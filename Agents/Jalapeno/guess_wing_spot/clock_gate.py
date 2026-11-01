"""Eastern scheduling and publication-window gates, independent of UTC date."""
from datetime import datetime, time, timezone, timedelta
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
RECOVERY_CRON = "10,30,50 23,0,1 * * *"


def closed_publication_date(now):
    local=now.astimezone(EASTERN)
    return (local.date() if local.hour>=21 else local.date()-timedelta(days=1)).isoformat()


def gate(now=None, *, event="workflow_dispatch", cron="", mode="plan", scheduler="github", automatic_date=""):
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(EASTERN)
    result = {"date": local.date().isoformat(), "proceed": True, "reason": "local_only"}
    if mode == "live-test":
        return {**result, "proceed": event == "workflow_dispatch", "reason": "isolated_manual_live_test"}
    if mode != "publish":
        return result
    if event == 'schedule' and scheduler == 'pi':
        return {**result,'proceed':False,'reason':'inactive_github_scheduler'}
    if automatic_date:
        if event!='workflow_dispatch' or scheduler!='pi':
            return {**result,'proceed':False,'reason':'inactive_pi_scheduler'}
        if automatic_date!=result['date']:
            return {**result,'proceed':False,'reason':'original_run_date_elapsed'}
    if not time(18) <= local.time().replace(tzinfo=None) < time(21):
        return {**result, "proceed": False, "reason": "outside_18_21_eastern"}
    if event == "schedule":
        expected = "30 23 * * *" if local.utcoffset().total_seconds() == -14400 else "30 0 * * *"
        if cron not in {expected, RECOVERY_CRON}:
            return {**result, "proceed": False, "reason": "other_dst_trigger"}
        if local.time().replace(tzinfo=None) < time(19, 30):
            return {**result, "proceed": False, "reason": "before_1930_eastern"}
    if automatic_date and local.time().replace(tzinfo=None)<time(19,30):
        return {**result,'proceed':False,'reason':'before_1930_eastern'}
    return {**result, "reason": "within_publication_window"}
