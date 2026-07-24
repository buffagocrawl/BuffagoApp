"""Small dependency-free safety, contract, redaction, and Serrano adapter helpers."""
from __future__ import annotations
import json, os, re
from datetime import datetime, timezone
from pathlib import Path

FAILURE_CATEGORIES = {"APP_DEFECT","TEST_DEFECT","ENVIRONMENT_BLOCKER","FIXTURE_BLOCKER","EXTERNAL_PROVIDER_BLOCKER","DEVICE_BLOCKER","BUILD_FAILURE","TIMEOUT","SELECTOR_MISSING","PERMISSION_BLOCKER","DATA_MISMATCH","SECURITY_BOUNDARY","INCONCLUSIVE"}
SECRET_KEY = re.compile(r"(?i)(password|token|secret|authorization|cookie|api[_-]?key|service[_-]?role|anon[_-]?key|refresh)")
SECRET_VALUE = re.compile(r"(?i)(bearer\s+)?[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{8,}\.?[A-Za-z0-9_\-]*")
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)

def redact(value, *, redact_emails=True):
    if isinstance(value, dict):
        return {k: "<redacted>" if SECRET_KEY.search(str(k)) else redact(v, redact_emails=redact_emails) for k,v in value.items()}
    if isinstance(value, list): return [redact(v, redact_emails=redact_emails) for v in value]
    if isinstance(value, str):
        value = SECRET_VALUE.sub("<redacted>", value)
        return EMAIL.sub("<redacted-email>", value) if redact_emails else value
    return value

def safety(environment, mutation_requested, allow_mutation, supabase_url="", env_values=None):
    env_values = env_values or {}
    host = (supabase_url or "").lower()
    production = any(x in host for x in ("supabase.co", "buffago.com"))
    service_role = any("service_role" in str(k).lower() or "service-role" in str(k).lower() for k in env_values)
    reasons = []
    if environment not in {"local-mock","qa","production-readonly"}: reasons.append("UNKNOWN_ENVIRONMENT")
    if mutation_requested and environment == "production-readonly": reasons.append("PRODUCTION_MUTATION_DENIED")
    if mutation_requested and not allow_mutation: reasons.append("MUTATION_OPT_IN_REQUIRED")
    if mutation_requested and production: reasons.append("PRODUCTION_HOST_DETECTED")
    if service_role: reasons.append("SERVICE_ROLE_IN_CLIENT_ENV")
    return {"environment":environment,"productionDetected":production,"mutationRequested":bool(mutation_requested),"mutationAllowed":bool(allow_mutation and not production and environment in {"local-mock","qa"}),"decision":"ALLOW" if not reasons else "BLOCK","reasons":reasons}

def validate_selectors(root: Path, flow_root: Path):
    registry = json.loads((root/"cayenne/selectors/registry.json").read_text(encoding="utf-8"))["selectors"]
    if len(registry) != len(set(registry.values())): raise ValueError("duplicate selector IDs")
    unknown=[]
    for path in flow_root.rglob("*.yaml"):
        for selector in re.findall(r"(?:id|testID|selector):\s*[\"']?([A-Za-z0-9_.-]+)", path.read_text(encoding="utf-8")):
            if selector not in registry and selector not in registry.values(): unknown.append(f"{path}:{selector}")
    if unknown: raise ValueError("unknown selectors: " + ", ".join(unknown))
    return {"registryCount":len(registry),"duplicateIds":False,"unknownReferences":[]}

def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(redact(payload),indent=2)+"\n",encoding="utf-8")

def disposition(result, request):
    required = set(request.get("acceptanceCriteria",[])); covered = set(result.get("summary",{}).get("acceptanceCriteriaCovered",[]))
    if result.get("status") == "BLOCKED" or result.get("safety",{}).get("decision") == "BLOCK": d="BLOCKED"
    elif result.get("status") == "FAILED" and any(f.get("failureCategory")=="APP_DEFECT" for f in result.get("failures",[])): d="REJECT"
    elif result.get("status") != "PASSED" or not required.issubset(covered) or not result.get("redaction",{}).get("validated",False): d="INSUFFICIENT_EVIDENCE"
    else: d="APPROVE"
    return {"disposition":d,"confirmedDefects":[f for f in result.get("failures",[]) if f.get("failureCategory")=="APP_DEFECT"],"testDefects":[f for f in result.get("failures",[]) if f.get("failureCategory")=="TEST_DEFECT"],"environmentBlockers":[f for f in result.get("failures",[]) if f.get("failureCategory") in {"ENVIRONMENT_BLOCKER","DEVICE_BLOCKER","FIXTURE_BLOCKER","EXTERNAL_PROVIDER_BLOCKER"}],"missingEvidence":result.get("limitations",[]),"requiredRemediation":[],"rerunSuites":[result.get("suite")] if d != "APPROVE" else [],"releaseImpact":"BLOCK" if d in {"REJECT","BLOCKED"} else "WARN" if d=="INSUFFICIENT_EVIDENCE" else "NONE"}
