"""Run ONLY on an existing trusted server with storage credentials, never on Pi.
Reads private Storage; writes only an atomic local display projection. No Meta calls.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from growth_goals import moment, project_report, goal

BUCKET = 'jalapeno-assets'
ANALYTICS = 'guess-wing-spot-analytics-v1/'
PUBLICATIONS = ('guess-wing-spot-v1/', 'guess-wing-spot-live-test-v1/')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class StorageReader:
    def __init__(self, origin, key):
        if not re.fullmatch(r'https://[a-z0-9.-]+', origin):
            raise ValueError('Invalid storage origin')
        self.origin, self.key = origin, key

    def request(self, method, path, body=None):
        allowed = method == 'GET' and path.startswith('object/authenticated/' + BUCKET + '/')
        allowed |= method == 'POST' and path == 'object/list/' + BUCKET and body is not None
        if not allowed:
            raise ValueError('Read-only boundary')
        key = body['prefix'] if body else path.split(BUCKET + '/', 1)[1]
        if '..' in key or not re.fullmatch(r'[A-Za-z0-9/_.-]+', key) or not (key.startswith(ANALYTICS+'reports/') or any(key.startswith(p+'days/') for p in PUBLICATIONS)):
            raise ValueError('Outside report and publication namespaces')
        req = Request(self.origin+'/storage/v1/'+path,
                      data=json.dumps(body).encode() if body else None, method=method,
                      headers={'apikey': self.key, 'Authorization': 'Bearer '+self.key, 'Content-Type': 'application/json'})
        with build_opener(NoRedirect()).open(req, timeout=30) as response:
            data = response.read(8_000_001)
            if len(data) > 8_000_000:
                raise ValueError('Oversized response')
            return json.loads(data)

    def read(self, key):
        return self.request('GET', 'object/authenticated/'+BUCKET+'/'+quote(key, safe='/'))

    def names(self, prefix):
        result = []
        for offset in range(0, 20000, 100):
            page = self.request('POST', 'object/list/'+BUCKET,
                {'prefix': prefix, 'limit': 100, 'offset': offset, 'sortBy': {'column': 'name', 'order': 'asc'}})
            if not isinstance(page, list):
                raise ValueError('Invalid listing')
            result.extend(row['name'] for row in page)
            if len(page) < 100:
                return result
        raise ValueError('Listing incomplete')


def latest_report(store):
    """Report objects are created atomically at the end of collection.
    Exhaust the paginated listing; select by parsed generated_at, not run ID/name.
    A listing/read failure aborts export so the previous projection stays intact.
    """
    reports = []
    prefix = ANALYTICS+'reports/'
    for name in store.names(prefix):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.json', name):
            continue
        raw = store.read(prefix+name)
        try:
            safe = project_report(raw)
        except (ValueError, TypeError, AttributeError):
            continue  # Incomplete or unsupported objects are not completed reports.
        reports.append((moment(safe['generated_at']), name, safe))
    if not reports:
        raise ValueError('No completed reports')
    return max(reports, key=lambda row: (row[0], row[1]))[2]


def publication_results(store):
    results = []
    for namespace in PUBLICATIONS:
        for day in store.names(namespace+'days/'):
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day):
                continue
            prefix = namespace+'days/'+day+'/states/'
            revisions = [n for n in store.names(prefix) if re.fullmatch(r'\d{6}\.json', n)]
            if not revisions:
                continue
            # Unlike run IDs these are explicitly monotonic ledger revisions.
            state = store.read(prefix+max(revisions))
            for platform in ('instagram', 'facebook'):
                item = state.get('platforms', {}).get(platform, {})
                status = item.get('status')
                status = status if status in ('published', 'failed', 'pending', 'publishing', 'skipped', 'blocked', 'ready', 'not_started', 'uncertain') else 'Unknown'
                results.append({'date': day, 'platform': platform, 'status': status,
                                'live_test': namespace == PUBLICATIONS[1]})
    return sorted(results, key=lambda r: r['date'], reverse=True)[:120]


def state_goals(raw):
    """Explicit adapter contract pending actual Pi state source access.
    Targets must carry the same unit as the source measurement; never convert density to count.
    """
    result = []
    order = raw.get('priority_states', [])
    for row in raw.get('states', []):
        code = row.get('code', '')
        if not re.fullmatch('[A-Z]{2}', code) or row.get('eligible') is not True:
            continue
        metrics = []
        for m in row.get('metrics', []):
            if m.get('name') not in ('Restaurant coverage', 'Ratings', 'Photos') or not m.get('source'):
                continue
            units = {'Restaurant coverage': ('restaurants', 'restaurants per million residents'),
                     'Ratings': ('ratings',), 'Photos': ('photos',)}
            if m.get('unit') not in units[m['name']]:
                raise ValueError('Metric and unit mismatch')
            target = m.get('target') if m.get('target_unit') == m.get('unit') else None
            item = goal(m.get('current'), target, m.get('unit'))
            item['name'] = m['name']
            metrics.append(item)
        result.append({'code': code, 'updated_at': row.get('updated_at') if moment(row.get('updated_at')) else None,
                       'metrics': metrics})
    if order:
        return sorted(result, key=lambda r: (order.index(r['code']) if r['code'] in order else len(order), r['code']))
    return sorted(result, key=lambda r: (-next((m['current'] or 0 for m in r['metrics'] if m['name']=='Restaurant coverage'), 0), r['code']))


def export(store, output, states=None):
    payload = {'schema_version': 1, 'exported_at': datetime.now(timezone.utc).isoformat(),
               'social': latest_report(store), 'publications': publication_results(store),
               'states': state_goals(states or {}),
               'state_order': 'Established priority order' if (states or {}).get('priority_states') else 'Largest catalogs; priority not set'}
    output = Path(output)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, allow_nan=False), encoding='utf-8')
    temporary.replace(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--states', help='Verified state projection; see README before configuring')
    args = parser.parse_args()
    try:
        export(StorageReader(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY']), args.output,
               json.loads(Path(args.states).read_text(encoding='utf-8')) if args.states else None)
    except Exception:
        # Preserve successful values, but communicate a failed server refresh immediately.
        try:
            previous = json.loads(Path(args.output).read_text(encoding='utf-8'))
            previous['refresh_failed'] = True
            temporary = Path(args.output).with_suffix('.tmp')
            temporary.write_text(json.dumps(previous, allow_nan=False), encoding='utf-8')
            temporary.replace(args.output)
        except (OSError, ValueError, TypeError):
            pass
        print('Growth projection failed; previous values retained and marked stale.', file=sys.stderr)
        sys.exit(1)
