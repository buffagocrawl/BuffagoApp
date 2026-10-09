import unittest
from datetime import date

from models import (MARKETING_SCORE_WEIGHTS, MonthlyPoint, Snapshot,
                    marketing_score)


def months(values=None):
    values = values or []
    points = []
    for index in range(12):
        year, month_num = 2025 + (index + 10) // 12, (index + 10) % 12 + 1
        tracked = index >= 7
        values_for_month = values[index] if index < len(values) else (0, 0, 0, 0)
        points.append(MonthlyPoint(date(year, month_num, 1),
                                   values_for_month[0] if tracked else None,
                                   values_for_month[1] if tracked else None,
                                   values_for_month[2], values_for_month[3], tracked))
    return points


class MarketingScoreTests(unittest.TestCase):
    def test_monthly_point_accepts_year_month_and_full_date(self):
        for raw, expected in (("2026-06", date(2026, 6, 1)),
                              ("2026-10", date(2026, 10, 1)),
                              ("2026-06-17", date(2026, 6, 1))):
            with self.subTest(raw=raw):
                point = MonthlyPoint.parse({"month": raw})
                self.assertIsNotNone(point)
                self.assertEqual(point.month, expected)

    def test_monthly_history_with_year_month_values_keeps_all_months(self):
        history = [{"month": f"2026-{month:02}", "mau": month * 10,
                    "unique_devices": month * 5, "wing_ratings": month,
                    "new_accounts": month, "app_open_tracking_available": True}
                   for month in range(6, 11)]
        parsed = Snapshot.from_payload({"product_pulse": {"monthly_history": history}}).monthly_history
        self.assertEqual(len(parsed), 5)
        self.assertEqual([point.month for point in parsed], [date(2026, month, 1) for month in range(6, 11)])

    def test_versioned_weights(self):
        self.assertEqual(MARKETING_SCORE_WEIGHTS,
                         {"mau": .40, "acquisition": .25, "engagement": .20, "account_growth": .15})

    def test_deterministic_bounded_and_limited_confidence(self):
        points = months()
        first = marketing_score(points)
        self.assertEqual(first, marketing_score(points))
        self.assertGreaterEqual(first.score, 0)
        self.assertLessEqual(first.score, 100)
        self.assertEqual(first.confidence, "limited")

    def test_untracked_app_open_months_are_ignored_and_true_zero_is_valid(self):
        history = months()
        score = marketing_score(history)
        self.assertEqual(score.factors["mau"], 50)
        self.assertEqual(score.factors["acquisition"], 50)
        self.assertIsNotNone(score.factors["engagement"])
        only_one_tracked = [MonthlyPoint(point.month, point.mau, point.unique_devices,
                                         point.wing_ratings, point.new_accounts,
                                         point.app_open_tracking_available and point.month.month == 10)
                            for point in history]
        self.assertIsNone(marketing_score(only_one_tracked).factors["mau"])
        self.assertEqual(Snapshot.from_payload({"product_pulse": {"monthly_history": [
            {"month": "2026-01-01", "mau": 0, "unique_devices": 0,
             "app_open_tracking_available": False, "wing_ratings": 0, "new_accounts": 0}
        ]}}).monthly_history[0].mau, None)

    def test_true_zero_remains_available(self):
        snapshot = Snapshot.from_payload({"product_pulse": {"monthly_history": [
            {"month": "2026-01-01", "mau": 0, "unique_devices": 0,
             "app_open_tracking_available": True, "wing_ratings": 0, "new_accounts": 0}
        ]}})
        self.assertEqual(snapshot.monthly_history[0].mau, 0)
        self.assertEqual(snapshot.monthly_history[0].unique_devices, 0)

    def test_confidence_thresholds(self):
        for count, expected in ((5, "limited"), (6, "medium"), (8, "medium"), (9, "high")):
            points = [MonthlyPoint(date(2025, index + 1, 1), 1, 1, 1, 1, index < count)
                      for index in range(12)]
            self.assertEqual(marketing_score(points).confidence, expected)

    def test_explanation_calls_out_dominant_positive_and_weak_factor(self):
        points = months()
        changed = []
        for index, point in enumerate(points):
            changed.append(MonthlyPoint(point.month, 2 if index < 10 else 20,
                                        10 if index < 10 else 10,
                                        20 if index < 10 else 0,
                                        3 if index < 10 else 3,
                                        point.app_open_tracking_available))
        result = marketing_score(changed)
        self.assertIn("tracking covers", result.explanation)
        self.assertIn("while", result.explanation)


if __name__ == "__main__":
    unittest.main()
