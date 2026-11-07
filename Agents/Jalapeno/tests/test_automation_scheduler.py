"""Clock, durable dispatch and spotlight authority contracts; no live providers."""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import automation_scheduler as scheduler
import spotlight_main

ET = ZoneInfo('America/New_York')


@pytest.mark.parametrize('start', ['2026-03-02', '2026-10-26', '2026-11-02'])
def test_full_weeks_across_dst(start):
    for day in range(14):
        date = datetime.fromisoformat(start) + timedelta(days=day)
        for hour, minute, mode in [(12, 0, 'publish'), (12, 20, 'publish'),
                                   (12, 40, 'publish'), (13, 5, 'health')]:
            local = date.replace(hour=hour, minute=minute, tzinfo=ET)
            expected = [(scheduler.SPOTLIGHT, mode)] if local.weekday() in {0, 2, 4, 5, 6} else []
            assert scheduler.due(local.astimezone(ZoneInfo('UTC')))[2] == expected


@pytest.mark.parametrize('clock', ['11:59', '12:01', '12:19', '12:21', '12:39',
                                  '12:41', '12:59', '13:00', '13:04', '13:06', '16:23'])
def test_no_catchup_or_extra_window_slots(clock):
    assert scheduler.due(datetime.fromisoformat('2026-11-06T' + clock).replace(tzinfo=ET))[2] == []


class Accepted:
    status = 204
    def __enter__(self): return self
    def __exit__(self, *args): pass


@pytest.mark.parametrize('outcome', ['accepted', 'lost', 'http'])
def test_repeated_invocations_bounded_recovery_and_uncertain_outcomes(tmp_path, outcome):
    calls = []
    def send(request):
        calls.append(request)
        if outcome == 'lost': raise TimeoutError('secret-response')
        if outcome == 'http': raise HTTPError(request.full_url, 403, 'secret-response', {}, None)
        return Accepted()
    expected = {'accepted': 'dispatched', 'lost': 'dispatch_outcome_unknown', 'http': 'dispatch_http_403'}[outcome]
    for minute in (0, 20, 40):
        now = datetime(2026, 11, 6, 12, minute, tzinfo=ET)
        result = scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=send)
        assert result[0]['status'] == expected
        assert result[0]['workflow'] == scheduler.SPOTLIGHT
        assert scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=send)[0]['status'] == 'attempt_already_recorded'
    assert len(calls) == 3
    assert json.loads(calls[0].data) == {'ref': 'main', 'inputs': {'mode': 'publish', 'publication_date': '2026-11-06'}}
    assert all(r.full_url.endswith('/community-spotlight.yml/dispatches') for r in calls)
    assert 'secret-response' not in ''.join(p.read_text() for p in tmp_path.iterdir())


def test_workflow_identity_and_legacy_upgrade(tmp_path):
    now = datetime(2026, 11, 6, 12, tzinfo=ET)
    legacy = tmp_path / '2026-11-06-1200-publish.json'
    legacy.write_text('{}')
    with patch.object(scheduler, 'due', return_value=('2026-11-06', '12:00', [
            (scheduler.SPOTLIGHT, 'publish'), (scheduler.PUBLISH, 'publish')])):
        results = scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=lambda r: Accepted())
        assert [r['status'] for r in results] == ['dispatched', 'attempt_already_recorded']
        legacy.unlink()
        results = scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=lambda r: Accepted())
        assert [r['status'] for r in results] == ['attempt_already_recorded', 'dispatched']
    records = [json.loads(p.read_text()) for p in tmp_path.iterdir()]
    assert {r['workflow'] for r in records} == {scheduler.SPOTLIGHT, scheduler.PUBLISH}


def test_intent_survives_process_interruption(tmp_path):
    now = datetime(2026, 11, 6, 12, tzinfo=ET)
    def interrupt(request): raise KeyboardInterrupt()
    with pytest.raises(KeyboardInterrupt):
        scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=interrupt)
    record = json.loads(next(tmp_path.iterdir()).read_text())
    assert record['status'] == 'dispatch_intent' and record['workflow'] == scheduler.SPOTLIGHT
    assert scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=interrupt)[0]['status'] == 'attempt_already_recorded'


def test_health_and_dry_run_do_not_publish_or_claim(tmp_path):
    now = datetime(2026, 11, 6, 13, 5, tzinfo=ET)
    calls = []
    def send(request):
        calls.append(json.loads(request.data))
        return Accepted()
    scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=send, dry_run=True)
    assert not list(tmp_path.iterdir()) and not calls
    scheduler.dispatch(now, 'github_pat_synthetic', tmp_path, send=send)
    assert calls == [{'ref': 'main', 'inputs': {'mode': 'health', 'publication_date': '2026-11-06'}}]


def test_evening_slots_remain_daily_and_exact():
    expected = {'19:30': [(scheduler.PUBLISH, 'publish')],
                '19:50': [(scheduler.PUBLISH, 'publish')],
                '20:10': [(scheduler.PUBLISH, 'publish')],
                '20:30': [(scheduler.PUBLISH, 'publish'), (scheduler.METRICS, 'collect')],
                '20:50': [(scheduler.PUBLISH, 'publish')],
                '21:10': [(scheduler.METRICS, 'collect')],
                '21:15': [(scheduler.PUBLISH, 'health')],
                '21:45': [(scheduler.PUBLISH, 'health')]}
    for day in range(2, 9):
        for clock, tasks in expected.items():
            now = datetime.fromisoformat(f'2026-11-{day:02}T{clock}').replace(tzinfo=ET)
            assert scheduler.due(now)[2] == tasks


def test_workflow_propagates_authority_and_dated_dispatch():
    root = Path(__file__).resolve().parents[3]
    workflow = yaml.safe_load((root / '.github/workflows/community-spotlight.yml').read_text())
    inputs = workflow[True]['workflow_dispatch']['inputs']
    assert inputs['publication_date']['default'] == ''
    assert inputs['mode']['options'] == ['plan', 'health', 'publish']
    env = workflow['jobs']['spotlight']['env']
    assert env['PUBLICATION_DATE'] == '${{ inputs.publication_date }}'
    assert env['COMMUNITY_SPOTLIGHT_SCHEDULER'] == "${{ vars.COMMUNITY_SPOTLIGHT_SCHEDULER || 'github' }}"
    assert env['COMMUNITY_SPOTLIGHT_ENABLED'] == "${{ vars.COMMUNITY_SPOTLIGHT_ENABLED || 'false' }}"
    timer = (root / 'Agents/Jalapeno/systemd/buffago-jalapeno-scheduler.timer').read_text()
    assert 'Persistent=false' in timer
    assert 'Mon,Wed,Fri,Sat,Sun *-*-* 12:00,20,40:00 America/New_York' in timer
    assert 'Mon,Wed,Fri,Sat,Sun *-*-* 13:05:00 America/New_York' in timer


@pytest.mark.parametrize('authority,event,date,status', [
    ('pi', 'schedule', '', 'inactive_github_scheduler'),
    ('github', 'workflow_dispatch', '2026-11-06', 'inactive_pi_scheduler'),
    ('pi', 'workflow_dispatch', '2026-11-04', 'original_run_date_elapsed'),
    ('invalid', 'schedule', '', 'invalid_scheduler'),
])
def test_publish_authority_stops_before_any_data_access(authority, event, date, status):
    env = {'COMMUNITY_SPOTLIGHT_ENABLED': 'true', 'COMMUNITY_SPOTLIGHT_SCHEDULER': authority,
           'GITHUB_EVENT_NAME': event, 'PUBLICATION_DATE': date}
    with patch.object(spotlight_main, 'Ledger', side_effect=AssertionError('must not access data')):
        assert spotlight_main.run('publish', env, datetime(2026, 11, 6, 12, tzinfo=ET))['status'] == status


@pytest.mark.parametrize('mode,event,date', [('publish', 'workflow_dispatch', ''),
    ('publish', 'workflow_dispatch', '2026-11-06'), ('health', 'schedule', ''), ('plan', 'workflow_dispatch', '')])
def test_pi_allows_manual_dated_publish_and_read_only_modes(mode, event, date):
    env = {'COMMUNITY_SPOTLIGHT_ENABLED': 'true', 'COMMUNITY_SPOTLIGHT_SCHEDULER': 'pi',
           'GITHUB_EVENT_NAME': event, 'PUBLICATION_DATE': date,
           'SUPABASE_URL': 'synthetic', 'SUPABASE_SERVICE_ROLE_KEY': 'synthetic'}
    with patch.object(spotlight_main, 'Ledger', side_effect=RuntimeError('gate_passed')):
        with pytest.raises(RuntimeError, match='gate_passed'):
            spotlight_main.run(mode, env, datetime(2026, 11, 6, 12, tzinfo=ET))
