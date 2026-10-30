import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from state_geographies import STATE_CODES, wall_states, METRIC_UNITS
from state_goal_config import apply_config

APPROVED = Path(__file__).resolve().parents[1]/'data/state-goals.approved-20261231.json'


class GeographyTests(unittest.TestCase):
    def rows(self):
        return [{'code': code, 'contribution_basis':'founder_excluded_v1', 'updated_at': '2026-10-30T00:00:00Z', 'metrics':
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

    def test_approved_totals_calculations_deadline_and_refresh(self):
        data = apply_config({'states': self.rows()}, APPROVED)
        result = wall_states(data['states'])
        self.assertEqual([s['code'] for s in result], ['US','CT','OH','NY','MA'])
        self.assertEqual([[m['target'] for m in s['metrics']] for s in result],
                         [[1400,800,250],[250,450,90],[150,50,25],[100,60,35],[65,80,25]])
        national = result[0]['metrics']
        self.assertEqual(national[0]['current'], 1275)
        self.assertEqual(national[0]['gap'], 125)  # Total, never 1400 additional.
        self.assertAlmostEqual(national[0]['fraction'], 1275/1400)
        self.assertEqual(national[1]['gap'], 0)
        self.assertEqual(national[1]['fraction'], 1)
        self.assertTrue(all(m['deadline']=='2026-12-31' for s in result for m in s['metrics']))
        updated = self.rows()
        updated[0]['metrics'][0]['current'] += 10
        refreshed = wall_states(apply_config({'states':updated}, APPROVED)['states'])
        self.assertEqual(refreshed[0]['metrics'][0]['current'], 1285)
        self.assertEqual(refreshed[0]['metrics'][0]['gap'], 115)
        # Reapplying a local configuration cannot double-count Nation.
        self.assertEqual(wall_states(apply_config(data, APPROVED)['states']), result)

    def test_missing_national_data_does_not_invent_progress(self):
        result = wall_states(apply_config({'states':self.rows()[:-1]}, APPROVED)['states'])
        self.assertEqual(result[0]['metrics'][0]['target'], 1400)
        self.assertIsNone(result[0]['metrics'][0]['current'])
        self.assertIsNone(result[0]['metrics'][0]['fraction'])
        self.assertIsNone(result[0]['metrics'][0]['gap'])

    def test_approval_and_units_required_for_national_target_too(self):
        config = json.loads(APPROVED.read_text())
        with TemporaryDirectory() as folder:
            path = Path(folder)/'goals.json'
            config['approved'] = False
            path.write_text(json.dumps(config))
            self.assertIsNone(wall_states(apply_config({'states':self.rows()}, path)['states'])[0]['metrics'][0]['target'])
            config['approved'] = True
            config['targets']['US'][0]['unit'] = 'restaurants per million residents'
            path.write_text(json.dumps(config))
            self.assertIsNone(wall_states(apply_config({'states':self.rows()}, path)['states'])[0]['metrics'][0]['target'])

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
            self.assertIn('Community ratings', texts)
            self.assertIn('Community photos', texts)
            self.assertEqual(sum(wall.itemcget(i, 'text').endswith('/ Not set') for i in wall.find_all() if wall.type(i) == 'text'), 15)
            wall.growth_feed.data = apply_config({'states':self.rows(),'social':{}}, APPROVED)
            wall.render()
            root.update()
            text = [wall.itemcget(i,'text') for i in wall.find_all() if wall.type(i)=='text']
            self.assertIn('Due Dec 31, 2026', text)
            self.assertIn('1,275 / 1,400', text)
            self.assertIn('91.1% | 125 remaining', text)
            self.assertIn('159.4% | Achieved | 0 left', text)
            self.assertFalse(any('Not set' in t for t in text))
            self.assertEqual(sum('remaining' in t or 'Achieved' in t for t in text), 15)
            tracks = wall.find_withtag('goal-progress-track')
            fills = wall.find_withtag('goal-progress-fill')
            self.assertEqual(len(tracks),15)
            self.assertEqual(len(fills),15)
            for track, fill in zip(tracks,fills):
                t,f = wall.coords(track),wall.coords(fill)
                self.assertLessEqual(f[2]-f[0],t[2]-t[0])
            # Nation ratings are over target in this fixture: full, never wider.
            self.assertEqual(wall.coords(tracks[1]),wall.coords(fills[1]))
            for i in wall.find_all():
                if wall.type(i) != 'text':
                    continue
                box = wall.bbox(i)
                self.assertTrue(0 <= box[0] < box[2] <= 1920 and 0 <= box[1] < box[3] <= 1080)
        finally:
            root.destroy()
