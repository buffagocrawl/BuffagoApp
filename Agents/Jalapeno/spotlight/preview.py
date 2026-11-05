"""Local private preview: GET/HEAD source reads; no provider or ledger writes."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .core import Sources, Ledger, candidates, caption, render
from guess_wing_spot.sources import read_environment


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        env = read_environment(args.env_file)
        source = Sources.from_environment(args.env_file)
        ledger = Ledger(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
        ledger.check_private()
        now = datetime.now(timezone.utc)
        pool = candidates(source.load(), source.scores(), ledger.recent(now), now)
        verified = json.loads(Path(__file__).with_name('verified_handles.json').read_text())
        for candidate in pool:
            if not source.asset_available(candidate['photo_id']):
                continue
            try:
                image = render(source.photo_bytes(candidate['photo_id']), candidate)
            except ValueError:
                continue
            args.output.mkdir(parents=True, exist_ok=True)
            (args.output / 'photo.jpg').write_bytes(image)
            (args.output / 'caption.txt').write_text(caption(candidate, verified), encoding='utf-8')
            print('Private preview prepared; no publication or source writes.')
            return 0
        print('Preview blocked: no eligible candidate with available renderable photo.')
    except Exception as error:
        # Exception text/response bodies can contain secrets. Fixed diagnostics only.
        from guess_wing_spot.sources import SourceError
        from guess_wing_spot.durable import DurableError
        safe = str(error) if isinstance(error, (SourceError, DurableError)) else type(error).__name__
        print('Preview blocked: ' + safe)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
