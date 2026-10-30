import unittest
from state_geographies import STATE_CODES, wall_states, METRIC_UNITS


class GeographyTests(unittest.TestCase):
    def rows(self):
        return [{'code': code, 'updated_at': '2026-10-30T00:00:00Z', 'metrics':
                 [{'name': name, 'unit': unit, 'current': i+1} for name, unit in METRIC_UNITS]}
                for i, code in enumerate(sorted(STATE_CODES))]

    def test_explicit_order_and_all_fifty_not_featured_sum(self):
        rows = self.rows()
        result = wall_states(list(reversed(rows)))
        self.assertEqual([r['label'] for r in result], ['Nation', 'Connecticut', 'Ohio', 'New York', 'Massachusetts'])
        self.assertEqual([m['current'] for m in result[0]['metrics']], [1275]*3)
        self.assertTrue(all(m['target'] is None and m['fraction'] is None for m in result[0]['metrics']))
        # A prior Nation must never be added again.
        self.assertEqual(wall_states(rows+[result[0]])[0], result[0])

    def test_missing_duplicate_and_unavailable_are_not_national_zero(self):
        rows = self.rows()
        for bad in (rows[:-1], rows+[rows[0]], rows[:-1]+[rows[0]]):
            self.assertIsNone(wall_states(bad)[0]['metrics'][0]['current'])
        rows[0]['metrics'][0]['current'] = None
        self.assertIsNone(wall_states(rows)[0]['metrics'][0]['current'])
        self.assertEqual(wall_states(rows)[0]['metrics'][1]['current'], 1275)

    def test_rendered_rows_fit_state_card_and_other_panels_remain(self):
        import tkinter as tk
        from ui.dashboard import Dashboard
        from models import Snapshot
        root = tk.Tk()
        root.geometry('1920x1080')
        wall = Dashboard(root)
        root.update()
        try:
            wall.growth_feed.data = {'states': self.rows(), 'social': {}}
            wall.update_data(Snapshot(), {}, None, False, 'TEST')
            root.update()
            texts = {wall.itemcget(i, 'text'): i for i in wall.find_all() if wall.type(i) == 'text'}
            boxes = [wall.bbox(texts[label]) for label in ('Nation', 'Connecticut', 'Ohio', 'New York', 'Massachusetts')]
            self.assertTrue(all(a[3] < b[1] for a,b in zip(boxes, boxes[1:])))
            self.assertLess(boxes[-1][3], 1080)
            self.assertIn('Social performance', texts)
            self.assertIn('Instagram weekly views', texts)
            self.assertEqual(sum(wall.itemcget(i, 'text').endswith('/ Not set') for i in wall.find_all() if wall.type(i) == 'text'), 15)
        finally:
            root.destroy()
