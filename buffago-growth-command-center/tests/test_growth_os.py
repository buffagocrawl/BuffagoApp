import unittest

from models import Snapshot


LOCAL = {
    "current_experiment": {
        "title": "Local experiment", "goal": "Local hypothesis",
        "progress": "3 of 10", "day": 2, "duration_days": 7,
    },
    "todays_growth_move": {"action": "Local move", "why": "Local reason"},
    "founder_balance": {
        "product_actions": 1, "growth_actions": 2, "customer_conversations": 3,
    },
    "growth_insight": {"title": "Local insight", "detail": "Local detail"},
}


class GrowthOSTests(unittest.TestCase):
    def resolved(self, growth_os=None):
        payload = {} if growth_os is None else {"growth_os": growth_os}
        return Snapshot.from_payload(payload).growth_os.with_local_fallbacks(LOCAL)

    def test_backend_experiment_overrides_local_experiment(self):
        state = self.resolved({"current_experiment": {"title": "Backend experiment"}})
        self.assertEqual(state.current_experiment.title, "Backend experiment")

    def test_local_experiment_used_when_backend_experiment_missing(self):
        self.assertEqual(self.resolved({}).current_experiment.title, "Local experiment")

    def test_backend_move_overrides_local_move(self):
        state = self.resolved({"todays_move": {"title": "Backend move"}})
        self.assertEqual(state.todays_move.title, "Backend move")

    def test_backend_founder_balance_tracked_true(self):
        state = self.resolved({"founder_balance_7d": {
            "tracked": True, "product": 8, "growth": 3, "customer": 2,
        }})
        self.assertTrue(state.founder_balance_7d.tracked)
        self.assertEqual((state.founder_balance_7d.product, state.founder_balance_7d.growth,
                          state.founder_balance_7d.customer), (8, 3, 2))

    def test_tracked_false_preserves_not_tracked_state(self):
        state = self.resolved({"founder_balance_7d": {"tracked": False}})
        self.assertFalse(state.founder_balance_7d.tracked)
        self.assertIsNone(state.founder_balance_7d.product)

    def test_backend_insight_overrides_local_insight(self):
        state = self.resolved({"marketing_insight": {
            "title": "Backend insight", "body": "Backend detail", "source": "jalapeno",
        }})
        self.assertEqual(state.marketing_insight.title, "Backend insight")
        self.assertEqual(state.marketing_insight.source, "jalapeno")

    def test_old_snapshot_without_growth_os(self):
        snapshot = Snapshot.from_payload({"product_pulse": {"wing_ratings": {"total": 12}}})
        self.assertIsNone(snapshot.growth_os.current_experiment)
        self.assertEqual(snapshot.growth_os.with_local_fallbacks(LOCAL).todays_move.title, "Local move")

    def test_partial_growth_os_payload(self):
        state = self.resolved({"todays_move": {"title": "Only backend section"}})
        self.assertEqual(state.todays_move.title, "Only backend section")
        self.assertEqual(state.current_experiment.title, "Local experiment")
        self.assertEqual(state.marketing_insight.title, "Local insight")

    def test_malformed_experiment_does_not_break_other_sections(self):
        state = self.resolved({
            "current_experiment": {"title": None, "target_value": "NaN"},
            "todays_move": {"title": "Valid move"},
            "marketing_insight": {"title": "Valid insight", "body": "Useful"},
        })
        self.assertEqual(state.current_experiment.title, "Local experiment")
        self.assertEqual(state.todays_move.title, "Valid move")
        self.assertEqual(state.marketing_insight.title, "Valid insight")

    def test_completed_move_state(self):
        state = self.resolved({"todays_move": {"title": "Published", "status": "DONE"}})
        self.assertEqual(state.todays_move.status, "done")

    def test_experiment_with_no_progress_fields(self):
        experiment = self.resolved({"current_experiment": {
            "title": "No progress", "progress_pct": 55,
        }}).current_experiment
        self.assertFalse(experiment.has_progress)
        self.assertIsNone(experiment.calculated_progress_pct)

    def test_experiment_with_no_dates(self):
        experiment = self.resolved({"current_experiment": {
            "title": "No dates", "day_number": 7, "duration_days": 14,
        }}).current_experiment
        self.assertFalse(experiment.schedule_available)

    def test_extra_fields_and_null_text_are_safe(self):
        state = self.resolved({
            "todays_move": {"title": "  Ship   page  ", "why_it_matters": "null", "extra": 1},
        })
        self.assertEqual(state.todays_move.title, "Ship page")
        self.assertIsNone(state.todays_move.why_it_matters)


if __name__ == "__main__":
    unittest.main()
