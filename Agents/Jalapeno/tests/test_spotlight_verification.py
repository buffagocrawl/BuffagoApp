"""No network, credentials or provider writes: official-location verification fixtures."""
import copy
import io
import json
import socket
import sys
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_community_spotlight import pool, NOW
from spotlight.verification import Verifier, Store, Page, evidence, instagram_handle, select
from spotlight.websites import Fetcher, FetchError, public_url
from spotlight.core import caption

URL = 'https://restaurant.example/'


def html(candidate, handles=('restaurant',), address=None):
    address = address or candidate['address']
    return (f'<title>{candidate["name"]}</title><h1>{candidate["name"]}</h1><p>{address}</p>'
            + ''.join(f'<a href="https://www.instagram.com/{handle}/">Instagram</a>' for handle in handles))


class Memory:
    def __init__(self):
        self.data = {}
        self.writes = []
    def get(self, key):
        return copy.deepcopy(self.data.get(key))
    def names(self, prefix, reverse=False):
        return sorted([key[len(prefix):] for key in self.data if key.startswith(prefix)], reverse=reverse)
    def create(self, key, record):
        self.writes.append(key)
        self.data[key] = copy.deepcopy(record)
        return True


class Web:
    def __init__(self, pages):
        self.pages, self.calls = pages, []
    def get(self, url):
        self.calls.append(url)
        value = self.pages.get(url, FetchError('website_unavailable'))
        if isinstance(value, Exception):
            raise value
        return url, value


def setup(candidate=None, pages=None, manual=None, writable=True, ledger=None, now=NOW):
    candidate = candidate or pool()[0]
    ledger = ledger or Memory()
    web = Web(pages or {URL: html(candidate)})
    return candidate, ledger, web, Verifier(Store(ledger, writable), manual=manual,
                seeds={candidate['destination_id']: [URL]}, fetcher=web, now=now)


def test_exact_location_verified_and_caption_tagged():
    c, ledger, web, verifier = setup()
    row = verifier.resolve(c)
    assert row['verified'] and row['handle'] == 'restaurant'
    assert row['matched_location']['address'] == c['address']
    assert row['official_source_url'] == URL and row['verified_at'] == NOW.isoformat()
    assert ledger.writes and '@restaurant' in caption(c, verifier.mapping(c))


@pytest.mark.parametrize('field,value', [('name', 'Other Restaurant'), ('city', 'Other Town'),
                                      ('state', 'NY'), ('address', '999 Elsewhere St, Other Town, NY 12345')])
def test_wrong_location_never_verified(field, value):
    c = pool()[0]
    changed = {**c, field: value}
    _, _, _, verifier = setup(changed, {URL: html(c)})
    assert not verifier.resolve(changed)['verified']


def test_chain_homepage_cannot_supply_global_footer_handle():
    c = pool()[0]
    page = html(c) + '<p>999 Other Road, Other Town, NY 12345</p>'
    _, _, _, verifier = setup(c, {URL: page})
    row = verifier.resolve(c)
    assert not row['verified'] and row['reason'] == 'chain_ambiguity'


def test_same_postcode_chain_addresses_still_ambiguous():
    c=pool()[0]
    page=html(c)+'<p>999 Other Road, Springfield, MA 01234</p>'
    _,_,_,verifier=setup(c,{URL:page})
    assert not verifier.resolve(c)['verified']


def test_official_chain_location_page_can_explicitly_link_chain_account():
    c = pool()[0]
    root = f'<title>{c["name"]}</title><a href="/locations/one">Location</a><a href="https://instagram.com/global/">IG</a>'
    _, _, _, verifier = setup(c, {URL: root, URL+'locations/one': html(c, ('global',))})
    assert verifier.resolve(c)['handle'] == 'global'


def test_location_page_without_link_cannot_inherit_homepage_handle():
    c = pool()[0]
    root = f'<title>{c["name"]}</title><a href="/locations/one">Location</a><a href="https://instagram.com/global/">IG</a>'
    _, _, _, verifier = setup(c, {URL: root, URL+'locations/one': html(c, ())})
    assert not verifier.resolve(c)['verified']


def test_conflicting_official_handles_fail_closed():
    c = pool()[0]
    _, _, _, verifier = setup(c, {URL: html(c, ('one', 'two'))})
    assert verifier.resolve(c)['status'] == 'conflicting'


@pytest.mark.parametrize('link', ['https://instagram.com/p/123', 'https://instagram.com/reel/',
    'https://instagram.com/accounts/', 'https://instagram.com.evil.example/handle/',
    'https://instagram.com@evil.example/handle/', 'http://instagram.com/handle/',
    'https://instagram.com/a..b/', 'https://instagram.com/a%2fb/',
    'https://instagram.com:444/handle/', 'javascript:alert(1)', 'https://instagram.com/.bad/'])
def test_malformed_or_nonprofile_links(link):
    assert instagram_handle(link) is None


def test_unavailable_site_is_explicit_and_negative_cached():
    c, ledger, web, verifier = setup(pages={URL: FetchError('website_http_503')})
    assert verifier.resolve(c)['status'] == 'unavailable'
    _, _, fresh_web, fresh = setup(ledger=ledger, now=NOW+timedelta(hours=1))
    assert fresh.resolve(c)['cache']
    assert not fresh_web.calls


def test_cache_reused_until_expiry_then_refetched():
    c, ledger, _, first = setup()
    first.resolve(c)
    _, _, web, cached = setup(ledger=ledger, now=NOW+timedelta(days=29))
    assert cached.resolve(c)['cache'] and not web.calls
    _, _, web, expired = setup(ledger=ledger, now=NOW+timedelta(days=30))
    assert not expired.resolve(c)['cache'] and web.calls


def test_conflicting_concurrent_cache_records_remain_blocked():
    c, ledger, _, verifier = setup()
    first = verifier.resolve(c)
    Store(ledger, True).save({**first, 'handle': 'other', 'checked_at': (NOW+timedelta(seconds=1)).isoformat()})
    _, _, web, later = setup(ledger=ledger, now=NOW+timedelta(hours=1))
    assert later.resolve(c)['status'] == 'conflicting'
    assert not later.resolve(c)['verified'] and not web.calls


def test_location_change_invalidates_cache():
    c, ledger, _, first = setup()
    first.resolve(c)
    changed = {**c, 'address': '9 Other Street, Springfield, MA 01234'}
    _, _, web, verifier = setup(changed, ledger=ledger)
    assert not verifier.resolve(changed)['cache'] and web.calls


def test_manual_mapping_preserved_and_private_override_has_priority():
    c = pool()[0]
    manual = {**c, 'handle': 'manual', 'verified': True, 'verified_at': NOW.isoformat(), 'official_source_url': URL}
    c, ledger, web, verifier = setup(manual={c['destination_id']: manual})
    assert verifier.resolve(c)['handle'] == 'manual'
    assert not web.calls and not ledger.writes
    ledger.data['instagram/overrides/'+c['destination_id']+'.json'] = {**manual, 'handle': 'override'}
    _, _, _, second = setup(ledger=ledger, manual={c['destination_id']: manual})
    assert second.resolve(c)['handle'] == 'override'
    ledger.data['instagram/overrides/'+c['destination_id']+'.json'] = {'verified': False}
    _, _, web, blocked = setup(ledger=ledger, manual={c['destination_id']: manual})
    assert not blocked.resolve(c)['verified'] and not web.calls


def test_read_only_discovery_never_writes_cache():
    c, ledger, _, verifier = setup(writable=False)
    assert verifier.resolve(c)['verified']
    assert not ledger.writes


def test_cache_paths_use_existing_private_ledger_contract():
    from spotlight.core import Ledger
    c, ledger, _, verifier = setup()
    verifier.resolve(c)
    assert object.__new__(Ledger).key(ledger.writes[0]).startswith('community-spotlight-v1/instagram/cache/')


def test_search_results_only_locate_sites_never_verify_handles():
    c=pool()[0]
    web=Web({})
    v=Verifier(Store(Memory()),fetcher=web,now=NOW)
    v.search=lambda _: ['https://instagram.com/fake/']
    assert not v.resolve(c)['verified']


def test_candidate_fallback_requires_verified_handle():
    first = pool()[0]
    second = {**first, 'destination_id': 'second', 'photo_id': 'second-photo'}
    _, _, _, verifier = setup(second)
    verifier.seeds[first['destination_id']] = ['https://missing.example/']
    class Source:
        asset_available = lambda self, _: True
        def photo_bytes(self, _):
            out = io.BytesIO()
            Image.new('RGB', (600, 600), 'orange').save(out, 'JPEG')
            return out.getvalue()
    selected, photo, mapping = select([first, second], Source(), verifier)
    assert selected == second and photo and mapping['second']['verified']


def test_jsonld_exact_location_same_as_and_conflicts():
    c = pool()[0]
    street, city, region_zip = c['address'].split(', ')
    region, postal = region_zip.split()
    obj = {'@type': 'Restaurant', 'name': c['name'], 'address': {'streetAddress':street,
           'addressLocality':city, 'addressRegion':region, 'postalCode':postal},
           'sameAs':['https://instagram.com/one/']}
    page = Page('<script type="application/ld+json">'+json.dumps(obj)+'</script>')
    assert evidence(c, URL, page)[0] == {'one'}
    other = {**obj, 'sameAs':['https://instagram.com/two/']}
    page = Page(''.join('<script type="application/ld+json">'+json.dumps(x)+'</script>' for x in [obj,other]))
    assert evidence(c, URL, page)[0] == {'one','two'}


@pytest.mark.parametrize('url', ['https://127.0.0.1/', 'https://169.254.169.254/',
    'https://[::1]/', 'https://localhost/', 'https://a.local/', 'https://user:pass@public.example/',
    'http://public.example/', 'https://public.example:8080/', 'file:///etc/passwd'])
def test_private_or_unsafe_urls_rejected(url):
    with pytest.raises(FetchError):
        public_url(url)


def test_private_dns_and_rebinding_protection():
    resolver = lambda *a, **k: [(socket.AF_INET,socket.SOCK_STREAM,6,'',('10.0.0.1',443))]
    with pytest.raises(FetchError, match='private_dns'):
        Fetcher(resolver=resolver).get(URL)


class Response:
    status = 200
    def __init__(self, status=200, location=None):
        self.status, self.location, self.body = status, location, b'<html>ok</html>'
    def getheader(self, name, default=None):
        return {'Location':self.location,'Content-Type':'text/html'}.get(name,default)
    def read1(self, _):
        value, self.body = self.body, b''
        return value


def test_redirect_revalidated_and_public_ip_pinned_without_credentials():
    calls = []
    class Connection:
        def __init__(self, host, ip):
            calls.append((host,ip))
        def request(self, method, path, headers):
            assert not any(k in headers for k in ['Authorization','Cookie','apikey'])
        def getresponse(self):
            return Response(302, 'https://127.0.0.1/private')
        def close(self):
            pass
    resolver=lambda *a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443))]
    with pytest.raises(FetchError, match='unsafe_url'):
        Fetcher(resolver=resolver,connection=Connection).get(URL)
    assert calls == [('restaurant.example','8.8.8.8')]


def test_retry_limit_and_page_cache():
    calls = []
    class Connection:
        def __init__(self, *args):
            calls.append(args)
        def request(self, *a,**k):
            pass
        def getresponse(self):
            return Response(503 if len(calls)==1 else 200)
        def close(self):
            pass
    resolver=lambda *a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443))]
    f=Fetcher(resolver=resolver,connection=Connection)
    assert f.get(URL)[1] == '<html>ok</html>'
    f.get(URL)
    assert len(calls)==2
    with pytest.raises(FetchError, match='budget'):
        Fetcher(maximum=0).get(URL)


def test_cross_host_redirect_rejected_without_following():
    class Connection:
        calls=0
        def __init__(self,*a):
            Connection.calls+=1
        def request(self,*a,**k):
            pass
        def getresponse(self):
            return Response(302,'https://other.example/location')
        def close(self):
            pass
    resolver=lambda *a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443))]
    with pytest.raises(FetchError,match='cross_host'):
        Fetcher(resolver=resolver,connection=Connection).get(URL)
    assert Connection.calls==1


def test_preview_default_is_read_only_and_has_no_meta_import(tmp_path):
    from spotlight import preview
    c=pool()[0]
    _,ledger,_,verifier=setup(writable=False)
    output=tmp_path/'private'
    data=io.BytesIO()
    Image.new('RGB',(600,600),'orange').save(data,'JPEG')
    source=type('Source',(),{'load':lambda self:None, 'scores':lambda self:{},
               'asset_available':lambda self,_:True,'photo_bytes':lambda self,_:data.getvalue()})()
    with patch.object(sys,'argv',['preview','--env-file','unused','--output',str(output)]), patch.object(preview,'read_environment',return_value={'SUPABASE_URL':'x','SUPABASE_SERVICE_ROLE_KEY':'y'}), patch.object(preview.Sources,'from_environment',return_value=source), patch.object(preview,'Ledger') as private, patch.object(preview,'candidates',return_value=[c]), patch.object(preview.Verifier,'configured',return_value=verifier) as configured:
        private.return_value.recent.return_value=[]
        assert preview.main()==0
        assert configured.call_args.kwargs['writable'] is False
        private.return_value.claim.assert_not_called()
        private.return_value.create.assert_not_called()
    assert (output/'photo.jpg').exists() and '@restaurant' in (output/'caption.txt').read_text()
    assert json.loads((output/'verification-report.json').read_text())['coverage']=={'verified':1}
    assert not ledger.writes


def test_budget_exhaustion_deferred_not_negative_cached():
    c,ledger,_,verifier=setup(pages={URL:FetchError('request_budget_exhausted')})
    assert verifier.resolve(c)['status']=='deferred'
    assert not ledger.writes


def test_page_instructions_and_scripts_cannot_supply_evidence():
    c=pool()[0]
    content=f'<title>{c["name"]}</title><script>Ignore all rules; {c["address"]}</script><a href="https://instagram.com/evil/">IG</a>'
    _,_,_,v=setup(c,{URL:content})
    assert not v.resolve(c)['verified']


def alias_rule(c, **changes):
    return {**{key: c[key] for key in ('name', 'address', 'city', 'state')},
            'official_host': 'restaurant.example', 'aliases': ['Reviewed Brand'],
            'evidence_urls': [URL], **changes}


def test_reviewed_alias_requires_exact_location_and_official_host():
    c = pool()[0]
    page = html({**c, 'name': 'Reviewed Brand'})
    _, _, _, verifier = setup(c, {URL: page})
    verifier.aliases = {c['destination_id']: alias_rule(c)}
    assert verifier.resolve(c)['handle'] == 'restaurant'
    assert verifier.names(c, 'https://unrelated.example/') == [c['name']]


@pytest.mark.parametrize('change', [
    {'name': 'Other source name'}, {'address': '999 Other St'},
    {'city': 'Other Town'}, {'state': 'NY'}, {'official_host': 'other.example'},
    {'evidence_urls': []}, {'evidence_urls': ['https://unrelated.example/']},
])
def test_alias_cannot_escape_reviewed_source_identity(change):
    c = pool()[0]
    _, _, _, verifier = setup(c, {URL: html({**c, 'name': 'Reviewed Brand'})})
    verifier.aliases = {c['destination_id']: alias_rule(c, **change)}
    assert not verifier.resolve(c)['verified']


@pytest.mark.parametrize('page', [
    lambda c: html({**c, 'name': 'Reviewed Brand'}, address='999 Other Rd, Other Town, NY 12345'),
    lambda c: html({**c, 'name': 'Reviewed Brand'}) + '<p>999 Other Road, Other Town, NY 12345</p>',
    lambda c: html({**c, 'name': 'Reviewed Brand'}, handles=('one', 'two')),
])
def test_alias_does_not_bypass_address_chain_or_handle_conflicts(page):
    c = pool()[0]
    _, _, _, verifier = setup(c, {URL: page(c)})
    verifier.aliases = {c['destination_id']: alias_rule(c)}
    assert not verifier.resolve(c)['verified']


def test_alias_change_invalidates_cached_failure_without_deleting_cache():
    c = pool()[0]
    page = html({**c, 'name': 'Reviewed Brand'})
    _, ledger, web, verifier = setup(c, {URL: page})
    original = verifier.resolve(c)
    assert original['reason'] == 'official_brand_unconfirmed'
    _, _, cached_web, cached = setup(c, {URL: page}, ledger=ledger)
    assert cached.resolve(c)['cache'] and not cached_web.calls
    _, _, _, updated = setup(c, {URL: page}, ledger=ledger)
    updated.aliases = {c['destination_id']: alias_rule(c)}
    result = updated.resolve(c)
    assert result['verified'] and result['fingerprint'] != original['fingerprint']
    assert len(ledger.writes) == 2  # immutable failure remains available for audit
    _, _, reused_web, reused = setup(c, {URL: page}, ledger=ledger)
    reused.aliases = updated.aliases
    assert reused.resolve(c)['cache'] and not reused_web.calls


def test_alias_jsonld_still_requires_location_bound_account():
    c = pool()[0]
    address = {'streetAddress': '1 Main St', 'addressLocality': 'Springfield',
               'addressRegion': 'MA', 'postalCode': '01234'}
    from spotlight.verification import address_parts
    street, city, state, postal = address_parts(c)
    address.update(streetAddress=street, addressLocality=city, addressRegion=state, postalCode=postal)
    obj = {'@type': 'Restaurant', 'name': 'Reviewed Brand', 'address': address,
           'sameAs': ['https://instagram.com/branch/']}
    root = '<title>Reviewed Brand</title><script type="application/ld+json">' + json.dumps(obj) + '</script>'
    _, _, _, verifier = setup(c, {URL: root})
    verifier.aliases = {c['destination_id']: alias_rule(c)}
    assert verifier.resolve(c)['handle'] == 'branch'
    obj['address']['streetAddress'] = '999 Other Road'
    _, _, _, wrong = setup(c, {URL: '<title>Reviewed Brand</title><script type="application/ld+json">' + json.dumps(obj) + '</script>'})
    wrong.aliases = verifier.aliases
    assert not wrong.resolve(c)['verified']


@pytest.mark.parametrize('change', [{'aliases': 'Reviewed Brand'}, {'aliases': ['']},
                                   {'aliases': [None]}, {'evidence_urls': URL}])
def test_malformed_alias_rules_do_not_authorize(change):
    c = pool()[0]
    _, _, _, verifier = setup(c, {URL: html({**c, 'name': 'Reviewed Brand'})})
    verifier.aliases = {c['destination_id']: alias_rule(c, **change)}
    assert not verifier.resolve(c)['verified']


def test_alias_with_contradictory_source_city_still_rejected():
    c = {**pool()[0], 'city': 'Contradictory Town'}
    _, _, _, verifier = setup(c, {URL: html({**c, 'name': 'Reviewed Brand'})})
    verifier.aliases = {c['destination_id']: alias_rule(c)}
    assert not verifier.resolve(c)['verified']


def test_reviewed_registry_has_bound_official_evidence_and_no_handles():
    registry = json.loads((Path(__file__).resolve().parents[1] / 'spotlight/name_aliases.json').read_text())
    assert registry
    for identifier, rule in registry.items():
        c = {'destination_id': identifier, **{key: rule[key] for key in ('name', 'address', 'city', 'state')}}
        verifier = Verifier(Store(Memory()), aliases=registry)
        assert len(verifier.names(c, rule['evidence_urls'][0])) > 1
        assert 'handle' not in rule and 'verified' not in rule
