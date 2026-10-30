from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from urllib.error import URLError
from unittest.mock import patch
from adapters.pull_feed import pull, atomic_write
from growth_goals import PanelFeed, metric, eastern_stamp
from state_goal_config import apply_config


def payload():
    return {'schema_version':1,'exported_at':'2026-10-30T00:00:00+00:00',
        'social':{'generated_at':'2026-10-30T00:00:00+00:00','reels':[]},'states':[]}


class AutonomousFeedTests(unittest.TestCase):
    def test_unattended_http_pull_offline_fallback_and_network_recovery(self):
        with TemporaryDirectory() as folder:
            cache=Path(folder)/'cache.json'
            config={'url':'https://test.supabase.co/functions/v1/buffago-pi-feed','token':'t'*43,'cache_path':str(cache)}
            now=datetime(2026,10,30,0,5,tzinfo=timezone.utc)
            good=lambda req:BytesIO(json.dumps(payload()).encode())
            self.assertTrue(pull(config,fetch=good,sleep=lambda _:None,now=lambda:now))
            first=json.loads(cache.read_text())
            self.assertEqual(first['pi_refreshed_at'],now.isoformat())
            def offline(req):raise URLError('offline')
            self.assertFalse(pull(config,fetch=offline,sleep=lambda _:None))
            failed=json.loads(cache.read_text())
            self.assertEqual(failed['social'],first['social'])
            self.assertEqual(failed['pi_refreshed_at'],first['pi_refreshed_at'])
            feed=PanelFeed();feed.load(cache);self.assertTrue(feed.failed)
            self.assertTrue(pull(config,fetch=good,sleep=lambda _:None,now=lambda:now+timedelta(minutes=10)))
            feed.load(cache);self.assertFalse(feed.failed)
            self.assertTrue(feed.connectivity(now+timedelta(minutes=11)))
            self.assertFalse(feed.source_stale(now+timedelta(minutes=11)))

    def test_atomic_replace_failure_keeps_existing_bytes(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/'cache.json';path.write_bytes(b'previous-good')
            with patch.object(Path,'replace',side_effect=OSError('disk unavailable')):
                with self.assertRaises(OSError):atomic_write(path,payload())
            self.assertEqual(path.read_bytes(),b'previous-good')

    def test_malformed_feed_does_not_replace_values_and_retries_are_bounded(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/'cache.json';atomic_write(path,payload())
            config={'url':'https://test.supabase.co/functions/v1/buffago-pi-feed','token':'t'*43,'cache_path':str(path)}
            calls=[]
            def bad(req):calls.append(req);return BytesIO(b'{bad')
            self.assertFalse(pull(config,fetch=bad,sleep=lambda _:None))
            self.assertEqual(len(calls),2)
            self.assertEqual(json.loads(path.read_text())['social'],payload()['social'])

    def test_dst_aware_collection_vs_refresh_times(self):
        self.assertIn('EDT',eastern_stamp('2026-10-30T00:00:00Z'))
        self.assertIn('EST',eastern_stamp('2026-11-02T00:00:00Z'))
        self.assertEqual(metric({'value':0,'reason':'permission_denied'},'facebook','views')['status'],'Available')
        self.assertEqual(metric({'value':None,'reason':'unsupported_or_unavailable'},'facebook','reach')['reason'],'unsupported_or_unavailable')

    def test_proposed_goals_never_activate_and_units_must_match(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/'goals.json'
            raw={'states':[{'code':'CT','metrics':[{'name':'Restaurant coverage','current':20,'target':None,'unit':'restaurants'}]}]}
            config={'schema_version':1,'approved':False,'review_states':['CT'],'targets':{'CT':[{'name':'Restaurant coverage','value':100,'unit':'restaurants','status':'proposed'}]}}
            path.write_text(json.dumps(config))
            self.assertIsNone(apply_config(raw,path)['states'][0]['metrics'][0]['fraction'])
            config.update(approved=True,approved_at='2026-10-30T00:00:00Z',approved_by='owner')
            config['targets']['CT'][0].update(status='approved',unit='restaurants per million residents')
            path.write_text(json.dumps(config))
            self.assertIsNone(apply_config(raw,path)['states'][0]['metrics'][0]['target'])
            config['targets']['CT'][0]['unit']='restaurants';path.write_text(json.dumps(config))
            self.assertEqual(apply_config(raw,path)['states'][0]['metrics'][0]['gap'],80)

    def test_weekly_chart_scope_and_partial_data_are_explicit(self):
        import tkinter as tk
        from ui.dashboard import Dashboard
        from models import Snapshot
        root=tk.Tk();root.withdraw()
        wall=Dashboard(root)
        rows=[{'week_start':'2026-10-19','value':42,'partial':False},
              {'week_start':'2026-10-26','value':3,'partial':True}]
        try:
            wall.growth_feed.data={**payload(),'weekly_instagram':{'weeks':rows,'captured_at':'2026-10-30T00:00:00Z'}}
            wall.update_data(Snapshot(),{},None,False,'TEST')
            text=[wall.itemcget(i,'text') for i in wall.find_all() if wall.type(i)=='text']
            self.assertIn('Instagram weekly views',text)
            self.assertNotIn('Unique Mobile Devices',text)
            self.assertIn('Account-wide | views gained',text)
            self.assertIn('PARTIAL',text)
            plotted=[wall.itemcget(i,'text') for i in wall.find_withtag('chart-value')]
            self.assertIn('42',plotted)
            self.assertNotIn('3',plotted)  # Incomplete week is a separate summary, not an equivalent trend point.
        finally:root.destroy()
