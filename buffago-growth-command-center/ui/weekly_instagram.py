"""One replacement chart, using account-wide gained views from daily ranges."""
from datetime import date
from growth_goals import eastern_stamp
from models import fmt_number
from ui import theme


def draw(d, p, x):
    weekly = (d.growth_feed.data or {}).get('weekly_instagram') or {}
    rows = weekly.get('weeks', [])[-8:]
    p.text(x+14, 374, 'Instagram weekly views', 11, theme.MUTED, 'bold', width=220)
    p.text(x+14, 392, 'Account-wide | views gained', 9, theme.SUBTLE)
    current = rows[-1] if rows else {}
    p.text(x+14, 407, fmt_number(current.get('value')), 26, theme.TEXT, 'bold')
    p.text(x+234, 419, 'PARTIAL', 9, theme.ACCENT, 'bold', anchor='ne')
    values = [r.get('value') if not r.get('partial') else None for r in rows]
    if any(v is not None for v in values):
        d._draw_mini_chart(p, x+22, 451, 206, 75, values, None)
    else:
        p.text(x+14, 470, 'Weekly history unavailable', 11, theme.MUTED, width=220)
        p.text(x+14, 493, 'Collecting daily account views', 9, theme.SUBTLE, width=220)
    for i,row in enumerate(rows):
        if i in {0,2,4,7}:
            label = date.fromisoformat(row['week_start']).strftime('%m/%d')
            p.text(round(x+22+206*i/max(1,len(rows)-1)), 535, label, 9, theme.SUBTLE, anchor='n')
    p.text(x+14, 553, 'Mon-Sun ET | current week partial', 8, theme.SUBTLE)
    p.text(x+14, 570, 'Source '+eastern_stamp(weekly.get('captured_at')), 8, theme.SUBTLE)
