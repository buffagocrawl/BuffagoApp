"""Trusted Windows-host refresh job. Private reads stay here; Pi gets aggregates only."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import os
from config import load_dotenv
from adapters.export_growth import StorageReader, export
from adapters.state_counts import StateReader, collect_states


def sync(env_file, identity, host, cache):
    load_dotenv(Path(env_file))
    failed = False
    try:
        store = StorageReader(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
        export(store, cache, collect_states(StateReader(store)))
    except Exception:
        failed = True
        try:
            payload = json.loads(Path(cache).read_text(encoding='utf-8'))
            payload['refresh_failed'] = True
            Path(cache).write_text(json.dumps(payload, allow_nan=False), encoding='utf-8')
        except (OSError, ValueError, TypeError):
            return 1
    result = subprocess.run(['ssh','-T','-i',str(identity),'-o','IdentitiesOnly=yes',
                             '-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
                             '-o','ConnectTimeout=15',host], input=Path(cache).read_bytes(),
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)
    return 1 if failed or result.returncode else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--identity-file', required=True)
    parser.add_argument('--host', required=True)
    parser.add_argument('--cache', required=True)
    args = parser.parse_args()
    try:
        sys.exit(sync(args.env_file, args.identity_file, args.host, args.cache))
    except Exception:
        print('Dashboard refresh failed; cached display values retained.', file=sys.stderr)
        sys.exit(1)
