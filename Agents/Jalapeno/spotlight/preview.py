"""Private discovery preview: source reads only; optional separate cache writes."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .core import Sources, Ledger, candidates, caption
from guess_wing_spot.sources import read_environment
from .verification import Verifier, select


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--save-cache', action='store_true',
                        help='Opt in to private verification-cache writes only; default is read-only.')
    args = parser.parse_args()
    try:
        env = read_environment(args.env_file)
        source = Sources.from_environment(args.env_file)
        ledger = Ledger(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
        ledger.check_private()
        now = datetime.now(timezone.utc)
        pool = candidates(source.load(), source.scores(), ledger.recent(now), now)
        verifier = Verifier.configured(ledger, writable=args.save_cache, now=now)
        candidate, image, verified = select(pool, source, verifier)
        # Resolve the rest for coverage while sharing the strict run budget.
        for row in pool[:100]:
            verifier.resolve(row)
        args.output.mkdir(parents=True, exist_ok=True)
        report = {'checked_at': now.isoformat(), 'eligible_photo_count': len(pool),
                  'eligible_restaurant_count': len({c['destination_id'] for c in pool}),
                  'coverage': verifier.summary(), 'results': list(verifier.results.values()),
                  'selected_destination_id': candidate['destination_id'] if candidate else None,
                  'cache_writes': args.save_cache}
        (args.output / 'verification-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        if candidate:
            (args.output / 'photo.jpg').write_bytes(image)
            (args.output / 'caption.txt').write_text(caption(candidate, verified), encoding='utf-8')
            print(json.dumps({'status': 'private_preview_prepared', 'coverage': verifier.summary(),
                              'cache_writes': args.save_cache}))
            return 0
        for name in ('photo.jpg', 'caption.txt'):
            (args.output / name).unlink(missing_ok=True)
        print(json.dumps({'status': 'no_verified_candidate', 'coverage': verifier.summary()}))
    except Exception as error:
        # Exception text/response bodies can contain secrets. Fixed diagnostics only.
        from guess_wing_spot.sources import SourceError
        from guess_wing_spot.durable import DurableError
        safe = str(error) if isinstance(error, (SourceError, DurableError)) else type(error).__name__
        print('Preview blocked: ' + safe)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
