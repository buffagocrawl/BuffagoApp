"""Noon photo series entry point. Logs contain status/counts only."""
import argparse
import json
import os
import re
from datetime import datetime, timezone

import requests
from guess_wing_spot.actions_runtime import bind_run_date
from guess_wing_spot.durable import DurableError
from guess_wing_spot.meta_reels import Graph
from spotlight.core import (WORKFLOW, EASTERN, DAYS, Sources, Ledger, candidates,
                            caption, render, handle, PhotoPublisher, window)
from spotlight.verification import Verifier, select


def actions_identity(env, now):
    repo = env.get('GITHUB_REPOSITORY', '')
    owner = env.get('GITHUB_RUN_ID', '') + '.' + env.get('GITHUB_RUN_ATTEMPT', '')
    if (env.get('GITHUB_ACTIONS') != 'true' or env.get('GITHUB_REF') != 'refs/heads/main'
            or not re.fullmatch(r'[\w.-]+/[\w.-]+', repo) or not re.fullmatch(r'\d+\.\d+', owner)
            or env.get('GITHUB_WORKFLOW_REF') != repo + '/' + WORKFLOW + '@refs/heads/main'):
        raise DurableError('expected_main_actions_workflow_required')

    def read_run(identifier):
        response = requests.get(f'https://api.github.com/repos/{repo}/actions/runs/{identifier}',
                                headers={'Authorization': 'Bearer ' + env.get('GITHUB_TOKEN', '')},
                                timeout=30, allow_redirects=False)
        if response.status_code != 200:
            raise DurableError('actions_ownership_unverifiable')
        return response.json()

    run = read_run(env['GITHUB_RUN_ID'])
    created = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
    if (run.get('path') != WORKFLOW or run.get('head_branch') != 'main'
            or created.astimezone(EASTERN).date() != now.astimezone(EASTERN).date()
            or not window(created)):
        raise DurableError('original_run_outside_publication_slot')

    def previous_finished(prior):
        if not re.fullmatch(r'\d+\.\d+', prior):
            return False
        prior_run = read_run(prior.split('.')[0])
        return prior_run.get('status') == 'completed' and prior_run.get('path') == WORKFLOW
    return owner, previous_finished


def run(mode, env=os.environ, now=None):
    now = now or datetime.now(timezone.utc)
    date = now.astimezone(EASTERN).date().isoformat()
    enabled = env.get('COMMUNITY_SPOTLIGHT_ENABLED') == 'true'
    if mode == 'publish' and (not enabled or not window(now)):
        return {'status': 'disabled' if not enabled else 'outside_noon_window', 'date': date}
    ledger = Ledger(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
    ledger.check_private()
    if mode == 'health':
        state = ledger.latest(date)
        if not enabled:
            status = 'disabled'
        elif now.astimezone(EASTERN).weekday() not in DAYS:
            status = 'not_scheduled'
        elif now.astimezone(EASTERN).hour < 13:
            status = 'window_not_closed'
        else:
            status = (state or {}).get('status', 'missed')
        unresolved = [entry for entry in ledger.recent(now) if not entry.get('published_at')]
        return {'status': status, 'date': date, 'unresolved_count': len(unresolved),
                'verification_counts': (state or {}).get('verification_counts', {}),
                'action': 'inspect_private_ledger_before_retry' if unresolved else 'none'}

    if mode == 'plan':
        sources = Sources.from_environment(None)
        pool = candidates(sources.load(), sources.scores(), ledger.recent(now), now)
        verifier = Verifier.configured(ledger, now=now)
        verified_count = sum(bool(handle(row, verifier.mapping(row))) for row in
                             {c['destination_id']: c for c in pool[:100]}.values())
        return {'status': 'planned' if verified_count else 'no_verified_candidate' if pool else 'no_eligible_candidate',
                'eligible_count': len(pool), 'verified_restaurant_count': verified_count,
                'verification_counts': verifier.summary(), 'date': date}

    owner, previous_finished = actions_identity(env, now)
    if not bind_run_date(ledger, env['GITHUB_RUN_ID'], date):
        raise DurableError('run_bound_to_another_date')
    ledger.claim(date, 'run', owner, previous_finished)
    state = ledger.latest(date)
    if state and state['status'] in {'published', 'no_eligible_candidate', 'no_verified_candidate'}:
        return {'status': state['status'], 'date': date,
                'verification_counts': state.get('verification_counts', {})}
    if state and state.get('attempts', 0) >= 3 and not state.get('pending'):
        return {'status': 'recovery_exhausted', 'date': date}
    sources = Sources.from_environment(None)
    verifier = Verifier.configured(ledger, writable=True, now=now)
    # Reuse the existing account/link/token validation before any provider POST.
    if not env.get('GUESS_EXPECTED_INSTAGRAM_USERNAME') or not env.get('GUESS_EXPECTED_FACEBOOK_NAME'):
        raise DurableError('expected_account_names_required')
    graph = Graph(env['META_LONG_LIVED_ACCESS_TOKEN'], env['META_GRAPH_API_VERSION'], app_secret=env.get('META_APP_SECRET'))
    _, token = graph.validate(env['INSTAGRAM_BUSINESS_ACCOUNT_ID'], env['FACEBOOK_PAGE_ID'],
                              env['GUESS_EXPECTED_INSTAGRAM_USERNAME'], env['GUESS_EXPECTED_FACEBOOK_NAME'])
    if state is None:
        pool = candidates(sources.load(), sources.scores(), ledger.recent(now), now)
        selected, image, verified = select(pool, sources, verifier)
        state = {'date': date, 'revision': 0,
                 'status': 'no_verified_candidate' if pool else 'no_eligible_candidate',
                 'verification_counts': verifier.summary()}
        if selected:
            import hashlib
            digest = hashlib.sha256(image).hexdigest()
            ledger.create('outputs/' + digest + '.jpg', image, 'image/jpeg')
            state.update(selected, status='prepared', image_digest=digest, caption=caption(selected, verified),
                         account_verification=verified[selected['destination_id']])
        ledger.save(date, state)
        if not selected:
            return {'status': state['status'], 'date': date, 'verification_counts': state['verification_counts']}

    def persist():
        ledger.save(date, state)

    state['attempts'] = state.get('attempts', 0) + 1
    persist()

    def revalidate():
        pool = candidates(sources.load(), sources.scores(), [], datetime.now(timezone.utc))
        current = next((c for c in pool if c['photo_id'] == state['photo_id']), None)
        mapping = verifier.mapping(current) if current else {}
        if (not current or not handle(current, mapping) or caption(current, mapping) != state['caption']
                or not sources.asset_available(state['photo_id'])):
            raise DurableError('source_or_score_changed_before_publication')
        # The generated JPEG must still correspond to this exact source photo.
        import hashlib
        if hashlib.sha256(render(sources.photo_bytes(state['photo_id']), current)).hexdigest() != state['image_digest']:
            raise DurableError('source_image_changed_before_publication')

    PhotoPublisher(graph, env['INSTAGRAM_BUSINESS_ACCOUNT_ID'], token).publish(
        state, persist, lambda: ledger.image_url(state['image_digest']), revalidate,
        lambda: window(datetime.now(timezone.utc)) and datetime.now(EASTERN).date().isoformat() == date)
    return {'status': state['status'], 'date': date}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['plan', 'publish', 'health'])
    mode = parser.parse_args().mode
    try:
        result = run(mode)
    except Exception:
        # Third-party exceptions can include signed URLs or account identifiers.
        print('::error::Community spotlight failed; inspect private state and credential readiness.')
        return 1
    print(json.dumps(result))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as stream:
            stream.write('### Community spotlight\n\n' + json.dumps(result) + '\n')
    return int(result['status'] in {'missed', 'uncertain', 'container_created', 'prepared', 'recovery_exhausted'}
               or result.get('unresolved_count', 0) > 0)


if __name__ == '__main__':
    raise SystemExit(main())
