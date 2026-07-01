from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import requests

from config import JalapenoConfig
from jalapeno_db import insert_performance_summary, insert_report_log
from logging_utils import log_event
from performance_context import build_performance_context
from supabase_client import SupabaseClient


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _num(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) else 0.0


NO_LEARNING_DATA_MESSAGE = "Not enough post-performance data yet. Keep collecting metrics after published posts."


def first_or_default(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (list, tuple)):
        return value[0] if value else default
    return value or default


def _list_or_empty(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _named_items(value: Any, *, limit: int = 3) -> list[str]:
    names: list[str] = []
    for item in _list_or_empty(value)[:limit]:
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if name:
                names.append(name)
        elif item:
            names.append(str(item))
    return names


def _adjustment_items(context: dict[str, Any]) -> list[str]:
    items: list[str] = []
    for key in ("recommended_adjustments", "strong_patterns", "weak_patterns"):
        value = context.get(key)
        if isinstance(value, list):
            items.extend(str(item) for item in value if item)
        elif value:
            items.append(str(value))
        if items:
            return items
    return items


@dataclass(frozen=True, slots=True)
class AdminReportResult:
    run_id: str
    report_type: str
    subject: str
    body: str
    stored: bool
    email_status: str


def _fetch_rows(client: SupabaseClient, table: str, *, since: datetime, time_column: str, limit: int = 500) -> list[dict[str, Any]]:
    try:
        return client.fetch_rows(
            table,
            select="*",
            filters={time_column: f"gte.{since.isoformat()}", "order": f"{time_column}.desc", "limit": limit},
        )
    except Exception:
        return []


def _cost_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = 0.0
    known = False
    token_total = 0
    for row in rows:
        for key in ("estimated_cost", "cost_estimate", "cost_estimate_usd"):
            if isinstance(row.get(key), (int, float)):
                total += float(row[key])
                known = True
        token_usage = row.get("token_usage") if isinstance(row.get("token_usage"), dict) else {}
        token_total += int(token_usage.get("total_tokens") or row.get("total_tokens") or 0)
    return {"estimated_cost_usd": round(total, 6) if known else None, "total_tokens": token_total}


def _best_metric(metrics: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not metrics:
        return None
    return max(metrics, key=lambda row: _num(row.get("engagement_rate")))


def _format_post(row: dict[str, Any]) -> str:
    caption = str(row.get("caption") or row.get("generated_caption") or "").replace("\n", " ").strip()
    return f"{row.get('published_at') or row.get('created_at')} | {row.get('category') or row.get('post_type')} | ER {row.get('engagement_rate', 'n/a')} | {caption[:80]}"


def _send_email(*, subject: str, body: str, logger=None, run_id: str | None = None) -> str:
    to_email = os.getenv("REPORT_EMAIL_TO", "").strip()
    from_email = os.getenv("REPORT_EMAIL_FROM", "").strip()
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not (to_email and from_email and api_key):
        log_event(logger, "email_report_failed", level="warning", run_id=run_id, stage="reporting", status="disabled", error="REPORT_EMAIL_TO, REPORT_EMAIL_FROM, or RESEND_API_KEY missing")
        print("Warning: email reporting is disabled because REPORT_EMAIL_TO, REPORT_EMAIL_FROM, or RESEND_API_KEY is not configured.")
        return "disabled"
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": from_email, "to": [to_email], "subject": subject, "text": body},
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Resend failed ({response.status_code}): {response.text}")
        log_event(logger, "email_report_sent", run_id=run_id, stage="reporting", status="sent", recipient=to_email)
        return "sent"
    except Exception as exc:
        log_event(logger, "email_report_failed", level="error", run_id=run_id, stage="reporting", status="failed", error_type=type(exc).__name__, error=str(exc))
        return "failed"


def _daily_body(*, runs: list[dict[str, Any]], posts: list[dict[str, Any]], metrics: list[dict[str, Any]], errors: list[dict[str, Any]], context: dict[str, Any], costs: dict[str, Any]) -> str:
    published = [post for post in posts if str(post.get("publish_status") or "").startswith("published")]
    skipped = [run for run in runs if run.get("status") in {"skipped", "precheck_failed"}]
    best = _best_metric(metrics)
    failures = len(errors) + len([run for run in runs if run.get("status") in {"failed", "failed_action_required"}])
    source_counts = _dict_or_empty(context.get("source_counts"))
    has_learning_data = bool(_num(source_counts.get("rows")) or metrics)
    adjustment = str(
        first_or_default(context.get("recommended_adjustments"), None)
        or first_or_default(context.get("strong_patterns"), None)
        or first_or_default(context.get("weak_patterns"), None)
        or (NO_LEARNING_DATA_MESSAGE if not has_learning_data else "Keep using the highest-engagement category and avoid recent duplicates.")
    )
    return "\n".join(
        [
            "Overall status: " + ("Action required" if failures else "Healthy"),
            f"Runs: {len(runs)}",
            f"Posts generated: {len(posts)}",
            f"Posts published: {len(published)}",
            f"Posts skipped: {len(skipped)}",
            f"Failures/action required: {failures}",
            "Metrics highlights: " + (_format_post(best) if best else "No recent metric snapshots yet."),
            f"Costs: estimated ${costs.get('estimated_cost_usd') if costs.get('estimated_cost_usd') is not None else 'unknown'}; tokens {costs.get('total_tokens', 0)}",
            "Recommended adjustment: " + adjustment,
            "Learning status: " + (NO_LEARNING_DATA_MESSAGE if not has_learning_data else "Post-performance learning data is available."),
        ]
    )


def _weekly_body(*, runs: list[dict[str, Any]], posts: list[dict[str, Any]], metrics: list[dict[str, Any]], errors: list[dict[str, Any]], context: dict[str, Any], costs: dict[str, Any]) -> str:
    source_counts = _dict_or_empty(context.get("source_counts"))
    has_learning_data = bool(_num(source_counts.get("rows")) or metrics)
    best_posts = [post for post in _list_or_empty(_dict_or_empty(context.get("best_posts")).get("7d"))[:3] if isinstance(post, dict)]
    worst_posts = [post for post in _list_or_empty(_dict_or_empty(context.get("worst_posts")).get("7d"))[:3] if isinstance(post, dict)]
    best_lines = [_format_post(post) for post in best_posts] if best_posts else ["No best-post data yet."]
    worst_lines = [_format_post(post) for post in worst_posts] if worst_posts else ["No worst-post data yet."]
    adjustment_values = _adjustment_items(context)
    adjustment_line = "; ".join(str(item) for item in adjustment_values[:3] if item) or (
        NO_LEARNING_DATA_MESSAGE if not has_learning_data else "Collect more metrics before changing strategy."
    )
    lines = [
        f"Runs this week: {len(runs)}",
        f"Generated posts: {len(posts)}",
        f"Published posts: {len([post for post in posts if str(post.get('publish_status') or '').startswith('published')])}",
        f"Failures: {len(errors)}",
        "",
        "Generated/published posts:",
        *[_format_post(post) for post in posts[:12]],
        "",
        "Best posts:",
        *best_lines,
        "",
        "Worst posts:",
        *worst_lines,
        "",
        "Best categories: " + (", ".join(_named_items(context.get("best_categories"))) or "No category data yet."),
        "Worst categories: " + (", ".join(_named_items(context.get("worst_categories"))) or "No category data yet."),
        "Best image styles: " + (", ".join(_named_items(context.get("best_image_styles"))) or "No image-style data yet."),
        "Worst image styles: " + (", ".join(_named_items(context.get("worst_image_styles"))) or "No image-style data yet."),
        "Best CTA types: " + (", ".join(_named_items(context.get("best_cta_types"))) or "No CTA data yet."),
        f"Costs: estimated ${costs.get('estimated_cost_usd') if costs.get('estimated_cost_usd') is not None else 'unknown'}; tokens {costs.get('total_tokens', 0)}",
        "Recommended adjustments: " + adjustment_line,
        "Learning status: " + (NO_LEARNING_DATA_MESSAGE if not has_learning_data else "Post-performance learning data is available."),
    ]
    return "\n".join(lines)


def generate_admin_report(
    config: JalapenoConfig,
    client: SupabaseClient | None,
    *,
    report_type: str,
    logger=None,
    send_email: bool = True,
    now: datetime | None = None,
    run_id: str | None = None,
) -> AdminReportResult:
    started = time.perf_counter()
    now = now or _utcnow()
    active_run_id = run_id or str(uuid4())
    if report_type not in {"daily", "weekly"}:
        raise ValueError("report_type must be daily or weekly")
    period_start = now - timedelta(days=1 if report_type == "daily" else 7)
    subject = f"Jalapeno {'Daily' if report_type == 'daily' else 'Weekly'} Report - {now.date().isoformat()}"
    log_event(logger, "email_report_generated", run_id=active_run_id, stage="reporting", status="started", report_type=report_type)
    runs: list[dict[str, Any]] = []
    posts: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    context = build_performance_context(client, logger=logger, run_id=active_run_id, now=now).to_dict() if client is not None else build_performance_context(None, logger=logger, run_id=active_run_id, now=now).to_dict()
    if client is not None:
        runs = _fetch_rows(client, "jalapeno_runs", since=period_start, time_column="started_at")
        posts = _fetch_rows(client, "jalapeno_posts", since=period_start, time_column="created_at")
        metrics = _fetch_rows(client, "jalapeno_post_metrics", since=period_start, time_column="collected_at")
        errors = _fetch_rows(client, "jalapeno_errors", since=period_start, time_column="created_at")
    costs = _cost_summary([*runs, *posts, *metrics])
    if report_type == "daily":
        body = _daily_body(runs=runs, posts=posts, metrics=metrics, errors=errors, context=context, costs=costs)
    else:
        body = _weekly_body(runs=runs, posts=posts, metrics=metrics, errors=errors, context=context, costs=costs)
    email_status = _send_email(subject=subject, body=body, logger=logger, run_id=active_run_id) if send_email else "skipped"
    stored = False
    if client is not None:
        try:
            insert_performance_summary(
                client,
                summary_type=report_type,
                period_start=period_start,
                period_end=now,
                summary={"runs": len(runs), "posts": len(posts), "metrics": len(metrics), "errors": len(errors), "context": context, "costs": costs},
                generated_by_run_id=UUID(active_run_id) if len(active_run_id) == 36 else None,
            )
            insert_report_log(
                client,
                report_type=report_type,
                subject=subject,
                body=body,
                period_start=period_start,
                period_end=now,
                delivery_status=email_status,
                recipient=os.getenv("REPORT_EMAIL_TO", "").strip() or None,
                run_id=UUID(active_run_id) if len(active_run_id) == 36 else None,
                metadata={"duration_ms": int((time.perf_counter() - started) * 1000), "email_status": email_status},
            )
            stored = True
        except Exception as exc:
            log_event(logger, "email_report_failed", level="warning", run_id=active_run_id, stage="reporting", status="store_failed", error=str(exc))
    log_event(
        logger,
        "weekly_summary_generated" if report_type == "weekly" else "email_report_generated",
        run_id=active_run_id,
        stage="reporting",
        status="completed",
        report_type=report_type,
        duration_ms=int((time.perf_counter() - started) * 1000),
        email_status=email_status,
        stored=stored,
    )
    return AdminReportResult(
        run_id=active_run_id,
        report_type=report_type,
        subject=subject,
        body=body,
        stored=stored,
        email_status=email_status,
    )
