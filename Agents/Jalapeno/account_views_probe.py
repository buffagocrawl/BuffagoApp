"""Read-only account views capability probe; never print counts, tokens, IDs or raw responses."""
import json
import os
from datetime import datetime, timezone
from reel_analytics.meta import MetaReader
from reel_analytics.weekly import account_history

if __name__ == '__main__':
    try:
        e = os.environ
        meta = MetaReader(e['META_LONG_LIVED_ACCESS_TOKEN'], e['META_APP_SECRET'], e['META_GRAPH_API_VERSION'])
        meta.identity(e['INSTAGRAM_BUSINESS_ACCOUNT_ID'],e['FACEBOOK_PAGE_ID'],e['GUESS_EXPECTED_INSTAGRAM_USERNAME'],e['GUESS_EXPECTED_FACEBOOK_NAME'])
        result = account_history(meta, datetime.now(timezone.utc), days=2)
        print(json.dumps({'status': 'account_views_probed_read_only', 'scope': result['scope'],
            'available_days': sum(r['value'] is not None for r in result['days']),
            'reasons': sorted({r['reason'] for r in result['days'] if r['reason']}),
            'range_contract': 'NY midnight to next midnight minus one second; inclusive Unix bounds',
            'methods': sorted({r['method'] for r in meta.audit})}))
    except Exception:
        print('{"status":"account_views_probe_failed_details_withheld"}')
        raise SystemExit(1)
