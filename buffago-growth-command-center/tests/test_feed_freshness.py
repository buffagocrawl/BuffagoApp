from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from adapters.state_counts import StateReader, collect_states
from adapters.export_growth import state_goals
from growth_goals import goal, goal_progress, PanelFeed


class FeedFreshnessTests(unittest.TestCase):
    def test_connecticut_above_target_keeps_real_percentage_and_capped_bar(self):
        item=goal(322,250,'restaurants')
        self.assertEqual(item['current'],322)
        self.assertEqual(item['gap'],0)
        self.assertEqual(item['fraction'],1)
        self.assertEqual(goal_progress(item),'128.8% | Achieved | 0 left')
        self.assertEqual(goal_progress(goal(250,250,'restaurants')),'100.0% | Achieved | 0 left')
        self.assertEqual(goal_progress(goal(228,250,'restaurants')),'91.2% | 22 remaining')
        self.assertEqual(goal_progress(goal(None,250,'restaurants')),'Progress unavailable')

    def test_new_pi_pull_does_not_make_old_database_counts_fresh(self):
        now=datetime(2026,10,30,14,tzinfo=timezone.utc)
        feed=PanelFeed()
        feed.data={'pi_refreshed_at':now.isoformat(),'social':{'generated_at':now.isoformat()},
                   'states':[{'updated_at':(now-timedelta(hours=1)).isoformat()}]}
        self.assertTrue(feed.connectivity(now))
        self.assertTrue(feed.source_stale(now))
        feed.data['states'][0]['updated_at']=now.isoformat()
        self.assertFalse(feed.source_stale(now))

    def test_full_restaurant_pagination_includes_new_ct_rows_without_author_filter(self):
        from urllib.parse import parse_qs,urlsplit
        records=[{'id':str(i),'state_id':7 if i<322 else 1} for i in range(1228)]
        offsets=[]
        class Store: origin='https://example.supabase.co'; key='server-test'
        class Opener:
            def open(self, request, timeout):
                query=parse_qs(urlsplit(request.full_url).query)
                offset=int(query['offset'][0]); offsets.append(offset)
                self_test.assertEqual(query['select'],['id,state_id'])
                self_test.assertNotIn('user_id',query)
                return BytesIO(json.dumps(records[offset:offset+500]).encode())
        self_test=self
        with patch('adapters.state_counts.build_opener',return_value=Opener()):
            rows=StateReader(Store()).rows('destinations')
        self.assertEqual(offsets,[0,500,1000])
        self.assertEqual(len(rows),1228)
        class Reader:
            def rows(self, table):
                return {'states':[{'state_id':7,'state_code':'CT'}], 'destinations':rows,
                        'destination_ratings':[], 'wing_media_submissions':[]}[table]
        result=state_goals(collect_states(Reader(),{'founder-test'}))[0]
        self.assertEqual(result['metrics'][0]['current'],322)
        self.assertLessEqual(result['collection_started_at'],result['restaurants_collected_at'])
        self.assertLessEqual(result['restaurants_collected_at'],result['updated_at'])

    def test_dashboard_schedule_is_independent_and_has_no_social_credentials(self):
        import yaml
        root=Path(__file__).resolve().parents[2]
        workflow=yaml.safe_load((root/'.github/workflows/pi-dashboard-feed.yml').read_text())
        triggers=workflow.get('on',workflow.get(True))
        self.assertEqual(triggers['schedule'],[{'cron':'*/10 * * * *'}])
        self.assertFalse(workflow['concurrency']['cancel-in-progress'])
        self.assertEqual(workflow['concurrency']['group'],'jalapeno-reel-analytics')
        job=workflow['jobs']['dashboard']
        self.assertEqual(set(job['env']),{'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'})
        self.assertEqual([s['run'] for s in job['steps'] if 'run' in s],
                         ['python -B buffago-growth-command-center/adapters/cloud_producer.py'])
