"""Eastern scheduling and publication-window gates, independent of UTC date."""
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")


def gate(now=None, *, event="workflow_dispatch", cron="", mode="plan"):
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(EASTERN)
    result = {"date": local.date().isoformat(), "proceed": True, "reason": "local_only"}
    if mode != "publish":
        return result
    if not time(18) <= local.time().replace(tzinfo=None) < time(21):
        return {**result, "proceed": False, "reason": "outside_18_21_eastern"}
    if event == "schedule":
        expected = "30 23 * * *" if local.utcoffset().total_seconds() == -14400 else "30 0 * * *"
        if cron != expected:
            return {**result, "proceed": False, "reason": "other_dst_trigger"}
        if local.time().replace(tzinfo=None) < time(19, 30):
            return {**result, "proceed": False, "reason": "before_1930_eastern"}
    return {**result, "reason": "within_publication_window"}
