import copy
import io
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_guess_wing_spot import snapshot, uid
from spotlight.core import (window, score, candidates, caption, handle, render,
                            PhotoPublisher, Ledger, Sources)
from guess_wing_spot.durable import PrivateLedger
from guess_wing_spot.meta_reels import MetaError
from guess_wing_spot.sources import TABLES
import spotlight_main

NOW = datetime(2026, 11, 4, 17, tzinfo=timezone.utc)


def pool(data=None, history=(), now=NOW, average=90):
    data = data or snapshot(1)
    return candidates(data, {uid(101): {'average': average, 'count': 2}}, history, now)


@pytest.mark.parametrize('instant,expected', [
    ('2026-11-04T17:00:00+00:00', True),
    ('2026-11-04T17:59:59+00:00', True),
    ('2026-11-04T18:00:00+00:00', False),
    ('2026-11-04T16:59:59+00:00', False),
    ('2026-11-03T17:00:00+00:00', False),
    ('2026-11-05T17:00:00+00:00', False),
    ('2026-11-06T17:00:00+00:00', True),
    ('2026-11-07T17:00:00+00:00', True),
    ('2026-11-08T17:00:00+00:00', True),
    ('2026-07-01T16:00:00+00:00', True),
    ('2026-07-01T17:00:00+00:00', False),
    ('2026-03-08T16:00:00+00:00', True),
    ('2026-11-01T17:00:00+00:00', True),
])
def test_eastern_window_and_dst(instant, expected):
    assert window(datetime.fromisoformat(instant)) == expected


@pytest.mark.parametrize('average,allowed', [(80, False), (80.001, True), (100, True), (0, False)])
def test_strict_unrounded_restaurant_threshold(average, allowed):
    assert bool(pool(average=average)) == allowed


def test_rating_average_not_photo_likes():
    assert score([{'destination_id': 'd', 'weight_score': 80},
                  {'destination_id': 'd', 'weight_score': 100}]) == {'d': {'average': 90, 'count': 2}}
    assert not score([{'destination_id': 'd', 'weight_score': 'NaN'}])
    assert not score([{'destination_id': 'd', 'weight_score': 101}])


@pytest.mark.parametrize('days,blocked', [(29, True), (30, False), (31, False)])
@pytest.mark.parametrize('same', ['photo_id', 'destination_id'])
def test_independent_photo_and_restaurant_cooldown(days, blocked, same):
    entry = {'photo_id': uid(999), 'destination_id': uid(998),
             'published_at': (NOW-timedelta(days=days)).isoformat()}
    entry[same] = uid(1 if same == 'photo_id' else 101)
    assert bool(pool(history=[entry])) != blocked


def test_unresolved_provider_attempt_stays_reserved():
    assert not pool(history=[{'photo_id': uid(1), 'destination_id': uid(101), 'status': 'uncertain'}])


@pytest.mark.parametrize('field,value', [('withdrawn_at', NOW.isoformat()), ('consented_at', None),
                                       ('moderation_status', 'rejected'), ('owner_deleted_at', NOW.isoformat())])
def test_source_safety(field, value):
    data = snapshot(1)
    data.photos[0][field] = value
    assert not pool(data)


def test_tag_requires_location_bound_verification():
    candidate = pool()[0]
    record = {'handle': 'restaurant', 'verified': True, 'verified_at': '2026-11-04',
              'official_source_url': 'https://restaurant.example/contact',
              'name': candidate['name'], 'city': candidate['city'],
              'state': candidate['state'], 'address': candidate['address']}
    assert handle(candidate, {uid(101): record}) == '@restaurant'
    for field in record:
        changed = dict(record)
        changed.pop(field)
        assert handle(candidate, {uid(101): changed}) is None
    assert '@' not in caption(candidate, {})
    assert '90.00/100 from 2 ratings' in caption(candidate, {})


def test_render_preserves_photo_and_removes_metadata():
    output = io.BytesIO()
    Image.new('RGB', (700, 600), 'orange').save(output, 'JPEG')
    image = Image.open(io.BytesIO(render(output.getvalue(), pool()[0])))
    assert image.size == (1080, 1350)
    assert not image.getexif()


class Graph:
    def __init__(self, fail=None, status='FINISHED'):
        self.calls, self.fail, self.status = [], fail, status

    def call(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if method == 'GET':
            return {'status_code': self.status}
        if self.fail == path:
            raise MetaError('timeout', uncertain=True)
        return {'id': '222' if path.endswith('/media') else '333'}


def publish(graph, state, persist=lambda: None, validate=lambda: None, window_ok=lambda: True):
    PhotoPublisher(graph, '111', 'private-token').publish(state, persist, lambda: 'https://signed.invalid', validate, window_ok)


@pytest.mark.parametrize('failure', ['111/media', '111/media_publish'])
def test_unknown_post_never_repeated(failure):
    graph, state = Graph(fail=failure), {'caption': 'test'}
    saved = []
    with pytest.raises(MetaError):
        publish(graph, state, lambda: saved.append(copy.deepcopy(state)))
    assert saved[-1]['pending']
    first = len([c for c in graph.calls if c[0] == 'POST'])
    publish(graph, state)
    assert len([c for c in graph.calls if c[0] == 'POST']) == first


def test_reconcile_published_container():
    graph = Graph(status='PUBLISHED')
    state = {'caption': 'test', 'container_id': '222', 'pending': 'publish'}
    publish(graph, state)
    assert state['status'] == 'published' and state['published_at']
    assert all(c[0] == 'GET' for c in graph.calls)


def test_intent_must_persist_before_post():
    graph = Graph()
    def fail():
        raise RuntimeError('storage down')
    with pytest.raises(RuntimeError):
        publish(graph, {'caption': 'test'}, fail)
    assert not graph.calls


def test_publication_revalidates_and_obeys_window():
    graph, state = Graph(), {'caption': 'test'}
    validations = []
    with pytest.raises(MetaError):
        publish(graph, state, validate=lambda: validations.append(True), window_ok=lambda: False)
    assert validations
    assert not any(c[1].endswith('media_publish') for c in graph.calls)


def test_completed_post_is_idempotent():
    graph, state = Graph(), {'caption': 'test'}
    publish(graph, state)
    assert state['status'] == 'published' and state['publication_id'] == '333'
    calls = len(graph.calls)
    publish(graph, state)
    assert len(graph.calls) == calls


def test_no_source_writes_or_evening_namespace_changes():
    assert Sources.tables['destination_ratings'][1] == 'id,destination_id,weight_score'
    assert 'destination_ratings' not in TABLES
    assert Ledger.PREFIX != PrivateLedger.PREFIX
    assert not hasattr(Sources, 'update')


def test_disabled_publish_never_instantiates_clients():
    with patch.object(spotlight_main, 'Ledger', side_effect=AssertionError('unexpected network')):
        assert spotlight_main.run('publish', {}, NOW)['status'] == 'disabled'


def test_read_only_plan_does_not_construct_provider_or_claim():
    with patch.object(spotlight_main, 'Ledger') as ledger, patch.object(spotlight_main, 'Sources') as source, patch.object(spotlight_main, 'Graph', side_effect=AssertionError('provider')):
        source.from_environment.return_value.load.return_value = snapshot(1)
        source.from_environment.return_value.scores.return_value = {uid(101): {'average': 90, 'count': 2}}
        ledger.return_value.recent.return_value = []
        assert spotlight_main.run('plan', {'SUPABASE_URL': 'x', 'SUPABASE_SERVICE_ROLE_KEY': 'y'}, NOW)['eligible_count'] == 1
        ledger.return_value.claim.assert_not_called()
        ledger.return_value.save.assert_not_called()


def test_workflows_parse_and_disabled_default():
    import yaml
    root = Path(__file__).resolve().parents[3]
    workflow = yaml.safe_load((root/'.github/workflows/community-spotlight.yml').read_text())
    assert workflow['concurrency']['group'] != 'guess-wing-spot-daily'
    assert "|| 'false'" in workflow['jobs']['spotlight']['env']['COMMUNITY_SPOTLIGHT_ENABLED']


def test_full_runtime_prepares_revalidates_and_publishes():
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz or timezone.utc)
    env = {'SUPABASE_URL': 'https://test.invalid', 'SUPABASE_SERVICE_ROLE_KEY': 'private',
           'COMMUNITY_SPOTLIGHT_ENABLED': 'true', 'GITHUB_RUN_ID': '123',
           'GUESS_EXPECTED_INSTAGRAM_USERNAME': 'buffago', 'GUESS_EXPECTED_FACEBOOK_NAME': 'BuffaGo',
           'META_LONG_LIVED_ACCESS_TOKEN': 'private', 'META_GRAPH_API_VERSION': 'v24.0',
           'META_APP_SECRET': 'private', 'INSTAGRAM_BUSINESS_ACCOUNT_ID': '111', 'FACEBOOK_PAGE_ID': '444'}
    graph = Graph()
    graph.validate = lambda *args: ({}, 'private')
    source = type('Source', (), {})()
    source.load = lambda: snapshot(1)
    source.scores = lambda: {uid(101): {'average': 90, 'count': 2}}
    source.asset_available = lambda _: True
    image = io.BytesIO()
    Image.new('RGB', (700, 600), 'orange').save(image, 'JPEG')
    source.photo_bytes = lambda _: image.getvalue()
    revisions = []
    with patch.object(spotlight_main, 'Ledger') as ledger, patch.object(spotlight_main, 'Sources') as sources, patch.object(spotlight_main, 'Graph', return_value=graph), patch.object(spotlight_main, 'actions_identity', return_value=('123.1', lambda _: True)), patch.object(spotlight_main, 'bind_run_date', return_value=True), patch.object(spotlight_main, 'datetime', Clock):
        ledger.return_value.latest.return_value = None
        ledger.return_value.recent.return_value = []
        ledger.return_value.save.side_effect = lambda date, state: revisions.append(copy.deepcopy(state))
        ledger.return_value.image_url.return_value = 'https://signed.invalid/image'
        sources.from_environment.return_value = source
        result = spotlight_main.run('publish', env, NOW)
    assert result['status'] == 'published'
    assert revisions[0]['average'] == 90 and revisions[0]['destination_id'] == uid(101)
    assert revisions[-2]['pending'] == 'publish'
    assert revisions[-1]['publication_id'] == '333'
    assert [c[1] for c in graph.calls if c[0] == 'POST'] == ['111/media', '111/media_publish']


def test_branch_publish_rejected_before_any_github_request():
    with patch.object(spotlight_main.requests, 'get', side_effect=AssertionError('unexpected network')):
        with pytest.raises(Exception, match='expected_main_actions_workflow_required'):
            spotlight_main.actions_identity({'GITHUB_REF': 'refs/heads/feature'}, NOW)


def test_private_history_retains_old_unresolved_dates():
    class Memory(Ledger):
        def names(self, prefix):
            return ['2026-01-01', '2026-11-04']
        def latest(self, date):
            return {'photo_id': date, 'destination_id': date, 'status': 'uncertain'}
    memory = object.__new__(Memory)
    assert len(memory.recent(NOW)) == 2


def test_physical_location_duplicate_ids_and_address_aliases():
    first = pool()[0]
    data = snapshot(1)
    destination = data.destinations.pop(uid(101))
    destination['id'] = uid(999)
    destination['address'] = destination['address'].replace('Street', 'St.')
    data.destinations[uid(999)] = destination
    data.photos[0]['destination_id'] = uid(999)
    data.photos[0]['id'] = uid(998)
    data.photos[0]['processed_storage_path'] = f'processed/{uid(998)}/primary'
    data.votes[uid(998)] = data.votes[uid(1)]
    history = [{**first, 'published_at': (NOW-timedelta(days=29)).isoformat()}]
    assert not candidates(data, {uid(999): {'average': 90, 'count': 2}}, history, NOW)


@pytest.mark.parametrize('delta,allowed', [(timedelta(days=30)-timedelta(microseconds=1), False),
                                         (timedelta(days=30), True)])
def test_elapsed_boundary_crosses_dst(delta, allowed):
    entry = {**pool()[0], 'published_at': (NOW-delta).isoformat()}
    assert bool(pool(history=[entry])) == allowed


def test_unknown_consent_version_fails_closed():
    data = snapshot(1)
    data.photos[0]['consent_version'] = 'unknown-contract'
    assert not pool(data)


def test_score_null_matches_wingdex_row_count_and_zero_coalesce():
    assert score([{'destination_id': 'd', 'weight_score': 100},
                  {'destination_id': 'd', 'weight_score': None}])['d'] == {'average': 50, 'count': 2}


def test_concurrent_series_claim_and_bounded_claim_recovery():
    from test_guess_wing_spot_publish import MemoryLedger
    from guess_wing_spot.durable import Busy
    from concurrent.futures import ThreadPoolExecutor
    class Memory(Ledger, MemoryLedger):
        pass
    ledger = Memory()
    def claim(owner):
        try:
            ledger.claim('2026-11-04', 'run', owner, lambda _: False)
            return True
        except Busy:
            return False
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sum(executor.map(claim, ['1.1', '2.1'])) == 1
    for attempt in range(2, 13):
        ledger.claim('2026-11-04', 'run', f'{attempt+2}.1', lambda _: True)
    with pytest.raises(Busy, match='retry_limit'):
        ledger.claim('2026-11-04', 'run', '99.1', lambda _: True)


def test_processing_retry_reuses_container():
    graph, state = Graph(status='IN_PROGRESS'), {'caption': 'test'}
    publish(graph, state)
    graph.status = 'FINISHED'
    publish(graph, state)
    assert [c[1] for c in graph.calls if c[0] == 'POST'] == ['111/media', '111/media_publish']


def test_missing_history_fails_closed():
    from guess_wing_spot.durable import DurableError
    with patch.object(Ledger, 'names', return_value=['2026-11-04']), patch.object(Ledger, 'latest', return_value=None):
        with pytest.raises(DurableError, match='history_state_missing'):
            object.__new__(Ledger).recent(NOW)


def test_health_reports_old_unresolved_without_provider_or_claims():
    env = {'SUPABASE_URL': 'https://test.invalid', 'SUPABASE_SERVICE_ROLE_KEY': 'private',
           'COMMUNITY_SPOTLIGHT_ENABLED': 'true'}
    with patch.object(spotlight_main, 'Ledger') as ledger, patch.object(spotlight_main, 'Graph', side_effect=AssertionError):
        ledger.return_value.latest.return_value = {'status': 'published'}
        ledger.return_value.recent.return_value = [{'status': 'uncertain'}]
        result = spotlight_main.run('health', env, NOW+timedelta(hours=1))
        assert result['unresolved_count'] == 1
        assert result['action'] == 'inspect_private_ledger_before_retry'
        ledger.return_value.claim.assert_not_called()
        ledger.return_value.save.assert_not_called()


def test_recovery_budget_stops_before_provider_validation():
    env = {'SUPABASE_URL': 'https://test.invalid', 'SUPABASE_SERVICE_ROLE_KEY': 'private',
           'COMMUNITY_SPOTLIGHT_ENABLED': 'true', 'GITHUB_RUN_ID': '123'}
    with patch.object(spotlight_main, 'Ledger') as ledger, patch.object(spotlight_main, 'actions_identity', return_value=('123.1', lambda _: True)), patch.object(spotlight_main, 'bind_run_date', return_value=True), patch.object(spotlight_main, 'Graph', side_effect=AssertionError):
        ledger.return_value.latest.return_value = {'status': 'container_created', 'attempts': 3}
        assert spotlight_main.run('publish', env, NOW)['status'] == 'recovery_exhausted'
