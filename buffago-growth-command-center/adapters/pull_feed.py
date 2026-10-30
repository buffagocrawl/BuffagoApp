"""Pi-only restricted feed pull. No Supabase service key, Meta token, SDK, or app writes."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from growth_goals import PanelFeed


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def atomic_write(path, payload):
    path = Path(path)
    temporary = path.with_name(path.name+'.new')
    try:
        with temporary.open('w', encoding='utf-8') as stream:
            os.chmod(temporary, 0o600)
            json.dump(payload, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def pull(config, *, fetch=None, sleep=time.sleep, now=lambda: datetime.now(timezone.utc)):
    url, token, cache = config['url'], config['token'], Path(config['cache_path'])
    if not re.fullmatch(r'https://[a-z0-9.-]+\.supabase\.co/functions/v1/buffago-pi-feed', url):
        raise ValueError('Invalid fixed feed endpoint')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise ValueError('Invalid restricted feed credential')
    request = Request(url, headers={'Authorization': 'Bearer '+token, 'Cache-Control': 'no-cache'})
    fetch = fetch or (lambda req: build_opener(NoRedirect()).open(req, timeout=12))
    for attempt in range(2):
        try:
            with fetch(request) as response:
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError('Oversized feed')
            payload = json.loads(raw)
            if not isinstance(payload, dict) or set(payload)-{'schema_version','exported_at','social','publications','states','state_order','weekly_instagram'}:
                raise ValueError('Invalid feed fields')
            # Validate on a separate candidate; never replace the last good cache with partial data.
            candidate = cache.with_name(cache.name+'.candidate')
            try:
                atomic_write(candidate, payload)
                if PanelFeed().load(candidate) is None:
                    raise ValueError('Invalid feed contract')
            finally:
                candidate.unlink(missing_ok=True)
            payload['pi_refreshed_at'] = now().isoformat()
            payload['pi_refresh_failed'] = False
            atomic_write(cache, payload)
            return True
        except Exception:
            if attempt == 0:
                sleep(2)
    try:
        payload = json.loads(cache.read_text(encoding='utf-8'))
        payload['pi_refresh_failed'] = True
        atomic_write(cache, payload)  # Keep all values, capture times and last successful refresh unchanged.
    except (OSError, ValueError, TypeError):
        pass
    return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/buffago-growth-feed.json')
    args = parser.parse_args()
    try:
        ok = pull(json.loads(Path(args.config).read_text(encoding='utf-8')))
    except Exception:
        ok = False
    print('Restricted dashboard feed refreshed' if ok else 'Dashboard feed unavailable; last good values retained')
    raise SystemExit(0 if ok else 1)
