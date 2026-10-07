#!/usr/bin/env python3
"""Measure both real processes without credentials, network or persistent writes."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def sample(pid):
    if os.name=='nt':
        from ctypes import wintypes as w
        class Memory(ctypes.Structure):
            _fields_=[('cb',w.DWORD),('faults',w.DWORD)]+[(name,ctypes.c_size_t) for name in ('peak_rss','rss','peak_pool','pool','peak_nonpaged','nonpaged','private','peak_private')]
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.OpenProcess.restype=w.HANDLE
        kernel.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD]
        kernel.GetProcessTimes.argtypes=[w.HANDLE]+[ctypes.POINTER(w.FILETIME)]*4
        kernel.CloseHandle.argtypes=[w.HANDLE]
        psapi=ctypes.WinDLL('psapi',use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes=[w.HANDLE,ctypes.POINTER(Memory),w.DWORD]
        handle=kernel.OpenProcess(0x410,False,pid)
        if not handle:raise OSError('Cannot sample process')
        try:
            mem=Memory();mem.cb=ctypes.sizeof(mem)
            if not psapi.GetProcessMemoryInfo(handle,ctypes.byref(mem),mem.cb):raise OSError('Memory sample failed')
            times=[w.FILETIME() for _ in range(4)]
            if not kernel.GetProcessTimes(handle,*[ctypes.byref(t) for t in times]):raise OSError('CPU sample failed')
            cpu=sum((t.dwHighDateTime<<32)+t.dwLowDateTime for t in times[2:])/1e7
            return mem.rss,cpu
        finally:kernel.CloseHandle(handle)
    fields=Path('/proc/%d/stat'%pid).read_text().rsplit(')',1)[1].split()
    cpu=(int(fields[11])+int(fields[12]))/os.sysconf('SC_CLK_TCK')
    rss=int(fields[21])*os.sysconf('SC_PAGE_SIZE')
    return rss,cpu

def child(role):
    if role=='control':
        from control_server import ControlServer
        class Offline:
            def request(self,payload=None):return {'growth_os':{},'recent_audit':[],'recent_experiments':[]}
        ControlServer(('127.0.0.1',0),Offline()).serve_forever(poll_interval=1)
    else:
        from dataclasses import replace
        from config import Config,BASE_DIR
        from app import Application
        with tempfile.TemporaryDirectory() as directory:
            config=Config(True,False,'','','','',600,12,1200,Path(directory)/'cache.json',BASE_DIR/'data/demo_snapshot.json',BASE_DIR/'data/growth_config.json')
            Application(config).start()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--child',choices=['display','control']);parser.add_argument('--seconds',type=int,default=60)
    args=parser.parse_args()
    if args.child:return child(args.child)
    processes={}
    try:
        for role in ('display','control'):
            processes[role]=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--child',role],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        time.sleep(5)
        before={role:sample(p.pid) for role,p in processes.items()}
        started=time.monotonic();time.sleep(args.seconds);elapsed=time.monotonic()-started
        after={role:sample(p.pid) for role,p in processes.items()}
        result={'platform':sys.platform,'sample_seconds':round(elapsed,2),'mode':'display demo, control idle, no upstream requests','processes':{role:{'rss_mib':round(after[role][0]/1048576,2),'cpu_percent_one_core':round((after[role][1]-before[role][1])*100/elapsed,3)} for role in processes}}
        result['combined_rss_mib']=round(sum(x[0] for x in after.values())/1048576,2)
        print(json.dumps(result,indent=2))
    finally:
        for process in processes.values():
            process.terminate();process.wait(timeout=5)

if __name__=='__main__':main()
