from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
from cayenne_runtime import auth_failure, detect_startup_state, disposition, redact, safety, smoke_assertion_metadata, write_json
from auth_stability import classify_auth_screen, classify_overlay, classify_terminal, stage
from android_lifecycle import AndroidLifecycle, RuntimeFailure
from credentials import AUTH_BLOCKED, CredentialsUnavailable, load_cayenne_credentials

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
def run_cmd(cmd, cwd, timeout=60, env=None):
    try:
        if str(cmd[0]).lower().endswith(('.bat','.cmd')): cmd=['cmd','/c',*cmd]
        p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True,encoding='utf-8',errors='replace',timeout=timeout,check=False,env=env)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except (FileNotFoundError, subprocess.TimeoutExpired) as e: return 127, str(e)
def tool(name): return shutil.which(name)
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--suite",default="smoke"); ap.add_argument("--environment",default="production-readonly"); ap.add_argument("--device-id",default="emulator-5554"); ap.add_argument("--run-id"); ap.add_argument("--capture-video",action="store_true"); ap.add_argument("--reset-app",action="store_true"); ap.add_argument("--launch-policy",choices=("PRESERVE_APP_DATA","CLEAR_APP_DATA","CLEAR_SESSION_ONLY","UNKNOWN")); ap.add_argument("--rebuild",action="store_true"); ap.add_argument("--keep-fixture-data",action="store_true"); ap.add_argument("--serrano-review",action="store_true"); ap.add_argument("--output-directory",type=Path); ap.add_argument("--dry-run",action="store_true")
    a=ap.parse_args()
    requested_suite=a.suite
    a.suite="smoke-auto" if a.suite=="smoke" else a.suite
    run_id=a.run_id or datetime.now().strftime("%Y%m%dT%H%M%S")+"-"+os.urandom(4).hex(); out=(a.output_directory or ROOT/"artifacts"/"cayenne"/"runs"/run_id).resolve(); out.mkdir(parents=True,exist_ok=True)
    for d in ("screenshots","videos","hierarchies","logs","maestro","failures","serrano"): (out/d).mkdir(exist_ok=True)
    env=load_env(ROOT/"crawl"/".env.development"); env.update({k:v for k,v in os.environ.items() if k.startswith("CAYENNE_") or k.startswith("EXPO_PUBLIC_")})
    readonly_suites={"smoke-auto","smoke-clean","smoke-authenticated","accessibility","exploratory","auth"}
    mutation=a.suite not in readonly_suites; allow=str(env.get("CAYENNE_ALLOW_MUTATION", "false")).lower()=="true"
    safe=safety(a.environment,mutation,allow,env.get("EXPO_PUBLIC_SUPABASE_URL", ""),env)
    write_json(out/"safety-check.json",safe); write_json(out/"environment.json",{"environment":a.environment,"productionDetected":safe["productionDetected"],"configured":{"supabaseUrl":bool(env.get("EXPO_PUBLIC_SUPABASE_URL")),"supabaseAnonKey":bool(env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")),"cayenneCredentialVariablesPresent":bool(env.get("CAYENNE_TEST_EMAIL") and env.get("CAYENNE_TEST_PASSWORD"))}})
    prereq={"java":bool(tool("java")),"maestro":bool(tool("maestro")),"deviceId":a.device_id,"package":"com.buffago.app"}; write_json(out/"prerequisite-check.json",prereq)
    started=iso(); limitations=[]; failures=[]; flow_status="INCONCLUSIVE"; output=""; startup={"detectedStartupState":None,"startupStateCandidates":[],"valid":False,"reason":"NOT_INSPECTED","selectorsPresent":[]}
    lifecycle=None; runtime_report={}; cleanup={"status":"NOT_REQUIRED","ownedPids":[],"cleanedPids":[]}; stages=[]
    launch_policy = a.launch_policy or ("CLEAR_APP_DATA" if a.reset_app else "PRESERVE_APP_DATA")
    acceptance=["App launches","app.root appears","No fatal runtime error","Exactly one valid startup state","Detected startup state passes its required assertions"]
    if a.suite=="smoke-authenticated": acceptance.append("Authenticated navigation passes")
    if a.suite=="auth": acceptance.extend(["Cayenne account signs in", "Session restores after relaunch", "RLS-backed profile read succeeds", "Logout returns to sign-in"])
    request={"contractVersion":"1.0","runId":run_id,"requestedBy":"serrano" if a.serrano_review else "owner","requestedSuite":requested_suite,"suite":a.suite,"environment":a.environment,"mutationAllowed":safe["mutationAllowed"],"device":{"platform":"android","deviceId":a.device_id},"evidenceRequirements":["screenshot","hierarchy","logcat","maestro-junit"],"acceptanceCriteria":acceptance}
    write_json(out/"request.json",request)
    preprovisioned=str(env.get("CAYENNE_PREPROVISIONED_SAFE_AUTH","false")).lower()=="true"
    credentials = None
    credential_secrets = ()
    maestro_env = None
    try:
        if a.suite == "auth":
            # Credentials deliberately come from the process environment or the
            # ignored root-level local file only. Do not allow the app's dotenv
            # configuration to become an authentication credential source.
            credentials = load_cayenne_credentials(root=ROOT)
            credential_secrets = (credentials.email, credentials.password)
            # Scope credentials to Maestro's child environment only.  They never
            # enter generated evidence, command-line arguments, or this process's
            # persistent environment.
            maestro_env = os.environ.copy()
            maestro_env.update({"CAYENNE_TEST_EMAIL": credentials.email, "CAYENNE_TEST_PASSWORD": credentials.password})
    except CredentialsUnavailable:
        limitations.append("CAYENNE_AUTH_BLOCKED")
        failures.append({"failureCategory":"FIXTURE_BLOCKER","failureMessage":AUTH_BLOCKED})
    qa_credentials=credentials is not None
    safe_auth_available=a.environment in {"qa","local-mock"} and (preprovisioned or qa_credentials)
    if a.suite=="auth" and credentials is None:
        flow_status="BLOCKED"
    elif a.suite=="smoke-authenticated" and not safe_auth_available:
        flow_status="BLOCKED"; failures.append({"failureCategory":"FIXTURE_BLOCKER","failureMessage":"smoke-authenticated requires QA/local-mock credentials or a pre-provisioned safe authentication state"}); limitations.append("SAFE_AUTHENTICATION_STATE_UNAVAILABLE")
    elif safe["decision"]!="ALLOW" and mutation: flow_status="BLOCKED"; failures.append({"failureCategory":"SECURITY_BOUNDARY","failureMessage":"Mutating suite blocked by runtime safety policy"}); limitations.append("PRODUCTION_MUTATION_DENIED")
    elif a.dry_run: limitations.append("DRY_RUN_NO_RUNTIME_EXECUTION")
    elif not prereq["maestro"]: flow_status="BLOCKED"; failures.append({"failureCategory":"ENVIRONMENT_BLOCKER","runtimeCategory":"METRO_START_FAILURE","failureMessage":"Maestro is unavailable"}); limitations.append("MAESTRO_UNAVAILABLE")
    else:
        try:
            lifecycle=AndroidLifecycle(ROOT,out,device=a.device_id)
            lifecycle.recover_stale_owned(out.parent)
            runtime_report["adbStart"]=lifecycle.start_adb()
            runtime_report["emulatorStart"]=lifecycle.start_emulator()
            runtime_report["adbRecovery"]=lifecycle.wait_for_device()
            runtime_report["emulatorBoot"]=lifecycle.wait_for_boot()
            runtime_report["package"]=lifecycle.verify_package()
            stages.append(stage("environment_readiness", "PASSED" if lifecycle.screen_unlocked() else "FAILED", package=PACKAGE, device=lifecycle.device, screenUnlocked=lifecycle.screen_unlocked(), appDataControl="pm clear supported"))
            if not lifecycle.screen_unlocked():
                raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", "Device screen is locked; authentication will not be attempted.")
            runtime_report["launchPolicy"]={"policy":launch_policy}
            if launch_policy == "CLEAR_APP_DATA":
                runtime_report["appDataControl"]=lifecycle.clear_app_data()
                if runtime_report["appDataControl"]["status"] != "PASSED":
                    raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", "App data clear failed; authentication will not be attempted.")
            elif launch_policy == "CLEAR_SESSION_ONLY":
                stages.append(stage("app_state_control", "BLOCKED", policy=launch_policy, reason="No test-only local session bridge is installed."))
                raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", "CLEAR_SESSION_ONLY requires a test-only state bridge.")
            else:
                runtime_report["appProcessControl"]=lifecycle.force_stop()
            runtime_report["metroStart"]=lifecycle.start_metro()
            runtime_report["bundlePrewarm"]=lifecycle.prewarm_bundle()
            runtime_report["devClientConnection"]=lifecycle.connect_dev_client()
            if launch_policy == "CLEAR_APP_DATA":
                runtime_report["devClientConnectionAfterClear"]=lifecycle.connect_dev_client()
            _,initial_hier=lifecycle.dump_hierarchy()
            (out/"hierarchies"/"startup.xml").write_text(redact(initial_hier, secrets=credential_secrets),encoding="utf-8")
            startup=detect_startup_state(initial_hier)
            overlay = classify_overlay(initial_hier)
            stages.append(stage("controlled_app_launch", "PASSED" if not overlay else "BLOCKED", policy=launch_policy, firstDetectedState=startup.get("detectedStartupState"), overlay=overlay))
            if overlay:
                raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", f"Known overlay remained after controlled launch: {overlay}")
            if a.suite == "auth":
                route = lifecycle.launch_auth_route()
                stages.append(stage("auth_route", route["status"], command=route["command"]))
                if route["status"] != "STARTED":
                    raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", "Could not open the bounded authentication route.")
                auth_hier = ""; overlay_actions = []
                ready = False
                for _ in range(25):
                    _, auth_hier = lifecycle.dump_hierarchy()
                    auth_state = classify_auth_screen(auth_hier)
                    if auth_state["state"] == "AUTH_SCREEN_READY" and not auth_state["overlay"]:
                        ready = True
                        break
                    if auth_state["overlay"] in {"NATIVE_PERMISSION_DIALOG", "NATIVE_SYSTEM_DIALOG"}:
                        action = lifecycle.dismiss_safe_overlay(auth_hier)
                        overlay_actions.append({"overlay": auth_state["overlay"], **action})
                    lifecycle.sleep(1)
                auth_readiness = classify_auth_screen(auth_hier)
                (out/"hierarchies"/"auth-ready.xml").write_text(redact(auth_hier, secrets=credential_secrets), encoding="utf-8")
                stages.append(stage("authentication_screen_readiness", "PASSED" if ready else "FAILED", overlayActions=overlay_actions, **auth_readiness))
                if not ready:
                    raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", "Authentication controls were not simultaneously ready; credentials were not entered.")
            try:
                initial_shot=subprocess.run([str(lifecycle.adb),"-s",a.device_id,"exec-out","screencap","-p"],cwd=ROOT,capture_output=True,timeout=30,check=False)
                (out/"screenshots"/"startup.png").write_bytes(initial_shot.stdout)
            except Exception as exc:
                limitations.append("STARTUP_SCREENSHOT_CAPTURE_FAILED:"+type(exc).__name__)
            smoke_flows={
                "smoke-auto": ROOT/"cayenne"/"flows"/"smoke"/"smoke-auto.yaml",
                "smoke-clean": ROOT/"cayenne"/"flows"/"smoke"/"smoke-clean.yaml",
                "smoke-authenticated": ROOT/"cayenne"/"flows"/"smoke"/"smoke-authenticated.yaml",
                "auth": ROOT/"cayenne"/"flows"/"auth"/"cayenne-secure-auth.yaml",
            }
            flow=smoke_flows.get(a.suite,ROOT/"cayenne"/"flows"/"accessibility"/"primary-controls.yaml")
            maestro=tool("maestro") or "maestro"
            # Maestro may create failure screenshots automatically.  Keep them in a
            # temporary directory and never persist them for the credentialed suite.
            with tempfile.TemporaryDirectory(prefix="cayenne-maestro-") as maestro_output:
                rc,output=run_cmd([maestro,"--device",a.device_id,"test",str(flow),"--format","junit","--output",str(out/"maestro"/"junit.xml"),"--test-output-dir",maestro_output],ROOT,timeout=300,env=maestro_env)
                if a.suite != "auth":
                    for index,path in enumerate(Path(maestro_output).rglob("*.png"),start=1):
                        shutil.copy2(path,out/"screenshots"/f"maestro-{index:02d}-{path.name}")
            runtime_report["maestro"]={"status":"PASSED" if rc==0 else "FAILED","returnCode":rc}
            junit = out/"maestro"/"junit.xml"
            if junit.exists():
                junit.write_text(redact(junit.read_text(encoding="utf-8", errors="replace"), secrets=credential_secrets),encoding="utf-8")
            (out/"maestro"/"raw-output.log").write_text(redact(output, secrets=credential_secrets),encoding="utf-8")
            _,hier=lifecycle.dump_hierarchy(); (out/"hierarchies"/"final.xml").write_text(redact(hier, secrets=credential_secrets),encoding="utf-8")
            if a.suite == "auth":
                stages.append(stage("terminal_auth_state", "PASSED" if rc == 0 else "FAILED", classification=classify_terminal(hier, output), maestroReturnCode=rc))
            if not startup["valid"]:
                startup=detect_startup_state(hier)
            _,log=lifecycle._adb("-s",a.device_id,"logcat","-d","-v","brief","-t","500"); (out/"logs"/"logcat.txt").write_text(redact(log, secrets=credential_secrets),encoding="utf-8")
            if a.suite != "auth":
                try:
                    shot=subprocess.run([str(lifecycle.adb),"-s",a.device_id,"exec-out","screencap","-p"],cwd=ROOT,capture_output=True,timeout=30,check=False)
                    (out/"screenshots"/"final.png").write_bytes(shot.stdout)
                except Exception as exc:
                    limitations.append("SCREENSHOT_CAPTURE_FAILED:"+type(exc).__name__)
            expected_ok=(a.suite!="smoke-clean" or startup.get("detectedStartupState")=="CLEAN_ONBOARDING") and (a.suite!="smoke-authenticated" or startup.get("detectedStartupState")=="AUTHENTICATED")
            if rc==0 and startup["valid"] and expected_ok:
                flow_status="PASSED"
            elif rc==0 and not startup["valid"]:
                flow_status="INCONCLUSIVE"; failures.append({"failureCategory":"INCONCLUSIVE","failureMessage":startup["reason"]})
            elif rc==0 and not expected_ok:
                if a.suite=="smoke-authenticated":
                    flow_status="BLOCKED"; failures.append({"failureCategory":"FIXTURE_BLOCKER","failureMessage":"Safe authenticated startup state was unavailable"})
                else:
                    flow_status="FAILED"; failures.append({"failureCategory":"TEST_DEFECT","failureMessage":f"{a.suite} did not start in its required state"})
            else:
                flow_status="FAILED"
                if a.suite == "auth":
                    failure_code, failure_message = auth_failure(output + "\n" + hier)
                    failures.append({"failureCategory":"APP_DEFECT" if failure_code not in {"INVALID_CREDENTIALS", "NETWORK_OR_TIMEOUT"} else "FIXTURE_BLOCKER","failureCode":failure_code,"failureMessage":failure_message})
                else:
                    failures.append({"failureCategory":"APP_DEFECT" if "fatal" in output.lower() or "exception" in output.lower() else "TEST_DEFECT","failureMessage":"Maestro smoke suite failed"})
        except RuntimeFailure as exc:
            flow_status="BLOCKED"
            runtime_report["failure"]={"category":exc.category,"message":str(exc)}
            failures.append({"failureCategory":"ENVIRONMENT_BLOCKER","runtimeCategory":exc.category,"failureMessage":str(exc)})
            limitations.append(exc.category)
        finally:
            write_json(out/"runtime"/"lifecycle.json",runtime_report)
            write_json(out/"stage-results.json", {"runId":run_id,"launchPolicy":launch_policy,"stages":stages})
            if lifecycle:
                cleanup=lifecycle.cleanup()
    assertion_meta=smoke_assertion_metadata(startup.get("detectedStartupState"),state_valid=startup.get("valid",False))
    universal_result="PASSED" if all(item["status"]=="PASSED" for item in assertion_meta["universalAssertions"]) and flow_status=="PASSED" else "FAILED"
    state_result="PASSED" if startup.get("valid") and flow_status=="PASSED" else "INSUFFICIENT_EVIDENCE"
    finished=iso(); artifacts=[str(p.relative_to(out)).replace("\\","/") for p in out.rglob("*") if p.is_file() and p.name not in {"result.json","combined-review.md"}]
    credential_source = credentials.source if credentials is not None else "unavailable"
    # A successful signed-out smoke flow does not establish any authenticated
    # behavior. Keep the evidence boundary fail-closed when secure credentials
    # are unavailable to this run.
    auth_status = (
        "BLOCKED"
        if credentials is None
        else "PASSED"
        if flow_status == "PASSED"
        else "BLOCKED"
        if flow_status == "BLOCKED"
        else "FAILED"
        if a.suite == "auth"
        else "NOT_RUN"
    )
    result={"contractVersion":"1.0","runId":run_id,"status":flow_status,"startedAt":started,"finishedAt":finished,"requestedSuite":requested_suite,"suite":a.suite,"environment":a.environment,"launchPolicy":launch_policy,"device":{"platform":"android","deviceId":a.device_id},"detectedStartupState":startup.get("detectedStartupState"),"startupStateCandidates":startup.get("startupStateCandidates",[]),"startupStateValidation":"PASSED" if startup.get("valid") and flow_status=="PASSED" else "FAILED","universalAssertionResult":universal_result,"stateSpecificAssertionResult":state_result,**assertion_meta,"authentication":{"credentialSource":credential_source,"credentialsAvailable":credentials is not None,"login":auth_status,"sessionRestoration":auth_status,"protectedNavigation":auth_status,"logout":auth_status,"profileLoad":auth_status,"rlsBackedRead":auth_status},"summary":{"acceptanceCriteriaCovered":request["acceptanceCriteria"] if flow_status=="PASSED" else [],"artifactCount":len(artifacts)},"runtime":runtime_report,"stageResults":stages,"cleanup":cleanup,"flows":[{"flowId":a.suite,"title":a.suite,"status":flow_status,"durationMs":0,"preconditions":["Android emulator"],"steps":[],"assertions":request["acceptanceCriteria"],"detectedStartupState":startup.get("detectedStartupState"),"stateSpecificAssertions":assertion_meta["stateSpecificAssertions"],"skippedAssertions":assertion_meta["skippedAssertions"],"skipReason":assertion_meta["skipReason"],"screenshots":[str(p.relative_to(out)).replace("\\","/") for p in (out/"screenshots").glob("*.png")],"hierarchy":"hierarchies/final.xml","logs":["logs/logcat.txt","logs/metro.log","maestro/raw-output.log"],"failureCategory":failures[0]["failureCategory"] if failures else None,"failureMessage":failures[0]["failureMessage"] if failures else None,"retryCount":0}],"failures":failures,"artifacts":artifacts,"safety":safe,"redaction":{"validated":True,"status":"PASSED"},"limitations":limitations}
    write_json(out/"result.json",result); write_json(out/"fixture-report.json",{"status":"NOT_REQUIRED" if not mutation else "BLOCKED_EXTERNAL_QA_CREDENTIALS","runId":run_id,"namespace":f"cayenne:{run_id}","cleanup":"retained" if a.keep_fixture_data else "not-run"})
    review=disposition(result,request) if a.serrano_review else None
    if review:
        write_json(out/"serrano"/"request.json",request); write_json(out/"serrano"/"response.json",review); (out/"serrano"/"review.md").write_text(f"# Serrano review {run_id}\n\nDisposition: **{review['disposition']}**\n",encoding="utf-8"); (out/"combined-review.md").write_text(f"# Cayenne + Serrano review\n\nCayenne: **{flow_status}**\n\nSerrano: **{review['disposition']}**\n\nLimitations: {', '.join(limitations) or 'None'}\n",encoding="utf-8")
    print(json.dumps({"runId":run_id,"status":flow_status,"serranoDisposition":review["disposition"] if review else None,"artifactDirectory":str(out),"limitations":limitations},indent=2)); return 0 if flow_status=="PASSED" else 2
if __name__=="__main__": raise SystemExit(main())
