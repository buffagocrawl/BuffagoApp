import json
import os
import subprocess
from pathlib import Path
import sys
import pytest
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from cayenne_runtime import auth_failure, detect_startup_state, disposition, redact, safety, smoke_assertion_metadata, validate_selectors, write_json
from credentials import AUTH_BLOCKED, CredentialsUnavailable, LOCAL_IGNORED_FILE, PROCESS_ENV, load_cayenne_credentials
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

def test_missing_cayenne_credentials_fail_closed_without_values(tmp_path):
    with pytest.raises(CredentialsUnavailable) as caught:
        load_cayenne_credentials({}, root=tmp_path)
    assert str(caught.value) == AUTH_BLOCKED
    assert 'CAYENNE_TEST_PASSWORD' not in str(caught.value)

def test_password_never_appears_in_errors_or_redacted_logger_output(tmp_path):
    password = 'synthetic-password-for-security-test'
    with pytest.raises(CredentialsUnavailable) as caught:
        load_cayenne_credentials({'CAYENNE_TEST_EMAIL': 'example', 'CAYENNE_TEST_PASSWORD': password}, root=tmp_path)
    assert password not in str(caught.value)
    assert password not in redact(f'authentication failed: {password}', secrets=(password,))

def test_credential_loader_keeps_password_unmodified_and_is_not_json_serializable():
    password = ' fake password with spaces '
    credentials = load_cayenne_credentials({'CAYENNE_TEST_EMAIL': ' qa@example.test ', 'CAYENNE_TEST_PASSWORD': password})
    assert credentials.email == 'qa@example.test'
    assert credentials.password == password
    with pytest.raises(TypeError):
        json.dumps(credentials)
    assert password not in repr(credentials)
    assert credentials.source == PROCESS_ENV

def test_credential_loader_uses_ignored_local_file_only_when_process_pair_is_unavailable(tmp_path):
    local = tmp_path / '.env.cayenne.local'
    local.write_text('# local only\nCAYENNE_TEST_EMAIL= qa@example.test \nCAYENNE_TEST_PASSWORD=secret=with=equals\n', encoding='utf-8')
    credentials = load_cayenne_credentials({}, root=tmp_path)
    assert credentials.email == 'qa@example.test'
    assert credentials.password == 'secret=with=equals'
    assert credentials.source == LOCAL_IGNORED_FILE
    process = load_cayenne_credentials({'CAYENNE_TEST_EMAIL': 'process@example.test', 'CAYENNE_TEST_PASSWORD': 'process-secret'}, root=tmp_path)
    assert process.source == PROCESS_ENV

def test_local_credential_loader_rejects_empty_and_placeholder_values(tmp_path):
    (tmp_path / '.env.cayenne.local').write_text('CAYENNE_TEST_EMAIL=example\nCAYENNE_TEST_PASSWORD=\n', encoding='utf-8')
    with pytest.raises(CredentialsUnavailable) as caught:
        load_cayenne_credentials({}, root=tmp_path)
    assert str(caught.value) == AUTH_BLOCKED

def test_cayenne_example_contains_no_password_value():
    example = (ROOT / '.env.cayenne.example').read_text(encoding='utf-8')
    assert 'CAYENNE_TEST_PASSWORD=\n' in example
    assert 'CAYENNE_QA_USER_PASSWORD' not in example

def test_local_cayenne_secret_file_is_ignored_and_untracked(tmp_path):
    local_secret = ROOT / '.env.cayenne.local'
    result = subprocess.run(['git', 'check-ignore', '-v', str(local_secret)], cwd=ROOT, text=True, capture_output=True, check=False)
    assert result.returncode == 0
    tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', '.env.cayenne.local'], cwd=ROOT, text=True, capture_output=True, check=False)
    assert tracked.returncode != 0

def test_launcher_uses_no_password_argument_or_environment_dump_and_restores_scope():
    launcher = (ROOT / 'scripts' / 'run-cayenne-auth.ps1').read_text(encoding='utf-8')
    assert 'CAYENNE_TEST_PASSWORD' in launcher
    assert 'Get-ChildItem Env:' not in launcher
    assert 'ArgumentList' not in launcher
    assert 'finally' in launcher and 'Remove-Item Env:CAYENNE_TEST_PASSWORD' in launcher
    assert '.env.cayenne.local' in launcher

def test_mobile_application_does_not_import_harness_credential_loader():
    for path in (ROOT / 'crawl').rglob('*'):
        if path.is_file() and 'node_modules' not in path.parts and path.suffix in {'.js', '.jsx', '.ts', '.tsx'}:
            assert 'cayenne.scripts.credentials' not in path.read_text(encoding='utf-8', errors='ignore')

def test_maestro_auth_flow_uses_runtime_variables_and_has_no_credential_screenshot():
    flow = (ROOT / 'cayenne' / 'flows' / 'auth' / 'cayenne-secure-auth.yaml').read_text(encoding='utf-8')
    assert '${CAYENNE_TEST_EMAIL}' in flow and '${CAYENNE_TEST_PASSWORD}' in flow
    assert 'takeScreenshot' not in flow
    assert 'CAYENNE_QA_USER_' not in flow

def test_artifact_redaction_removes_tokens_sessions_and_authorization_values(tmp_path):
    password = 'synthetic-password-for-artifact-test'
    payload = {
        'password': password,
        'Authorization': 'Bearer abcdefghijklmnopqrstuvwxyz.12345678',
        'access_token': 'access-value',
        'refresh_token': 'refresh-value',
        'session': {'user': 'synthetic-user'},
        'message': password,
    }
    target = tmp_path / 'evidence.json'
    write_json(target, redact(payload, secrets=(password,)))
    text = target.read_text(encoding='utf-8')
    for value in (password, 'access-value', 'refresh-value', 'synthetic-user', 'Bearer'):
        assert value not in text

def test_auth_runner_keeps_maestro_artifacts_temporary_and_does_not_capture_password_screen():
    runner = (ROOT / 'cayenne' / 'scripts' / 'run_runtime.py').read_text(encoding='utf-8')
    assert 'TemporaryDirectory(prefix="cayenne-maestro-")' in runner
    assert 'if a.suite != "auth"' in runner
    assert 'credential_secrets' in runner
    assert 'if a.suite != "auth":\n                try:' in runner

def test_auth_failure_messages_are_sanitized_and_actionable():
    code, message = auth_failure('Invalid login credentials for a user')
    assert code == 'INVALID_CREDENTIALS'
    assert 'user' not in message.lower()
    assert auth_failure('network request failed')[0] == 'NETWORK_OR_TIMEOUT'
    assert auth_failure('profile.rls-read-marker missing')[0] == 'PROFILE_RLS_DENIAL'
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

def hierarchy(*selectors):
    return "<hierarchy>" + "".join(f'<node resource-id="{selector}" />' for selector in selectors) + "</hierarchy>"

def valid_smoke(state):
    return {
        'suite':'smoke-auto','status':'PASSED','detectedStartupState':state,
        'startupStateValidation':'PASSED','universalAssertionResult':'PASSED',
        'stateSpecificAssertionResult':'PASSED','safety':{'decision':'ALLOW'},
        'failures':[],'limitations':[],'redaction':{'validated':True},
        'summary':{'acceptanceCriteriaCovered':['launch']},
    }

def test_onboarding_detected():
    assert detect_startup_state(hierarchy('app.root','onboarding.root'))['detectedStartupState']=='CLEAN_ONBOARDING'

def test_auth_screen_detected():
    assert detect_startup_state(hierarchy('app.root','auth.screen'))['detectedStartupState']=='SIGNED_OUT'

def test_authenticated_navigation_detected():
    assert detect_startup_state(hierarchy('app.root','nav.home'))['detectedStartupState']=='AUTHENTICATED'

def test_multiple_startup_states_detected():
    result=detect_startup_state(hierarchy('onboarding.root','auth.screen'))
    assert not result['valid'] and result['reason']=='MULTIPLE_STARTUP_STATES'

def test_no_startup_state_detected():
    result=detect_startup_state(hierarchy('app.root'))
    assert not result['valid'] and result['reason']=='NO_STARTUP_STATE'

def test_authenticated_assertions_not_applicable_during_onboarding():
    metadata=smoke_assertion_metadata('CLEAN_ONBOARDING')
    authenticated=[item for item in metadata['skippedAssertions'] if item['assertion']=='Authenticated primary navigation']
    assert authenticated==[{'assertion':'Authenticated primary navigation','status':'NOT_APPLICABLE'}]

def test_serrano_approves_valid_onboarding_smoke():
    assert disposition(valid_smoke('CLEAN_ONBOARDING'),{'acceptanceCriteria':['launch']})['disposition']=='APPROVE'

def test_serrano_approves_valid_authenticated_smoke():
    assert disposition(valid_smoke('AUTHENTICATED'),{'acceptanceCriteria':['launch']})['disposition']=='APPROVE'

def test_serrano_insufficient_when_startup_state_is_ambiguous():
    result=valid_smoke(None)
    result['startupStateValidation']='FAILED'
    assert disposition(result,{'acceptanceCriteria':['launch']})['disposition']=='INSUFFICIENT_EVIDENCE'

def test_production_readonly_auto_smoke_preserves_safety():
    result=safety('production-readonly',False,False,'https://example.supabase.co',{})
    assert result['decision']=='ALLOW' and result['productionDetected'] and not result['mutationAllowed']

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
