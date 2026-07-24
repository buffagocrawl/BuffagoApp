import json
from pathlib import Path
import sys
import pytest
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from cayenne_runtime import disposition, redact, safety, validate_selectors
import android_lifecycle as al
from android_lifecycle import AndroidLifecycle, RuntimeFailure

ROOT=Path(__file__).parents[2]
def test_production_mutation_fails_closed():
    r=safety('production-readonly',True,True,'https://example.supabase.co',{})
    assert r['decision']=='BLOCK' and not r['mutationAllowed']
def test_unknown_environment_fails_closed():
    assert safety('unknown',False,False,'',{})['decision']=='BLOCK'
def test_redaction_removes_secrets_and_email():
    r=redact({'password':'secret','message':'Bearer abcdefghijklmnopqrstuvwxyz.12345678 user@example.com'})
    assert 'secret' not in json.dumps(r) and 'user@example.com' not in json.dumps(r)
def test_selectors_are_unique_and_known():
    result=validate_selectors(ROOT,ROOT/'cayenne'/'flows')
    assert result['duplicateIds'] is False and result['unknownReferences']==[]
def test_serrano_blocked_is_not_rejected():
    result={'status':'BLOCKED','safety':{'decision':'BLOCK'},'failures':[],'limitations':['DEVICE_UNAVAILABLE'],'redaction':{'validated':True},'summary':{}}
    request={'acceptanceCriteria':['launch']}
    assert disposition(result,request)['disposition']=='BLOCKED'
def test_serrano_failed_app_defect_rejects():
    result={'status':'FAILED','safety':{'decision':'ALLOW'},'failures':[{'failureCategory':'APP_DEFECT'}],'limitations':[],'redaction':{'validated':True},'summary':{}}
    assert disposition(result,{'acceptanceCriteria':[]})['disposition']=='REJECT'
def test_serrano_missing_evidence_is_insufficient():
    result={'status':'PASSED','safety':{'decision':'ALLOW'},'failures':[],'limitations':['missing screenshot'],'redaction':{'validated':True},'summary':{'acceptanceCriteriaCovered':[]}}
    assert disposition(result,{'acceptanceCriteria':['launch']})['disposition']=='INSUFFICIENT_EVIDENCE'

def lifecycle(tmp_path, monkeypatch):
    adb=tmp_path/'adb.exe'; emulator=tmp_path/'emulator.exe'
    adb.touch(); emulator.touch()
    monkeypatch.setattr(al,'canonical_android_tools',lambda: (adb,emulator,[]))
    return AndroidLifecycle(ROOT,tmp_path/'run',sleep=lambda _:None)

def test_adb_resolution_fails_without_sdk():
    try:
        al.canonical_android_tools({},which=lambda _:None)
    except RuntimeFailure as exc:
        assert exc.category=='ADB_START_FAILURE'
    else:
        raise AssertionError('missing SDK must fail')

def test_duplicate_adb_binary_warns_with_both_paths(tmp_path):
    sdk=tmp_path/'sdk'
    adb=sdk/'platform-tools'/'adb.exe'; emulator=sdk/'emulator'/'emulator.exe'
    adb.parent.mkdir(parents=True); emulator.parent.mkdir(parents=True)
    adb.touch(); emulator.touch()
    duplicate=tmp_path/'other'/'adb.exe'; duplicate.parent.mkdir(); duplicate.touch()
    resolved_adb,resolved_emulator,warnings=al.canonical_android_tools(
        {'ANDROID_HOME':str(sdk),'ANDROID_SDK_ROOT':str(sdk)},
        which=lambda name:str(duplicate) if name=='adb' else str(emulator),
    )
    assert resolved_adb==adb.resolve() and resolved_emulator==emulator.resolve()
    assert str(duplicate.resolve()) in warnings[0] and str(adb.resolve()) in warnings[0]

def test_adb_daemon_start_failure_is_specific(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    monkeypatch.setattr(lc,'_adb',lambda *args,**kwargs:(1,'cannot bind 5037'))
    with pytest.raises(RuntimeFailure) as caught: lc.start_adb()
    assert caught.value.category=='ADB_START_FAILURE'

def test_offline_device_reconnects_then_restarts_adb_once(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    states=iter(['offline','offline','offline','offline','device'])
    monkeypatch.setattr(lc,'device_state',lambda:next(states))
    calls=[]
    monkeypatch.setattr(lc,'_adb',lambda *args,**kwargs:(calls.append(args) or (0,'')))
    result=lc.wait_for_device(attempts=5,interval=0)
    assert result['status']=='RECOVERED' and result['reconnect'] and result['adbRestart']
    assert calls.count(('kill-server',))==1 and calls.count(('start-server',))==1

def test_offline_timeout_has_specific_category(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    monkeypatch.setattr(lc,'device_state',lambda:'offline')
    monkeypatch.setattr(lc,'_adb',lambda *args,**kwargs:(0,''))
    with pytest.raises(RuntimeFailure,match='did not become online') as caught:
        lc.wait_for_device(attempts=5,interval=0)
    assert caught.value.category=='ADB_OFFLINE_TIMEOUT'

def test_missing_configured_avd_is_emulator_start_failure(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    monkeypatch.setattr(lc,'device_state',lambda:'missing')
    monkeypatch.setattr(lc,'_run',lambda *args,**kwargs:(0,'Another_AVD\n'))
    with pytest.raises(RuntimeFailure) as caught: lc.start_emulator()
    assert caught.value.category=='EMULATOR_START_FAILURE'

def test_boot_timeout_has_specific_category(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    monkeypatch.setattr(lc,'_adb',lambda *args,**kwargs:(0,'0\n'))
    with pytest.raises(RuntimeFailure) as caught: lc.wait_for_boot(attempts=2,interval=0)
    assert caught.value.category=='EMULATOR_BOOT_TIMEOUT'

def test_invalid_port_owner_is_metro_start_failure(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    monkeypatch.setattr(lc,'_metro_ready',lambda:False)
    monkeypatch.setattr(lc,'_port_pid',lambda:4242)
    with pytest.raises(RuntimeFailure) as caught: lc.start_metro()
    assert caught.value.category=='METRO_START_FAILURE'

def test_metro_timeout_has_specific_category(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    expo=ROOT/'crawl'/'node_modules'/'.bin'/'expo.cmd'
    assert expo.exists()
    monkeypatch.setattr(lc,'_metro_ready',lambda:False)
    monkeypatch.setattr(lc,'_port_pid',lambda:None)
    class Process:
        pid=12345; returncode=None
        def poll(self): return None
    monkeypatch.setattr(lc,'popen',lambda *args,**kwargs:Process())
    with pytest.raises(RuntimeFailure) as caught: lc.start_metro(attempts=2,interval=0)
    assert caught.value.category=='METRO_TIMEOUT'

def test_dev_client_reverse_failure_is_specific(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    monkeypatch.setattr(lc,'_adb',lambda *args,**kwargs:(1,'reverse failed'))
    with pytest.raises(RuntimeFailure) as caught: lc.connect_dev_client(attempts=1,interval=0)
    assert caught.value.category=='DEV_CLIENT_CONNECTION_FAILURE'

def test_fatal_js_during_connection_is_bundle_load_failure(tmp_path,monkeypatch):
    lc=lifecycle(tmp_path,monkeypatch)
    def adb(*args,**kwargs):
        joined=' '.join(args)
        if 'logcat' in joined: return 0,'ReactNativeJS: Error: bundle exploded'
        if 'pidof' in joined: return 0,'111'
        return 0,''
    monkeypatch.setattr(lc,'_adb',adb)
    with pytest.raises(RuntimeFailure) as caught: lc.connect_dev_client(attempts=1,interval=0)
    assert caught.value.category=='BUNDLE_LOAD_FAILURE'
