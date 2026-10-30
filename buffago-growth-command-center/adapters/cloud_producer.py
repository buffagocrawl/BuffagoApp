"""Actions producer: read app aggregates, write ONLY the independent sanitized analytics feed."""
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapters.export_growth import StorageReader, export, ANALYTICS, BUCKET
from adapters.state_counts import StateReader, collect_states
from growth_goals import moment
from urllib.request import Request, build_opener
from adapters.export_growth import NoRedirect

FEED_KEY = ANALYTICS+'dashboard/feed.json'


def newest_weekly(store):
    prefix = ANALYTICS+'account-reports/'
    rows = []
    for name in store.names(prefix):
        if not name.endswith('.json'):
            continue
        row = store.read(prefix+name)
        if row.get('schema_version') == 1 and moment(row.get('generated_at')):
            rows.append(row)
    if not rows:
        return None
    raw = max(rows, key=lambda r: moment(r['generated_at']))
    return {k: raw[k] for k in ('schema_version','generated_at','captured_at','scope','definition','timezone','api_version','source','weeks','coverage')}


def produce(env=os.environ):
    if env.get('GITHUB_ACTIONS') != 'true' or env.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Feed production requires reviewed main Actions code')
    store = StorageReader(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
    path = Path(env.get('RUNNER_TEMP', '/tmp'))/'pi-dashboard-feed.json'
    reader = StateReader(store)
    excluded = reader.excluded_users()
    export(store, path, collect_states(reader, excluded))
    payload = json.loads(path.read_text(encoding='utf-8'))
    payload['weekly_instagram'] = newest_weekly(store)
    data = json.dumps(payload, allow_nan=False).encode()
    if any(identity.encode() in data for identity in excluded):
        raise ValueError('Private goal configuration in projection')
    # Fixed object only. Never reuse the collector's immutable snapshot writer for upserts.
    request = Request(store.origin+'/storage/v1/object/'+BUCKET+'/'+FEED_KEY, data=data, method='POST',
        headers={'apikey': store.key, 'Authorization': 'Bearer '+store.key,
                 'Content-Type': 'application/json', 'x-upsert': 'true'})
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        if response.status not in (200, 201):
            raise ValueError('Feed write failed')
    print(json.dumps({'status': 'sanitized_feed_updated', 'states': len(payload['states']),
                      'credential_or_source_fields_exported': False}))


if __name__ == '__main__':
    try:
        produce()
    except Exception:
        print('Sanitized dashboard feed production failed; prior object retained.', file=sys.stderr)
        raise SystemExit(1)
