import unittest
from datetime import datetime, timezone

from models import GrowthMetric, Snapshot, combined_value, direction_arrow, format_growth_change
from ui.components import sparkline_segments


class ModelTests(unittest.TestCase):
    def test_arrow_direction_logic(self):
        self.assertEqual(direction_arrow("up"), "↑")
        self.assertEqual(direction_arrow("down"), "↓")
        self.assertEqual(direction_arrow(None, 0), "→")

    def test_combined_download_total(self):
        self.assertEqual(combined_value(10, 20), 30)
        self.assertEqual(combined_value(None, 20), 20)
        self.assertIsNone(combined_value(None, None))

    def test_null_store_metrics(self):
        snapshot = Snapshot.from_payload({"product_pulse": {"store": {"ios": None}}})
        self.assertIsNone(snapshot.downloads_total)
        self.assertIsNone(snapshot.ios.store_rating)

    def test_optional_fields_do_not_crash(self):
        snapshot = Snapshot.from_payload({})
        self.assertIsNone(snapshot.wing_total)
        self.assertEqual(snapshot.wing.direction, "flat")

    def test_feedback_age(self):
        snapshot = Snapshot.from_payload({"product_pulse": {"feedback": {"oldest_open_at": "2026-01-01T00:00:00Z"}}})
        self.assertEqual(snapshot.oldest_feedback_age(datetime(2026, 1, 3, tzinfo=timezone.utc)), "2d old")

    def test_parses_growth_7d(self):
        snapshot = Snapshot.from_payload({"growth_7d": {
            "active_users": {"current": 3, "previous": 1, "change_pct": 200, "direction": "up"},
            "wing_ratings": {"current": 1, "previous": 0, "change_pct": None, "direction": "up"},
            "new_users": {"current": 0, "previous": 0, "change_pct": None, "direction": "flat"},
        }})
        self.assertEqual(snapshot.growth_users.current, 3)
        self.assertEqual(snapshot.growth_wing.previous, 0)
        self.assertEqual(snapshot.growth_new_users.direction, "flat")

    def test_parses_history_14d(self):
        snapshot = Snapshot.from_payload({"history_14d": [
            {"date": "2026-09-23", "active_users": 3, "wing_ratings": 1,
             "ios_downloads": 2, "android_downloads": 4}
        ]})
        self.assertEqual(len(snapshot.history), 1)
        self.assertEqual(snapshot.history[0].active_users, 3)
        self.assertEqual(snapshot.history[0].downloads, 6)

    def test_old_cached_payload_without_growth_fields(self):
        snapshot = Snapshot.from_payload({"product_pulse": {"wing_ratings": {"total": 12}}})
        self.assertEqual(snapshot.wing_total, 12)
        self.assertEqual(snapshot.history, ())
        self.assertIsNone(snapshot.growth_users.current)

    def test_growth_change_from_zero(self):
        self.assertEqual(format_growth_change(GrowthMetric(3, 0, None, "up")), "↑ from 0")

    def test_growth_change_zero_vs_zero_is_flat(self):
        self.assertEqual(format_growth_change(GrowthMetric(0, 0, None, "flat")), "→ flat")

    def test_normal_positive_and_negative_percentage(self):
        self.assertEqual(format_growth_change(GrowthMetric(9, 8, 12.4, "up")), "↑ 12.4%")
        self.assertEqual(format_growth_change(GrowthMetric(7, 8, -12.5, "down")), "↓ 12.5%")

    def test_null_download_history_is_not_zero(self):
        snapshot = Snapshot.from_payload({"history_14d": [
            {"date": "2026-09-23", "ios_downloads": None, "android_downloads": 4}
        ]})
        self.assertIsNone(snapshot.history[0].downloads)
        self.assertFalse(snapshot.has_download_history)

    def test_malformed_history_item_is_ignored(self):
        snapshot = Snapshot.from_payload({"history_14d": [None, {}, {"date": "bad"},
                                                             {"date": "2026-09-23", "active_users": 2}]})
        self.assertEqual(len(snapshot.history), 1)

    def test_all_zero_sparkline_is_safe(self):
        segments = sparkline_segments([0] * 14, 0, 0, 100, 20)
        self.assertEqual(len(segments), 1)
        self.assertEqual(len(segments[0]), 14)
        self.assertTrue(all(point[1] == 10 for point in segments[0]))

    def test_partial_growth_payload_does_not_crash(self):
        snapshot = Snapshot.from_payload({"growth_7d": {"active_users": {"current": "NaN"},
                                                         "downloads": {"ios": {"current": 2}}}})
        self.assertIsNone(snapshot.growth_users.current)
        self.assertIsNone(snapshot.growth_downloads.combined)


if __name__ == "__main__":
    unittest.main()
