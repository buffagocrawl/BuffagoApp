"""Deterministic website evidence, never LLM/page instructions or inferred handles."""
import base64
import hashlib
import json
import re
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, quote, urljoin, urlsplit

from guess_wing_spot.eligibility import timestamp
from guess_wing_spot.geography import street_key
from .websites import Fetcher, FetchError, host_key, public_url

VERSION = 1
TTL = {'verified': 30, 'unresolved': 7, 'conflicting': 7, 'unavailable': 1}
DENIED = {'instagram.com', 'facebook.com', 'yelp.com', 'tripadvisor.com', 'restaurantguru.com',
          'opentable.com', 'doordash.com', 'ubereats.com', 'grubhub.com', 'google.com',
          'bing.com', 'duckduckgo.com', 'yellowpages.com', 'mapquest.com', 'wikipedia.org'}
RESERVED = {'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'share', 'tv', 'about'}


def instagram_handle(url):
    try:
        p = urlsplit(url)
        value = p.path.strip('/')
        if (p.scheme == 'https' and p.hostname in {'instagram.com', 'www.instagram.com'}
                and not p.username and not p.password and p.port in (None, 443)
                and re.fullmatch(r'[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?', value)
                and '..' not in value and value.casefold() not in RESERVED):
            return value.casefold()
    except ValueError:
        pass
    return None


def norm(value):
    return street_key(str(value).replace("'", '').replace('’', '').replace('&', ' and '))


def name_matches(name, text):
    tokens = norm(name).split()
    return bool(tokens) and (' ' + ' '.join(tokens) + ' ') in (' ' + norm(text) + ' ')


def allowed_site(url):
    try:
        host = urlsplit(public_url(url)).hostname
        return not any(host == item or host.endswith('.' + item) for item in DENIED)
    except FetchError:
        return False


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.links, self.text, self.brand, self.schemas = [], [], [], []
        self.ignored, self.heading, self.script = 0, False, None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {'script', 'style', 'noscript'}:
            self.ignored += 1
        if tag == 'script' and attrs.get('type', '').lower() == 'application/ld+json':
            self.script = []
        if tag in {'title', 'h1'}:
            self.heading = True
        if tag == 'meta' and attrs.get('property') == 'og:site_name':
            self.brand.append(attrs.get('content', ''))
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            try:
                self.schemas.append(json.loads(''.join(self.script)))
            except (ValueError, RecursionError):
                pass
            self.script = None
        if tag in {'script', 'style', 'noscript'}:
            self.ignored = max(0, self.ignored - 1)
        if tag in {'title', 'h1'}:
            self.heading = False

    def handle_data(self, text):
        if self.script is not None:
            self.script.append(text)
        if not self.ignored:
            self.text.append(text)
            if self.heading:
                self.brand.append(text)


def objects(value, depth=0):
    if depth > 12:
        return
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child, depth+1)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child, depth+1)


def address_parts(candidate):
    address = re.fullmatch(r"(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?(?:,?\s*(?:USA|United States))?", candidate['address'], re.I)
    return address.groups() if address else None


def same_address(candidate, address):
    parts = address_parts(candidate)
    if not parts or not isinstance(address, dict):
        return False
    street, city, state, postal = parts
    region = address.get('addressRegion', '')
    if isinstance(region, dict):
        region = region.get('name', '')
    return (norm(address.get('streetAddress', '')) == norm(street)
            and norm(address.get('addressLocality', '')) == norm(city)
            and norm(region) == norm(state)
            and str(address.get('postalCode', '')).split('-')[0] == postal
            and norm(candidate['city'].split(',')[0]) == norm(city)
            and norm(candidate['state']) == norm(state))


def evidence(candidate, url, page, names=None):
    """Only an exact-location object or a single-location page can supply links."""
    matches = []
    names = names or [candidate['name']]
    for schema in page.schemas:
        for obj in objects(schema):
            types = obj.get('@type', [])
            types = [types] if isinstance(types, str) else types
            if (not isinstance(types, list) or not all(isinstance(t, str) for t in types)
                    or not set(types) & {'Restaurant', 'BarOrPub', 'FoodEstablishment', 'LocalBusiness'}
                    or not any(name_matches(name, obj.get('name', '')) for name in names)
                    or not same_address(candidate, obj.get('address'))):
                continue
            same_as = obj.get('sameAs', [])
            same_as = [same_as] if isinstance(same_as, str) else same_as
            if not isinstance(same_as, list):
                continue
            handles = {h for link in same_as if isinstance(link, str) and (h := instagram_handle(link))}
            matches.extend(handles)
    matched = set(matches)
    def fallback(reason):
        return (matched, 'official_location_jsonld') if matched else (set(), reason)
    parts = address_parts(candidate)
    if not parts:
        return fallback('location_mismatch')
    street, city, state, postal = parts
    # Do not piece together an address from unrelated page sections. Require a
    # contiguous complete address after conservative street abbreviation folding.
    text = norm(' '.join(page.text))
    expected = norm(' '.join((street, city, state, postal)))
    if (not any(name_matches(name, ' '.join(page.text)) for name in names)
            or (' ' + expected + ' ') not in (' ' + text + ' ')
            or norm(candidate['city'].split(',')[0]) != norm(city)
            or norm(candidate['state']) != norm(state)):
        return fallback('location_mismatch')
    # A multi-location directory/homepage cannot authorize its global footer.
    zipcodes = set(re.findall(r'\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b', ' '.join(page.text)))
    streets = {norm(street) for street in re.findall(
        r'\b(\d{1,6}\s+[A-Za-z][A-Za-z .\x27#-]{2,65}),\s*[A-Za-z][A-Za-z .\x27-]+,\s*[A-Z]{2}\s+\d{5}',
        ' '.join(page.text))}
    if len(zipcodes) > 1 or len(streets) > 1:
        return fallback('chain_ambiguity')
    return matched | {h for link in page.links if (h := instagram_handle(urljoin(url, link)))}, 'official_location_page'


class Store:
    def __init__(self, ledger, writable=False):
        self.ledger, self.writable = ledger, writable

    def override(self, identifier):
        return self.ledger.get('instagram/overrides/' + identifier + '.json')

    def cached(self, identifier, fingerprint, now):
        prefix = 'instagram/cache/' + identifier + '/'
        names = self.ledger.names(prefix, reverse=True)
        fresh = []
        for name in names[:20]:
            row = self.ledger.get(prefix + name)
            if row and row.get('fingerprint') == fingerprint:
                expiry = timestamp(row.get('expires_at'))
                if expiry and expiry > now:
                    fresh.append(row)
        if not fresh:
            return None
        handles = {row['handle'] for row in fresh if row.get('verified') and row.get('handle')}
        if len(handles) > 1 or any(row.get('status') == 'conflicting' for row in fresh):
            return {**fresh[0], 'status': 'conflicting', 'verified': False, 'handle': None,
                    'reason': 'conflicting_durable_evidence'}
        return fresh[0]

    def save(self, record):
        if self.writable:
            key = 'instagram/cache/' + record['destination_id'] + '/' + record['checked_at'].replace(':', '-').replace('+', '-') + '-' + uuid.uuid4().hex + '.json'
            if not self.ledger.create(key, record):
                raise RuntimeError('verification_cache_write_failed')


class Verifier:
    def __init__(self, store, manual=None, seeds=None, fetcher=None, now=None, aliases=None):
        self.store, self.manual, self.seeds = store, manual or {}, seeds or {}
        self.fetcher, self.now = fetcher or Fetcher(), now or datetime.now(timezone.utc)
        self.results = {}
        self.aliases = aliases or {}

    @classmethod
    def configured(cls, ledger, writable=False, now=None):
        directory = Path(__file__).parent
        return cls(Store(ledger, writable), json.loads((directory/'verified_handles.json').read_text()),
                   json.loads((directory/'website_sources.json').read_text()), now=now,
                   aliases=json.loads((directory/'name_aliases.json').read_text()))

    def names(self, candidate, url):
        """Reviewed aliases identify a brand, never an address or account."""
        rule = self.aliases.get(candidate['destination_id'], {})
        if (not isinstance(rule, dict)
                or not isinstance(rule.get('aliases'), list)
                or not rule['aliases']
                or not all(isinstance(name, str) and name.strip() for name in rule['aliases'])
                or not isinstance(rule.get('evidence_urls'), list)
                or any(rule.get(key) != candidate[key] for key in ('name', 'address', 'city', 'state'))
                or not allowed_site(url) or host_key(url) != rule.get('official_host')
                or not rule.get('evidence_urls')
                or not all(isinstance(link, str) and allowed_site(link) and host_key(link) == rule['official_host']
                           for link in rule['evidence_urls'])):
            return [candidate['name']]
        return [candidate['name'], *rule.get('aliases', [])]

    def search(self, candidate):
        query = ' '.join((candidate['name'], candidate['address'], 'official restaurant website'))
        _, html = self.fetcher.get('https://www.bing.com/search?q=' + quote(query))
        links = []
        for link in Page(html).links:
            parsed = urlsplit(link)
            if parsed.hostname in {'www.bing.com', 'bing.com'} or link.startswith('/ck/'):
                value = parse_qs(parsed.query).get('u', [''])[0]
                if value.startswith('a1'):
                    try:
                        link = base64.urlsafe_b64decode(value[2:] + '=' * (-len(value[2:]) % 4)).decode()
                    except (ValueError, UnicodeError):
                        continue
            if allowed_site(link) and link not in links:
                links.append(link)
        return links[:3]

    def resolve(self, candidate):
        identifier = candidate['destination_id']
        if identifier in self.results:
            return self.results[identifier]
        from .core import handle
        override = self.store.override(identifier)
        manual = override if override is not None else self.manual.get(identifier)
        location = {key: candidate[key] for key in ('name', 'address', 'city', 'state')}
        seeds = list(dict.fromkeys([*candidate.get('website_urls', []), *self.seeds.get(identifier, [])]))[:3]
        # A reviewed alias change rechecks only this destination's cached results.
        identity = [VERSION, location, seeds]
        if identifier in self.aliases:
            identity.append(self.aliases[identifier])
        fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        base = {'destination_id': identifier, **location, 'matched_location': location,
                'fingerprint': fingerprint, 'checked_at': self.now.isoformat(), 'verified': False,
                'verification_version': VERSION}
        if manual is not None:
            if handle(candidate, {identifier: manual}):
                record = {**manual, **base, 'verified': True, 'verified_at': manual['verified_at'],
                          'handle': manual['handle'], 'official_source_url': manual['official_source_url'],
                          'status': 'verified', 'method': 'manual_override', 'cache': False}
            else:
                record = {**base, 'status': 'unresolved', 'reason': 'manual_override_blocked_or_invalid', 'method': 'manual_override'}
            self.results[identifier] = record
            return record
        cached = self.store.cached(identifier, fingerprint, self.now)
        if cached:
            self.results[identifier] = {**cached, 'cache': True}
            return self.results[identifier]
        handles, methods, errors, matched_urls = set(), set(), [], []
        try:
            if not seeds:
                seeds = self.search(candidate)
            for seed in seeds:
                if not allowed_site(seed):
                    errors.append('unsafe_or_nonofficial_seed')
                    continue
                try:
                    root = 'https://' + urlsplit(seed).netloc + '/'
                    root_url, root_html = self.fetcher.get(root)
                    root_page = Page(root_html)
                    # A directory's restaurant detail page is insufficient:
                    # the site's own homepage must identify this restaurant.
                    if not any(name_matches(name, ' '.join(root_page.brand))
                               for name in self.names(candidate, root_url)):
                        errors.append('official_brand_unconfirmed')
                        continue
                    urls = [seed]
                    # Only same-host contact/location links from official root.
                    for link in root_page.links:
                        target = urljoin(root_url, link)
                        if (allowed_site(target) and host_key(target) == host_key(root_url)
                                and any(word in target.lower() for word in ('location', 'contact', quote(candidate['city'].lower())))):
                            if target not in urls:
                                urls.append(target)
                    for target in urls[:4]:
                        final, html = self.fetcher.get(target)
                        found, method = evidence(candidate, final, Page(html), self.names(candidate, final))
                        if found:
                            handles.update(found)
                            methods.add(method)
                            matched_urls.append(final)
                        else:
                            errors.append(method if method in {'location_mismatch', 'chain_ambiguity'} else 'no_instagram_link')
                except FetchError as error:
                    errors.append(str(error))
        except FetchError as error:
            errors.append(str(error))
        status = ('conflicting' if len(handles) > 1 else 'verified' if handles else
                  'deferred' if 'request_budget_exhausted' in errors else
                  'unavailable' if errors and all(e.startswith(('website_', 'request_', 'read_', 'private_', 'unsafe_', 'cross_', 'redirect_', 'not_html', 'unsupported_', 'page_')) for e in errors) else 'unresolved')
        record = {**base, 'status': status, 'reason': 'multiple_official_handles' if len(handles) > 1 else 'verified_exact_location' if handles else (errors[-1] if errors else 'no_official_website'),
                  'method': '+'.join(sorted(methods)) or 'official_website_discovery',
                  'official_source_url': matched_urls[0] if matched_urls else None,
                  'evidence_urls': sorted(set(matched_urls)), 'errors': sorted(set(errors)),
                  'expires_at': (self.now + timedelta(days=TTL.get(status, 0))).isoformat(), 'cache': False}
        if status == 'verified':
            record.update(verified=True, handle=next(iter(handles)), verified_at=self.now.isoformat())
        if status != 'deferred':
            self.store.save(record)
        self.results[identifier] = record
        return record

    def mapping(self, candidate):
        row = self.resolve(candidate)
        return {candidate['destination_id']: row} if row.get('verified') else {}

    def summary(self):
        return dict(Counter(row['status'] for row in self.results.values()))


def select(pool, source, verifier):
    from .core import handle, render
    for candidate in pool[:100]:
        mapping = verifier.mapping(candidate)
        if not handle(candidate, mapping) or not source.asset_available(candidate['photo_id']):
            continue
        try:
            image = render(source.photo_bytes(candidate['photo_id']), candidate)
        except ValueError:
            continue
        return candidate, image, mapping
    return None, None, {}
