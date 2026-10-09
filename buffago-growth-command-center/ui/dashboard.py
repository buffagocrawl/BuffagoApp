"""Responsive Tkinter wall dashboard for Buffago business health and action."""

from __future__ import annotations

import tkinter as tk
import random
from activity import relative_time, safe_display
from models import parse_datetime
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from models import MarketingScore, MonthlyPoint, Snapshot, fmt_number
from ui import theme
from ui.components import Painter
from missions import MissionStore, eastern_day, mission_for
from ui.mission_panel import open_mission


ASSET_DIR = Path(__file__).resolve().parents[1] / "assets"
ALERT = theme.ALERT
ALERT_BG = theme.ALERT_BG
EXPECTED_HISTORY_START = date(2026, 6, 1)


def _utc_now():
    return datetime.now(timezone.utc)


def _display_history(points: tuple[MonthlyPoint, ...]) -> tuple[MonthlyPoint, ...]:
    """Keep June onward visible, with gaps wherever telemetry is unavailable."""
    return tuple(point for point in points if point.month >= EXPECTED_HISTORY_START)


def _month_label_indexes(count: int, max_labels: int = 6) -> set[int]:
    if count <= max_labels:
        return set(range(count))
    return {round(index * (count - 1) / (max_labels - 1)) for index in range(max_labels)}


def _month_label(month: str | date | None, fallback: str) -> str:
    if not month:
        return fallback
    if isinstance(month, date):
        return month.strftime("%b").upper()
    try:
        try:
            parsed = datetime.strptime(month, "%Y-%m")
        except ValueError:
            parsed = datetime.strptime(month, "%Y-%m-%d")
        return parsed.strftime("%b").upper()
    except ValueError:
        return fallback


def _fallback_move(score: MarketingScore) -> str:
    factors = score.factors
    available = [(key, value) for key, value in factors.items() if value is not None]
    weakest = min(available, key=lambda pair: pair[1])[0] if available else "acquisition"
    return {
        "acquisition": "Launch one measurable acquisition test.",
        "mau": "Re-engage recent visitors and improve return activity.",
        "engagement": "Bring existing users back to rate one restaurant.",
        "account_growth": "Improve visitor-to-account conversion.",
    }[weakest]


def _active_insight(insight: Any, now: datetime) -> Any:
    return None if insight and insight.expires_at and insight.expires_at <= now else insight


class Dashboard(tk.Canvas):
    def __init__(self, master: tk.Misc):
        super().__init__(master, bg=theme.BG, highlightthickness=0, bd=0)
        self.pack(fill="both", expand=True)
        self.snapshot: Snapshot | None = None
        self.local: dict[str, Any] = {}
        self.last_success: datetime | None = None
        self.stale = False
        self.status = "STARTING"
        self._images: dict[str, tk.PhotoImage] = {}
        self.mission_store = MissionStore(Path(__file__).resolve().parents[1] / 'data' / 'marketing-missions.json')
        self._load_brand_images()
        self.bind("<Configure>", self._on_resize)
        self._resize_job: str | None = None

    def _load_brand_images(self) -> None:
        """Tk's native PNG reader keeps assets dependency-free; bad/missing files are optional."""
        for key, filename, target in (("logo", "icon.png", 34), ("mascot", "wing-user.png", 36)):
            try:
                image = tk.PhotoImage(master=self, file=str(ASSET_DIR / filename))
                factor = max(1, (max(image.width(), image.height()) + target - 1) // target)
                image = image.subsample(factor, factor) if factor > 1 else image
                self._images[key] = image
            except (tk.TclError, OSError):
                continue

    def _on_resize(self, _event: tk.Event) -> None:
        if self._resize_job:
            self.after_cancel(self._resize_job)
        self._resize_job = self.after(80, self.render)

    def destroy(self):
        if self._resize_job:
            self.after_cancel(self._resize_job)
            self._resize_job = None
        super().destroy()

    def update_data(self, snapshot: Snapshot | None, local: dict[str, Any],
                    last_success: datetime | None, stale: bool, status: str) -> None:
        self.snapshot, self.local, self.last_success = snapshot, local, last_success
        self.stale, self.status = stale, status
        self.render()

    def _card(self, p: Painter, x: int, y: int, w: int, h: int, *, alert: bool = False,
              fill: str | None = None, outline: str | None = None) -> None:
        p.box(x, y, x + w, y + h, fill=fill or (ALERT_BG if alert else theme.PANEL_ALT),
              outline=outline or (ALERT if alert else theme.PANEL_ALT), width=1 if not alert else 2)

    def _draw_header(self, p: Painter, width: int, now: datetime) -> None:
        center = 800  # Geometric screen center, independent of left/right header content.
        if "logo" in self._images:
            self.create_image(p.xy(54), p.xy(42, "y"), image=self._images["logo"], anchor="center")
        if "mascot" in self._images:
            self.create_image(p.xy(1544), p.xy(42, "y"), image=self._images["mascot"], anchor="center")
        p.text(center, 13, "BUFFAGO COMMAND CENTER", 24, theme.TEXT, "bold", anchor="n")
        p.text(center, 48, "Growth & Business Health", 11, theme.MUTED, anchor="n")
        p.text(1490, 22, self._age(self.last_success, now), 10, theme.MUTED, anchor="ne")
        status = "LIVE" if not self.stale else (self.status or "STALE")
        color = ALERT if self.stale else theme.UP
        p.text(1490, 43, f"●  {status.upper()}", 9, color, "bold", anchor="ne")
        self.create_line(p.xy(36), p.xy(76, "y"), p.xy(1564), p.xy(76, "y"), fill=theme.BORDER)

    def _draw_tiles(self, p: Painter, s: Snapshot) -> None:
        left, gap = 40, 12
        p.label(left, 91, "Business Snapshot")
        tile_w = 250
        device_tiles = [
            ("Unique Device Opens", s.device_all_time, s.device_all_time.breakdown),
            ("Last 24 Hours", s.device_last_24h, s.device_last_24h.breakdown),
        ]
        for index, (title, metric, sub) in enumerate(device_tiles):
            x = left + index * (tile_w + gap)
            self._card(p, x, 116, tile_w, 126)
            p.text(x + 18, 132, title, 12, theme.MUTED, "bold")
            p.text(x + 18, 158, fmt_number(metric.total), 40, theme.TEXT, "bold")
            p.text(x + 18, 210, sub, 11, theme.SUBTLE)

        prior_label = _month_label(s.calendar_previous_month[0], "PREV") + " MAU"
        current_label = _month_label(s.calendar_current_month[0], "MTD") + " MTD MAU"
        for index, (title, value, detail) in enumerate((
            (prior_label, s.calendar_previous_month[1], "Previous month"),
            (current_label, s.calendar_current_month[1], "Month to date"),
        )):
            x = left + (index + 2) * (tile_w + gap)
            self._card(p, x, 116, tile_w, 126, fill=theme.SCORE_SURFACE if index == 1 else theme.PANEL_ALT,
                       outline=theme.BORDER)
            p.text(x + 18, 132, title, 12, theme.MUTED, "bold")
            p.text(x + 18, 158, fmt_number(value), 40, theme.ACCENT if index == 1 else theme.TEXT, "bold")
            p.text(x + 18, 210, detail, 11, theme.SUBTLE)

        # Five quieter catalog cards, with count and percentage hierarchy.
        row_y, total_w = 256, 198
        health = s.catalog_health
        totals = (("Total Wing Ratings", s.wing_total, None),
                  ("Total Restaurants", s.total_restaurants, None),
                  ("Restaurants Without Ratings", health.get('restaurants_without_ratings', {}).get('count'), health.get('restaurants_without_ratings', {}).get('percentage')),
                  ("Restaurants Without Photos", health.get('restaurants_without_photos', {}).get('count'), health.get('restaurants_without_photos', {}).get('percentage')),
                  ("Total Users Created", s.total_accounts, None))
        for index, (title, value, percentage) in enumerate(totals):
            x = left + index * (total_w + 12)
            self._card(p, x, row_y, total_w, 76, fill=theme.PANEL)
            short = title.replace('Restaurants Without ', 'Restaurants Without\n')
            p.text(x + 12, row_y + 8, short, 11, theme.MUTED, width=total_w - 24)
            p.text(x + 12, row_y + 39, fmt_number(value), 23, theme.TEXT, 'bold')
            if index in (2, 3):
                suffix = '%' if p.scale < .7 else '% of restaurants'
                detail = f"{fmt_number(percentage, 1)}{suffix}" if percentage is not None else 'Unavailable'
                p.text(x + total_w - 10, row_y + 67, detail, 9, theme.SUBTLE, anchor='se')

    def _draw_charts(self, p: Painter, points: tuple[MonthlyPoint, ...]) -> None:
        points = _display_history(points)
        p.label(40, 337, "Monthly Growth Trends")
        items = (("Monthly MAU", "mau"), ("Unique Mobile Devices", "unique_devices"),
                 ("Wing Ratings", "wing_ratings"), ("New Accounts", "new_accounts"))
        for index, (title, field) in enumerate(items):
            x = 40 + index * 260
            self._card(p, x, 362, 250, 226, fill=theme.PANEL)
            p.text(x + 14, 374, title, 11, theme.MUTED, "bold", width=220)
            values = [getattr(point, field) for point in points]
            current = next((value for value in reversed(values) if value is not None), None)
            previous = next((value for value in reversed(values[:-1]) if value is not None), None)
            direction = "↑" if current is not None and previous is not None and current > previous else (
                "↓" if current is not None and previous is not None and current < previous else "→")
            p.text(x + 14, 397, fmt_number(current), 26, theme.TEXT, "bold")
            p.text(x + 234, 407, direction, 15,
                   theme.UP if direction == "↑" else theme.DOWN if direction == "↓" else theme.SUBTLE,
                   "bold", anchor="ne")
            self._draw_mini_chart(p, x + 22, 437, 206, 92, values,
                                  [point.app_open_tracking_available for point in points] if field in {"mau", "unique_devices"} else None)
            show_year = bool(points and points[-1].month.year != points[0].month.year)
            for month_index, point in enumerate(points):
                if month_index in _month_label_indexes(len(points)):
                    month_x = x + 22 + (206 * month_index / max(1, len(points) - 1))
                    label = point.month.strftime("%b '%y" if show_year else "%b")
                    p.text(round(month_x), 540, label, 9, theme.SUBTLE, anchor="n")
        if points:
            p.text(40, 596, "App-open tracking began in Jun 2026", 9, theme.SUBTLE)

    def _draw_mini_chart(self, p: Painter, x: int, y: int, w: int, h: int,
                         values: list[int | float | None], tracking: list[bool] | None) -> None:
        present = [float(value) for value in values if value is not None]
        if not present:
            p.create_line(p.xy(x), p.xy(y + h - 3, "y"), p.xy(x + w), p.xy(y + h - 3, "y"),
                          fill=theme.BORDER)
            return
        low, high = min(present), max(present)
        if low == high:
            low = max(0, low - 1)
            high += 1
        usable = h - 12
        plot_top, plot_bottom = y + 5, y + h - 7
        for fraction in (0.25, 0.5, 0.75, 1):
            gy = plot_top + (plot_bottom - plot_top) * fraction
            self.create_line(p.xy(x), p.xy(gy, "y"), p.xy(x + w), p.xy(gy, "y"),
                             fill=theme.BORDER, width=1)
        denominator = max(1, len(values) - 1)
        points: list[tuple[float, float] | None] = []
        for index, value in enumerate(values):
            px = x + w * index / denominator
            py = y + h - 7 - (float(value) - low) / (high - low) * usable if value is not None else 0
            points.append((px, py) if value is not None else None)
        for index in range(1, len(points)):
            if points[index - 1] and points[index]:
                x1, y1 = points[index - 1]
                x2, y2 = points[index]
                self.create_line(p.xy(x1), p.xy(y1, "y"), p.xy(x2), p.xy(y2, "y"),
                                 fill=theme.ACCENT, width=max(1, round(p.scale * 2.5)))
        for index, point in enumerate(points):
            if point:
                px, py = point
                self.create_oval(p.xy(px - 3), p.xy(py - 3, "y"), p.xy(px + 3), p.xy(py + 3, "y"),
                                 fill=theme.ACCENT, outline=theme.BG)
                label_y = py + 10 if py - 16 < y else py - 9
                anchor = 'n' if label_y > py else 's'
                # Keep endpoint text inside card and separate from the title.
                label_x = min(x + w - 7, max(x + 7, px))
                p.text(round(label_x), round(label_y), fmt_number(values[index]), 10,
                       theme.TEXT, 'bold', anchor=anchor)
                self.addtag_withtag('chart-value', self.find_all()[-1])
            elif tracking and not tracking[index]:
                px = x + w * index / denominator
                self.create_line(p.xy(px), p.xy(y + h - 2, "y"), p.xy(px), p.xy(y + h + 2, "y"),
                                 fill=theme.SUBTLE, width=max(1, round(p.scale)))

    def _draw_actions(self, p: Painter, s: Snapshot) -> None:
        p.label(40, 635, "Action Required")
        for x, title, value in ((40, 'PENDING PHOTOS', s.pending_photos),
                                (222, 'OPEN WORK', s.open_work)):
            alert = value is not None and value >= 1
            self._card(p, x, 660, 170, 95, alert=alert)
            p.text(x + 12, 671, title, 11, ALERT if alert else theme.MUTED, 'bold')
            p.text(x + 12, 689, fmt_number(value), 32, ALERT if alert else theme.TEXT, 'bold')
            detail = 'Needs attention' if alert else 'All clear' if value == 0 else 'Unavailable'
            p.text(x + 12, 736, detail, 10, theme.MUTED)

    def _draw_activity(self, p: Painter, s: Snapshot, now: datetime) -> None:
        x, w = 412, 658
        p.label(x, 611, 'Recent Activity')
        self._card(p, x, 636, w, 214, fill=theme.PANEL)
        # Ten rows on normal wall displays; preserve readable type at 800x480.
        visible = 6 if p.scale < .7 else 10
        row_h = 174 / visible
        for column, (key, heading) in enumerate((('logins', 'RECENT LOGINS'), ('ratings', 'RECENT RATINGS'))):
            left = x + 14 + column * 330
            p.text(left, 646, heading, 10, theme.SUBTLE, 'bold')
            rows = s.recent_activity.get(key, ())
            if not rows:
                p.text(left, 683, 'No recent activity', 12, theme.MUTED)
            for index, row in enumerate(rows[:visible]):
                y = 670 + index * row_h
                name = safe_display(row.get('display_name') if key == 'logins' else row.get('destination_name'), 'User' if key == 'logins' else 'Restaurant')
                name = self._fit_text(p, name, 202, 12)
                p.text(left, round(y), name, 12, theme.TEXT)
                moment = parse_datetime(row.get('occurred_at') if key == 'logins' else row.get('created_at'))
                p.text(left + 300, round(y), relative_time(moment, now), 11, theme.MUTED, anchor='ne')
                self.create_line(p.xy(left), p.xy(y + row_h - 3, 'y'),
                                 p.xy(left + 300), p.xy(y + row_h - 3, 'y'), fill=theme.BORDER)

    @staticmethod
    def _fit_text(p: Painter, text: str, width: int, size: int) -> str:
        original = text
        while text and Dashboard._text_size(p, text + ('…' if text != original else ''), size)[0] > p.xy(width):
            text = text[:-1]
        return text + ('…' if text != original else '')

    @staticmethod
    def _text_size(p, text, size, weight='normal'):
        # Measure the actual Canvas font. Named Font metrics round differently
        # on Windows DPI-aware displays when the requested family falls back.
        item = p.canvas.create_text(0, 0, text=text, font=p.font(size, weight), anchor='nw')
        box = p.canvas.bbox(item)
        p.canvas.delete(item)
        return (box[2] - box[0], box[3] - box[1]) if box else (0, 0)

    def _draw_sauce(self, p: Painter) -> None:
        # Small fixed-seed primitives restricted to outer gutters, behind content.
        rng = random.Random('buffago-command-center')
        for index in range(8):
            x = rng.uniform(8, 21) if index < 4 else rng.uniform(1580, 1592)
            y = rng.uniform(96, 850)
            radius = rng.uniform(3, 7)
            color = rng.choice(('#60331E', '#70341E', '#58301D'))
            self.create_oval(p.xy(x-radius), p.xy(y-radius,'y'), p.xy(x+radius), p.xy(y+radius,'y'),
                             fill=color, outline='', tags='sauce')
            if index in (1, 6):
                self.create_line(p.xy(x), p.xy(y,'y'), p.xy(x+1), p.xy(y+17,'y'),
                                 fill=color, width=max(2, round(p.scale*3)), capstyle='round', tags='sauce')

    def _draw_growth_engine(self, p: Painter, s: Snapshot, now: datetime) -> None:
        x, w = 1100, 460
        p.label(x, 91, "Growth Engine")
        p.text(x, 109, "Distribution is the growth lever.", 11, theme.MUTED)
        score = s.marketing
        self._card(p, x, 132, w, 148, fill=theme.SCORE_SURFACE, outline=theme.BORDER)
        p.text(x + 20, 146, "MARKETING SCORE", 10, theme.MUTED, "bold")
        p.text(x + 20, 164, f"{score.score}", 54, theme.ACCENT, "bold")
        p.text(x + 106, 199, "/100", 14, theme.SUBTLE, "bold")
        conf = f"{score.confidence.upper()} CONFIDENCE"
        self._card(p, x + w - 170, 150, 150, 25, fill="#2D2A23", outline="#3A352B")
        p.text(x + w - 95, 155, conf, 8, theme.MUTED, "bold", anchor="n")
        p.text(x + 20, 247, "MAU  •  Devices  •  Ratings  •  Accounts", 10, theme.MUTED)

        self._card(p, x, 292, w, 62, fill=theme.PANEL)
        p.text(x + 16, 302, "WHY THIS SCORE", 9, theme.SUBTLE, "bold")
        tracked_months = sum(1 for point in s.monthly_history if point.app_open_tracking_available)
        available = [(key, value) for key, value in score.factors.items() if value is not None]
        weakest = min(available, key=lambda pair: pair[1])[0] if available else "mau"
        weakness_label = {"mau": "MAU momentum", "acquisition": "device acquisition",
                          "engagement": "ratings engagement", "account_growth": "account growth"}.get(weakest, "MAU momentum")
        coverage = f"App-open tracking covers {tracked_months} months." if tracked_months else "App-open tracking is limited."
        explanation = f"{coverage} {weakness_label.capitalize()} is the biggest current weakness."
        p.text(x + 16, 321, explanation, 11, theme.MUTED, width=w - 32)

        plan = s.marketing_weekly_goal
        self._card(p, x, 366, w, 484, fill=theme.PANEL, outline=theme.BORDER)
        p.label(x + 16, 379, 'Marketing Weekly Goal')
        week = plan.get('week_start')
        p.text(x + w - 16, 402, f"Week of {week}" if week else 'Awaiting weekly snapshot',
               9, theme.SUBTLE, anchor='ne')
        fallback = {'goal': 'Establish a measurable external-user growth baseline.',
                    'next_step': 'Verify the new weekly snapshot is available.',
                    'what_to_do': 'Check external mobile opens and ratings before selecting a campaign.',
                    'expected_result': 'A verified baseline and one measurable weekly plan.',
                    'timeline': 'Launch Monday. Check Wednesday. Review Sunday.',
                    'why': 'A weekly plan will appear after the backend update.'}
        sections = [('WEEKLY GOAL', 'goal', 426, 14, theme.TEXT),
                    ('NEXT STEP', 'next_step', 490, 13, theme.ACCENT),
                    ('WHAT TO DO', 'what_to_do', 545, 12, theme.TEXT),
                    ('EXPECTED RESULT', 'expected_result', 639, 12, theme.TEXT),
                    ('TIMELINE', 'timeline', 710, 12, theme.MUTED),
                    ('WHY', 'why', 768, 11, theme.MUTED)]
        for label, key, y, size, color in sections:
            p.text(x + 16, y, label, 9, theme.SUBTLE, 'bold')
            text = plan.get(key) or fallback[key]
            # Text is measured into a fixed area; full copy is retained in the snapshot.
            available = {'goal': 48, 'next_step': 32, 'what_to_do': 72,
                         'expected_result': 48, 'timeline': 36, 'why': 53}[key]
            self._flow_text(p, x + 16, y + 16, text, w - 32, available, size, color,
                            'bold' if key in ('goal', 'next_step') else 'normal')

    def _flow_text(self, p, x, y, text, width, height, size, color, weight='normal'):
        lines, line = [], ''
        for word in safe_display(text, 'Details unavailable').split():
            candidate = (line + ' ' + word).strip()
            if line and self._text_size(p, candidate, size, weight)[0] > p.xy(width):
                lines.append(line)
                line = word
            else:
                line = candidate
        if line:
            lines.append(line)
        step = max(self._text_size(p, 'Ag', size, weight)[1] + 2, round(15 * p.sy))
        limit = max(1, int(p.xy(height, 'y') // step))
        if len(lines) > limit:
            lines = lines[:limit]
            lines[-1] = self._fit_text(p, lines[-1] + ' …', width - 8, size)
        for index, value in enumerate(lines):
            p.text(x, y + index * step / p.sy, value, size, color, weight)

    @staticmethod
    def _factor(score: MarketingScore, key: str) -> str:
        value = score.factors.get(key)
        return "—" if value is None else str(value)

    @staticmethod
    def _metric_label(value: str | None) -> str:
        if value == "mau_30d":
            return "Rolling 30-day MAU"
        return (value or "Target").replace("_", " ").capitalize()

    @staticmethod
    def _recommendations(s: Snapshot, score: MarketingScore, experiment: Any,
                         photos: int | float, work: int | float) -> list[str]:
        result = []
        if photos >= 1:
            result.append(f"Review {fmt_number(photos)} pending photo submissions.")
        if work >= 1:
            result.append(f"Clear {fmt_number(work)} open operations work item(s).")
        order = sorted(((value, key) for key, value in score.factors.items() if value is not None))
        mapping = {"acquisition": "Run one trackable acquisition campaign.",
                   "mau": "Improve return activity from recent visitors.",
                   "engagement": "Re-engage users to create restaurant ratings.",
                   "account_growth": "Improve account conversion from device opens."}
        for _, key in order:
            item = mapping[key]
            if item not in result:
                result.append(item)
            if len(result) >= 3:
                break
        if experiment and len(result) < 3:
            result.append(f"Measure progress on {experiment.title}.")
        return result[:3]

    @staticmethod
    def _age(moment: datetime | None, now: datetime) -> str:
        if not moment:
            return "No snapshot yet"
        minutes = max(0, int((now - moment).total_seconds() // 60))
        return "Updated just now" if minutes < 1 else f"Updated {minutes}m ago" if minutes < 60 else f"Updated {minutes // 60}h ago"

    def render(self) -> None:
        if self._resize_job:
            self.after_cancel(self._resize_job)
        self._resize_job = None
        width, height = max(800, self.winfo_width()), max(480, self.winfo_height())
        self.delete("all")
        p = Painter(self, width, height)
        s = self.snapshot or Snapshot()
        now = _utc_now()
        self._draw_sauce(p)
        self._draw_header(p, width, now)
        self._draw_tiles(p, s)
        self._draw_charts(p, s.monthly_history)
        self._draw_actions(p, s)
        self._draw_activity(p, s, now)
        self._draw_growth_engine(p, s, now)
