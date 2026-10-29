"""Read-only aggregate adapter for the inspected public state catalog and contributions."""
from collections import Counter
from datetime import datetime, timezone
import json
from urllib.request import Request, build_opener
from adapters.export_growth import NoRedirect

SELECTS = {
    'states': 'state_id,state_code',
    'destinations': 'id,state_id',
    'destination_ratings': 'id,destination_id',
    'wing_media_submissions': 'id,destination_id,media_type,status,withdrawn_at',
}
PUBLIC_STATUSES = {'approved', 'generation_pending', 'ready_to_post', 'scheduled', 'posting', 'posted'}


class StateReader:
    def __init__(self, storage):
        self.origin, self.key = storage.origin, storage.key

    def rows(self, table):
        select = SELECTS[table]  # No arbitrary tables, columns, RPCs, or mutations.
        rows = []
        for offset in range(0, 100000, 500):
            order = 'state_id' if table == 'states' else 'id'
            request = Request(f'{self.origin}/rest/v1/{table}?select={select}&order={order}&limit=500&offset={offset}',
                              headers={'apikey': self.key, 'Authorization': 'Bearer '+self.key})
            with build_opener(NoRedirect()).open(request, timeout=30) as response:
                page = json.load(response)
            if not isinstance(page, list):
                raise ValueError('Invalid state source')
            rows.extend(page)
            if len(page) < 500:
                return rows
        raise ValueError('Incomplete state source')


def collect_states(reader):
    states = reader.rows('states')
    destinations = reader.rows('destinations')
    destination_states = {r['id']: r['state_id'] for r in destinations}
    counts = Counter(r['state_id'] for r in destinations)
    ratings = Counter(destination_states.get(r['destination_id']) for r in reader.rows('destination_ratings'))
    photos = Counter(destination_states.get(r['destination_id']) for r in reader.rows('wing_media_submissions')
                     if r['media_type'] == 'photo' and r['status'] in PUBLIC_STATUSES and r['withdrawn_at'] is None)
    stamp = datetime.now(timezone.utc).isoformat()
    # No established priorities/targets or population denominator were found.
    result = []
    for state in states:
        sid = state['state_id']
        result.append({'code': state['state_code'].strip(), 'eligible': True, 'updated_at': stamp,
                       'metrics': [{'name': name, 'current': current, 'target': None, 'unit': unit,
                                    'source': source} for name, current, unit, source in (
                           ('Restaurant coverage', counts[sid], 'restaurants', 'public.destinations.state_id'),
                           ('Ratings', ratings[sid], 'ratings', 'public.destination_ratings joined to destinations'),
                           ('Photos', photos[sid], 'photos', 'public.wing_media_submissions approved lifecycle, not withdrawn'))]})
    return {'priority_states': [], 'states': result}
