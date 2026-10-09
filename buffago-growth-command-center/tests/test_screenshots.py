"""Tk layout and screenshot checks for the three supported kiosk sizes."""
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
import tkinter as tk
import unittest
from unittest.mock import patch

from models import Snapshot
from ui import dashboard as dashboard_module
from models import MonthlyPoint
from ui.dashboard import Dashboard, _active_insight, _display_history, _fallback_move, _month_label, _month_label_indexes


BASE = Path(__file__).parents[1]


class DashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        cls.root = tk.Tk()
        cls.root.overrideredirect(True)
        cls.root.attributes("-topmost", True)
        cls.dashboard = Dashboard(cls.root)
        cls.demo = json.loads((BASE / "data/demo_snapshot.json").read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.root.destroy()

    def render(self, width=1280, height=720):
        self.root.geometry(f"{width}x{height}+0+0")
        self.root.update()
        with patch.object(dashboard_module, '_utc_now') as clock:
            clock.return_value = datetime(2026, 10, 8, 17, 0, tzinfo=timezone.utc)
            self.dashboard.update_data(Snapshot.from_payload(self.demo), {}, datetime(2026,10,8,17,0,tzinfo=timezone.utc), False, 'LIVE')
        self.root.update()
        return [self.dashboard.itemcget(item, "text") for item in self.dashboard.find_all()
                if self.dashboard.type(item) == "text"]

    def test_brand_assets_are_self_contained(self):
        self.assertEqual(dashboard_module.ASSET_DIR, BASE / "assets")
        self.assertTrue((BASE / "assets/icon.png").is_file())
        self.assertTrue((BASE / "assets/wing-user.png").is_file())
        self.assertEqual(set(self.dashboard._images), {"logo", "mascot"})

    def test_mission_controls_and_narrow_details(self):
        import tempfile
        from missions import MissionStore, eastern_day
        from ui.mission_panel import open_mission
        with tempfile.TemporaryDirectory() as folder:
            original = self.dashboard.mission_store
            self.dashboard.mission_store = MissionStore(Path(folder) / 'missions.json')
            try:
                texts = self.render()
                self.assertIn("MARKETING WEEKLY GOAL", texts)
                open_mission(self.dashboard)
                self.root.update()
                window = next(w for w in self.dashboard.winfo_children() if isinstance(w, tk.Toplevel))
                window.geometry('360x640')
                self.root.update()
                def descendants(widget):
                    return [child for direct in widget.winfo_children() for child in [direct, *descendants(direct)]]
                widgets = descendants(window)
                text = next(w for w in widgets if isinstance(w, tk.Text)).get('1.0', 'end')
                self.assertIn('America/New_York', text)
                self.assertIn('Create it manually', text)
                self.assertIn('Evaluate', text)
                next(w for w in widgets if isinstance(w, tk.Checkbutton) and w.cget('text') == 'Instagram').invoke()
                next(w for w in widgets if isinstance(w, tk.Button) and w.cget('text') == 'Mark as Posted').invoke()
                self.root.update()
                self.assertEqual(self.dashboard.mission_store.records()[eastern_day().isoformat()]['platforms'], ['Instagram'])
                window = next(w for w in self.dashboard.winfo_children() if isinstance(w, tk.Toplevel))
                window.geometry('360x640')
                widgets = descendants(window)
                next(w for w in widgets if isinstance(w, tk.Button) and w.cget('text') == 'Weekly overview ▾').invoke()
                self.assertTrue(any('Pending' in w.get('1.0', 'end') for w in descendants(window) if isinstance(w, tk.Text)))
                try:
                    from PIL import ImageGrab
                    output = BASE / 'artifacts/marketing-missions'
                    output.mkdir(parents=True, exist_ok=True)
                    self.root.update()
                    import time
                    time.sleep(0.4)  # Let the Windows compositor finish its window transition.
                    window.update()
                    left, top = window.winfo_rootx(), window.winfo_rooty()
                    ImageGrab.grab(bbox=(left, top, left+window.winfo_width(), top+window.winfo_height())).save(output / 'mission-details.png')
                except ImportError:
                    pass
                next(w for w in widgets if isinstance(w, tk.Button) and w.cget('text') == 'Undo').invoke()
                self.assertEqual(self.dashboard.mission_store.records(), {})
            finally:
                for widget in self.dashboard.winfo_children():
                    if isinstance(widget, tk.Toplevel):
                        widget.destroy()
                self.dashboard.mission_store = original

    def test_missing_brand_images_are_optional(self):
        with patch.object(dashboard_module, "ASSET_DIR", BASE / "assets-missing"):
            dashboard = Dashboard(self.root)
        try:
            self.assertEqual(dashboard._images, {})
            dashboard.update_data(Snapshot.from_payload(self.demo), {}, None, False, "LIVE")
            self.root.update()
            self.assertTrue(any(dashboard.itemcget(item, "text") == "BUFFAGO COMMAND CENTER"
                                for item in dashboard.find_all() if dashboard.type(item) == "text"))
        finally:
            dashboard.destroy()

    def test_title_is_geometrically_centered_at_each_resolution(self):
        for size in ((800, 480), (1280, 720), (1600, 900)):
            with self.subTest(size=size):
                self.render(*size)
                item = next(item for item in self.dashboard.find_all()
                            if self.dashboard.type(item) == "text" and
                            self.dashboard.itemcget(item, "text") == "BUFFAGO COMMAND CENTER")
                title_x = self.dashboard.coords(item)[0]
                self.assertAlmostEqual(title_x, size[0] / 2, delta=1)

    def test_growth_engine_content_and_expiration(self):
        texts = self.render()
        for expected in ('MARKETING SCORE', 'WHY THIS SCORE', 'MARKETING WEEKLY GOAL',
                         'WEEKLY GOAL', 'NEXT STEP', 'WHAT TO DO', 'EXPECTED RESULT', 'TIMELINE', 'WHY'):
            self.assertIn(expected, texts)
        for removed in ('CURRENT GOAL', 'RECOMMENDED STEPS', 'MARKETING INSIGHT'):
            self.assertNotIn(removed, texts)
        self.assertIn("Launch one measurable acquisition test.", _fallback_move(Snapshot.from_payload({}).marketing))
        expired = Snapshot.from_payload({"growth_os": {"marketing_insight": {
            "title": "Expired", "body": "Old copy", "expires_at": "2026-10-01T00:00:00Z"}}}).growth_os.marketing_insight
        self.assertIsNone(_active_insight(expired, datetime(2026, 10, 8, tzinfo=timezone.utc)))
        self.assertIsNone(Snapshot.from_payload({}).growth_os.marketing_insight)

    def test_monthly_charts_start_at_first_instrumented_month_and_expand(self):
        points = Snapshot.from_payload(self.demo).monthly_history
        shown = _display_history(points)
        self.assertEqual(shown[0].month, date(2026, 6, 1))
        self.assertEqual(shown[-1].month, date(2026, 10, 1))
        self.assertEqual([point.month for point in shown], [point.month for point in points if point.month >= date(2026, 6, 1)])

        later = MonthlyPoint(date(2027, 1, 1), 15, 48, 38, 6, True)
        expanded = _display_history((*points, later))
        self.assertEqual(expanded[-1].month, date(2027, 1, 1))
        indexes = _month_label_indexes(len(expanded))
        self.assertEqual(min(indexes), 0)
        self.assertEqual(max(indexes), len(expanded) - 1)
        self.assertEqual(len(indexes), 6)

    def test_yyyy_mm_history_flows_to_charts_without_awaiting_data(self):
        payload = json.loads(json.dumps(self.demo))
        payload["product_pulse"]["monthly_history"] = [
            {"month": f"2026-{month:02}", "mau": month * 10,
             "unique_devices": month * 5, "wing_ratings": month * 3,
             "new_accounts": month, "app_open_tracking_available": True}
            for month in range(6, 11)
        ]
        points = Snapshot.from_payload(payload).monthly_history
        shown = _display_history(points)
        self.assertEqual(len(shown), 5)
        self.assertEqual(shown[0].month, date(2026, 6, 1))
        self.assertEqual(_month_label(shown[0].month, "PREV"), "JUN")
        self.assertEqual(_month_label("2026-06", "PREV"), "JUN")
        self.assertEqual(_month_label("2026-06-01", "PREV"), "JUN")
        self.dashboard.update_data(Snapshot.from_payload(payload), {}, datetime.now(timezone.utc), False, "LIVE")
        self.root.update()
        texts = [self.dashboard.itemcget(item, "text") for item in self.dashboard.find_all()
                 if self.dashboard.type(item) == "text"]
        self.assertNotIn("AWAITING DATA", texts)
        self.assertIn("Jun", texts)
        self.assertIn("Oct", texts)

    def test_charts_hide_uninstrumented_months_before_tracking_begins(self):
        texts = self.render()
        self.assertIn("MONTHLY GROWTH TRENDS", texts)
        self.assertIn("Jun", texts)
        self.assertIn("Oct", texts)
        for hidden in ("NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"):
            self.assertNotIn(hidden, texts)

    def test_missing_growth_os_items_get_derived_next_step_without_fake_content(self):
        empty = json.loads(json.dumps(self.demo))
        empty["growth_os"] = {}
        empty.pop("marketing", None)
        self.root.geometry("1280x720+0+0")
        self.root.update()
        self.dashboard.update_data(Snapshot.from_payload(empty), {}, None, False, "LIVE")
        self.root.update()
        texts = [self.dashboard.itemcget(item, "text") for item in self.dashboard.find_all()
                 if self.dashboard.type(item) == "text"]
        self.assertIn("MARKETING WEEKLY GOAL", texts)

    def test_action_tiles_use_static_red_alert_state(self):
        self.render()
        fills = [self.dashboard.itemcget(item, "fill") for item in self.dashboard.find_all()
                 if self.dashboard.type(item) == "rectangle"]
        outlines = [self.dashboard.itemcget(item, "outline") for item in self.dashboard.find_all()
                    if self.dashboard.type(item) == "rectangle"]
        self.assertIn(dashboard_module.ALERT_BG, fills)
        self.assertIn(dashboard_module.ALERT, outlines)

    def test_zero_action_counts_use_normal_tile_style(self):
        empty = json.loads(json.dumps(self.demo))
        empty["product_pulse"]["pending_photos"] = {"total": 0}
        empty["product_pulse"]["open_work"] = {"total": 0}
        self.root.geometry("1280x720+0+0")
        self.root.update()
        self.dashboard.update_data(Snapshot.from_payload(empty), {}, None, False, "LIVE")
        self.root.update()
        fills = [self.dashboard.itemcget(item, "fill") for item in self.dashboard.find_all()
                 if self.dashboard.type(item) == "rectangle"]
        outlines = [self.dashboard.itemcget(item, "outline") for item in self.dashboard.find_all()
                    if self.dashboard.type(item) == "rectangle"]
        self.assertNotIn(dashboard_module.ALERT_BG, fills)
        self.assertNotIn(dashboard_module.ALERT, outlines)

    def test_dashboard_fits_and_captures_supported_displays(self):
        try:
            from PIL import ImageGrab
        except ImportError:
            self.skipTest("Pillow is only required for developer screenshot capture")
        output = BASE / "artifacts/operations-redesign"
        output.mkdir(parents=True, exist_ok=True)
        for width, height in ((800, 480), (1280, 720), (1600, 900)):
            with self.subTest(size=(width, height)):
                texts = self.render(width, height)
                for title in ("Unique Device Opens", "Last 24 Hours", "Total Wing Ratings",
                              "Total Restaurants", "Total Users Created", "Monthly MAU", "Unique Mobile Devices",
                              "Wing Ratings", "New Accounts", "Jun", "Oct",
                              "PENDING PHOTOS", "OPEN WORK", "MARKETING SCORE",
                              "Growth & Business Health", "MONTHLY GROWTH TRENDS"):
                    self.assertIn(title, texts)
                self.assertEqual(sum(text == "App-open tracking began in Jun 2026" for text in texts), 1)
                self.assertNotIn("AWAITING DATA", texts)
                self.assertNotIn("BLANK = TRACKING NOT AVAILABLE", texts)
                for item in self.dashboard.find_all():
                    box = self.dashboard.bbox(item)
                    if box:
                        self.assertGreaterEqual(box[0], 0)
                        self.assertGreaterEqual(box[1], 0)
                        self.assertLessEqual(box[2], width)
                        self.assertLessEqual(box[3], height)
                self.root.lift()
                self.root.update()
                left, top = self.root.winfo_rootx(), self.root.winfo_rooty()
                ImageGrab.grab(bbox=(left, top, left + width, top + height)).save(
                    output / f"buffago-growth-{width}x{height}.png")


if __name__ == "__main__":
    unittest.main()
