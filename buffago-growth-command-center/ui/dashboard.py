"""Responsive, redraw-on-change Tkinter dashboard."""

from __future__ import annotations

import tkinter as tk
from datetime import datetime, timezone
from typing import Any

from models import GrowthExperiment, GrowthMetric, Snapshot, fmt_number, format_growth_change
from ui import theme
from ui.components import Painter, sparkline_segments


def _rating(value: Any, count: Any) -> tuple[str, str]:
    if value is None:
        return "—", "Awaiting store data"
    count_text = f"{fmt_number(count)} ratings" if count is not None else "Rating count unavailable"
    return f"{float(value):.1f} ★", count_text


def _age(moment: datetime | None, now: datetime) -> str:
    if not moment:
        return "Never updated"
    minutes = max(0, int((now - moment).total_seconds() // 60))
    if minutes < 1:
        return "Updated just now"
    if minutes < 60:
        return f"Last updated {minutes} min ago"
    return f"Last updated {minutes // 60}h {minutes % 60}m ago"


class Dashboard(tk.Canvas):
    def __init__(self, master: tk.Misc):
        super().__init__(master, bg=theme.BG, highlightthickness=0)
        self.pack(fill="both", expand=True)
        self.snapshot: Snapshot | None = None
        self.local: dict[str, Any] = {}
        self.last_success: datetime | None = None
        self.stale = False
        self.status = "STARTING"
        self.bind("<Configure>", self._on_resize)
        self._resize_job: str | None = None

    def _on_resize(self, _event: tk.Event) -> None:
        if self._resize_job:
            self.after_cancel(self._resize_job)
        self._resize_job = self.after(80, self.render)

    def update_data(self, snapshot: Snapshot | None, local: dict[str, Any],
                    last_success: datetime | None, stale: bool, status: str) -> None:
        self.snapshot, self.local, self.last_success = snapshot, local, last_success
        self.stale, self.status = stale, status
        self.render()

    def render(self) -> None:
        self._resize_job = None
        width, height = max(800, self.winfo_width()), max(450, self.winfo_height())
        self.delete("all")
        p = Painter(self, width, height)
        s = self.snapshot or Snapshot()
        now = datetime.now(timezone.utc)

        p.text(48, 30, "BUFFAGO", 14, theme.ACCENT, "bold")
        p.text(48, 54, "Growth Command Center", 28, theme.TEXT, "bold")
        p.text(1550, 41, _age(self.last_success, now), 13, theme.MUTED, anchor="ne")
        if self.stale:
            stale_status = self.status if self.status.startswith("AUTH") else "STALE · USING LAST GOOD DATA"
            p.text(1550, 64, stale_status, 11, theme.ACCENT, "bold", anchor="ne")
        elif self.status:
            p.text(1550, 64, self.status, 11, theme.SUBTLE, "bold", anchor="ne")
        self.create_line(p.xy(800), p.xy(112, "y"), p.xy(800), p.xy(856, "y"), fill=theme.BORDER)

        p.label(48, 112, "Product Pulse")
        p.text(48, 134, "How Buffago is doing", 17, theme.MUTED)
        p.box(48, 180, 412, 310, fill=theme.PANEL_ALT)
        p.metric(72, 204, "Total Downloads", fmt_number(s.downloads_total),
                 f"iOS: {fmt_number(s.ios.downloads_total)}    Android: {fmt_number(s.android.downloads_total)}")
        p.box(430, 180, 752, 310, fill=theme.PANEL_ALT)
        p.metric(454, 204, "Total Wing Ratings", fmt_number(s.wing_total), "All-time community ratings")

        metric_boxes = [
            (48, "Downloads", fmt_number(s.downloads_daily), "Last 24h · stores", s.downloads_direction),
            (230, "Wing Ratings", fmt_number(s.wing.current), "Last 24h · prior period", s.wing.direction),
            (412, "Unique Users", fmt_number(s.users.current), "Last 24h · all users", s.users.direction),
            (594, "Open Feedback", fmt_number(s.feedback_open),
             self._feedback_detail(s, now), None),
        ]
        for x, title, value, detail, direction in metric_boxes:
            p.box(x, 330, x + 158, 485)
            p.metric(x + 18, 354, title, value, detail, direction)

        p.label(48, 522, "Store Health")
        ios_rating, ios_detail = _rating(s.ios.store_rating, s.ios.store_rating_count)
        android_rating, android_detail = _rating(s.android.store_rating, s.android.store_rating_count)
        p.box(48, 552, 392, 675)
        p.metric(72, 576, "App Store", ios_rating, ios_detail)
        p.box(408, 552, 752, 675)
        p.metric(432, 576, "Google Play", android_rating, android_detail)
        p.box(48, 696, 752, 830, fill="#0D1218")
        p.text(72, 720, "PRODUCT SIGNAL", 11, theme.ACCENT, "bold")
        p.text(72, 748, self._product_signal(s), 18, theme.TEXT, "bold", width=640)
        p.text(72, 788, "The product pulse stays useful while store collectors come online.", 13, theme.MUTED)

        p.label(848, 112, "Growth Engine")
        p.text(848, 134, "What to do next", 17, theme.MUTED)
        p.box(848, 180, 1552, 390)
        p.label(872, 200, "7-Day Pulse")
        downloads = s.growth_downloads.combined
        pulse = (
            (872, "Downloads", downloads, "Awaiting store data"),
            (1038, "Active Users", s.growth_users, "Awaiting history"),
            (1204, "Wing Ratings", s.growth_wing, "Awaiting history"),
            (1370, "New Users", s.growth_new_users, "Awaiting history"),
        )
        for x, title, metric, empty_text in pulse:
            self._growth_metric(p, x, 230, title, metric, empty_text)
        self._draw_history(p, s)

        growth_os = s.growth_os.with_local_fallbacks(self.local)
        experiment = growth_os.current_experiment
        p.box(848, 412, 1262, 650, fill=theme.ACCENT_SOFT, outline=theme.ACCENT)
        p.label(876, 436, "Current Experiment")
        p.text(876, 467, experiment.title if experiment else "No active experiment",
               21, theme.TEXT, "bold", width=354)
        if experiment and experiment.hypothesis:
            p.text(876, 515, experiment.hypothesis, 13, "#C9BBA8", width=354)
        if experiment:
            self._draw_experiment_progress(p, experiment)

        move = growth_os.todays_move
        p.box(1280, 412, 1552, 650, fill=theme.PANEL_ALT, outline=theme.ACCENT)
        p.label(1308, 436, "Today's Move")
        if move and move.status in {"done", "skipped"}:
            p.text(1524, 436, "COMPLETE" if move.status == "done" else "SKIPPED",
                   10, theme.SUBTLE, "bold", anchor="ne")
        p.text(1308, 471, move.title if move else "Choose one focused growth action.",
               19, theme.TEXT, "bold", width=216)
        why = move.why_it_matters if move else "One clear move creates momentum."
        if why:
            p.text(1308, 548, "WHY THIS MATTERS", 10, theme.SUBTLE, "bold")
            p.text(1308, 568, why, 12, theme.MUTED, width=216)

        p.box(848, 672, 1174, 830)
        p.label(876, 696, "Founder Balance · 7D")
        balance = growth_os.founder_balance_7d
        rows = (("Product", balance.product if balance and balance.tracked else None),
                ("Growth", balance.growth if balance and balance.tracked else None),
                ("Customers", balance.customer if balance and balance.tracked else None))
        for index, (label, value) in enumerate(rows):
            y = 733 + index * 29
            p.text(876, y, label, 12, theme.MUTED)
            p.text(1144, y, fmt_number(value) if value is not None else "Not yet tracked",
                   12, theme.TEXT if value is not None else theme.SUBTLE, "bold", anchor="ne")

        insight = growth_os.marketing_insight
        p.box(1192, 672, 1552, 830)
        p.label(1220, 696, "Marketing Insight")
        p.text(1220, 728, insight.title if insight and insight.title else "No current insight",
               17, theme.TEXT, "bold", width=304)
        body = insight.body if insight and insight.body else "Jalapeno recommendations will appear here."
        p.text(1220, 768, body, 11, theme.MUTED, width=304)
        if insight and insight.source:
            p.text(1524, 808, insight.source.upper(), 9, theme.SUBTLE, "bold", anchor="ne")

    @staticmethod
    def _draw_experiment_progress(p: Painter, experiment: GrowthExperiment) -> None:
        if experiment.has_progress:
            unit = f" {experiment.unit}" if experiment.unit else ""
            p.text(876, 568,
                   f"{fmt_number(experiment.current_value)} / {fmt_number(experiment.target_value)}{unit}",
                   14, theme.TEXT, "bold")
            percent = experiment.calculated_progress_pct
            if percent is not None:
                filled = min(12, max(0, round(percent * 12 / 100)))
                bar = "█" * filled + "░" * (12 - filled)
                p.text(876, 594, f"{bar}  {percent:.0f}%", 13, theme.ACCENT, "bold")
        elif experiment.legacy_progress:
            p.text(876, 578, experiment.legacy_progress, 14, theme.TEXT, "bold", width=250)
        if experiment.schedule_available and experiment.day_number is not None and experiment.duration_days:
            p.text(1230, 620,
                   f"Day {fmt_number(experiment.day_number)} / {fmt_number(experiment.duration_days)}",
                   11, theme.ACCENT, "bold", anchor="ne")

    @staticmethod
    def _growth_metric(p: Painter, x: int, y: int, title: str,
                       metric: GrowthMetric | None, empty_text: str) -> None:
        p.label(x, y, title)
        if metric is None or metric.current is None:
            p.text(x, y + 29, empty_text, 13, theme.MUTED, "bold", width=145)
            return
        p.text(x, y + 25, fmt_number(metric.current), 29, theme.TEXT, "bold")
        prior = fmt_number(metric.previous) if metric.previous is not None else "—"
        p.text(x, y + 61, f"vs {prior} prior 7d", 11, theme.MUTED)
        change = format_growth_change(metric)
        color = theme.UP if change.startswith("↑") else theme.DOWN if change.startswith("↓") else theme.FLAT
        p.text(x, y + 83, change, 13, color, "bold")

    def _draw_history(self, p: Painter, snapshot: Snapshot) -> None:
        values = [point.active_users for point in snapshot.history]
        segments = sparkline_segments(values, 872, 344, 1518, 371)
        download_status = "DOWNLOAD HISTORY · CONNECTED" if snapshot.has_download_history else "Awaiting store history"
        p.text(1518, 326, download_status, 10, theme.SUBTLE, "bold", anchor="ne")
        if not segments:
            p.text(872, 347, "Awaiting 14-day activity history", 11, theme.SUBTLE)
            return
        p.text(872, 326, "ACTIVE USERS · 14 DAYS", 10, theme.SUBTLE, "bold")
        for segment in segments:
            if len(segment) == 1:
                x, y = segment[0]
                self.create_oval(p.xy(x - 2), p.xy(y - 2, "y"), p.xy(x + 2), p.xy(y + 2, "y"),
                                 fill=theme.ACCENT, outline="")
            else:
                coordinates = []
                for x, y in segment:
                    coordinates.extend((p.xy(x), p.xy(y, "y")))
                self.create_line(*coordinates, fill=theme.ACCENT, width=max(1, int(2 * p.scale)))
        if snapshot.history:
            oldest, newest = snapshot.history[0].day, snapshot.history[-1].day
            p.text(872, 373, f"{oldest.strftime('%b')} {oldest.day}", 9, theme.SUBTLE)
            p.text(1518, 373, f"{newest.strftime('%b')} {newest.day}", 9, theme.SUBTLE, anchor="ne")

    @staticmethod
    def _feedback_detail(snapshot: Snapshot, now: datetime) -> str:
        bits = []
        if snapshot.feedback_new is not None:
            bits.append(f"{fmt_number(snapshot.feedback_new)} new")
        age = snapshot.oldest_feedback_age(now)
        if age:
            bits.append(f"oldest {age}")
        return " · ".join(bits) or "Inbox clear"

    @staticmethod
    def _product_signal(snapshot: Snapshot) -> str:
        if snapshot.users.current is None and snapshot.wing.current is None:
            return "Waiting for the first live product snapshot."
        if (snapshot.users.current or 0) == 0:
            return "User activity is quiet. Today’s growth move deserves focus."
        if (snapshot.wing.current or 0) > 0:
            return "People are active and contributing ratings."
        return "People are opening Buffago; encourage the next wing rating."
