"""Account-wide views gained in exact Eastern calendar days, never lifetime allocations."""
from datetime import datetime, timedelta, timezone, time
from zoneinfo import ZoneInfo
from .meta import MetaReadError, number

EASTERN = ZoneInfo('America/New_York')
DEFINITION = 'instagram_account_views_v25_total_value_all_surfaces'


def day_bounds(day):
    start = datetime.combine(day, time.min, EASTERN)
    end = datetime.combine(day+timedelta(days=1), time.min, EASTERN)
    return int(start.timestamp()), int(end.timestamp())


def week_rows(days, now):
    today = now.astimezone(EASTERN).date()
    monday = today-timedelta(days=today.weekday())
    by_day = {r['date']: r for r in days if r.get('definition') == DEFINITION}
    weeks = []
    for offset in range(7, -1, -1):
        start = monday-timedelta(weeks=offset)
        end = min(start+timedelta(days=6), today)
        required = [start+timedelta(days=i) for i in range((end-start).days+1)]
        records = [by_day.get(d.isoformat()) for d in required]
        valid = [r for r in records if r and number(r.get('value')) is not None]
        complete = len(valid) == len(required)
        weeks.append({'week_start': start.isoformat(), 'value': sum(r['value'] for r in valid) if complete else None,
                      'partial': offset == 0, 'days_available': len(valid), 'days_expected': len(required),
                      'reason': None if complete else 'daily_history_unavailable'})
    return weeks


def retain_daily(current, previous):
    if current['value'] is not None:
        return current
    compatible = [r for r in previous if r.get('date') == current['date'] and r.get('definition') == DEFINITION
        and number(r.get('value')) is not None and r.get('since') == current['since']
        and (r.get('until_inclusive') == current['until_inclusive'] or
             (r.get('partial') and current['partial'] and r.get('until_inclusive',0) <= current['until_inclusive']))]
    if not compatible:
        return current
    best = max(compatible, key=lambda r: r.get('captured_at',''))
    return {**best, 'retained': True, 'refresh_reason': current['reason']}


def account_history(meta, now, *, days=56, previous=()):
    today = now.astimezone(EASTERN).date()
    monday = today-timedelta(days=today.weekday())
    first = max(monday-timedelta(weeks=7), today-timedelta(days=days-1))
    records = []
    for offset in range((today-first).days+1):
        day = first+timedelta(days=offset)
        since, stop = day_bounds(day)
        until = min(stop, int(now.timestamp()))-1  # Meta documents inclusive since/until.
        value, reason = None, None
        try:
            raw = meta.get(meta.ig_id+'/insights', {'metric': 'views', 'period': 'day',
                'metric_type': 'total_value', 'since': since, 'until': until})
            rows = [r for r in raw.get('data', []) if r.get('name') == 'views' and r.get('period') == 'day']
            value = number(rows[0].get('total_value', {}).get('value')) if len(rows) == 1 else None
            reason = None if value is not None else 'empty_or_unavailable'
        except MetaReadError as exc:
            reason = str(exc)
        record = {'date': day.isoformat(), 'value': value, 'reason': reason, 'definition': DEFINITION,
                  'since': since, 'until_inclusive': until, 'partial': day == today,
                  'captured_at': datetime.now(timezone.utc).isoformat()}
        records.append(retain_daily(record, previous))
        # Access/rate failures apply to remaining days too; avoid 50 redundant requests.
        if reason in {'permission_denied','invalid_or_expired_token','rate_limited','rate_limited_deferred','unsupported_or_unavailable'}:
            for later in range(offset+1,(today-first).days+1):
                missing_day = first+timedelta(days=later)
                a,b = day_bounds(missing_day)
                records.append(retain_daily({'date':missing_day.isoformat(),'value':None,'reason':reason,
                    'definition':DEFINITION,'since':a,'until_inclusive':min(b,int(now.timestamp()))-1,
                    'partial':missing_day==today,'captured_at':datetime.now(timezone.utc).isoformat()}, previous))
            break
    captured = datetime.now(timezone.utc).isoformat()
    oldest = min((r['captured_at'] for r in records if r['value'] is not None), default=captured)
    return {'schema_version': 1, 'generated_at': captured, 'captured_at': oldest,
            'scope': 'Account-wide Instagram views', 'definition': DEFINITION, 'timezone': 'America/New_York',
            'api_version': meta.version, 'source': 'IG User /insights views total_value, daily timestamp ranges',
            'days': records, 'weeks': week_rows(records, now),
            'coverage': 'Missing days are unavailable; current week partial; provider values may lag 48h.'}
