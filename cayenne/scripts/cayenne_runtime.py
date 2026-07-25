"""Small dependency-free safety, contract, redaction, and Serrano adapter helpers."""
from __future__ import annotations
import json, os, re
from datetime import datetime, timezone
from pathlib import Path

FAILURE_CATEGORIES = {"APP_DEFECT","TEST_DEFECT","ENVIRONMENT_BLOCKER","FIXTURE_BLOCKER","EXTERNAL_PROVIDER_BLOCKER","DEVICE_BLOCKER","BUILD_FAILURE","TIMEOUT","SELECTOR_MISSING","PERMISSION_BLOCKER","DATA_MISMATCH","SECURITY_BOUNDARY","INCONCLUSIVE"}
SECRET_KEY = re.compile(r"(?i)^(?:password|token|secret|authorization|cookie|api[_-]?key|service[_-]?role|anon[_-]?key|access_token|refresh(?:_token)?|session|storage[_-]?state|auth[_-]?state)$")
SECRET_VALUE = re.compile(r"(?i)(bearer\s+)?[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{8,}\.?[A-Za-z0-9_\-]*")
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
STARTUP_SELECTORS = {
    "CLEAN_ONBOARDING": {"onboarding.root"},
    "SIGNED_OUT": {"auth.screen"},
    "AUTHENTICATED": {"auth.signed-in-marker", "nav.home", "nav.crawl", "nav.wingdex", "nav.leaderboard", "nav.profile"},
}

def auth_failure(text):
    value=(text or "").lower()
    if "invalid login credentials" in value or "invalid credentials" in value: return "INVALID_CREDENTIALS", "Authentication failed for the configured Cayenne test account: invalid credentials."
    if "email not confirmed" in value or "confirm your email" in value: return "EMAIL_CONFIRMATION_REQUIRED", "Authentication failed for the configured Cayenne test account: email confirmation is required."
    if "network" in value or "failed to fetch" in value or "timeout" in value: return "NETWORK_OR_TIMEOUT", "Authentication could not complete within the bounded auth window. Check network availability and service health."
    if "profile.rls-read-marker" in value: return "PROFILE_RLS_DENIAL", "Authentication succeeded but the expected profile RLS-backed read did not complete."
    if "onboarding" in value: return "ONBOARDING_INCOMPLETE", "Authentication succeeded but onboarding was unexpectedly incomplete."
    return "AUTHENTICATION_FAILED", "Authentication lifecycle test failed; inspect sanitized runtime diagnostics."

def redact(value, *, redact_emails=True, secrets=()):
    if isinstance(value, dict):
        return {k: "<redacted>" if SECRET_KEY.search(str(k)) else redact(v, redact_emails=redact_emails, secrets=secrets) for k,v in value.items()}
    if isinstance(value, list): return [redact(v, redact_emails=redact_emails, secrets=secrets) for v in value]
    if isinstance(value, str):
        # Exact runtime credentials are removed before any artifact is written.
        for secret in secrets:
            if secret:
                value = value.replace(secret, "<redacted>")
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

def detect_startup_state(hierarchy):
    present = set(re.findall(r'resource-id="([^"]+)"', hierarchy or ""))
    matches = []
    if "onboarding.root" in present:
        matches.append("CLEAN_ONBOARDING")
    if "auth.screen" in present:
        matches.append("SIGNED_OUT")
    if "auth.signed-in-marker" in present or any(selector in present for selector in ("nav.home", "nav.crawl", "nav.wingdex", "nav.leaderboard", "nav.profile")):
        matches.append("AUTHENTICATED")
    return {
        "detectedStartupState": matches[0] if len(matches) == 1 else None,
        "startupStateCandidates": matches,
        "valid": len(matches) == 1,
        "reason": None if len(matches) == 1 else "MULTIPLE_STARTUP_STATES" if matches else "NO_STARTUP_STATE",
        "selectorsPresent": sorted(present),
    }

def smoke_assertion_metadata(state, *, state_valid=True):
    universal = [
        {"assertion": "App launches", "status": "PASSED"},
        {"assertion": "app.root appears", "status": "PASSED"},
        {"assertion": "No fatal runtime error", "status": "PASSED"},
        {"assertion": "Exactly one valid startup state", "status": "PASSED" if state_valid else "FAILED"},
    ]
    definitions = {
        "CLEAN_ONBOARDING": ["onboarding.root and app.root remain visible", "Onboarding navigation controls are discoverable", "Safe onboarding forward/back interaction succeeds"],
        "SIGNED_OUT": ["auth.screen is visible", "Sign-in controls render"],
        "AUTHENTICATED": ["Available primary navigation renders", "Each visited authenticated surface renders"],
    }
    specific = [{"assertion": item, "status": "PASSED"} for item in definitions.get(state, [])] if state_valid else []
    skipped = []
    for candidate, assertions in definitions.items():
        if candidate != state:
            skipped.extend({"assertion": item, "status": "NOT_APPLICABLE"} for item in assertions)
    if state != "AUTHENTICATED":
        skipped.append({"assertion": "Authenticated primary navigation", "status": "NOT_APPLICABLE"})
    return {
        "universalAssertions": universal,
        "stateSpecificAssertions": specific,
        "skippedAssertions": skipped,
        "skipReason": None if not skipped else f"Assertions for startup states other than {state or 'an unambiguous detected state'} are not applicable",
    }

def disposition(result, request):
    required = set(request.get("acceptanceCriteria",[])); covered = set(result.get("summary",{}).get("acceptanceCriteriaCovered",[]))
    smoke_auto = result.get("suite") in {"smoke", "smoke-auto", "smoke-clean"}
    startup_valid = bool(result.get("detectedStartupState")) and result.get("startupStateValidation") == "PASSED"
    universal_pass = result.get("universalAssertionResult") == "PASSED"
    state_pass = result.get("stateSpecificAssertionResult") == "PASSED"
    if result.get("status") == "BLOCKED" or result.get("safety",{}).get("decision") == "BLOCK": d="BLOCKED"
    elif result.get("status") == "FAILED" and any(f.get("failureCategory")=="APP_DEFECT" for f in result.get("failures",[])): d="REJECT"
    elif smoke_auto and not startup_valid: d="INSUFFICIENT_EVIDENCE"
    elif smoke_auto and result.get("status") == "PASSED" and universal_pass and state_pass and result.get("redaction",{}).get("validated",False): d="APPROVE"
    elif result.get("status") != "PASSED" or not required.issubset(covered) or not result.get("redaction",{}).get("validated",False): d="INSUFFICIENT_EVIDENCE"
    else: d="APPROVE"
    return {"disposition":d,"confirmedDefects":[f for f in result.get("failures",[]) if f.get("failureCategory")=="APP_DEFECT"],"testDefects":[f for f in result.get("failures",[]) if f.get("failureCategory")=="TEST_DEFECT"],"environmentBlockers":[f for f in result.get("failures",[]) if f.get("failureCategory") in {"ENVIRONMENT_BLOCKER","DEVICE_BLOCKER","FIXTURE_BLOCKER","EXTERNAL_PROVIDER_BLOCKER"}],"missingEvidence":result.get("limitations",[]),"requiredRemediation":[],"rerunSuites":[result.get("suite")] if d != "APPROVE" else [],"releaseImpact":"BLOCK" if d in {"REJECT","BLOCKED"} else "WARN" if d=="INSUFFICIENT_EVIDENCE" else "NONE"}
