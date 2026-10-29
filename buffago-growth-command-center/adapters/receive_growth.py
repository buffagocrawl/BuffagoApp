"""Forced SSH command: replace ONLY the local sanitized Growth & Goals cache."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from growth_goals import PanelFeed


def receive(stream, destination):
    raw = stream.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('Oversized projection')
    payload = json.loads(raw)
    if not isinstance(payload, dict) or set(payload)-{'schema_version','exported_at','social','publications','states','state_order','refresh_failed'}:
        raise ValueError('Invalid projection')
    destination = Path(destination)
    temporary = destination.with_suffix('.incoming')
    try:
        temporary.write_text(json.dumps(payload, allow_nan=False), encoding='utf-8')
        feed = PanelFeed()
        if feed.load(temporary) is None:
            raise ValueError('Incomplete projection')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        receive(sys.stdin.buffer, Path(__file__).resolve().parents[1]/'data/growth-goals.json')
        print('Dashboard cache received')
    except Exception:
        print('Dashboard cache rejected', file=sys.stderr)
        sys.exit(1)
