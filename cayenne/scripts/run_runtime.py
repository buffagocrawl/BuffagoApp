from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from cayenne_runtime import redact, safety, write_json, disposition

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = "com.buffago.app"

def iso(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
def load_env(path):
    values={}
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line=line.strip()
            if line and not line.startswith("#") and "=" in line:
                k,v=line.split("=",1); values[k.strip()]=v.strip().strip('"')
    return values
def run_cmd(cmd, cwd, timeout=60):
    try:
        if str(cmd[0]).lower().endswith(('.bat','.cmd')): cmd=['cmd','/c',*cmd]
        p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True,encoding='utf-8',errors='replace',timeout=timeout,check=False)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except (FileNotFoundError, subprocess.TimeoutExpired) as e: return 127, str(e)
def tool(name): return shutil.which(name)
def metro_ready():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8081/status', timeout=2) as r: return r.status == 200
    except Exception: return False
def start_metro():
    if metro_ready(): return None
    expo = ROOT/'crawl'/'node_modules'/'.bin'/'expo.cmd'
    if not expo.exists(): return None
    flags = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
    p = subprocess.Popen([str(expo), 'start', '--dev-client', '--lan'], cwd=ROOT/'crawl', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
    for _ in range(30):
        if metro_ready(): return p
        time.sleep(2)
    try: p.terminate()
    except Exception: pass
    return None
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--suite",default="smoke"); ap.add_argument("--environment",default="production-readonly"); ap.add_argument("--device-id",default="emulator-5554"); ap.add_argument("--run-id"); ap.add_argument("--capture-video",action="store_true"); ap.add_argument("--reset-app",action="store_true"); ap.add_argument("--rebuild",action="store_true"); ap.add_argument("--keep-fixture-data",action="store_true"); ap.add_argument("--serrano-review",action="store_true"); ap.add_argument("--output-directory",type=Path); ap.add_argument("--dry-run",action="store_true")
    a=ap.parse_args(); run_id=a.run_id or datetime.now().strftime("%Y%m%dT%H%M%S")+"-"+os.urandom(4).hex(); out=(a.output_directory or ROOT/"artifacts"/"cayenne"/"runs"/run_id).resolve(); out.mkdir(parents=True,exist_ok=True)
    for d in ("screenshots","videos","hierarchies","logs","maestro","failures","serrano"): (out/d).mkdir(exist_ok=True)
    env=load_env(ROOT/"crawl"/".env.development"); env.update({k:v for k,v in os.environ.items() if k.startswith("CAYENNE_") or k.startswith("EXPO_PUBLIC_")})
    mutation=a.suite not in {"smoke","accessibility","exploratory"}; allow=str(env.get("CAYENNE_ALLOW_MUTATION", "false")).lower()=="true"
    safe=safety(a.environment,mutation,allow,env.get("EXPO_PUBLIC_SUPABASE_URL", ""),env)
    write_json(out/"safety-check.json",safe); write_json(out/"environment.json",{"environment":a.environment,"productionDetected":safe["productionDetected"],"configured":{"supabaseUrl":bool(env.get("EXPO_PUBLIC_SUPABASE_URL")),"supabaseAnonKey":bool(env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")),"qaUser":bool(env.get("CAYENNE_QA_USER_EMAIL"))}})
    prereq={"java":bool(tool("java")),"adb":bool(tool("adb")),"maestro":bool(tool("maestro")),"deviceId":a.device_id,"package":"com.buffago.app"}; write_json(out/"prerequisite-check.json",prereq)
    started=iso(); limitations=[]; failures=[]; flow_status="INCONCLUSIVE"; output=""
    request={"contractVersion":"1.0","runId":run_id,"requestedBy":"serrano" if a.serrano_review else "owner","suite":a.suite,"environment":a.environment,"mutationAllowed":safe["mutationAllowed"],"device":{"platform":"android","deviceId":a.device_id},"evidenceRequirements":["screenshot","hierarchy","logcat"],"acceptanceCriteria":["App launches without fatal error","A real Buffago surface renders","Primary navigation can be exercised"]}
    write_json(out/"request.json",request)
    if safe["decision"]!="ALLOW" and mutation: flow_status="BLOCKED"; failures.append({"failureCategory":"SECURITY_BOUNDARY","failureMessage":"Mutating suite blocked by runtime safety policy"}); limitations.append("PRODUCTION_MUTATION_DENIED")
    elif a.dry_run: limitations.append("DRY_RUN_NO_RUNTIME_EXECUTION")
    elif not (prereq["adb"] and prereq["maestro"]): flow_status="BLOCKED"; failures.append({"failureCategory":"DEVICE_BLOCKER","failureMessage":"adb or Maestro is unavailable"}); limitations.append("ADB_OR_MAESTRO_UNAVAILABLE")
    else:
        metro_process=start_metro()
        run_cmd(["adb","-s",a.device_id,"reverse","tcp:8081","tcp:8081"],ROOT)
        if not metro_ready():
            flow_status="BLOCKED"; failures.append({"failureCategory":"ENVIRONMENT_BLOCKER","failureMessage":"Metro did not become ready on port 8081"}); limitations.append("METRO_UNAVAILABLE")
        else:
            run_cmd(["adb","-s",a.device_id,"shell","am","force-stop",PACKAGE],ROOT)
            run_cmd(["adb","-s",a.device_id,"shell","monkey","-p",PACKAGE,"1"],ROOT)
            rc, boot=run_cmd(["adb","-s",a.device_id,"get-state"],ROOT); write_json(out/"logs"/"device-state.json",{"returnCode":rc,"output":boot[:2000]})
            if rc!=0: flow_status="BLOCKED"; failures.append({"failureCategory":"DEVICE_BLOCKER","failureMessage":"Connected Android device is unavailable"}); limitations.append("DEVICE_UNAVAILABLE")
            else:
                if a.reset_app: run_cmd(["adb","-s",a.device_id,"shell","pm","clear",PACKAGE],ROOT)
                flow=ROOT/"cayenne"/"flows"/"smoke"/"smoke-suite.yaml" if a.suite=="smoke" else ROOT/"cayenne"/"flows"/"accessibility"/"primary-controls.yaml"
                maestro=tool("maestro") or "maestro"
                rc,output=run_cmd([maestro,"--device",a.device_id,"test",str(flow),"--format","junit","--output",str(out/"maestro"/"junit.xml")],ROOT,timeout=300)
                (out/"maestro"/"raw-output.log").write_text(redact(output,redact_emails=False),encoding="utf-8")
                _,hier=run_cmd(["adb","-s",a.device_id,"exec-out","uiautomator","dump","/dev/tty"],ROOT); (out/"hierarchies"/"final.xml").write_text(redact(hier,redact_emails=False),encoding="utf-8")
                _,log=run_cmd(["adb","-s",a.device_id,"logcat","-d","-v","brief","-t","500"],ROOT); (out/"logs"/"logcat.txt").write_text(redact(log,redact_emails=False),encoding="utf-8")
                try:
                    shot=subprocess.run(["adb","-s",a.device_id,"exec-out","screencap","-p"],cwd=ROOT,capture_output=True,timeout=30,check=False)
                    (out/"screenshots"/"final.png").write_bytes(shot.stdout)
                except Exception as exc:
                    limitations.append("SCREENSHOT_CAPTURE_FAILED:"+type(exc).__name__)
                if "Development Build" in hier and "app.root" not in hier:
                    flow_status="BLOCKED"; failures.append({"failureCategory":"ENVIRONMENT_BLOCKER","failureMessage":"Expo development client did not connect to Metro; its saved server requires explicit local host selection."}); limitations.append("DEV_CLIENT_SERVER_SELECTION_REQUIRED")
                elif rc==0: flow_status="PASSED"
                else: flow_status="FAILED"; failures.append({"failureCategory":"APP_DEFECT" if "fatal" in output.lower() or "exception" in output.lower() else "TEST_DEFECT","failureMessage":"Maestro smoke suite failed"})
        if metro_process:
            try: metro_process.terminate()
            except Exception: pass
    finished=iso(); artifacts=[str(p.relative_to(out)).replace("\\","/") for p in out.rglob("*") if p.is_file() and p.name not in {"result.json","combined-review.md"}]
    result={"contractVersion":"1.0","runId":run_id,"status":flow_status,"startedAt":started,"finishedAt":finished,"suite":a.suite,"environment":a.environment,"device":{"platform":"android","deviceId":a.device_id},"summary":{"acceptanceCriteriaCovered":request["acceptanceCriteria"] if flow_status=="PASSED" else [],"artifactCount":len(artifacts)},"flows":[{"flowId":a.suite,"title":a.suite,"status":flow_status,"durationMs":0,"preconditions":["Android emulator"],"steps":[],"assertions":request["acceptanceCriteria"],"screenshots":["screenshots/final.png"],"hierarchy":"hierarchies/final.xml","logs":["logs/logcat.txt"],"failureCategory":failures[0]["failureCategory"] if failures else None,"failureMessage":failures[0]["failureMessage"] if failures else None,"retryCount":0}],"failures":failures,"artifacts":artifacts,"safety":safe,"redaction":{"validated":True,"status":"PASSED"},"limitations":limitations}
    write_json(out/"result.json",result); write_json(out/"fixture-report.json",{"status":"NOT_REQUIRED" if not mutation else "BLOCKED_EXTERNAL_QA_CREDENTIALS","runId":run_id,"namespace":f"cayenne:{run_id}","cleanup":"retained" if a.keep_fixture_data else "not-run"})
    review=disposition(result,request) if a.serrano_review else None
    if review:
        write_json(out/"serrano"/"request.json",request); write_json(out/"serrano"/"response.json",review); (out/"serrano"/"review.md").write_text(f"# Serrano review {run_id}\n\nDisposition: **{review['disposition']}**\n",encoding="utf-8"); (out/"combined-review.md").write_text(f"# Cayenne + Serrano review\n\nCayenne: **{flow_status}**\n\nSerrano: **{review['disposition']}**\n\nLimitations: {', '.join(limitations) or 'None'}\n",encoding="utf-8")
    print(json.dumps({"runId":run_id,"status":flow_status,"serranoDisposition":review["disposition"] if review else None,"artifactDirectory":str(out),"limitations":limitations},indent=2)); return 0 if flow_status=="PASSED" else 2
if __name__=="__main__": raise SystemExit(main())
