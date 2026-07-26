"""Read-only, privacy-safe Buffago metrics collector (Python 3.11+)."""
from __future__ import annotations

import argparse, hashlib, json, os, re, subprocess, tempfile, time, uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[3]
BASE = Path(__file__).resolve().parents[1]
DEFAULT_SHARED = ROOT.parent / "Agents" / "Buffago"
SCHEMA_VERSION = "2.0.0"
DEFINITION_VERSION = "2026-07-26.1"
SENSITIVE = [re.compile(p, re.I) for p in [r"authorization\s*:\s*(?!\[REDACTED\])\S+", r"\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+", r"\b(sb_secret|service_role)[A-Za-z0-9_-]{12,}", r"\b(?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|CHIPOTLE_SUPABASE_(?:URL|SERVICE_ROLE_KEY))\s*[=:]\s*(?!$|\[REDACTED\]|['\"]?['\"]?$)\S+"]]
PII = [re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I), re.compile(r"\"(?:user_id|email|phone|identity_id)\"\s*:", re.I)]
UNAVAILABLE_REASON = "no_authoritative_privacy_safe_aggregate_source_detected"
MEANINGFUL_ALLOWLIST = ["destination_ratings.created_at", "crawls.start_time", "crawls.end_time", "user_wing_battle_votes.created_at", "daily_xp_claims.claimed_at"]

class ChipotleError(Exception): pass

@dataclass(frozen=True)
class Windows:
    report_date: str; timezone: str; day_start: datetime; day_end: datetime; prev_start: datetime; week_start: datetime; prior_week_start: datetime; month_start: datetime

def iso(dt: datetime) -> str: return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
def load_env(path: Path) -> dict[str, str]:
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line=line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value=line.split("=",1); values[key.strip()]=value.strip().strip('"').strip("'")
    return values
def config() -> dict[str,str]:
    env={**load_env(BASE.parent / "Chipotle.env.local"), **os.environ}; required=["CHIPOTLE_SUPABASE_URL","CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY"]
    if missing:=[k for k in required if not env.get(k,"").strip()]: raise ChipotleError("credential_missing:"+",".join(missing))
    parsed=urlparse(env["CHIPOTLE_SUPABASE_URL"]); match=re.fullmatch(r"/dashboard/project/([a-z0-9]+)",parsed.path.rstrip("/"))
    if parsed.netloc=="supabase.com" and match: env["CHIPOTLE_SUPABASE_URL"]=f"https://{match.group(1)}.supabase.co"
    elif not(parsed.scheme=="https" and parsed.netloc.endswith(".supabase.co") and not parsed.path.rstrip("/")): raise ChipotleError("supabase_url_invalid_or_not_project_api")
    return env
def completed_windows(now:datetime,tz_name:str,date:str|None=None)->Windows:
    tz=ZoneInfo(tz_name); local=now.astimezone(tz); report=datetime.fromisoformat(date).date() if date else local.date()-timedelta(days=1); start=datetime.combine(report,datetime.min.time(),tzinfo=tz)
    return Windows(report.isoformat(),tz_name,start.astimezone(timezone.utc),(start+timedelta(days=1)).astimezone(timezone.utc),(start-timedelta(days=1)).astimezone(timezone.utc),(start-timedelta(days=7)).astimezone(timezone.utc),(start-timedelta(days=14)).astimezone(timezone.utc),(start-timedelta(days=30)).astimezone(timezone.utc))

class Rest:
    def __init__(self,url:str,key:str,timeout:int=20): self.url=url.rstrip("/"); self.key=key; self.timeout=timeout
    def get(self,path:str,params:dict[str,str]|list[tuple[str,str]])->tuple[list[dict[str,Any]],str|None]:
        req=Request(f"{self.url}/{path}?{urlencode(params,safe='(),.*')}",headers={"apikey":self.key,"Authorization":f"Bearer {self.key}","Accept":"application/json","Prefer":"count=exact"},method="GET")
        for attempt in range(3):
            try:
                with urlopen(req,timeout=self.timeout) as response:
                    body=json.loads(response.read().decode()); return (body if isinstance(body,list) else [body]),response.headers.get("Content-Range")
            except HTTPError as exc:
                if exc.code in (408,429,500,502,503,504) and attempt<2: time.sleep(.4*(attempt+1)); continue
                raise ChipotleError(f"supabase_http_{exc.code}")
            except (URLError,TimeoutError):
                if attempt<2: time.sleep(.4*(attempt+1)); continue
                raise ChipotleError("supabase_unreachable")
        raise ChipotleError("supabase_unreachable")
    def count(self,table:str,column:str,start:datetime,end:datetime)->int:
        _,cr=self.get(f"rest/v1/{table}",[("select",column),(column,f"gte.{iso(start)}"),(column,f"lt.{iso(end)}"),("limit","1")])
        if not cr or "/" not in cr: raise ChipotleError("count_unavailable")
        return int(cr.rsplit("/",1)[1])

def unavailable(reason:str=UNAVAILABLE_REASON,status:str="unavailable")->dict[str,Any]: return {"value":None,"status":status,"reason":reason,"source":None,"confidence":"none"}
def metric(value:Any,source:str,calculation:str,*,status:str="calculated",confidence:str="high",timestamp:str|None=None,**extra:Any)->dict[str,Any]:
    return {"value":value,"status":status,"source":source,"calculation":calculation,"timestamp":timestamp,"confidence":confidence,**extra}
def percent(current:float|int|None,previous:float|int|None)->float|None:
    if current is None or previous is None or previous==0:return None
    return round((current-previous)/previous*100,2)
def direction(current:float|int|None,previous:float|int|None)->str:
    if current is None or previous is None:return "unknown"
    return "up" if current>previous else "down" if current<previous else "flat"
def trend(current:dict[str,Any],previous:dict[str,Any]|None=None,*,complete:bool=True)->dict[str,Any]:
    p=previous or unavailable("no_prior_snapshot")
    return {"current":current.get("value"),"previous":p.get("value"),"absolute_delta":None if current.get("value") is None or p.get("value") is None else current["value"]-p["value"],"percentage_delta":percent(current.get("value"),p.get("value")),"trend_direction":direction(current.get("value"),p.get("value")),"comparison_windows_complete":complete,"confidence":current.get("confidence","none")}
def safe_count(rest:Rest,table:str,column:str,w:Windows)->dict[str,Any]:
    try:
        values={"daily":rest.count(table,column,w.day_start,w.day_end),"previous_day":rest.count(table,column,w.prev_start,w.day_start),"trailing_7_days":rest.count(table,column,w.week_start,w.day_end),"trailing_28_days":rest.count(table,column,w.month_start+timedelta(days=2),w.day_end)}
        return metric(values,f"public.{table}.{column}","count rows in completed Eastern windows",timestamp=iso(w.day_end),windows_complete=True)
    except ChipotleError as exc:return unavailable(str(exc),"query_failed")
def safe_daily_aggregate(rest:Rest,w:Windows)->dict[str,Any]:
    try:
        def one(date:str)->int|None:
            rows,_=rest.get("rest/v1/analytics_daily_active_users",{"select":"event_date,active_identities","event_date":f"eq.{date}","limit":"1"})
            return int(rows[0]["active_identities"]) if rows else 0
        dates=[(w.day_start-timedelta(days=i)).astimezone(ZoneInfo(w.timezone)).date().isoformat() for i in range(28)]
        values=[one(d) for d in dates]; return metric({"daily":values[0],"previous_day":values[1],"trailing_7_days_sum":sum(values[:7]),"trailing_28_days_sum":sum(values)},"public.analytics_daily_active_users.active_identities","daily distinct identities supplied by authoritative aggregate; rolling sums are not deduplicated",timestamp=iso(w.day_end),confidence="medium")
    except (ChipotleError,KeyError,TypeError,ValueError) as exc:return unavailable(str(exc) if isinstance(exc,ChipotleError) else "aggregate_source_invalid","query_failed")

def legacy(metric_record:dict[str,Any])->dict[str,Any]:
    if metric_record["status"] not in ("verified","calculated","manually_verified"):return {"availability":"unavailable","reason":metric_record.get("reason","unavailable")}
    value=metric_record["value"]
    if isinstance(value,dict): return {"availability":"available","yesterday":value.get("daily"),"previousDay":value.get("previous_day"),"trailing7":value.get("trailing_7_days",value.get("trailing_7_days_sum")),"trailing30":value.get("trailing_28_days",value.get("trailing_28_days_sum")),"source":metric_record["source"]}
    return {"availability":"available","yesterday":value,"source":metric_record["source"]}
def manual_business(shared:Path)->dict[str,Any]:
    path=shared/"metrics"/"manual-business-facts.json"
    if not path.exists():return {"status":"unavailable","reason":"manual_business_facts_file_not_present","facts":{}}
    try:
        data=json.loads(path.read_text(encoding="utf-8")); facts=data.get("facts",{})
        if not isinstance(facts,dict):raise ValueError
        return {"status":"available","source":str(path.relative_to(shared.parent)).replace("\\","/"),"facts":facts}
    except (OSError,ValueError,json.JSONDecodeError):return {"status":"query_failed","reason":"manual_business_facts_invalid","facts":{}}
def jalapeno_health(w:Windows,thresholds:dict[str,Any])->dict[str,Any]:
    candidates=list((ROOT/"Agents"/"Jalapeno"/"data").glob("latest_*.json")) if (ROOT/"Agents"/"Jalapeno"/"data").exists() else []
    if not candidates:return {"status":"unavailable","reason":"no_machine_readable_artifact"}
    latest=max(candidates,key=lambda p:p.stat().st_mtime); age=(datetime.now(timezone.utc)-datetime.fromtimestamp(latest.stat().st_mtime,timezone.utc)).total_seconds()/3600
    return {"status":"verified" if age<=thresholds["jalapenoExpectedFreshnessHours"] else "stale","artifact":latest.name,"age_hours":round(age,1),"timestamp":iso(datetime.fromtimestamp(latest.stat().st_mtime,timezone.utc))}

def collect(rest:Rest,w:Windows,thresholds:dict[str,Any],shared:Path)->dict[str,Any]:
    raw={"ratings_created":safe_count(rest,"destination_ratings","created_at",w),"crawls_created":safe_count(rest,"crawls","start_time",w),"crawls_completed":safe_count(rest,"crawls","end_time",w),"badges_awarded":safe_count(rest,"user_badges","earned_at",w),"onboarding_starts":safe_count(rest,"onboarding_analytics","started_at",w),"wing_duel_votes":safe_count(rest,"user_wing_battle_votes","created_at",w),"xp_claims":safe_count(rest,"daily_xp_claims","claimed_at",w),"jalapeno_runs":safe_count(rest,"jalapeno_runs","started_at",w),"jalapeno_errors":safe_count(rest,"jalapeno_errors","created_at",w),"any_activity":safe_daily_aggregate(rest,w)}
    missing={k:unavailable() for k in ["meaningful_dau","meaningful_wau","meaningful_mau","new_registered_users_1d","new_registered_users_7d","new_registered_users_30d","returning_active_users","anonymous_authenticated_activity","onboarding_completions","onboarding_completion_rate","first_meaningful_action_users","first_rating_users","activated_users","activation_rate","time_to_activation","d1_retention","d7_retention","d30_retention","weekly_returning_user_rate","wau_mau_ratio","retained_meaningful_users","unique_active_raters","restaurants_viewed","restaurants_rated","newly_covered_restaurants","towns_with_meaningful_activity","states_with_meaningful_activity","mission_participation","crawl_participation","social_shares","referrals_sent","successful_referrals","repeat_contributors","ugc_volume","meaningful_actions_per_user","organic_acquisition","referral_acquisition","other_acquisition","referral_conversion","active_market_growth","geographic_concentration","top_active_markets","strongest_market_activity_pct","market_density","auth_success_failure","core_action_success_failure","rating_submission_success_failure","application_errors","crash_free","production_incidents","failed_backend_operations","release_distribution"]}
    business=manual_business(shared)
    business_metrics={}
    for key in ("revenue","paying_customers","restaurant_partnerships","active_partner_conversations","sponsorships","acquisition_spending","acquisition_cost","infrastructure_cost","other_validated_business_signals"):
        fact=business["facts"].get(key)
        business_metrics[key]=metric(fact.get("value"),business.get("source","manual-business-facts.json"),"manually verified shared-brain business fact",status="manually_verified",confidence=fact.get("confidence","medium"),timestamp=fact.get("verified_at"),notes=fact.get("notes")) if isinstance(fact,dict) and fact.get("value") is not None else unavailable("manual_business_fact_not_provided")
    legacy_map={"ratings_created":raw["ratings_created"],"crawls_created":raw["crawls_created"],"crawls_completed":raw["crawls_completed"],"badges_awarded":raw["badges_awarded"],"onboarding_events":raw["onboarding_starts"],"wing_battle_votes":raw["wing_duel_votes"],"xp_claims":raw["xp_claims"],"jalapeno_runs":raw["jalapeno_runs"],"jalapeno_errors":raw["jalapeno_errors"],"dau":raw["any_activity"]}
    for name in ("registered_users","wau","mau","retention_d1","retention_d7","retention_d30","missions","referrals","state_passport","error_telemetry","auth_failures","performance_percentiles"):legacy_map[name]=missing.get(name,unavailable())
    return {"raw":raw,"missing":missing,"business":business_metrics,"metrics":{k:legacy(v) for k,v in legacy_map.items()},"jalapeno":jalapeno_health(w,thresholds)}

def build_payload(collected:dict[str,Any],w:Windows,run_id:str,generated_at:str,previous:dict[str,Any]|None=None)->dict[str,Any]:
    raw,missing,business=collected["raw"],collected["missing"],collected["business"]
    all_records=list(raw.values())+list(missing.values())+list(business.values()); usable=[m for m in all_records if m["status"] in ("verified","calculated","manually_verified")]; failed=[m for m in all_records if m["status"]=="query_failed"]
    completeness=round(100*len(usable)/len(all_records),1) if all_records else 0; confidence="high" if not failed and completeness>=70 else "medium" if not failed else "low"
    warnings=[]
    if failed:warnings.append("One or more source queries failed; affected values are null, not zero.")
    if completeness<100:warnings.append("Some required metrics lack a privacy-safe authoritative aggregate source.")
    def prior(name:str)->dict[str,Any]|None:
        return previous.get("metric_index",{}).get(name) if previous else None
    activation={k:missing[k] for k in ("onboarding_completions","onboarding_completion_rate","first_meaningful_action_users","first_rating_users","activated_users","activation_rate","time_to_activation")}; activation["onboarding_starts"]=raw["onboarding_starts"]; activation["definition"]="Activated means completing onboarding and a first meaningful action; unavailable until a privacy-safe aggregate can join those events."
    retention={k:missing[k] for k in ("d1_retention","d7_retention","d30_retention","weekly_returning_user_rate","wau_mau_ratio","retained_meaningful_users")}; retention["methodology"]="Cohort retention requires stable privacy-safe cohort aggregates. Each future percentage must include cohort_size; cohorts not old enough are cohort_not_mature, never zero."
    audience={"daily_active_users_any_activity":raw["any_activity"],"weekly_active_users_any_activity":unavailable("daily aggregate cannot deduplicate identities across days"),"monthly_active_users_any_activity":unavailable("daily aggregate cannot deduplicate identities across days"),"daily_meaningful_active_users":missing["meaningful_dau"],"weekly_meaningful_active_users":missing["meaningful_wau"],"monthly_meaningful_active_users":missing["meaningful_mau"],**{k:missing[k] for k in ("new_registered_users_1d","new_registered_users_7d","new_registered_users_30d","returning_active_users","anonymous_authenticated_activity")}}
    engagement={**{k:raw[k] for k in ("ratings_created","crawls_created","crawls_completed","badges_awarded","wing_duel_votes","xp_claims")},**{k:missing[k] for k in ("unique_active_raters","restaurants_viewed","restaurants_rated","newly_covered_restaurants","towns_with_meaningful_activity","states_with_meaningful_activity","mission_participation","crawl_participation","social_shares","referrals_sent","successful_referrals","repeat_contributors","ugc_volume","meaningful_actions_per_user")}}
    growth={k:missing[k] for k in ("organic_acquisition","referral_acquisition","other_acquisition","referral_conversion","active_market_growth","geographic_concentration","top_active_markets","strongest_market_activity_pct","market_density")}
    health={k:missing[k] for k in ("auth_success_failure","core_action_success_failure","rating_submission_success_failure","application_errors","crash_free","production_incidents","failed_backend_operations","release_distribution")}; health["data_pipeline_health"]=metric("partial" if warnings else "healthy","Chipotle read-only collection","collection status based on aggregate source responses",confidence=confidence,timestamp=generated_at)
    index={"any_activity_dau":raw["any_activity"],"ratings_created":raw["ratings_created"],"crawls_created":raw["crawls_created"],"onboarding_starts":raw["onboarding_starts"]}
    return {"schema_version":SCHEMA_VERSION,"metadata":{"schema_version":SCHEMA_VERSION,"generated_at":generated_at,"reporting_date":w.report_date,"timezone":w.timezone,"collection_status":"partial" if warnings else "complete","collection_run_id":run_id,"source_systems":["Supabase public aggregate REST GET", "local Jalapeno artifact freshness", "shared manual business facts (read-only)"],"data_window":{"day_start":iso(w.day_start),"day_end":iso(w.day_end),"end_exclusive":True},"oldest_source_timestamp":iso(w.month_start),"newest_source_timestamp":iso(w.day_end),"freshness_status":"fresh","completeness_percentage":completeness,"overall_evidence_confidence":confidence,"metric_definition_version":DEFINITION_VERSION,"meaningful_activity_definition":"A user who completes at least one recognized core Buffago action. This source set does not expose identity-safe meaningful-user aggregates, so meaningful active-user counts remain unavailable.","meaningful_event_allowlist":MEANINGFUL_ALLOWLIST,"warnings":warnings,"unavailable_metrics":sorted([name for name,val in {**missing,**business}.items() if val["status"] not in ("verified","calculated","manually_verified")]),"provenance":"GET-only aggregate queries; no credentials, identifiers, raw event payloads, or production writes."},"audience":audience,"activation":activation,"retention":retention,"engagement_and_community":engagement,"growth":growth,"product_health":health,"business_viability":business,"operational_maturity":{"analytics_coverage":metric(completeness,"Chipotle metric inventory","supported metric records / contract records",confidence=confidence),"data_freshness":metric("fresh","Chipotle collection","completed Eastern day",confidence=confidence),"scheduled_collection":metric("configured","Agents/Chipotle/scripts/install-scheduled-task.ps1","scheduled task configuration exists",confidence="medium"),"reporting_reliability":metric("partial" if warnings else "complete","Chipotle collection","collection status",confidence=confidence),"critical_instrumentation_gaps":["identity-safe meaningful active-user aggregates","auth registration aggregates","cohort retention aggregates","product telemetry and error aggregates","geographic aggregate views"],"maturity_model_data_support_percentage":completeness,"jalapeno_health":collected["jalapeno"]},"trends":{name:trend(record,prior(name)) for name,record in index.items()},"metric_index":index,"legacy":{"schemaVersion":1,"reportDate":w.report_date,"generatedAt":generated_at,"windows":{"dayStart":iso(w.day_start),"dayEnd":iso(w.day_end),"timezone":w.timezone},"metrics":collected["metrics"],"jalapeno":collected["jalapeno"]}}

def render(payload:dict[str,Any])->str:
    m=payload["metadata"]; a=payload["audience"]; e=payload["engagement_and_community"]; val=lambda x: "Unavailable" if x.get("value") is None else str(x["value"].get("daily",x["value"]) if isinstance(x.get("value"),dict) else x["value"])
    gaps=", ".join(m["unavailable_metrics"][:8]) or "None"
    return f"# Buffago Metrics — {m['reporting_date']}\n\n- Collection status: **{m['collection_status']}**; completeness: **{m['completeness_percentage']}%**; evidence confidence: **{m['overall_evidence_confidence']}**.\n- Meaningful DAU / WAU / MAU: **{val(a['daily_meaningful_active_users'])} / {val(a['weekly_meaningful_active_users'])} / {val(a['monthly_meaningful_active_users'])}**.\n- Any-activity DAU: **{val(a['daily_active_users_any_activity'])}** (the current daily aggregate cannot safely calculate WAU/MAU).\n\n## Growth and activation\n\nGrowth acquisition and activation completion are unavailable pending identity-safe aggregate instrumentation. Activation is defined as onboarding completion plus a first meaningful action; Chipotle does not infer it.\n\n## Engagement and geography\n\n- Ratings created: **{val(e['ratings_created'])}**; crawls created: **{val(e['crawls_created'])}**; Wing Duel votes: **{val(e['wing_duel_votes'])}**.\n- Geographic and market-density data: unavailable pending aggregate views.\n\n## Retention and product health\n\nRetention cohorts are unavailable; immature cohorts must be emitted as `cohort_not_mature`, never zero. Product telemetry is unavailable, not a claim of zero errors.\n\n## Business signals\n\nManual verified facts are read from `Buffago/metrics/manual-business-facts.json` without overwriting it. Missing facts are unavailable.\n\n## Strongest signal / largest constraint\n\n- Strongest positive signal: aggregate ratings and crawl activity are collected from production read-only sources.\n- Largest constraint: no identity-safe meaningful-user, cohort, activation, telemetry, or geography aggregates yet.\n\n## Important gaps and prior-week comparison\n\nImportant gaps: {gaps}. Prior-week comparisons are present only where complete historical snapshots exist; no maturity score is calculated here.\n\nMachine-readable: `Buffago/metrics/latest.json` and `Buffago/metrics/daily/{m['reporting_date']}.json`.\n"

def atomic_write(path:Path,text:str)->None:
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile("w",encoding="utf-8",dir=path.parent,delete=False) as f:f.write(text); temp=Path(f.name)
    os.replace(temp,path)
def scan(paths:list[Path])->list[str]:
    findings=[]
    for path in paths:
        if path.exists():
            for n,line in enumerate(path.read_text(encoding="utf-8",errors="replace").splitlines(),1):
                if any(p.search(line) for p in SENSITIVE+PII):findings.append(f"{path.name}:{n}:sensitive_or_pii_pattern")
    return findings
def validate_payload(payload:dict[str,Any])->list[str]:
    required={"schema_version","metadata","audience","activation","retention","engagement_and_community","growth","product_health","business_viability","operational_maturity","trends","metric_index","legacy"}; return [] if payload.get("schema_version")==SCHEMA_VERSION and required<=set(payload) else ["schema_validation_failed"]
def snapshot_fingerprint(payload:dict[str,Any])->str:
    copy=json.loads(json.dumps(payload)); copy["metadata"].pop("generated_at",None); copy["metadata"].pop("collection_run_id",None); return hashlib.sha256(json.dumps(copy,sort_keys=True,separators=(",",":")).encode()).hexdigest()[:12]
def write_snapshots(shared:Path,payload:dict[str,Any],markdown:str)->list[Path]:
    metrics=shared/"metrics"; daily=metrics/"daily"; date=payload["metadata"]["reporting_date"]; target=daily/f"{date}.json"; target_md=daily/f"{date}.md"; fingerprint=snapshot_fingerprint(payload)
    if target.exists() and target.read_text(encoding="utf-8")!=json.dumps(payload,indent=2,sort_keys=True)+"\n":
        payload["metadata"]["regeneration"]={"replaces_no_history":True,"previous_snapshot":target.name,"content_fingerprint":fingerprint}; target=daily/f"{date}.regenerated-{fingerprint}.json"; target_md=daily/f"{date}.regenerated-{fingerprint}.md"
    text=json.dumps(payload,indent=2,sort_keys=True)+"\n"; atomic_write(target,text); atomic_write(target_md,markdown); atomic_write(metrics/"latest.json",text); atomic_write(metrics/"latest.md",markdown); return [target,target_md,metrics/"latest.json",metrics/"latest.md"]
def git(args:list[str])->subprocess.CompletedProcess[str]:return subprocess.run(["git",*args],cwd=ROOT,text=True,capture_output=True,check=False)
def git_safe_commit(files:list[Path],date:str,env:dict[str,str],dry:bool)->dict[str,str]:
    if dry:return {"commit":"skipped_dry_run","push":"skipped_dry_run"}
    branch=env.get("CHIPOTLE_GIT_BRANCH") or git(["branch","--show-current"]).stdout.strip(); remote=env.get("CHIPOTLE_GIT_REMOTE","origin")
    if Path(git(["rev-parse","--show-toplevel"]).stdout.strip()).resolve()!=ROOT.resolve() or git(["rev-parse","-q","--verify","MERGE_HEAD"]).returncode==0 or git(["branch","--show-current"]).stdout.strip()!=branch:raise ChipotleError("git_unsafe_state")
    if git(["fetch",remote,branch]).returncode:raise ChipotleError("git_fetch_failed")
    counts=git(["rev-list","--left-right","--count",f"{branch}...{remote}/{branch}"])
    if counts.returncode or int(counts.stdout.split()[1])>0:raise ChipotleError("git_branch_behind_or_diverged")
    rel=[str(p.relative_to(ROOT)).replace("\\","/") for p in files]
    if git(["add","--",*rel]).returncode:raise ChipotleError("git_stage_failed")
    if git(["diff","--cached","--quiet"]).returncode==0:return {"commit":"no_op","push":"no_op"}
    if git(["commit","-m",f"chore(chipotle): add daily metrics for {date}","--",*rel]).returncode:raise ChipotleError("git_commit_failed")
    if env.get("CHIPOTLE_ENABLE_GIT_PUSH","false").lower()=="true":
        if git(["push",remote,branch]).returncode:raise ChipotleError("git_push_failed")
        return {"commit":"committed","push":"pushed"}
    return {"commit":"committed","push":"disabled"}
def main(argv:list[str]|None=None)->int:
    parser=argparse.ArgumentParser(); parser.add_argument("--date"); parser.add_argument("--dry-run",action="store_true"); parser.add_argument("--smoke-test",action="store_true"); args=parser.parse_args(argv); started=iso(datetime.now(timezone.utc)); result={"runId":str(uuid.uuid4()),"startedAt":started,"success":False,"gitCommitStatus":"not_started","gitPushStatus":"not_started"}
    try:
        env=config(); w=completed_windows(datetime.now(timezone.utc),env.get("CHIPOTLE_TIMEZONE","America/New_York"),args.date); rest=Rest(env["CHIPOTLE_SUPABASE_URL"],env["CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY"],int(env.get("CHIPOTLE_HTTP_TIMEOUT_SECONDS","20")))
        if args.smoke_test:rest.get("rest/v1/destinations",{"select":"id","limit":"1"}); print("Read-only Supabase smoke test passed"); return 0
        shared=Path(env.get("CHIPOTLE_SHARED_BRAIN_DIR") or DEFAULT_SHARED); metrics_shared=shared.parent if shared.name.lower()=="daily output" else shared; thresholds=json.loads((BASE/"config"/"thresholds.json").read_text()); collected=collect(rest,w,thresholds,metrics_shared); payload=build_payload(collected,w,result["runId"],started); markdown=render(payload)
        results=Path(env.get("CHIPOTLE_RESULTS_DIR") or BASE/"Results"); md=results/f"{w.report_date}-buffago-daily-metrics.md"; js=results/f"{w.report_date}-buffago-daily-metrics.json"; atomic_write(md,markdown); atomic_write(js,json.dumps(payload["legacy"],indent=2,sort_keys=True)+"\n"); atomic_write(results/"latest.md",markdown); shared_md=shared/f"{w.report_date}-chipotle-buffago-daily-metrics.md"; shared_latest=shared/"chipotle-latest.md"; atomic_write(shared_md,markdown); atomic_write(shared_latest,markdown); shared_paths=write_snapshots(metrics_shared,payload,markdown); paths=[md,js,results/"latest.md",shared_md,shared_latest,*shared_paths]
        if findings:=scan(paths):raise ChipotleError("secret_or_pii_scan_failed")
        if validate_payload(payload):raise ChipotleError("schema_validation_failed")
        statuses=git_safe_commit([md,js,results/"latest.md"],w.report_date,env,args.dry_run); result.update({"success":True,"reportDate":w.report_date,"reportPaths":[str(p) for p in paths],"gitCommitStatus":statuses["commit"],"gitPushStatus":statuses["push"],"collection":payload["metadata"]["collection_status"],"completeness":payload["metadata"]["completeness_percentage"],"confidence":payload["metadata"]["overall_evidence_confidence"]})
    except ChipotleError as exc:result["errorCategory"]=str(exc)
    except Exception:result["errorCategory"]="unexpected_sanitized_failure"
    result["endedAt"]=iso(datetime.now(timezone.utc)); atomic_write(BASE/"artifacts"/"last-run-result.json",json.dumps(result,indent=2,sort_keys=True)+"\n"); print(json.dumps({k:v for k,v in result.items() if k!="reportPaths"},sort_keys=True)); return 0 if result["success"] else 2
if __name__=="__main__":raise SystemExit(main())
