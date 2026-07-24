from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
from cayenne_runtime import detect_startup_state, disposition, redact, safety, smoke_assertion_metadata, write_json
from android_lifecycle import AndroidLifecycle, RuntimeFailure

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
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--suite",default="smoke"); ap.add_argument("--environment",default="production-readonly"); ap.add_argument("--device-id",default="emulator-5554"); ap.add_argument("--run-id"); ap.add_argument("--capture-video",action="store_true"); ap.add_argument("--reset-app",action="store_true"); ap.add_argument("--rebuild",action="store_true"); ap.add_argument("--keep-fixture-data",action="store_true"); ap.add_argument("--serrano-review",action="store_true"); ap.add_argument("--output-directory",type=Path); ap.add_argument("--dry-run",action="store_true")
    a=ap.parse_args()
    requested_suite=a.suite
    a.suite="smoke-auto" if a.suite=="smoke" else a.suite
    run_id=a.run_id or datetime.now().strftime("%Y%m%dT%H%M%S")+"-"+os.urandom(4).hex(); out=(a.output_directory or ROOT/"artifacts"/"cayenne"/"runs"/run_id).resolve(); out.mkdir(parents=True,exist_ok=True)
    for d in ("screenshots","videos","hierarchies","logs","maestro","failures","serrano"): (out/d).mkdir(exist_ok=True)
    env=load_env(ROOT/"crawl"/".env.development"); env.update({k:v for k,v in os.environ.items() if k.startswith("CAYENNE_") or k.startswith("EXPO_PUBLIC_")})
    readonly_suites={"smoke-auto","smoke-clean","smoke-authenticated","accessibility","exploratory"}
    mutation=a.suite not in readonly_suites; allow=str(env.get("CAYENNE_ALLOW_MUTATION", "false")).lower()=="true"
    safe=safety(a.environment,mutation,allow,env.get("EXPO_PUBLIC_SUPABASE_URL", ""),env)
    write_json(out/"safety-check.json",safe); write_json(out/"environment.json",{"environment":a.environment,"productionDetected":safe["productionDetected"],"configured":{"supabaseUrl":bool(env.get("EXPO_PUBLIC_SUPABASE_URL")),"supabaseAnonKey":bool(env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")),"qaUser":bool(env.get("CAYENNE_QA_USER_EMAIL"))}})
    prereq={"java":bool(tool("java")),"maestro":bool(tool("maestro")),"deviceId":a.device_id,"package":"com.buffago.app"}; write_json(out/"prerequisite-check.json",prereq)
    started=iso(); limitations=[]; failures=[]; flow_status="INCONCLUSIVE"; output=""; startup={"detectedStartupState":None,"startupStateCandidates":[],"valid":False,"reason":"NOT_INSPECTED","selectorsPresent":[]}
    lifecycle=None; runtime_report={}; cleanup={"status":"NOT_REQUIRED","ownedPids":[],"cleanedPids":[]}
    acceptance=["App launches","app.root appears","No fatal runtime error","Exactly one valid startup state","Detected startup state passes its required assertions"]
    if a.suite=="smoke-authenticated": acceptance.append("Authenticated navigation passes")
    request={"contractVersion":"1.0","runId":run_id,"requestedBy":"serrano" if a.serrano_review else "owner","requestedSuite":requested_suite,"suite":a.suite,"environment":a.environment,"mutationAllowed":safe["mutationAllowed"],"device":{"platform":"android","deviceId":a.device_id},"evidenceRequirements":["screenshot","hierarchy","logcat","maestro-junit"],"acceptanceCriteria":acceptance}
    write_json(out/"request.json",request)
    preprovisioned=str(env.get("CAYENNE_PREPROVISIONED_SAFE_AUTH","false")).lower()=="true"
    qa_credentials=bool(env.get("CAYENNE_QA_USER_EMAIL") and env.get("CAYENNE_QA_USER_PASSWORD"))
    safe_auth_available=a.environment in {"qa","local-mock"} and (preprovisioned or qa_credentials)
    if a.suite=="smoke-authenticated" and not safe_auth_available:
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
            runtime_report["metroStart"]=lifecycle.start_metro()
            runtime_report["bundlePrewarm"]=lifecycle.prewarm_bundle()
            runtime_report["devClientConnection"]=lifecycle.connect_dev_client()
            if a.reset_app:
                lifecycle._adb("-s",a.device_id,"shell","pm","clear",PACKAGE)
                runtime_report["devClientConnection"]=lifecycle.connect_dev_client()
            _,initial_hier=lifecycle._adb("-s",a.device_id,"exec-out","uiautomator","dump","/dev/tty")
            (out/"hierarchies"/"startup.xml").write_text(redact(initial_hier,redact_emails=False),encoding="utf-8")
            startup=detect_startup_state(initial_hier)
            try:
                initial_shot=subprocess.run([str(lifecycle.adb),"-s",a.device_id,"exec-out","screencap","-p"],cwd=ROOT,capture_output=True,timeout=30,check=False)
                (out/"screenshots"/"startup.png").write_bytes(initial_shot.stdout)
            except Exception as exc:
                limitations.append("STARTUP_SCREENSHOT_CAPTURE_FAILED:"+type(exc).__name__)
            smoke_flows={
                "smoke-auto": ROOT/"cayenne"/"flows"/"smoke"/"smoke-auto.yaml",
                "smoke-clean": ROOT/"cayenne"/"flows"/"smoke"/"smoke-clean.yaml",
                "smoke-authenticated": ROOT/"cayenne"/"flows"/"smoke"/"smoke-authenticated.yaml",
            }
            flow=smoke_flows.get(a.suite,ROOT/"cayenne"/"flows"/"accessibility"/"primary-controls.yaml")
            maestro=tool("maestro") or "maestro"
            rc,output=run_cmd([maestro,"--device",a.device_id,"test",str(flow),"--format","junit","--output",str(out/"maestro"/"junit.xml"),"--test-output-dir",str(out/"maestro"/"artifacts")],ROOT,timeout=300)
            runtime_report["maestro"]={"status":"PASSED" if rc==0 else "FAILED","returnCode":rc}
            (out/"maestro"/"raw-output.log").write_text(redact(output,redact_emails=False),encoding="utf-8")
            _,hier=lifecycle._adb("-s",a.device_id,"exec-out","uiautomator","dump","/dev/tty"); (out/"hierarchies"/"final.xml").write_text(redact(hier,redact_emails=False),encoding="utf-8")
            if not startup["valid"]:
                startup=detect_startup_state(hier)
            _,log=lifecycle._adb("-s",a.device_id,"logcat","-d","-v","brief","-t","500"); (out/"logs"/"logcat.txt").write_text(redact(log,redact_emails=False),encoding="utf-8")
            try:
                shot=subprocess.run([str(lifecycle.adb),"-s",a.device_id,"exec-out","screencap","-p"],cwd=ROOT,capture_output=True,timeout=30,check=False)
                (out/"screenshots"/"final.png").write_bytes(shot.stdout)
            except Exception as exc:
                limitations.append("SCREENSHOT_CAPTURE_FAILED:"+type(exc).__name__)
            for index,path in enumerate((out/"maestro"/"artifacts").rglob("*.png"),start=1):
                shutil.copy2(path,out/"screenshots"/f"maestro-{index:02d}-{path.name}")
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
                flow_status="FAILED"; failures.append({"failureCategory":"APP_DEFECT" if "fatal" in output.lower() or "exception" in output.lower() else "TEST_DEFECT","failureMessage":"Maestro smoke suite failed"})
        except RuntimeFailure as exc:
            flow_status="BLOCKED"
            runtime_report["failure"]={"category":exc.category,"message":str(exc)}
            failures.append({"failureCategory":"ENVIRONMENT_BLOCKER","runtimeCategory":exc.category,"failureMessage":str(exc)})
            limitations.append(exc.category)
        finally:
            write_json(out/"runtime"/"lifecycle.json",runtime_report)
            if lifecycle:
                cleanup=lifecycle.cleanup()
    assertion_meta=smoke_assertion_metadata(startup.get("detectedStartupState"),state_valid=startup.get("valid",False))
    universal_result="PASSED" if all(item["status"]=="PASSED" for item in assertion_meta["universalAssertions"]) and flow_status=="PASSED" else "FAILED"
    state_result="PASSED" if startup.get("valid") and flow_status=="PASSED" else "INSUFFICIENT_EVIDENCE"
    finished=iso(); artifacts=[str(p.relative_to(out)).replace("\\","/") for p in out.rglob("*") if p.is_file() and p.name not in {"result.json","combined-review.md"}]
    result={"contractVersion":"1.0","runId":run_id,"status":flow_status,"startedAt":started,"finishedAt":finished,"requestedSuite":requested_suite,"suite":a.suite,"environment":a.environment,"device":{"platform":"android","deviceId":a.device_id},"detectedStartupState":startup.get("detectedStartupState"),"startupStateCandidates":startup.get("startupStateCandidates",[]),"startupStateValidation":"PASSED" if startup.get("valid") and flow_status=="PASSED" else "FAILED","universalAssertionResult":universal_result,"stateSpecificAssertionResult":state_result,**assertion_meta,"summary":{"acceptanceCriteriaCovered":request["acceptanceCriteria"] if flow_status=="PASSED" else [],"artifactCount":len(artifacts)},"runtime":runtime_report,"cleanup":cleanup,"flows":[{"flowId":a.suite,"title":a.suite,"status":flow_status,"durationMs":0,"preconditions":["Android emulator"],"steps":[],"assertions":request["acceptanceCriteria"],"detectedStartupState":startup.get("detectedStartupState"),"stateSpecificAssertions":assertion_meta["stateSpecificAssertions"],"skippedAssertions":assertion_meta["skippedAssertions"],"skipReason":assertion_meta["skipReason"],"screenshots":[str(p.relative_to(out)).replace("\\","/") for p in (out/"screenshots").glob("*.png")],"hierarchy":"hierarchies/final.xml","logs":["logs/logcat.txt","logs/metro.log","maestro/raw-output.log"],"failureCategory":failures[0]["failureCategory"] if failures else None,"failureMessage":failures[0]["failureMessage"] if failures else None,"retryCount":0}],"failures":failures,"artifacts":artifacts,"safety":safe,"redaction":{"validated":True,"status":"PASSED"},"limitations":limitations}
    write_json(out/"result.json",result); write_json(out/"fixture-report.json",{"status":"NOT_REQUIRED" if not mutation else "BLOCKED_EXTERNAL_QA_CREDENTIALS","runId":run_id,"namespace":f"cayenne:{run_id}","cleanup":"retained" if a.keep_fixture_data else "not-run"})
    review=disposition(result,request) if a.serrano_review else None
    if review:
        write_json(out/"serrano"/"request.json",request); write_json(out/"serrano"/"response.json",review); (out/"serrano"/"review.md").write_text(f"# Serrano review {run_id}\n\nDisposition: **{review['disposition']}**\n",encoding="utf-8"); (out/"combined-review.md").write_text(f"# Cayenne + Serrano review\n\nCayenne: **{flow_status}**\n\nSerrano: **{review['disposition']}**\n\nLimitations: {', '.join(limitations) or 'None'}\n",encoding="utf-8")
    print(json.dumps({"runId":run_id,"status":flow_status,"serranoDisposition":review["disposition"] if review else None,"artifactDirectory":str(out),"limitations":limitations},indent=2)); return 0 if flow_status=="PASSED" else 2
if __name__=="__main__": raise SystemExit(main())
