"""Operational display contracts beyond the baseline kiosk tests."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tkinter as tk
import unittest
from activity import relative_time, safe_display
from models import Snapshot
from ui.dashboard import Dashboard

BASE=Path(__file__).parents[1]


class RelativeTimeTests(unittest.TestCase):
    def test_eastern_relative_time_and_dates(self):
        now=datetime(2026,10,8,17,tzinfo=timezone.utc)
        for delta, expected in ((20,'Now'),(480,'8m ago'),(7200,'2h ago'),(86400,'Yesterday'),
                                (3*86400,'Mon'),(8*86400,'Sep 30')):
            self.assertEqual(relative_time(now-timedelta(seconds=delta),now),expected)
        self.assertEqual(relative_time(None,now),'—')
        # Yesterday takes calendar priority over hours, across local midnight.
        now=datetime(2026,10,9,4,30,tzinfo=timezone.utc)
        self.assertEqual(relative_time(now-timedelta(hours=2),now),'Yesterday')

    def test_email_defense_and_safe_snapshot_fields(self):
        self.assertEqual(safe_display('private@example.test','User'),'User')
        s=Snapshot.from_payload({'recent_activity':{'logins':[{'display_name':'Alex','email':'private@example.test'}]*14},
                                 'marketing':{'factors':{'mau':{'score':12}}}})
        self.assertEqual(len(s.recent_activity['logins']),10)
        self.assertNotIn('email',s.recent_activity['logins'][0])
        self.assertEqual(s.marketing.factors['mau'],12)


class WallRenderingTests(unittest.TestCase):
    def setUp(self):
        self.root=tk.Tk()
        self.root.geometry('1600x900')
        self.wall=Dashboard(self.root)
        self.root.update()
        self.payload=json.loads((BASE/'data/demo_snapshot.json').read_text(encoding='utf-8'))

    def tearDown(self):
        self.root.destroy()

    def render(self):
        self.wall.update_data(Snapshot.from_payload(self.payload),{},None,False,'LIVE')
        self.root.update()

    def test_chart_zero_missing_labels_and_bounds(self):
        history=self.payload['product_pulse']['monthly_history']
        shown=[p for p in history if p['month']>='2026-06']
        shown[0]['mau']=0
        shown[1]['mau']=None
        shown[2]['unique_devices']=0
        self.render()
        items=self.wall.find_withtag('chart-value')
        self.assertEqual(len(items),4*len(shown)-1)
        texts=[self.wall.itemcget(i,'text') for i in items]
        self.assertIn('0',texts)
        self.assertNotIn('—',texts)
        for item in items:
            x1,y1,x2,y2=self.wall.bbox(item)
            self.assertGreaterEqual(y1,430)
            self.assertLessEqual(y2,540)
            self.assertGreaterEqual(x1,40)
            self.assertLessEqual(x2,1070)

    def test_sauce_deterministic_in_content_free_gutters(self):
        self.render()
        def shapes():
            return [(self.wall.type(i),self.wall.coords(i),self.wall.itemcget(i,'fill'))
                    for i in self.wall.find_withtag('sauce')]
        before=shapes()
        self.render()
        self.assertEqual(shapes(),before)
        self.assertEqual(len(before),10)
        for _,coords,_ in before:
            self.assertTrue(max(coords[::2])<40 or min(coords[::2])>1564)

    def test_activity_ten_each_and_empty(self):
        self.render()
        texts=[self.wall.itemcget(i,'text') for i in self.wall.find_all() if self.wall.type(i)=='text']
        for row in self.payload['recent_activity']['logins']:
            self.assertIn(row['display_name'],texts)
        for row in self.payload['recent_activity']['ratings']:
            self.assertIn(row['destination_name'],texts)
        self.payload['recent_activity']={}
        self.render()
        texts=[self.wall.itemcget(i,'text') for i in self.wall.find_all() if self.wall.type(i)=='text']
        self.assertEqual(texts.count('No recent activity'),2)
        self.assertIn('Total Users Created',texts)
        self.assertNotIn('Total Accounts',texts)


if __name__=='__main__':
    unittest.main()
