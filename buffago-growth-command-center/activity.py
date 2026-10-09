"""Small, dependency-free wall display formatters."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def relative_time(moment, now=None):
    if moment is None:
        return '—'
    now = now or datetime.now(timezone.utc)
    seconds = max(0, (now - moment).total_seconds())
    local, today = moment.astimezone(ZoneInfo('America/New_York')), now.astimezone(ZoneInfo('America/New_York'))
    if seconds < 60:
        return 'Now'
    if seconds < 3600:
        return f'{int(seconds // 60)}m ago'
    if (today.date() - local.date()).days == 1:
        return 'Yesterday'
    if seconds < 86400:
        return f'{int(seconds // 3600)}h ago'
    if (today.date() - local.date()).days < 7:
        return local.strftime('%a')
    return f'{local:%b} {local.day}'


def safe_display(value, fallback='Unknown'):
    """Defensive email suppression, including user-entered display names."""
    return value if isinstance(value, str) and value.strip() and '@' not in value else fallback
