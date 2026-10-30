"""Read-only aggregate adapter for the inspected public state catalog and contributions."""
from collections import Counter
from datetime import datetime, timezone
import json
from urllib.request import Request, build_opener
from uuid import UUID
from adapters.export_growth import NoRedirect

SELECTS = {
    'states': 'state_id,state_code',
    'destinations': 'id,state_id',
    'destination_ratings': 'id,destination_id,user_id',
    'wing_media_submissions': 'id,destination_id,user_id,media_type,status,withdrawn_at',
}
PUBLIC_STATUSES = {'approved', 'generation_pending', 'ready_to_post', 'scheduled', 'posting', 'posted'}
COMMUNITY_BASIS = 'founder_excluded_v1'
EXCLUSIONS_KEY = 'guess-wing-spot-analytics-v1/dashboard/goal-exclusions.json'


def exclusion_ids(config):
    """Validate private server configuration without including identities in errors."""
    try:
        values = config['excluded_user_ids']
        if config.get('schema_version') != 1 or not isinstance(values, list) or not values:
            raise ValueError()
        return frozenset(str(UUID(value)) for value in values)
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ValueError('Invalid private goal exclusions') from None


def unique_rows(rows):
    """Pagination duplicates must not count twice; conflicting copies fail closed."""
    result = {}
    for row in rows:
        key = row['id']
        if key in result and result[key] != row:
            raise ValueError('Conflicting aggregate source records')
        result[key] = row
    return list(result.values())


class StateReader:
    def __init__(self, storage):
        self.origin, self.key = storage.origin, storage.key

    def excluded_users(self):
        # The Pi's narrow feed capability cannot access this private object.
        request = Request(self.origin+'/storage/v1/object/authenticated/jalapeno-assets/'+EXCLUSIONS_KEY,
                          headers={'apikey': self.key, 'Authorization': 'Bearer '+self.key})
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            return exclusion_ids(json.load(response))

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


def collect_states(reader, excluded_user_ids):
    started = datetime.now(timezone.utc).isoformat()
    states = reader.rows('states')
    excluded_user_ids = frozenset(excluded_user_ids)
    if not excluded_user_ids:
        raise ValueError('Private goal exclusions required')
    destinations = unique_rows(reader.rows('destinations'))
    restaurants_read = datetime.now(timezone.utc).isoformat()
    destination_states = {r['id']: r['state_id'] for r in destinations}
    counts = Counter(r['state_id'] for r in destinations)
    ratings = Counter(destination_states.get(r['destination_id']) for r in unique_rows(reader.rows('destination_ratings'))
                      if r['user_id'] not in excluded_user_ids)
    photos = Counter(destination_states.get(r['destination_id']) for r in unique_rows(reader.rows('wing_media_submissions'))
                     if r['user_id'] not in excluded_user_ids and r['media_type'] == 'photo'
                     and r['status'] in PUBLIC_STATUSES and r['withdrawn_at'] is None)
    stamp = datetime.now(timezone.utc).isoformat()
    # No established priorities/targets or population denominator were found.
    result = []
    for state in states:
        sid = state['state_id']
        result.append({'code': state['state_code'].strip(), 'eligible': True, 'updated_at': stamp,
                       'collection_started_at': started, 'restaurants_collected_at': restaurants_read,
                       'contribution_basis': COMMUNITY_BASIS,
                       'metrics': [{'name': name, 'current': current, 'target': None, 'unit': unit,
                                    'source': source} for name, current, unit, source in (
                           ('Restaurant coverage', counts[sid], 'restaurants', 'public.destinations.state_id'),
                           ('Ratings', ratings[sid], 'ratings', 'public.destination_ratings joined to destinations'),
                           ('Photos', photos[sid], 'photos', 'public.wing_media_submissions approved lifecycle, not withdrawn'))]})
    return {'priority_states': [], 'states': result}
