"""Display-safe Growth & Goals model. No browser, provider SDK, or credentials."""
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

METRICS = ('views', 'reach', 'comments', 'shares', 'saves', 'likes_reactions')
UNITS = {'restaurants', 'restaurants per million residents', 'ratings', 'photos'}


def moment(value):
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except (ValueError, TypeError):
        return None


def number(value):
    return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None


def public_link(value):
    """Only canonical public social URLs; reject queries, signed assets and credentials."""
    if not isinstance(value, str):
        return None
    p = urlsplit(value)
    hosts = {'instagram.com', 'www.instagram.com', 'facebook.com', 'www.facebook.com', 'fb.watch'}
    if p.scheme != 'https' or p.netloc not in hosts or p.query or p.fragment:
        return None
    return value if p.path.startswith(('/reel/', '/reels/', '/p/', '/watch/', '/videos/')) or p.netloc == 'fb.watch' else None


def metric(entry, platform, name):
    entry = entry if isinstance(entry, dict) else {}
    value = number(entry.get('value'))
    reason = str(entry.get('reason') or '')
    if name == 'saves' and platform == 'facebook':
        return {'value': None, 'status': 'Not available'}
    return {'value': value, 'status': ('Permission needed' if 'permission' in reason else
            'Not available' if 'unsupported' in reason else 'Unavailable') if value is None else 'Available'}


def display(entry):
    value = entry.get('value')
    return f'{value:,.0f}' if value is not None else entry.get('status', 'Unavailable')


def project_report(report):
    if report.get('schema_version') != 1 or not moment(report.get('generated_at')) or not isinstance(report.get('health'), dict) or not isinstance(report.get('recent_reels'), list):
        raise ValueError('Invalid analytics report')
    reels = []
    for row in report['recent_reels']:
        platform = row.get('platform')
        if platform not in ('instagram', 'facebook'):
            continue
        obs = row.get('observation') or {}
        reels.append({'platform': platform, 'url': public_link(row.get('post_url')),
                      'published_at': row.get('published_at') if moment(row.get('published_at')) else None,
                      'captured_at': obs.get('captured_at') if moment(obs.get('captured_at')) else None,
                      'age_hours': number(obs.get('age_hours')), 'live_test': row.get('live_test') is True,
                      'window': obs.get('window') if obs.get('window') in ('24h', '72h', '7d') else 'Current age',
                      'metrics': {m: metric(obs.get('metrics', {}).get(m), platform, m) for m in METRICS}})
    reels.sort(key=lambda r: moment(r['published_at']) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    health = report['health']
    # Never forward raw errors, markdown, provider responses, geography/source metadata.
    result = {'generated_at': report['generated_at'], 'reels': reels[:60],
              'health': {'errors': len(health.get('errors', [])),
                         'collected': number(health.get('snapshots_collected'))},
              'rankings': [], 'geography': [], 'comparisons': []}
    for rank in report.get('rankings', []):
        rows = rank.get('reels', [])
        if rank.get('window') not in ('24h', '72h', '7d') or rank.get('live_test') or len(rows) < 3:
            continue
        if rank.get('metric') not in METRICS or rank.get('platform') not in ('instagram', 'facebook'):
            continue
        result['rankings'].append({'platform': rank['platform'], 'window': rank['window'], 'metric': rank['metric'],
            'reels': [{'url': public_link(r.get('post_url')), 'value': number(r.get('value'))} for r in rows if number(r.get('value')) is not None]})
    # Geography is the challenge area, never audience location. No source answer fields.
    for g in report.get('geography', []):
        reach = g.get('metrics', {}).get('reach', {})
        if g.get('live_test') or g.get('window') not in ('24h', '72h', '7d') or (number(reach.get('n')) or 0) < 3:
            continue
        area = g.get('area')
        if isinstance(area, str) and len(area) <= 80:
            result['geography'].append({'platform': g.get('platform'), 'window': g['window'], 'area': area,
                                       'n': reach['n'], 'mean_reach': number(reach.get('mean'))})
    for c in report.get('period_comparisons', []):
        if (not c.get('live_test') and c.get('window') in ('24h', '72h', '7d') and
                (number(c.get('current_n')) or 0) >= 3 and (number(c.get('previous_n')) or 0) >= 3 and
                type(c.get('change_fraction')) in (int, float) and math.isfinite(c['change_fraction'])):
            result['comparisons'].append({k: c.get(k) for k in ('platform', 'window', 'metric', 'current_n', 'previous_n', 'change_fraction')})
    return result


def goal(current, target, unit):
    if unit not in UNITS:
        raise ValueError('Unknown goal units')
    current, target = number(current), number(target)
    return {'current': current, 'target': target, 'unit': unit,
            'gap': max(0, target-current) if current is not None and target is not None else None,
            'fraction': min(1, current/target) if current is not None and target is not None and target > 0 else None}


class PanelFeed:
    """A failed/partial refresh cannot replace last successful, sanitized data."""
    def __init__(self):
        self.data = None
        self.failed = False
        self.status = 'Loading'

    def load(self, path):
        try:
            raw = json.loads(Path(path).read_text(encoding='utf-8'))
            if raw.get('schema_version') != 1 or not moment(raw.get('exported_at')):
                raise ValueError('Invalid feed')
            social = raw.get('social')
            if not isinstance(social, dict) or not moment(social.get('generated_at')) or not isinstance(social.get('reels'), list):
                raise ValueError('Invalid social projection')
            for reel in social['reels']:
                if not isinstance(reel, dict) or reel.get('platform') not in ('instagram', 'facebook'):
                    raise ValueError('Invalid Reel')
                if not all(k in reel for k in ('url', 'published_at', 'captured_at', 'age_hours', 'window', 'live_test', 'metrics')):
                    raise ValueError('Incomplete Reel')
                if not isinstance(reel['metrics'], dict):
                    raise ValueError('Invalid metrics')
                for name in METRICS:
                    entry = reel['metrics'].get(name)
                    if not isinstance(entry, dict) or entry.get('status') not in ('Available', 'Unavailable', 'Permission needed', 'Not available'):
                        raise ValueError('Incomplete metrics')
                    if entry.get('value') is not None and number(entry['value']) is None:
                        raise ValueError('Invalid metric')
                if reel['url'] is not None and public_link(reel['url']) is None:
                    raise ValueError('Invalid public link')
            for state in raw.get('states', []):
                if not isinstance(state, dict) or not isinstance(state.get('metrics'), list):
                    raise ValueError('Invalid state')
                for item in state['metrics']:
                    expected = goal(item.get('current'), item.get('target'), item.get('unit'))
                    if any(item.get(k) != v for k, v in expected.items()):
                        raise ValueError('Invalid goal units or progress')
            # This file is already a server-side projection, never a private report.
            self.data = raw
            self.failed = raw.get('refresh_failed') is True
            self.status = 'Refresh failed' if self.failed else 'Connected'
        except (OSError, ValueError, TypeError, KeyError):
            self.failed, self.status = True, 'Refresh failed' if self.data else 'Data connection needed'
        return self.data

    def stale(self, now=None):
        now = now or datetime.now(timezone.utc)
        stamp = moment((self.data or {}).get('social', {}).get('generated_at'))
        exported = moment((self.data or {}).get('exported_at'))
        delivery_old = exported is not None and (now-exported).total_seconds() > 30*60
        return self.failed or stamp is None or delivery_old or (now-stamp).total_seconds() > 36*3600
