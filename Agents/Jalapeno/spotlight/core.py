from __future__ import annotations

import hashlib
import io
import math
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from types import SimpleNamespace

from PIL import Image, ImageDraw
from guess_wing_spot.eligibility import verdict, attribution, timestamp
from guess_wing_spot.rendering import decode_photo, font
from guess_wing_spot.sources import ReadOnlySources, TABLES
from guess_wing_spot.durable import PrivateLedger, DurableError
from guess_wing_spot.meta_reels import MetaError
from guess_wing_spot.geography import locate

WORKFLOW = '.github/workflows/community-spotlight.yml'
EASTERN = ZoneInfo('America/New_York')
DAYS = {0, 2, 4, 5, 6}


def window(now):
    if now.tzinfo is None:
        raise ValueError('timezone_required')
    local = now.astimezone(EASTERN)
    return local.weekday() in DAYS and local.hour == 12


def score(rows):
    """Same weight_score arithmetic average as Wingdex; reject corrupt inputs."""
    grouped = {}
    for row in rows:
        grouped.setdefault(row['destination_id'], []).append(row.get('weight_score'))
    result = {}
    for identifier, values in grouped.items():
        try:
            if any(isinstance(v, bool) for v in values):
                continue
            numbers = [float(v) if v is not None else 0.0 for v in values]
        except (ValueError, TypeError):
            continue
        if not numbers or any(not math.isfinite(n) or not 0 <= n <= 100 for n in numbers):
            continue
        result[identifier] = {'average': sum(numbers) / len(numbers), 'count': len(numbers)}
    return result


class Sources(ReadOnlySources):
    tables = {**TABLES, 'destination_ratings': ('id', 'id,destination_id,weight_score')}

    def scores(self):
        return score(self.rows('destination_ratings'))


class Ledger(PrivateLedger):
    PREFIX = 'community-spotlight-v1/'

    def recent(self, now):
        # States, including unresolved attempts, are the authority. An optional
        # history write cannot accidentally free a restaurant after a crash.
        result = []
        for date in self.names('days/'):
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
                raise DurableError('invalid_history_date')
            state = self.latest(date)
            if state is None:
                raise DurableError('history_state_missing')
            if state and state.get('photo_id'):
                published = timestamp(state.get('published_at'))
                if not published or now - published < timedelta(days=30):
                    result.append(state)
        return result

    def image_url(self, digest):
        key = 'outputs/' + digest + '.jpg'
        response = self.request('POST', 'object/sign/' + self.BUCKET + '/' + self.key(key), json={'expiresIn': 3600})
        if response.status_code != 200:
            raise DurableError('image_sign_failed')
        signed = response.json().get('signedURL', '')
        expected = '/object/sign/' + self.BUCKET + '/' + self.PREFIX + key
        if not signed.startswith(expected + '?'):
            raise DurableError('unexpected_image_url')
        return self.origin + '/storage/v1' + signed


def candidates(snapshot, scores, history, now):
    blocked_photos, blocked_places, blocked_physical = set(), set(), set()
    for entry in history:
        # Unknown provider outcomes remain reserved until reconciled, even
        # after 30 days. Successful posts expire exactly 30 elapsed days later.
        published = timestamp(entry.get('published_at'))
        if not published or now - published < timedelta(days=30):
            blocked_photos.add(entry['photo_id'])
            blocked_places.add(entry['destination_id'])
            if entry.get('physical_key'):
                blocked_physical.add(entry['physical_key'])
    result = []
    for row in snapshot.photos:
        identifier, destination_id = row['id'], row.get('destination_id')
        if identifier in blocked_photos or destination_id in blocked_places:
            continue
        user = snapshot.users.get(row.get('user_id'))
        # The existing photo consent/moderation contract, including >50% photo
        # approval, is retained in addition to the restaurant score threshold.
        if (row.get('consent_version') != 'wing-shots-v1'
                or verdict(row, snapshot.votes.get(identifier), user, identifier in snapshot.unsafe, now)):
            continue
        rating = scores.get(destination_id, {})
        if rating.get('average', 0) <= 80:
            continue
        destination = snapshot.destinations.get(destination_id)
        state = snapshot.states.get(str((destination or {}).get('state_id')))
        credit = attribution(row, user)
        if not destination or not state or not credit:
            continue
        located = locate(SimpleNamespace(destination=destination, state=state))
        if not located or located.physical_key in blocked_physical:
            continue
        result.append({'photo_id': identifier, 'destination_id': destination_id,
                       'physical_key': located.physical_key,
                       'name': destination['name'], 'city': destination.get('city') or '',
                       'state': state['state_code'], 'address': destination.get('address') or '',
                       'credit': credit, **rating})
    # Stable daily shuffle avoids permanently favoring the highest rated place.
    date = now.astimezone(EASTERN).date().isoformat()
    return sorted(result, key=lambda c: hashlib.sha256((date + c['photo_id']).encode()).hexdigest())


def handle(candidate, verified):
    record = verified.get(candidate['destination_id'], {})
    username = record.get('handle', '')
    # Evidence is manually reviewed and bound to the exact physical location.
    if (record.get('verified') is True and record.get('verified_at')
            and record.get('official_source_url', '').startswith('https://')
            and record.get('name') == candidate['name'] and record.get('city') == candidate['city']
            and record.get('state') == candidate['state']
            and candidate.get('address') and record.get('address') == candidate['address']
            and re.fullmatch(r'[A-Za-z0-9_.]{1,30}', username)):
        return '@' + username
    return None


def caption(candidate, verified):
    tag = handle(candidate, verified)
    clean = lambda value: ' '.join(str(value).replace('@', '').replace('#', '').split())
    name = clean(candidate['name'])
    title = name + (' ' + tag if tag else '')
    location = clean(candidate.get('address') or ', '.join(x for x in (candidate['city'], candidate['state']) if x))
    count = candidate['count']
    return (f"{title} · {location}\n\n"
            f"BuffaGo community score: {candidate['average']:.2f}/100 from {count} "
            f"{'rating' if count == 1 else 'ratings'}.\n\n"
            f"A community look at the wings at {name}. Would you try them?\n"
            f"Photo: {candidate['credit']}.\n\n"
            "Download BuffaGo, try this restaurant, and add your own rating. Link in bio.\n\n"
            '#BuffaGo #ChickenWings #WingLovers #Foodie #WingSpot')


def render(data, candidate):
    image = decode_photo(data)
    if min(image.size) < 480:
        raise ValueError('photo_resolution_too_low')
    canvas = Image.new('RGB', (1080, 1350), '#111827')
    # Contain the full photo: no cropped watermarks, invented food, or EXIF.
    image.thumbnail((1080, 1060))
    canvas.paste(image, ((1080 - image.width)//2, (1060-image.height)//2))
    draw = ImageDraw.Draw(canvas)
    draw.text((48, 1100), f"{candidate['average']:.2f}/100", font=font(76), fill='#a3e635')
    count = candidate['count']
    draw.text((48, 1200), f"BuffaGo community · {count} {'rating' if count == 1 else 'ratings'}", font=font(36), fill='white')
    output = io.BytesIO()
    canvas.save(output, 'JPEG', quality=92)
    return output.getvalue()


class PhotoPublisher:
    """Durable intent before each provider mutation; never repeat an unknown POST."""
    def __init__(self, graph, account_id, token):
        self.graph, self.account_id, self.token = graph, account_id, token

    def publish(self, state, persist, image_url, revalidate, window_ok):
        if state.get('status') == 'published':
            return
        if state.get('pending'):
            identifier = state.get('container_id')
            if identifier:
                status = self.graph.call('GET', identifier, token=self.token, data={'fields': 'status_code'}).get('status_code')
                if status == 'PUBLISHED':
                    state.update(status='published', pending=None, published_at=datetime.now(timezone.utc).isoformat())
                    persist()
            # A FINISHED container does not prove a publish POST was rejected.
            return

        def mutation(operation, path, data):
            state.update(pending=operation, status='uncertain')
            persist()
            result = self.graph.call('POST', path, token=self.token, data=data)
            if not str(result.get('id', '')).isdigit():
                raise MetaError('provider_identity_missing', uncertain=True)
            return str(result['id'])

        if not state.get('container_id'):
            identifier = mutation('create', self.account_id + '/media',
                                  {'image_url': image_url(), 'caption': state['caption']})
            state.update(container_id=identifier, pending=None, status='container_created')
            persist()
        status = self.graph.call('GET', state['container_id'], token=self.token, data={'fields': 'status_code'}).get('status_code')
        if status == 'PUBLISHED':
            state.update(status='published', pending=None, published_at=datetime.now(timezone.utc).isoformat())
            persist()
            return
        if status != 'FINISHED':
            return  # Later bounded recovery attempt checks the same container.
        revalidate()
        if not window_ok():
            raise MetaError('publication_window_closed')
        identifier = mutation('publish', self.account_id + '/media_publish', {'creation_id': state['container_id']})
        state.update(publication_id=identifier, pending=None, status='published',
                     published_at=datetime.now(timezone.utc).isoformat())
        persist()
