"""Local-only browser visual QA. Requires an already installed Python Playwright.

All Supabase calls are intercepted with explicitly synthetic fixtures. No live
authentication, backend writes, or fabricated production content is performed.
Start Expo web on port 8081 before running. Artifacts are labelled fixture QA.
"""
import base64
import argparse
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'operation-ui-overhaul' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
UID = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
now = time.strftime('%Y-%m-%dT12:00:00Z')
user = {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'visual-fixture@example.invalid', 'user_metadata': {'username': 'Wing Explorer'}, 'app_metadata': {'provider': 'email'}}
def enc(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
session = {'access_token': enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': UID, 'exp': int(time.time()) + 86400, 'aud': 'authenticated', 'role': 'authenticated'}) + '.fixture-only', 'refresh_token': 'fixture-only', 'expires_at': int(time.time()) + 86400, 'expires_in': 86400, 'token_type': 'bearer', 'user': user}
env_text = (ROOT / '.env.development').read_text(encoding='utf-8-sig')
url = re.search(r'^EXPO_PUBLIC_SUPABASE_URL\s*=\s*[\"\']?([^\s\"\']+)', env_text, re.M).group(1)
storage_key = 'sb-' + urlparse(url).hostname.split('.')[0] + '-auth-token'
destinations = [{'id': 'visual-spot-' + str(i), 'name': name, 'city': 'Buffalo', 'state_code': 'NY', 'state_id': 1, 'address': f'{i} Example Street, Buffalo, NY', 'lat': 42.8864 + i * .001, 'lng': -78.8784, 'top_50': i == 1} for i, name in enumerate(['Harbor Wing Kitchen', 'The Long Restaurant Name Buffalo Wing House & Grill', 'Northside Wings', 'Classic Wing Stop'], 1)]
ratings = [{'id': 'visual-rating-' + str(i), 'user_id': UID if i == 2 else OTHER, 'destination_id': d['id'], 'weight_score': 9 - i * .25, 'overall': 9 - i * .25, 'crispiness': 8, 'sauce': 9, 'meat': 8, 'wings_eaten': 12, 'wings_qty': 12, 'created_at': now, 'is_buffacoin': False, 'destinations': d} for i, d in enumerate(destinations)]
routes = [{'id': 'visual-route-' + str(i), 'title': title, 'city': 'Buffalo', 'travel_tag_id': 1, 'stop1_id': destinations[0]['id'], 'stop2_id': destinations[1]['id'], 'stop3_id': destinations[2]['id']} for i, title in enumerate(['Buffalo Classics', 'Waterfront Wing Trail', 'Neighborhood Wing Walk'], 1)]
tables = {
    'destinations': destinations, 'destination_ratings': ratings, 'routes': routes,
    'states': [{'state_id': 1, 'state_code': 'NY', 'state_name': 'New York', 'code': 'NY', 'name': 'New York'}],
    'user_with_level': [{'user_id': UID, 'level': 4, 'xp': 1250, 'username': 'Wing Explorer'}],
    'level_thresholds': [{'level': 4, 'xp_required': 1000, 'level_title': 'Wing Scout'}, {'level': 5, 'xp_required': 1500, 'level_title': 'Wing Ranger'}],
    'users': [{'user_id': UID, 'id': UID, 'username': 'Wing Explorer'}],
    'users_check_profile': [{'user_id': UID}], 'users_check_route': [{'user_id': UID}],
    'users_check_home': [{'user_id': UID}], 'buffacoin_wallets': [{'user_id': UID, 'balance': 12345}],
    'route_travel_tag': [{'id': 1, 'travel': 'Walking'}, {'id': 2, 'travel': 'Driving'}],
    'v_social_feed': [{'user_id': OTHER, 'username': 'Wing Scout', 'destination_id': d['id'], 'destination_name': d['name'], 'destination_city': d['city'], 'weight_score': 8.7, 'created_at': now, 'is_buffacoin': False} for d in destinations],
    'fun_facts': [{'text': 'Visual QA fixture: chicken wings come in flats and drums.'}],
    'crawls': [{'crawl_id': 'visual-active', 'route_id': 'visual-route-1', 'user_id': UID, 'status': 'in_progress', 'start_time': now, 'end_time': None, 'routes': {'title': 'Buffalo Classics'}}, {'crawl_id': 'visual-completed', 'route_id': 'visual-route-2', 'user_id': UID, 'status': 'completed', 'start_time': now, 'end_time': now, 'routes': {'title': 'Waterfront Wing Trail'}}],
}
ratings[2]['crawl_id'] = 'visual-active'
def intercept(route):
    req = route.request
    parsed = urlparse(req.url)
    path = parsed.path
    query = parse_qs(parsed.query)
    payload = []
    if '/auth/v1/user' in path: payload = user
    elif '/auth/v1/token' in path: payload = session
    elif '/functions/v1/wing-public-gallery' in path:
        body = req.post_data_json or {}
        payload = {'ok': True, 'restaurants': [{'destination_id': did, 'picture_count': 1 if args.approved_media else 0, 'images': [{'signed_url': 'https://visual-fixture.invalid/approved-wing.png', 'submission_id': 'fixture-approved'}] if args.approved_media and body.get('include_images') else []} for did in body.get('destination_ids', [])]}
    elif '/rest/v1/rpc/' in path:
        name = path.rsplit('/', 1)[-1]
        if name == 'daily_xp_status': payload = [{'can_claim': True, 'eligible': True, 'claimed_today': False}]
        elif name == 'get_random_fun_fact': payload = [{'text': 'Visual QA fixture: chicken wings come in flats and drums.'}]
        elif name == 'get_wing_shots_feature_flags': payload = [{'flag_key': key, 'enabled_for_user': True} for key in ['wing_shots_enabled', 'wing_shots_creator_stats_enabled', 'wing_shots_gallery_enabled']]
        elif name == 'get_public_challenge_stats': payload = [{'total_completed': 12, 'this_week_completed': 1, 'current_weekly_streak': 3, 'best_weekly_streak': 5}]
        elif name == 'get_wing_creator_stats': payload = [{'creator_xp': 24, 'approved_submissions': 3, 'featured_submissions': 1}]
        elif name == 'get_engagement_dashboard': payload = {'assignments': [{'id': 'visual-mission', 'period_kind': 'weekly', 'mission_key': 'weekly_three_ratings', 'action_type': 'rating_created', 'title': 'Rate three wing spots', 'description': 'Explore three restaurants this week.', 'progress': 1, 'target': 3, 'reward_xp': 100, 'expires_at': '2026-10-12T04:00:00Z'}]}
    elif '/rest/v1/' in path:
        payload = tables.get(path.rsplit('/', 1)[-1], [])
        for key, vals in query.items():
            val = vals[0]
            if key in ['user_id', 'destination_id', 'id', 'state_id', 'status'] and val.startswith('eq.'):
                payload = [row for row in payload if str(row.get(key)) == val[3:]]
            elif key == 'status' and val.startswith('in.'):
                choices = val[3:].strip('()').split(',')
                payload = [row for row in payload if row.get(key) in choices]
        if 'object+json' in req.headers.get('accept', ''): payload = payload[0] if payload else None
    total = len(payload) if isinstance(payload, list) else 1
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': f'0-{max(0,total-1)}/{total}'}, body='' if req.method == 'HEAD' else json.dumps(payload))

parser = argparse.ArgumentParser()
parser.add_argument('--width', type=int, choices=[320, 360, 390, 430])
parser.add_argument('--only', choices=['home', 'routes', 'ratings', 'leaderboards', 'journey'])
parser.add_argument('--output', type=Path, help='Separate evidence directory for a final audit')
parser.add_argument('--theme', choices=['dark', 'light'], default='dark')
parser.add_argument('--approved-media', action='store_true', help='Fixture-only approved image cropped from the supplied Home mockup')
args = parser.parse_args()
if args.output:
    OUT = args.output.resolve()
    OUT.mkdir(parents=True, exist_ok=True)
fixture_photo = None
if args.approved_media:
    import io
    from PIL import Image
    fixture_source = ROOT / 'design-references/8afd3fb8-1eda-4186-9dd0-054c410ac873.png'
    specimen = Image.open(fixture_source).crop((365, 1145, 658, 1190))
    specimen.save(OUT / 'fixture-approved-photo.png')
    buffer = io.BytesIO(); specimen.save(buffer, format='PNG'); fixture_photo = buffer.getvalue()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    report = {'fixture_only': True, 'theme': args.theme, 'approved_media_fixture': args.approved_media, 'media_source': 'Supplied Home tournament mockup crop (365,1145,658,1190); synthetic moderation response, not production media' if args.approved_media else None, 'screens': [], 'errors': []}
    for width, height in [(320, 740), (360, 800), (390, 844), (430, 932)]:
        if args.width and width != args.width: continue
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, device_scale_factor=1, geolocation={'latitude': 42.8864, 'longitude': -78.8784}, permissions=['geolocation'])
        context.route(url.rstrip('/') + '/**', intercept)
        if fixture_photo:
            context.route('https://visual-fixture.invalid/approved-wing.png', lambda route: route.fulfill(status=200, content_type='image/png', body=fixture_photo))
        values = {storage_key: json.dumps(session), 'buffago:onboarding_done_v3': '1', 'buffago:onboarding:complete': 'true', 'hasSeenIntro': 'true', 'buffago:themeMode': args.theme, 'buffago:currentState': 'NY', 'buffago:wingdex_hint_dismissed': '1'}
        context.add_init_script('for (const [k,v] of Object.entries(' + json.dumps(values) + ')) localStorage.setItem(k,v);')
        page = context.new_page()
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.on('console', lambda msg: report['errors'].append(msg.text[:500]) if msg.type == 'error' and ('ReferenceError' in msg.text or 'boundary caught' in msg.text) else None)
        for tab, name in [('home', 'home'), ('routes', 'crawls'), ('ratings', 'wingdex'), ('leaderboards', 'social'), ('journey', 'journey')]:
            if args.only and tab != args.only: continue
            if width == 390 and tab == 'ratings':
                page.add_init_script('''const qaFetch = window.fetch.bind(window); window.fetch = async (input, ...args) => { if (String(input).includes('/rest/v1/destinations?')) await new Promise(resolve => setTimeout(resolve, 8000)); return qaFetch(input, ...args); };''')
            page.goto('http://localhost:8081/(tabs)/' + tab, wait_until='domcontentloaded', timeout=120000)
            if width == 390 and tab == 'ratings':
                page.wait_for_timeout(4500)
                page.screenshot(path=str(OUT / 'wingdex-loading-390-fixture.png'))
            page.wait_for_timeout(6500)
            if tab == 'ratings':
                page.get_by_text('Harbor Wing Kitchen', exact=True).first.wait_for(state='visible', timeout=30000)
            if tab == 'routes':
                page.get_by_text('Neighborhood Wing Walk', exact=True).first.wait_for(state='visible', timeout=30000)
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(500)
            text = page.locator('body').inner_text()
            file = OUT / f'{name}-{width}-fixture.png'
            page.screenshot(path=str(file), full_page=True)
            overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
            report['screens'].append({'tab': name, 'width': width, 'height': height, 'file': file.name, 'horizontal_overflow': overflow, 'startup_error': 'startup error' in text, 'text': text[:1800]})
            print(name, width, 'overflow', overflow, 'startup_error', 'startup error' in text, flush=True)
            # At the smallest viewport, test 130% text scaling and capture the
            # layout after scroll. This is web scaling, not native Dynamic Type.
            if width == 320:
                page.evaluate('''() => { for (const e of document.querySelectorAll('[dir="auto"]')) { const s = getComputedStyle(e); if (s.fontFamily.toLowerCase().includes('material') || (e.textContent.length <= 2 && e.textContent.codePointAt(0) > 0xe000)) continue; const scale = e.closest('[role="tab"], [aria-label$="navigation"]') ? 1.15 : 1.3; e.style.fontSize = (parseFloat(s.fontSize) * scale) + 'px'; e.style.lineHeight = (parseFloat(s.lineHeight) * scale) + 'px'; } }''')
                page.wait_for_timeout(700)
                if tab == 'ratings':
                    heading = page.get_by_text('Harbor Wing Kitchen', exact=True).first.bounding_box()
                    sort_control = page.get_by_text('Overall score', exact=True).first.bounding_box()
                    clear = heading['y'] >= sort_control['y'] + sort_control['height']
                    report.setdefault('wingdex_header_clearance', []).append({'width': width, 'font_scale': 1.3, 'clear': clear})
                page.screenshot(path=str(OUT / f'{name}-{width}-font130-fixture.png'), full_page=True)
                report['screens'].append({'tab': name, 'width': width, 'font_scale': 1.3, 'file': f'{name}-{width}-font130-fixture.png', 'horizontal_overflow': page.evaluate('document.documentElement.scrollWidth > innerWidth')})
            if tab == 'routes':
                resume = page.get_by_role('button', name='Resume crawl', exact=True).first
                resume.scroll_into_view_if_needed()
                reachable = resume.evaluate('''e => {
                    const r = e.getBoundingClientRect();
                    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                    return r.height >= 36 && (hit === e || e.contains(hit));
                }''')
                report.setdefault('crawl_resume_actions', []).append({'width': width, 'reachable': reachable})
                if width == 390:
                    assert page.get_by_text('Neighborhood Wing Walk', exact=True).count() == 1
                    assert page.get_by_text('Buffalo Classics', exact=True).count() == 1
                    page.get_by_role('button', name='View crawl', exact=True).click()
                    page.get_by_role('button', name='Begin Crawl', exact=True).wait_for(state='visible')
                    page.get_by_text('Harbor Wing Kitchen', exact=True).first.wait_for(state='visible', timeout=15000)
                    report['crawl_details_open'] = True
                    page.goto('http://localhost:8081/(tabs)/routes', wait_until='domcontentloaded')
                    page.get_by_text('Neighborhood Wing Walk', exact=True).first.wait_for(state='visible')
                    page.get_by_role('button', name='My Crawls', exact=True).click()
                    page.get_by_role('button', name='Resume crawl', exact=True).wait_for(state='visible')
                    assert page.get_by_text('Neighborhood Wing Walk', exact=True).count() == 0
                    report['crawl_active_filter'] = True
                    page.get_by_role('button', name='Completed', exact=True).click()
                    page.get_by_role('button', name='Review crawl', exact=True).wait_for(state='visible')
                    assert page.get_by_text('Buffalo Classics', exact=True).count() == 0
                    report['crawl_completed_filter'] = True
                    page.get_by_role('button', name='Nearby', exact=True).click()
                    page.get_by_role('button', name='Resume crawl', exact=True).click()
                    page.wait_for_function("location.pathname === '/crawl/visual-active'", timeout=15000)
                    stored = page.evaluate("JSON.parse(localStorage.getItem('buffago:selectedRoute'))")
                    assert stored['id'] == 'visual-route-1' and len(stored['stopsOrdered']) == 3
                    report['crawl_resume_navigation_and_storage'] = True
            if width == 390 and tab == 'ratings':
                page.get_by_placeholder('Search destinations…').fill('Northside')
                page.wait_for_timeout(700)
                report['search'] = {'matched': page.get_by_text('Northside Wings', exact=True).count() > 0, 'unmatched_hidden': page.get_by_text('Harbor Wing Kitchen', exact=True).count() == 0}
                page.screenshot(path=str(OUT / 'wingdex-search-390-fixture.png'))
                page.get_by_placeholder('Search destinations…').fill('no-such-visual-restaurant')
                page.wait_for_timeout(700)
                page.screenshot(path=str(OUT / 'wingdex-empty-390-fixture.png'))
                page.get_by_placeholder('Search destinations…').fill('')
                page.get_by_role('button', name='Map', exact=True).click()
                page.wait_for_timeout(500)
                report['web_map_fallback'] = page.get_by_text('Map available in the BuffaGo mobile app', exact=True).count() > 0
                page.screenshot(path=str(OUT / 'wingdex-map-fallback-390-fixture.png'))
            if width == 390 and tab == 'home':
                page.get_by_text('Wing Facts', exact=True).scroll_into_view_if_needed()
                page.screenshot(path=str(OUT / 'home-missions-facts-390-fixture.png'))
            if width == 390 and tab == 'journey':
                page.get_by_text('Best: 5 weeks', exact=True).scroll_into_view_if_needed()
                page.screenshot(path=str(OUT / 'journey-challenges-390-fixture.png'))
            if width == 390 and tab == 'leaderboards':
                page.get_by_text('Friends', exact=True).last.click()
                page.wait_for_timeout(700)
                page.screenshot(path=str(OUT / 'social-empty-friends-390-fixture.png'))
        if width == 390 and not args.only:
            page.goto('http://localhost:8081/(tabs)/home', wait_until='domcontentloaded')
            page.wait_for_timeout(6500)
            for label, suffix in [('Crawls', '/routes'), ('Wingdex', '/ratings'), ('Social', '/leaderboards'), ('Journey', '/journey'), ('Home', '/home')]:
                accessible_label = 'Profile navigation' if label == 'Journey' else label + ' navigation'
                page.get_by_label(accessible_label, exact=True).click()
                page.wait_for_timeout(500)
                print('navigation', label, page.url, flush=True)
                page.wait_for_function("(suffix) => location.pathname.replace(/\\/index\\/?$/, '').endsWith(suffix)", arg=suffix, timeout=15000)
                report.setdefault('tab_navigation', []).append({'label': label, 'arrived': True})
        context.close()
    browser.close()
    report_name = f'visual-report-{args.only or "all"}-{args.width or "all"}.json' if args.only or args.width else 'visual-report.json'
    (OUT / report_name).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('Errors:', report['errors'], flush=True)
    if report['errors'] or any(row.get('horizontal_overflow') or row.get('startup_error') for row in report['screens']):
        raise SystemExit(1)
    if report.get('search') and not all(report['search'].values()):
        raise SystemExit(1)
    if report.get('web_map_fallback') is False:
        raise SystemExit(1)
    if any(not row['reachable'] for row in report.get('crawl_resume_actions', [])):
        raise SystemExit(1)
    if any(not row['clear'] for row in report.get('wingdex_header_clearance', [])):
        raise SystemExit(1)
