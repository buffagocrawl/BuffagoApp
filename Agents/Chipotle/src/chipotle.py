"""Read-only, privacy-safe Buffago daily analytics runner (Python 3.11+)."""
from __future__ import annotations

import argparse, json, os, re, subprocess, sys, tempfile, time, uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[3]
BASE = Path(__file__).resolve().parents[1]
DEFAULT_SHARED = ROOT.parent / "Agents" / "Buffago" / "Daily Output"
SENSITIVE = [re.compile(p, re.I) for p in [r"authorization\s*:\s*(?!\[REDACTED\])\S+", r"\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+", r"\b(sb_secret|service_role)[A-Za-z0-9_-]{12,}", r"\b(?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|CHIPOTLE_SUPABASE_(?:URL|SERVICE_ROLE_KEY))\s*[=:]\s*(?!$|\[REDACTED\]|['\"]?['\"]?$)\S+"]]

class ChipotleError(Exception): pass

@dataclass(frozen=True)
class Windows:
    report_date: str; timezone: str; day_start: datetime; day_end: datetime; prev_start: datetime; week_start: datetime; prior_week_start: datetime; month_start: datetime

def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists(): return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        key, value = line.split("=", 1); values[key.strip()] = value.strip().strip('"').strip("'")
    return values

def config() -> dict[str, str]:
    env = {**load_env(BASE.parent / "Chipotle.env.local"), **os.environ}
    required = ["CHIPOTLE_SUPABASE_URL", "CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY"]
    missing = [name for name in required if not env.get(name, "").strip()]
    if missing: raise ChipotleError("credential_missing:" + ",".join(missing))
    return env

def completed_windows(now: datetime, tz_name: str, date: str | None = None) -> Windows:
    tz = ZoneInfo(tz_name); local = now.astimezone(tz)
    report_date = datetime.fromisoformat(date).date() if date else local.date() - timedelta(days=1)
    start_local = datetime.combine(report_date, datetime.min.time(), tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return Windows(report_date.isoformat(), tz_name, start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc), (start_local-timedelta(days=1)).astimezone(timezone.utc), (start_local-timedelta(days=7)).astimezone(timezone.utc), (start_local-timedelta(days=14)).astimezone(timezone.utc), (start_local-timedelta(days=30)).astimezone(timezone.utc))

def iso(dt: datetime) -> str: return dt.isoformat().replace("+00:00", "Z")

class Rest:
    def __init__(self, url: str, key: str, timeout: int = 20): self.url=url.rstrip("/"); self.key=key; self.timeout=timeout
    def get(self, path: str, params: dict[str,str]) -> tuple[list[dict[str,Any]], str | None]:
        query = urlencode(params, safe="(),.*")
        req = Request(f"{self.url}/{path}?{query}", headers={"apikey":self.key,"Authorization":f"Bearer {self.key}","Accept":"application/json","Prefer":"count=exact"}, method="GET")
        for attempt in range(3):
            try:
                with urlopen(req, timeout=self.timeout) as response:
                    body = json.loads(response.read().decode("utf-8")); return (body if isinstance(body,list) else [body]), response.headers.get("Content-Range")
            except HTTPError as exc:
                if exc.code in (408,429,500,502,503,504) and attempt < 2: time.sleep(0.4*(attempt+1)); continue
                raise ChipotleError(f"supabase_http_{exc.code}")
            except (URLError, TimeoutError):
                if attempt < 2: time.sleep(0.4*(attempt+1)); continue
                raise ChipotleError("supabase_unreachable")
    def count(self, table:str, column:str, start:datetime, end:datetime) -> int:
        _, cr = self.get(f"rest/v1/{table}", {"select":"id", column:f"gte.{iso(start)}", f"{column}.lt":iso(end), "limit":"1"})
        if not cr or "/" not in cr: raise ChipotleError("count_unavailable")
        return int(cr.rsplit("/",1)[1])
    def rows(self, table:str, fields:str, column:str, start:datetime, end:datetime, limit:int=10000) -> list[dict[str,Any]]:
        rows,_ = self.get(f"rest/v1/{table}", {"select":fields,column:f"gte.{iso(start)}",f"{column}.lt":iso(end),"limit":str(limit)})
        return rows

def safe_collect(rest: Rest, table:str, timestamp:str, windows:Windows) -> dict[str,Any]:
    try:
        return {"availability":"available","yesterday":rest.count(table,timestamp,windows.day_start,windows.day_end),"previousDay":rest.count(table,timestamp,windows.prev_start,windows.day_start),"trailing7":rest.count(table,timestamp,windows.week_start,windows.day_end),"trailing30":rest.count(table,timestamp,windows.month_start,windows.day_end)}
    except ChipotleError as exc: return {"availability":"unavailable","reason":str(exc)}

def jalapeno_health(windows:Windows, thresholds:dict[str,Any]) -> dict[str,Any]:
    data = ROOT / "Agents" / "Jalapeno" / "data"; candidates = list(data.glob("latest_*.json")) if data.exists() else []
    latest = max(candidates, key=lambda p:p.stat().st_mtime) if candidates else None
    if not latest: return {"status":"Unavailable","reason":"no_machine_readable_artifact"}
    age = (datetime.now(timezone.utc)-datetime.fromtimestamp(latest.stat().st_mtime,timezone.utc)).total_seconds()/3600
    return {"status":"Healthy" if age <= thresholds["jalapenoExpectedFreshnessHours"] else "Investigate","artifact":latest.name,"artifactTimestamp":iso(datetime.fromtimestamp(latest.stat().st_mtime,timezone.utc)),"ageHours":round(age,1),"reason":"local_artifact_freshness"}

def collect(rest:Rest, w:Windows, thresholds:dict[str,Any]) -> dict[str,Any]:
    metrics={
      "ratings_created":safe_collect(rest,"destination_ratings","created_at",w),
      "crawls_created":safe_collect(rest,"crawls","start_time",w),
      "crawls_completed":safe_collect(rest,"crawls","end_time",w),
      "badges_awarded":safe_collect(rest,"user_badges","earned_at",w),
      "onboarding_events":safe_collect(rest,"onboarding_analytics","started_at",w),
      "wing_battle_votes":safe_collect(rest,"user_wing_battle_votes","created_at",w),
      "xp_claims":safe_collect(rest,"daily_xp_claims","claimed_at",w),
      "jalapeno_runs":safe_collect(rest,"jalapeno_runs","started_at",w),
      "jalapeno_errors":safe_collect(rest,"jalapeno_errors","created_at",w),
    }
    # Auth admin endpoint is intentionally excluded from normal runs: a dedicated limited analytics key is preferred.
    metrics["registered_users"]={"availability":"unavailable","reason":"auth_users_requires_explicit_safe_aggregate_source"}
    for name in ("dau","wau","mau","retention_d1","retention_d7","retention_d30","missions","referrals","state_passport","error_telemetry","auth_failures","performance_percentiles"):
        metrics[name]={"availability":"unavailable","reason":"no_authoritative_privacy_safe_event_or_aggregate_source_detected"}
    return {"metrics":metrics,"jalapeno":jalapeno_health(w,thresholds)}

def value(metric:dict[str,Any], key:str) -> str: return str(metric.get(key,"—")) if metric.get("availability")=="available" else "Unavailable"
def change(metric:dict[str,Any]) -> str:
    if metric.get("availability")!="available": return "—"
    a,b=metric["yesterday"],metric["previousDay"]
    return f"{a-b:+d}" if b else ("new" if a else "0")
def render(data:dict[str,Any], w:Windows, git_sha:str) -> str:
    m=data["metrics"]; lines=[f"# Buffago Daily Metrics — {w.report_date}","","## Executive Summary",""]
    available=[k for k,v in m.items() if v.get("availability")=="available"]; unavailable=[k for k,v in m.items() if v.get("availability")!="available"]
    lines += [f"- **Data collection:** {len(available)} aggregate sources available; {len(unavailable)} metrics are honestly unavailable.",f"- **Jalapeno:** {data['jalapeno']['status']}.","- **Immediate action:** Monitor unless a source is partial, stale, or unavailable.","","## Daily Scorecard","","| Metric | Yesterday | Previous day | Change | Trailing 7 days | Status |","|---|---:|---:|---:|---:|---|"]
    for key in ("ratings_created","crawls_created","crawls_completed","badges_awarded","onboarding_events","wing_battle_votes","xp_claims","jalapeno_runs","jalapeno_errors"):
        x=m[key]; lines.append(f"| {key.replace('_',' ').title()} | {value(x,'yesterday')} | {value(x,'previousDay')} | {change(x)} | {value(x,'trailing7')} | {'Healthy' if x.get('availability')=='available' else 'Unavailable'} |")
    lines += ["","## Users and Retention","","Retention, active-user ratios, and onboarding completion require a privacy-safe authoritative activity and auth aggregate source. Partial cohorts are not estimated.","","## Ratings and Core Engagement","",f"Ratings created is sourced from `destination_ratings.created_at`: {value(m['ratings_created'],'yesterday')} yesterday.","","## Crawls, Missions, XP, and Rewards","",f"Crawls created/completed use `crawls.start_time` / `crawls.end_time`; badges use `user_badges.earned_at`; daily XP activity uses `daily_xp_claims.claimed_at`.","","## Reliability and Authentication","","No authoritative application error, session, authentication-failure, or timing telemetry was detected; this is **Unavailable**, not zero errors.","","## Jalapeno Health","",f"Status: **{data['jalapeno']['status']}**. {data['jalapeno'].get('reason','')} Artifact: {data['jalapeno'].get('artifact','—')}.","","## Significant Changes","","Changes are shown as counts; no anomaly claim is made without sufficient denominators and history.","","## Recommended Actions","","1. **This Week — Analytics:** add approved aggregate activity/error views to enable retention and reliability metrics.","2. **Monitor — Jalapeno:** investigate if its local artifact exceeds the configured freshness window.","","## Data Quality and Missing Metrics","",f"Unavailable: {', '.join(unavailable)}. See `docs/metric-source-map.md` for required sources.","","## Run Metadata","",f"- Execution timestamp: {iso(datetime.now(timezone.utc))}",f"- Reporting timezone: {w.timezone}",f"- Reporting window: {iso(w.day_start)} to {iso(w.day_end)} (end exclusive)",f"- Chipotle Git commit: {git_sha}","- Data-source status: aggregate REST GET collection; no writes performed."]
    return "\n".join(lines)+"\n"

def atomic_write(path:Path, text:str) -> None:
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile("w",encoding="utf-8",dir=path.parent,delete=False) as f: f.write(text); temp=Path(f.name)
    os.replace(temp,path)
def scan(paths:list[Path]) -> list[str]:
    findings=[]
    for path in paths:
        if not path.exists(): continue
        for n,line in enumerate(path.read_text(encoding="utf-8",errors="replace").splitlines(),1):
            if any(p.search(line) for p in SENSITIVE): findings.append(f"{path.name}:{n}:sensitive_pattern")
    return findings
def git(args:list[str]) -> subprocess.CompletedProcess[str]: return subprocess.run(["git",*args],cwd=ROOT,text=True,capture_output=True,check=False)
def git_safe_commit(files:list[Path], date:str, env:dict[str,str], dry:bool) -> dict[str,str]:
    if dry:return {"commit":"skipped_dry_run","push":"skipped_dry_run"}
    branch=env.get("CHIPOTLE_GIT_BRANCH") or git(["branch","--show-current"]).stdout.strip(); remote=env.get("CHIPOTLE_GIT_REMOTE","origin")
    if git(["rev-parse","--show-toplevel"]).stdout.strip()!=str(ROOT) or git(["rev-parse","-q","--verify","MERGE_HEAD"]).returncode==0: raise ChipotleError("git_unsafe_state")
    if git(["branch","--show-current"]).stdout.strip()!=branch: raise ChipotleError("git_wrong_branch")
    if git(["fetch",remote,branch]).returncode: raise ChipotleError("git_fetch_failed")
    counts=git(["rev-list","--left-right","--count",f"{branch}...{remote}/{branch}"])
    if counts.returncode or int(counts.stdout.split()[1])>0: raise ChipotleError("git_branch_behind_or_diverged")
    rel=[str(p.relative_to(ROOT)).replace("\\","/") for p in files]
    if git(["add","--",*rel]).returncode: raise ChipotleError("git_stage_failed")
    if git(["diff","--cached","--quiet"]).returncode==0:return {"commit":"no_op","push":"no_op"}
    if git(["commit","-m",f"chore(chipotle): add daily metrics for {date}","--",*rel]).returncode: raise ChipotleError("git_commit_failed")
    if env.get("CHIPOTLE_ENABLE_GIT_PUSH","false").lower()=="true":
        if git(["push",remote,branch]).returncode: raise ChipotleError("git_push_failed")
        return {"commit":"committed","push":"pushed"}
    return {"commit":"committed","push":"disabled"}

def main(argv:list[str]|None=None)->int:
    parser=argparse.ArgumentParser(); parser.add_argument("--date"); parser.add_argument("--dry-run",action="store_true"); parser.add_argument("--smoke-test",action="store_true"); args=parser.parse_args(argv)
    started=iso(datetime.now(timezone.utc)); result={"runId":str(uuid.uuid4()),"startedAt":started,"success":False,"gitCommitStatus":"not_started","gitPushStatus":"not_started"}
    try:
        env=config(); w=completed_windows(datetime.now(timezone.utc),env.get("CHIPOTLE_TIMEZONE","America/New_York"),args.date); rest=Rest(env["CHIPOTLE_SUPABASE_URL"],env["CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY"],int(env.get("CHIPOTLE_HTTP_TIMEOUT_SECONDS","20")))
        if args.smoke_test: rest.get("rest/v1/destinations",{"select":"id","limit":"1"}); print("Read-only Supabase smoke test passed"); return 0
        thresholds=json.loads((BASE/"config"/"thresholds.json").read_text()); collected=collect(rest,w,thresholds); sha=git(["rev-parse","--short","HEAD"]).stdout.strip() or "unknown"; markdown=render(collected,w,sha)
        results=Path(env.get("CHIPOTLE_RESULTS_DIR") or BASE/"Results"); shared=Path(env.get("CHIPOTLE_SHARED_BRAIN_DIR") or DEFAULT_SHARED); md=results/f"{w.report_date}-buffago-daily-metrics.md"; js=results/f"{w.report_date}-buffago-daily-metrics.json"; latest=results/"latest.md"; shared_md=shared/f"{w.report_date}-chipotle-buffago-daily-metrics.md"; shared_latest=shared/"chipotle-latest.md"
        payload={"schemaVersion":1,"reportDate":w.report_date,"generatedAt":iso(datetime.now(timezone.utc)),"windows":{"dayStart":iso(w.day_start),"dayEnd":iso(w.day_end),"timezone":w.timezone},**collected}
        atomic_write(md,markdown); atomic_write(js,json.dumps(payload,indent=2,sort_keys=True)+"\n"); atomic_write(latest,markdown); atomic_write(shared_md,markdown); atomic_write(shared_latest,markdown)
        findings=scan([md,js,latest,shared_md,shared_latest]);
        if findings: raise ChipotleError("secret_scan_failed")
        statuses=git_safe_commit([md,js,latest],w.report_date,env,args.dry_run); result.update({"success":True,"reportDate":w.report_date,"reportPaths":[str(md),str(js),str(shared_md)],"gitCommitStatus":statuses["commit"],"gitPushStatus":statuses["push"],"collection":"partial" if any(v.get("availability")!='available' for v in collected['metrics'].values()) else "complete"})
    except ChipotleError as exc: result["errorCategory"]=str(exc)
    except Exception: result["errorCategory"]="unexpected_sanitized_failure"
    result["endedAt"]=iso(datetime.now(timezone.utc)); atomic_write(BASE/"artifacts"/"last-run-result.json",json.dumps(result,indent=2,sort_keys=True)+"\n"); print(json.dumps({k:v for k,v in result.items() if k not in {"reportPaths"}},sort_keys=True)); return 0 if result["success"] else 2
if __name__=="__main__": raise SystemExit(main())
