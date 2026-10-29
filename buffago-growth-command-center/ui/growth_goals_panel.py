"""Read-only Tk wall panel and expandable detail view."""
import tkinter as tk
import webbrowser
from datetime import datetime, timezone
from growth_goals import display, moment, public_link
from ui import theme


def text_stamp(value):
    parsed = moment(value)
    return parsed.strftime('%b %d %H:%M UTC') if parsed else 'Unavailable'


def details(dashboard):
    feed = dashboard.growth_feed
    data = feed.data or {}
    social = data.get('social', {})
    popup = tk.Toplevel(dashboard)
    popup.title('Growth & Goals — details')
    popup.geometry('780x680')
    popup.configure(bg=theme.BG)
    body = tk.Text(popup, bg=theme.PANEL, fg=theme.TEXT, wrap='word', font=(theme.FONT, 12), padx=20, pady=16)
    scroll = tk.Scrollbar(popup, command=body.yview)
    body.configure(yscrollcommand=scroll.set)
    scroll.pack(side='right', fill='y')
    body.pack(fill='both', expand=True)
    def line(value=''):
        body.insert('end', value+'\n')
    def link(url):
        if not public_link(url):
            return
        tag = 'link'+str(len(body.tag_names()))
        body.insert('end', url+'\n', tag)
        body.tag_config(tag, foreground=theme.ACCENT, underline=True)
        body.tag_bind(tag, '<Button-1>', lambda _e, u=url: webbrowser.open(u))
    line('SOCIAL PERFORMANCE' + (' • STALE' if feed.stale() else ''))
    line('Report: '+text_stamp(social.get('generated_at')))
    line('Lifetime cumulative values at capture age; provider insights may lag 48 hours.')
    for r in social.get('reels', []):
        line('\n'+r['platform'].title()+(' • Live test' if r['live_test'] else ' • Nightly'))
        line('Published '+text_stamp(r['published_at'])+' | Captured '+text_stamp(r['captured_at']))
        line(f"Observation age: {r['age_hours']} hours | Window: {r['window']}")
        for name, entry in r['metrics'].items():
            line(name.replace('_', '/').title()+': '+display(entry))
        link(r['url'])
    line('\nPUBLICATION LEDGER • read only')
    for r in data.get('publications', []):
        line(f"{r['date']} | {r['platform']} | {r['status']}"+(' | Live test' if r['live_test'] else ' | Nightly'))
    line('\nBEST REELS • same platform and milestone • minimum 3 observations')
    for r in social.get('rankings', []):
        line(f"{r['platform']} | {r['window']} | {r['metric']}")
        for item in r['reels']:
            line(str(item['value']))
            link(item['url'])
    if not social.get('rankings'):
        line('Insufficient comparable milestone observations.')
    line('\nCHALLENGE GEOGRAPHIES • areas of posts, not viewers')
    groups = social.get('geography', [])
    comparable = [g for g in groups if sum(x['platform']==g['platform'] and x['window']==g['window'] for x in groups) >= 2]
    for g in sorted(comparable, key=lambda g: g['mean_reach'] or 0, reverse=True):
        line(f"{g['platform']} | {g['window']} | {g['area']} | Mean reach {g['mean_reach']} | n={g['n']}")
    if not comparable:
        line('Insufficient data: need 2 areas with at least 3 measured posts each at the same milestone.')
    line('\nWEEKLY COMPARISONS • adjacent 7-day publication cohorts')
    for c in social.get('comparisons', []):
        line(f"{c['platform']} | {c['window']} | {c['metric']}: {c['change_fraction']:+.1%} | n={c['previous_n']} → {c['current_n']}")
    if not social.get('comparisons'):
        line('Insufficient history: need at least 3 measured posts in each mature cohort.')
    line('\nSTATE GOALS • all eligible states in source priority order')
    for state in data.get('states', []):
        line('\n'+state['code']+' | Updated '+text_stamp(state['updated_at']))
        for m in state['metrics']:
            line(f"{m['name']}: {m['current'] if m['current'] is not None else 'Unavailable'} / {m['target'] if m['target'] is not None else 'Not set'} {m['unit']} | Gap: {m['gap'] if m['gap'] is not None else 'Unavailable'}")
    if not data.get('states'):
        line('State report, eligible-state list, priority order and established targets are not connected.')
    line('\nReach is per post; it is never summed as unique people. No tracked installs.')
    body.configure(state='disabled')


def draw(d, p, now):
    x, w = 800, 760
    feed = d.growth_feed
    data = feed.data or {}
    social = data.get('social', {})
    stale = feed.stale(now)
    p.label(x, 91, 'Growth & Goals')
    p.text(x+w, 91, 'STALE' if stale and data else feed.status.upper(), 12, theme.ALERT if stale else theme.UP, 'bold', anchor='ne')
    d._card(p, x, 120, w, 405, fill=theme.PANEL, outline=theme.BORDER)
    p.text(x+18, 137, 'Social performance', 22, theme.TEXT, 'bold')
    p.text(x+18, 169, 'Report '+text_stamp(social.get('generated_at')), 12, theme.MUTED)
    health = social.get('health', {})
    p.text(x+w-18, 169, f"{health.get('errors', 0)} collection gaps" if data else 'Awaiting server feed', 12,
           theme.ALERT if health.get('errors') else theme.MUTED, anchor='ne')
    for index, platform in enumerate(('instagram', 'facebook')):
        cx = x+18+index*365
        reel = next((r for r in social.get('reels', []) if r['platform']==platform), None)
        p.text(cx, 203, platform.title(), 19, theme.ACCENT, 'bold')
        publication = next((r for r in data.get('publications', []) if r['platform']==platform), None)
        p.text(cx, 233, ('Ledger: '+publication['status']+(' • test' if publication['live_test'] else '')) if publication else 'Ledger: unavailable', 12, theme.MUTED)
        if not reel:
            p.text(cx, 274, 'No Reel observations', 18, theme.TEXT)
            continue
        age = f"{reel['age_hours']:.1f}h" if reel['age_hours'] is not None else 'unknown'
        published = moment(reel['published_at'])
        post_age = f'{max(0, (now-published).total_seconds()/3600):.1f}h' if published else 'unknown'
        p.text(cx, 258, f"Post {post_age} | Snapshot {age} | {reel['window']}", 12, theme.MUTED)
        # Primary numbers are large; lesser metrics stay compact.
        for j, name in enumerate(('views', 'reach')):
            entry = reel['metrics'][name]
            p.text(cx+j*172, 289, name.title(), 12, theme.MUTED)
            p.text(cx+j*172, 311, display(entry), 32 if entry['value'] is not None else 16, theme.TEXT, 'bold')
        for j, name in enumerate(('comments', 'shares', 'saves', 'likes_reactions')):
            label = 'Likes/reactions' if name=='likes_reactions' else name.title()
            p.text(cx, 363+j*25, label, 12, theme.MUTED)
            p.text(cx+330, 363+j*25, display(reel['metrics'][name]), 13, theme.TEXT, 'bold', anchor='ne')
        if reel['url']:
            p.text(cx, 471, 'Open public Reel ↗', 13, theme.ACCENT, 'bold')
            link_item = d.find_all()[-1]
            d.tag_bind(link_item, '<Button-1>', lambda _e, u=reel['url']: webbrowser.open(u))
    p.text(x+18, 502, 'Lifetime at capture age • No comparable mature trend yet' if not social.get('comparisons') else 'Mature cohort comparisons available in details', 12, theme.SUBTLE)
    d._card(p, x, 542, w, 270, fill=theme.PANEL, outline=theme.BORDER)
    p.text(x+18, 558, 'State goals', 22, theme.TEXT, 'bold')
    states = data.get('states', [])
    if not states:
        p.text(x+18, 605, 'State data not connected', 24, theme.TEXT, 'bold')
        p.text(x+18, 648, 'Coverage target: Not set', 17, theme.MUTED)
        p.text(x+18, 683, 'Need the existing state report, priority order and targets.', 14, theme.MUTED)
        p.text(x+18, 721, 'Ratings and photos: unavailable by state', 14, theme.MUTED)
        p.text(x+18, 758, 'Last updated: unavailable', 12, theme.SUBTLE)
    for index, state in enumerate(states[:3]):
        y = 603+index*62
        m = next((m for m in state['metrics'] if m['name']=='Restaurant coverage'), None)
        p.text(x+18, y, state['code'], 19, theme.ACCENT, 'bold')
        if m:
            current = f"{m['current']:,.1f}" if m['current'] is not None else 'Unavailable'
            target = f"{m['target']:,.1f}" if m['target'] is not None else 'Not set'
            p.text(x+78, y, f"{current} / {target} {m['unit']}", 15, theme.TEXT, 'bold')
            p.box(x+78, y+27, x+470, y+34, fill=theme.BORDER, outline=theme.BORDER)
            if m['fraction'] is not None:
                p.box(x+78, y+27, x+78+int(392*m['fraction']), y+34, fill=theme.ACCENT, outline=theme.ACCENT)
            p.text(x+w-18, y+25, f"Gap {m['gap']:,.1f}" if m['gap'] is not None else 'Gap unavailable', 12, theme.MUTED, anchor='ne')
        else:
            p.text(x+78, y, 'Restaurant coverage: unavailable • Target: Not set', 14, theme.MUTED)
    if states:
        p.text(x+18, 790, 'Updated '+text_stamp(states[0].get('updated_at'))+' ? Ratings & photos in details', 12, theme.SUBTLE)
    p.text(x+18, 831, 'All Reels, collection details & all eligible states →', 15, theme.ACCENT, 'bold')
    d.tag_bind(d.find_all()[-1], '<Button-1>', lambda _e: details(d))
