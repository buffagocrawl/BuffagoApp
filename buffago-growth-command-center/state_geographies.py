"""Fixed wall geographies; Nation sums disjoint, complete state aggregates only."""
from growth_goals import goal, number

STATE_CODES = frozenset('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
FEATURED = (('US', 'Nation'), ('CT', 'Connecticut'), ('OH', 'Ohio'), ('NY', 'New York'), ('MA', 'Massachusetts'))
METRIC_UNITS = (('Restaurant coverage', 'restaurants'), ('Ratings', 'ratings'), ('Photos', 'photos'))


def wall_states(states):
    # Ignore any precomputed national row: never add it back into its own total.
    rows = [s for s in states if s.get('code') in STATE_CODES]
    complete = len(rows) == 50 and {s['code'] for s in rows} == STATE_CODES
    by_code = {s['code']: s for s in rows}
    nation = {'code': 'US', 'updated_at': min((s.get('updated_at') or '' for s in rows), default=None), 'metrics': []}
    for name, unit in METRIC_UNITS:
        values = [next((m.get('current') for m in s['metrics'] if m['name'] == name and m['unit'] == unit), None) for s in rows]
        total = sum(values) if complete and all(number(v) is not None for v in values) else None
        nation['metrics'].append({'name': name, **goal(total, None, unit)})
    return [dict(nation if code == 'US' else by_code.get(code, {'code': code, 'metrics': [], 'updated_at': None}), label=label)
            for code, label in FEATURED]
