import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from missions import THEMES, MissionStore, eastern_day, mission_for, goal_contribution
from models import Snapshot


class MissionTests(unittest.TestCase):
    def test_weekdays_and_required_coaching(self):
        for i, theme in enumerate(THEMES):
            mission = mission_for(date(2026, 10, 5) + timedelta(days=i))
            self.assertEqual(mission.theme, theme)
            for field in ('what', 'instructions', 'why', 'result', 'question', 'topic'):
                self.assertTrue(getattr(mission, field))
            self.assertIn('Instagram and Facebook', mission.instructions)

    def test_eastern_midnight_and_dst(self):
        for stamp, expected in [('2026-10-09T03:59:59+00:00', '2026-10-08'),
                                ('2026-10-09T04:00:00+00:00', '2026-10-09'),
                                ('2026-01-02T04:59:59+00:00', '2026-01-01'),
                                ('2026-01-02T05:00:00+00:00', '2026-01-02'),
                                ('2026-03-08T07:00:00+00:00', '2026-03-08'),
                                ('2026-11-01T06:00:00+00:00', '2026-11-01')]:
            self.assertEqual(eastern_day(datetime.fromisoformat(stamp)).isoformat(), expected)
        with self.assertRaises(ValueError):
            eastern_day(datetime(2026, 10, 8))

    def test_rotation(self):
        topics = [mission_for(date(2026, 10, 8) + timedelta(weeks=i)).topic for i in range(6)]
        self.assertEqual(len(set(topics)), 6)
        self.assertEqual(mission_for(date(2026, 10, 8)).topic,
                         mission_for(date(2026, 10, 8) + timedelta(weeks=6)).topic)

    def test_fallback_and_no_fabricated_results(self):
        for i in range(7):
            day = date(2026, 10, 5) + timedelta(days=i)
            self.assertEqual(mission_for(day).topic, mission_for(day, Snapshot()).topic)
            self.assertIn('evidence is unavailable', mission_for(day).context)
        self.assertIn('never invent a ranking', mission_for(date(2026, 10, 5)).instructions)
        self.assertIn('do not declare a winner', mission_for(date(2026, 10, 6)).what)
        self.assertIn('Never substitute stock', mission_for(date(2026, 10, 10)).instructions)

    def test_activity_is_reused_without_changing_score(self):
        snapshot = Snapshot.from_payload({'product_pulse': {'wing_ratings': {'last_24h': 3}}})
        before = snapshot.marketing
        mission = mission_for(date(2026, 10, 11), snapshot)
        self.assertIn('3 ratings', mission.context)
        self.assertEqual(snapshot.marketing, before)

    def test_persistence_correction_undo_and_week_boundaries(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'missions.json'
            store = MissionStore(path)
            today = mission_for(date(2026, 10, 8))
            stamp = datetime(2026, 10, 8, 18, tzinfo=timezone.utc)
            store.complete(today, ['Instagram'], stamp)
            store = MissionStore(path)
            record = store.records()['2026-10-08']
            self.assertEqual(record['topic'], today.topic)
            self.assertEqual(record['completed_at'], stamp.isoformat())
            store.complete(today, ['Instagram', 'Facebook'])
            self.assertEqual(store.progress(today.day), 1)
            self.assertEqual(len(store.records()), 1)
            self.assertEqual(store.records()['2026-10-08']['platforms'], ['Facebook', 'Instagram'])
            store.complete(mission_for(date(2026, 10, 11)), ['Facebook'])
            self.assertEqual(store.progress(today.day), 2)
            self.assertEqual(store.progress(date(2026, 10, 12)), 0)
            store.undo(today.day)
            self.assertEqual(MissionStore(path).progress(today.day), 1)
            with self.assertRaises(ValueError):
                store.complete(today, [])
            with self.assertRaises(ValueError):
                store.complete(today, ['Twitter'])

    def test_goals_and_no_automation_dependencies(self):
        self.assertIn('supports', goal_contribution('Social awareness'))
        self.assertIn('separately', goal_contribution('SEO landing page'))
        import ast
        base = Path(__file__).parents[1]
        for file in ('missions.py', 'ui/mission_panel.py'):
            tree = ast.parse((base / file).read_text(encoding='utf-8'))
            imports = [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]
            self.assertFalse(set(imports) & {'openai', 'requests', 'http.client', 'urllib.request'})
