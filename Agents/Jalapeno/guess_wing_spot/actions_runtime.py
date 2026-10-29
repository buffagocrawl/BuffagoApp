"""GitHub-only durable ownership proof; no private artifacts on public repos."""
import json
import os
import re
from pathlib import Path

import requests

from .clock_gate import gate
from .durable import Busy, DurableError, PrivateLedger
from .meta_reels import Graph, MetaError, ReelPublisher
from .screening import Screener
from .sources import ReadOnlySources
from .automatic import prepare, render_daily, revalidate

WORKFLOW = ".github/workflows/guess-wing-spot.yml"


def bind_run_date(ledger, run_id, date):
    """A rerun cannot turn yesterday's run into an extra post for today."""
    if not re.fullmatch(r"\d+", run_id):
        raise DurableError("invalid_actions_run_identity")
    key = "runs/" + run_id + ".json"
    prior = ledger.get(key)
    if prior is None:
        ledger.create(key, {"eastern_date": date})
        prior = ledger.get(key)
    return prior is not None and prior.get("eastern_date") == date


class ActionsOwner:
    def __init__(self, env=os.environ):
        self.env = env
        self.repo = env.get("GITHUB_REPOSITORY", "")
        self.owner = env.get("GITHUB_RUN_ID", "") + "." + env.get("GITHUB_RUN_ATTEMPT", "")
        if (env.get("GITHUB_ACTIONS") != "true" or not re.fullmatch(r"[\w.-]+/[\w.-]+", self.repo)
                or not re.fullmatch(r"\d+\.\d+", self.owner)
                or env.get("GITHUB_REF") != "refs/heads/main"
                or env.get("GITHUB_WORKFLOW_REF") != self.repo + "/" + WORKFLOW + "@refs/heads/main"):
            raise DurableError("publishing_requires_expected_main_branch_actions_workflow")

    def previous_finished(self, owner):
        if not re.fullmatch(r"\d+\.\d+", owner):
            return False
        run, attempt = owner.split(".")
        try:
            response = requests.get(f"https://api.github.com/repos/{self.repo}/actions/runs/{run}/attempts/{attempt}",
                                    headers={"Authorization": "Bearer " + self.env.get("GITHUB_TOKEN", ""), "Accept": "application/vnd.github+json"}, timeout=30)
            data = response.json()
            return response.status_code == 200 and data.get("status") == "completed" and data.get("path") == WORKFLOW
        except (requests.RequestException, ValueError):
            return False


def summarize(state, gate_result=None):
    platforms = {p: {k: v.get(k) for k in ("status", "reason", "post_url") if v.get(k)} for p, v in state.get("platforms", {}).items()}
    result = {"status": state.get("status", "unknown"), "date": state.get("date"),
              "geography": state.get("geography", {}).get("label"), "platforms": platforms}
    if gate_result:
        result["time_gate"] = gate_result["reason"]
    print(json.dumps(result))
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        # Only whitelisted summary fields. No caption, answers, IDs, tokens,
        # signed URLs or provider response bodies may enter Actions logs.
        with open(path, "a", encoding="utf-8") as stream:
            stream.write("### Guess the Wing Spot\n\n```json\n" + json.dumps(result, indent=2) + "\n```\n")
    return result


def run(mode, *, env=os.environ, now=None):
    decision = gate(now, event=env.get("GITHUB_EVENT_NAME", "workflow_dispatch"), cron=env.get("GITHUB_EVENT_SCHEDULE", ""), mode=mode)
    if mode == "publish" and (not decision["proceed"] or env.get("GUESS_WING_SPOT_ENABLED") != "true"):
        return summarize({"status": "skipped_" + (decision["reason"] if not decision["proceed"] else "new_workflow_disabled"), "date": decision["date"]}, decision)
    # Read-only plan and preview retain the isolated original CLI and do not
    # instantiate this module's uploader/publisher in the workflow.
    if mode not in {"publish", "validate"}:
        raise ValueError("publishing_runtime_has_no_plan_or_preview_mode")
    ledger = PrivateLedger(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    ledger.check_private()
    if mode == "publish" and not (env.get("GUESS_EXPECTED_INSTAGRAM_USERNAME") and env.get("GUESS_EXPECTED_FACEBOOK_NAME")):
        raise MetaError("expected_account_names_must_be_pinned_before_activation")
    graph = Graph(env["META_LONG_LIVED_ACCESS_TOKEN"], env["META_GRAPH_API_VERSION"], app_secret=env.get("META_APP_SECRET"))
    provider_problem = None
    provider_diagnostic = None
    try:
        identities, page_token = graph.validate(env["INSTAGRAM_BUSINESS_ACCOUNT_ID"], env["FACEBOOK_PAGE_ID"],
                                               env.get("GUESS_EXPECTED_INSTAGRAM_USERNAME", ""), env.get("GUESS_EXPECTED_FACEBOOK_NAME", ""))
    except MetaError as error:
        if mode != "validate":
            raise
        # Readiness diagnostics can still prove storage/source/OCR readiness
        # while credentials are repaired. No claims, uploads or publish calls.
        provider_problem, identities, page_token = str(error), None, None
        provider_diagnostic = error.diagnostic or {"check": getattr(graph, "validation_check", "configuration"), "failure_category": "local_validation", "message": str(error)}
    if mode == "validate":
        # Read-only provider checks plus a local OCR toolchain check. Storage
        # claims/write semantics are exercised by separate namespace probes.
        screener = Screener(ledger)
        from uuid import uuid4
        probe = "validation/" + str(uuid4()) + ".json"
        if not ledger.create(probe, {"probe": "immutable_create"}) or ledger.create(probe, {"probe": "must_not_overwrite"}):
            raise DurableError("atomic_create_probe_failed")
        candidate = prepare(ReadOnlySources(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]), ledger, screener, decision["date"], "validation")
        if candidate["status"] != "planned":
            raise MetaError("no_automatically_screened_trio_available")
        ledger.create("validation/" + candidate["reel_id"] + ".json", candidate)
        result = {"status": "blocked" if provider_problem else "validated", "accounts": identities,
                  "screened_geography": candidate["geography"]["label"], "source_screening": "passed",
                  "ledger": "existing_private_jalapeno_assets_namespace", "atomic_create": "verified"}
        if provider_problem:
            result["reason"] = provider_problem
            result["provider_diagnostic"] = provider_diagnostic
        print(json.dumps(result))
        return result
    owner = ActionsOwner(env)
    date = decision["date"]
    if not bind_run_date(ledger, env["GITHUB_RUN_ID"], date):
        return summarize({"status": "skipped_original_run_date_elapsed", "date": date}, decision)
    ledger.claim(date, "run", owner.owner, owner.previous_finished)
    state = ledger.latest(date)
    screener = Screener(ledger)
    repository = ReadOnlySources(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    if not state or state.get("status", "").startswith("skipped"):
        revision = state.get("revision", 0) if state else 0
        state = prepare(repository, ledger, screener, date, owner.owner)
        state["revision"] = revision
        ledger.save(date, state)  # Daily reel choice is durable before rendering.
    if state.get("status", "").startswith("skipped"):
        return summarize(state, decision)
    persist = lambda: ledger.save(date, state)
    if state["status"] == "planned":
        render_daily(repository, ledger, screener, state, env.get("RUNNER_TEMP", "/tmp"),
                     str(Path(__file__).resolve().parents[3] / "crawl/assets/images/buffago-logo.png"))
        persist()
    history = {**state, "generation_status": "preview_generated"}
    ledger.create("history/" + date + ".json", history)
    body = None

    def media():
        nonlocal body
        if body is None:
            body = ledger.get_bytes("outputs/" + state["reel_id"] + ".mp4")
            if body is None or __import__("hashlib").sha256(body).hexdigest() != state["video_sha256"]:
                raise MetaError("durable_generated_video_missing_or_changed")
        return body

    publisher = ReelPublisher(graph, identities["instagram"]["id"], identities["facebook"]["id"], page_token)
    for platform in ("instagram", "facebook"):
        if state["platforms"][platform]["status"] == "published":
            continue
        try:
            ledger.claim(date, platform, owner.owner, owner.previous_finished)
            if state["platforms"][platform].get("pending"):
                publisher.reconcile(platform, state, persist)
                if state["platforms"][platform]["status"] == "published" or state["platforms"][platform].get("pending"):
                    continue
            # Validate before beginning work, and again immediately before the
            # actual publish POST through the adapter callback.
            revalidate(repository, state, screener)
            publisher.publish(platform, state, persist, lambda: revalidate(repository, state, screener),
                              lambda: ledger.video_url(state["reel_id"]), media,
                              lambda: gate(event="workflow_dispatch", mode="publish")["proceed"])
        except (MetaError, Busy) as error:
            state["platforms"][platform].update(reason=str(error), status="uncertain" if state["platforms"][platform].get("pending") else "blocked")
            persist()
    state["status"] = "completed" if all(p["status"] == "published" for p in state["platforms"].values()) else "partial_or_pending"
    persist()
    # Retain generated media for at least seven days, including uncertain jobs.
    from datetime import date as calendar_date, timedelta
    cutoff = calendar_date.fromisoformat(date) - timedelta(days=7)
    keep = {h["reel_id"] for h in ledger.history() if calendar_date.fromisoformat(h["date"]) >= cutoff}
    ledger.cleanup_outputs(keep)
    return summarize(state, decision)
