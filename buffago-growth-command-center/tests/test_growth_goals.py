import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from datetime import datetime, timezone
from growth_goals import PanelFeed, display, goal, metric, project_report, public_link
from adapters.export_growth import latest_report, publication_results, state_goals, StorageReader


def report(stamp='2026-10-29T20:00:00Z'):
    return {'schema_version':1,'generated_at':stamp,'health':{'errors':[]},'recent_reels':[]}


class GrowthGoalsTests(unittest.TestCase):
    def test_latest_uses_timestamp_not_run_name(self):
        class Store:
            def names(self, prefix): return ['999.json','10.json','unfinished.json','notes.md']
            def read(self, key): return {'999.json':report('2026-10-28T20:00:00Z'),'10.json':report(),'unfinished.json':{}}[key.rsplit('/',1)[1]]
        self.assertEqual(latest_report(Store())['generated_at'],report()['generated_at'])

    def test_permissions_null_zero_and_unsupported_saves(self):
        self.assertEqual(display(metric({'value':0},'instagram','views')),'0')
        self.assertEqual(display(metric({'value':None,'reason':'permission_denied'},'facebook','views')),'Permission needed')
        self.assertEqual(display(metric({'value':None},'instagram','views')),'Unavailable')
        self.assertEqual(display(metric({'value':0},'facebook','saves')),'Not available')

    def test_private_fields_are_not_projected(self):
        raw=report()
        raw.update(markdown='PRIVATE_ANSWER',credentials='SECRET')
        raw['recent_reels']=[{'platform':'instagram','post_url':'https://www.instagram.com/reel/abc/','answer':'PRIVATE_ANSWER','observation':{'metrics':{'views':{'value':0}},'raw_supported_insights':'PRIVATE'}}]
        projected=json.dumps(project_report(raw))
        for value in ('PRIVATE','SECRET','markdown','raw_supported_insights','answer'): self.assertNotIn(value,projected)
        self.assertEqual(project_report(raw)['reels'][0]['metrics']['views']['value'],0)

    def test_current_age_and_small_cohorts_not_compared(self):
        raw=report()
        raw['rankings']=[{'window':'current-2026-10-29','reels':[{}]*5},{'window':'7d','reels':[{}]*2}]
        raw['period_comparisons']=[{'window':'7d','previous_n':2,'current_n':3,'change_fraction':.5}]
        safe=project_report(raw)
        self.assertEqual(safe['rankings'],[])
        self.assertEqual(safe['comparisons'],[])

    def test_failure_retains_data_and_marks_stale(self):
        with TemporaryDirectory() as directory:
            path=Path(directory)/'feed.json'
            path.write_text(json.dumps({'schema_version':1,'exported_at':report()['generated_at'],'social':project_report(report())}))
            feed=PanelFeed(); feed.load(path)
            self.assertFalse(feed.stale(datetime(2026,10,29,20,10,tzinfo=timezone.utc)))
            good=feed.data; path.write_text('{broken'); feed.load(path)
            self.assertIs(feed.data,good); self.assertTrue(feed.stale())
            self.assertEqual(feed.status,'Refresh failed')

    def test_old_report_is_stale_despite_fresh_export(self):
        feed=PanelFeed(); feed.data={'social':project_report(report())}
        self.assertTrue(feed.stale(datetime(2026,11,1,tzinfo=timezone.utc)))

    def test_goal_density_units_and_missing_targets(self):
        item=goal(20,100,'restaurants per million residents')
        self.assertEqual((item['gap'],item['fraction']),(80,.2))
        self.assertEqual(item['unit'],'restaurants per million residents')
        self.assertIsNone(goal(20,None,'restaurants')['fraction'])
        self.assertEqual(goal(0,100,'ratings')['fraction'],0)
        with self.assertRaises(ValueError): goal(1,10,'unknown')

    def test_priority_order_and_all_eligible_states(self):
        raw={'priority_states':['NY','CT'],'states':[{'code':c,'eligible':True,'metrics':[]} for c in ('CA','CT','NY')]}
        self.assertEqual([s['code'] for s in state_goals(raw)],['NY','CT','CA'])

    def test_ledger_failed_platform_and_privacy(self):
        class Store:
            def names(self,key): return ['2026-10-29'] if key.endswith('days/') else ['000001.json','000002.json']
            def read(self,key):
                self.key=key
                return {'answer':'PRIVATE','platforms':{'instagram':{'status':'published'},'facebook':{'status':'failed','token':'SECRET'}}}
        store=Store(); result=publication_results(store)
        self.assertTrue(store.key.endswith('000002.json'))
        self.assertEqual([r['status'] for r in result[:2]],['published','failed'])
        self.assertNotIn('PRIVATE',json.dumps(result)); self.assertNotIn('SECRET',json.dumps(result))

    def test_public_links_and_read_only_boundary(self):
        self.assertIsNone(public_link('https://www.instagram.com/reel/abc/?token=secret'))
        self.assertIsNone(public_link('https://example.org/answer'))
        store=StorageReader('https://example.supabase.co','test-secret')
        for method,path in [('DELETE','object/x'),('POST','object/jalapeno-assets/foo'),('GET','rest/v1/destinations')]:
            with self.assertRaises(ValueError): store.request(method,path)

class DiscoveryAndRenderingTests(unittest.TestCase):
    def test_storage_listing_paginates_to_completion(self):
        store=StorageReader('https://example.supabase.co','test')
        offsets=[]
        def request(method,path,body):
            offsets.append(body['offset'])
            return [{'name':str(n)} for n in range(100)] if body['offset']==0 else [{'name':'last'}]
        store.request=request
        self.assertEqual(len(store.names('guess-wing-spot-analytics-v1/reports/')),101)
        self.assertEqual(offsets,[0,100])

    def test_latest_read_failure_does_not_silently_fall_back(self):
        class Store:
            def names(self,key): return ['first.json','second.json']
            def read(self,key):
                if key.endswith('second.json'): raise OSError('offline')
                return report()
        with self.assertRaises(OSError): latest_report(Store())

    def test_server_refresh_failure_marks_cached_values_stale(self):
        with TemporaryDirectory() as directory:
            path=Path(directory)/'feed.json'
            path.write_text(json.dumps({'schema_version':1,'exported_at':report()['generated_at'],
                'social':project_report(report()),'refresh_failed':True}))
            feed=PanelFeed(); feed.load(path)
            self.assertTrue(feed.stale(datetime(2026,10,29,21,tzinfo=timezone.utc)))
            self.assertIsNotNone(feed.data)

    def test_connected_layout_and_details_at_recorded_pi_dimensions(self):
        import tkinter as tk
        from ui.dashboard import Dashboard
        from ui.growth_goals_panel import details
        from models import Snapshot
        from ui import theme
        root=tk.Tk(); root.overrideredirect(True)
        d=Dashboard(root)
        try:
            raw=report(datetime.now(timezone.utc).isoformat())
            raw['recent_reels']=[{'platform':p,'published_at':raw['generated_at'],'post_url':u,
              'observation':{'captured_at':raw['generated_at'],'age_hours':0,'window':'current-today',
                'metrics':{m:{'value':0 if p=='instagram' else None,'reason':'permission_denied'} for m in ('views','reach','comments','shares','saves','likes_reactions')}}}
                for p,u in [('instagram','https://www.instagram.com/reel/test/'),('facebook','https://www.facebook.com/reel/123/')]]
            d.growth_feed.data={'social':project_report(raw),'states':state_goals({'states':[
                {'code':'NY','eligible':True,'updated_at':raw['generated_at'],'metrics':[
                    {'name':'Restaurant coverage','current':10,'target':100,'unit':'restaurants per million residents','target_unit':'restaurants per million residents','source':'unit test'}]}]})}
            for width,height in ((800,480),(1280,720),(1920,1080)):
                root.geometry(f'{width}x{height}+0+0'); root.update()
                d.update_data(Snapshot(),{},None,False,'TEST'); root.update()
                texts=[d.itemcget(i,'text') for i in d.find_all() if d.type(i)=='text']
                self.assertIn('Permission needed',texts); self.assertIn('Not available',texts)
                self.assertIn('Nation',texts)
                self.assertIn('Connecticut',texts)
                self.assertIn('Ohio',texts)
                self.assertIn('New York',texts)
                self.assertIn('Massachusetts',texts)
                self.assertIn('Targets: Not set',texts)
                for item in d.find_all():
                    box=d.bbox(item)
                    if box: self.assertTrue(0<=box[0] and 0<=box[1] and box[2]<=width and box[3]<=height, (width,height,d.itemcget(item,'text') if d.type(item)=='text' else '',box))
            details(d); root.update()
            popup=next(c for c in d.winfo_children() if isinstance(c,tk.Toplevel))
            text=next(c for c in popup.winfo_children() if isinstance(c,tk.Text)).get('1.0','end')
            self.assertIn('Gap: 90',text); self.assertIn('No tracked installs',text)
        finally: root.destroy()

class GoalSourceTests(unittest.TestCase):
    def test_count_target_cannot_be_reused_as_density(self):
        raw={'states':[{'code':'NY','eligible':True,'metrics':[{'name':'Restaurant coverage',
             'current':20,'target':100,'unit':'restaurants per million residents','target_unit':'restaurants','source':'verified fixture'}]}]}
        self.assertIsNone(state_goals(raw)[0]['metrics'][0]['target'])

    def test_partial_feed_does_not_replace_last_success(self):
        with TemporaryDirectory() as directory:
            path=Path(directory)/'feed.json'
            raw={'schema_version':1,'exported_at':report()['generated_at'],'social':project_report(report())}
            path.write_text(json.dumps(raw)); feed=PanelFeed(); feed.load(path); prior=feed.data
            raw['social']['reels']=[{'platform':'instagram'}]
            path.write_text(json.dumps(raw)); feed.load(path)
            self.assertIs(feed.data,prior); self.assertTrue(feed.failed)

class LiveAdapterTests(unittest.TestCase):
    def test_live_state_aggregation_and_approved_photo_semantics(self):
        from adapters.state_counts import collect_states
        class Reader:
            def rows(self, table):
                return {'states':[{'state_id':1,'state_code':'CT'},{'state_id':2,'state_code':'NY'}],
                  'destinations':[{'id':'one','state_id':1}],
                  'destination_ratings':[{'destination_id':'one'}],
                  'wing_media_submissions':[{'destination_id':'one','media_type':'photo','status':status,'withdrawn_at':withdrawn}
                    for status,withdrawn in [('approved',None),('posted',None),('rejected',None),('approved','2026-01-01')]]}[table]
        states=state_goals(collect_states(Reader()))
        self.assertEqual([s['code'] for s in states],['CT','NY'])
        self.assertEqual([m['current'] for m in states[0]['metrics']],[1,1,2])
        self.assertTrue(all(m['target'] is None for s in states for m in s['metrics']))
        self.assertNotIn('destination_id',json.dumps(states))

    def test_forced_receiver_accepts_only_valid_cache(self):
        from adapters.receive_growth import receive
        from io import BytesIO
        with TemporaryDirectory() as directory:
            path=Path(directory)/'feed.json'
            good={'schema_version':1,'exported_at':report()['generated_at'],'social':project_report(report())}
            receive(BytesIO(json.dumps(good).encode()),path)
            previous=path.read_bytes()
            for raw in ({'schema_version':1},dict(good,secret='no')):
                with self.assertRaises(ValueError): receive(BytesIO(json.dumps(raw).encode()),path)
                self.assertEqual(previous,path.read_bytes())

    def test_installed_merge_preserves_pipeline_and_local_methods(self):
        from tools.stage_growth_goals import merge_app,merge_dashboard,methods
        from pathlib import Path
        root=Path(__file__).parents[1]
        reference=(root/'ui/dashboard.py').read_text(encoding='utf-8')
        # Simulate the inspected installed legacy hook without replacing it.
        installed=reference.replace('        self.growth_feed = PanelFeed()\n','')
        merged=merge_dashboard(installed,reference)
        for name in ('_draw_tiles','_draw_charts','_draw_actions','_draw_activity','destroy','_draw_growth_engine'):
            import ast
            self.assertEqual(ast.dump(methods(installed,'Dashboard')[name]),ast.dump(methods(merged,'Dashboard')[name]))
        original=(root/'app.py').read_text(encoding='utf-8')
        hook='        self._growth_path = Path(os.getenv("BUFFAGO_GROWTH_GOALS_PATH", config.cache_path.parent / "growth-goals.json"))\n        self.root.after(200, self._refresh_growth_goals)\n'
        original=original.replace(hook,'')
        start=original.index('    def _refresh_growth_goals(');end=original.index('    def _leave_fullscreen(',start)
        original=original[:start]+original[end:]
        merged=merge_app(original)
        for name in ('_fetch_in_background','_refresh_succeeded','_refresh_failed'):
            self.assertEqual(ast.dump(methods(original,'Application')[name]),ast.dump(methods(merged,'Application')[name]))

class DeliveryFreshnessTests(unittest.TestCase):
    def test_delivery_stops_become_stale_before_daily_collection_does(self):
        feed=PanelFeed()
        feed.data={'social':project_report(report()),'exported_at':report()['generated_at']}
        self.assertFalse(feed.stale(datetime(2026,10,29,20,20,tzinfo=timezone.utc)))
        self.assertTrue(feed.stale(datetime(2026,10,29,20,31,tzinfo=timezone.utc)))
