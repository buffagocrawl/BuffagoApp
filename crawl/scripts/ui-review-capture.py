"""Review only: actual Expo development components, in-process local fixtures."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[2]/'docs/ui-review/screenshots'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True)
    # Deny every remote request, including production and telemetry.
    context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(('http://localhost:8087/','http://127.0.0.1:8087/','data:','blob:')) else route.abort())
    context.add_init_script("localStorage.setItem('buffago:onboarding_done_v3','1'); localStorage.setItem('buffago:onboarding:complete','true'); localStorage.setItem('hasSeenIntro','true'); localStorage.setItem('buffago:themeMode','dark'); localStorage.setItem('buffago:wingdex_hint_dismissed','1');")
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    report=[]
    def capture(name):
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(1200)
        text=page.locator('body').inner_text()
        page.screenshot(path=str(OUT/name))
        report.append({'file':name,'url':page.url,'text':text,'errors':list(errors),'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth')})
        print(name,text[:300],flush=True)
    for tab,name in [('home','01-home.png'),('ratings','02-wingdex.png'),('journey','03-journey.png'),('routes','04-crawls.png'),('leaderboards','05-social.png')]:
        page.goto('http://localhost:8087/(tabs)/'+tab,wait_until='domcontentloaded',timeout=120000)
        page.wait_for_timeout(5500)
        capture(name)
    page.goto('http://localhost:8087/wing-jury',wait_until='domcontentloaded')
    page.wait_for_timeout(5000)
    capture('06-wing-jury-voting.png')
    page.get_by_role('button',name='Like',exact=True).click()
    page.get_by_test_id('wing-jury-reveal').wait_for(state='visible')
    capture('07-wing-jury-reveal.png')
    page.get_by_text('Next Photo',exact=True).scroll_into_view_if_needed()
    capture('14-wing-jury-reveal-actions.png')
    page.goto('http://localhost:8087/(tabs)/ratings',wait_until='domcontentloaded')
    page.get_by_text('Favorites',exact=True).first.wait_for(state='visible')
    page.get_by_text('Favorites',exact=True).first.click()
    page.get_by_text('QA Long Restaurant Name Buffalo Wing House & Grill',exact=True).first.wait_for(state='visible')
    capture('08-favorites-populated.png')
    page.get_by_text('Want to Try',exact=True).first.click()
    page.get_by_text('QA Harbor Wings',exact=True).first.wait_for(state='visible')
    capture('09-want-to-try-populated.png')
    # In-process fixture Response construction only: empty both saved-list arrays.
    # Match the exact synthetic saved-row shape; ratings/destinations stay intact.
    page.add_init_script("""const QAResponse=window.Response; window.Response=class extends QAResponse { constructor(body,options) { try { const rows=JSON.parse(body); if(Array.isArray(rows)&&rows.length&&rows.every(row=>Object.keys(row).sort().join(',')==='created_at,destination_id,user_id'&&row.user_id==='00000000-0000-4000-8000-000000000001')) body='[]'; } catch {} super(body,options); } };""")
    page.reload(wait_until='domcontentloaded')
    page.get_by_text('Favorites',exact=True).first.click()
    page.get_by_text('No Favorites yet',exact=True).wait_for(state='visible')
    capture('12-favorites-empty.png')
    page.get_by_text('Want to Try',exact=True).first.click()
    page.get_by_text('Nothing in Want to Try yet',exact=True).wait_for(state='visible')
    capture('13-want-to-try-empty.png')
    page.goto('http://localhost:8087/(tabs)/home',wait_until='domcontentloaded')
    page.get_by_text('Wing Facts',exact=True).click()
    page.get_by_text('Classic Buffalo sauce = cayenne pepper hot sauce + melted butter.',exact=True).wait_for(state='visible')
    capture('10-home-wing-facts-jury.png')
    page.goto('http://localhost:8087/(tabs)/journey',wait_until='domcontentloaded')
    page.get_by_text('Weekly Challenges',exact=True).scroll_into_view_if_needed()
    capture('11-journey-creator.png')
    (OUT.parent/'capture-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    browser.close()
