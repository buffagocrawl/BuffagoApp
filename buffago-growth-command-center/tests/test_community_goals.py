import json
from pathlib import Path
import unittest
from unittest.mock import patch
from io import BytesIO

from adapters.state_counts import collect_states, exclusion_ids, StateReader, PUBLIC_STATUSES, SELECTS
from adapters.export_growth import state_goals
from state_goal_config import apply_config
from state_geographies import STATE_CODES, wall_states


class CommunityGoalsTests(unittest.TestCase):
    def sources(self):
        states = [{'state_id':i,'state_code':code} for i,code in enumerate(sorted(STATE_CODES))]
        ct = next(s['state_id'] for s in states if s['state_code']=='CT')
        other = next(s['state_id'] for s in states if s['state_code']=='CA')
        return {'states':states, 'destinations':[{'id':'a','state_id':ct},{'id':'b','state_id':other}],
                'destination_ratings':[
                    {'id':'r1','destination_id':'a','user_id':'founder-a'},
                    {'id':'r2','destination_id':'a','user_id':'founder-b'},
                    {'id':'r3','destination_id':'a','user_id':'community'},
                    {'id':'r4','destination_id':'b','user_id':'community'},
                    {'id':'r5','destination_id':'a','user_id':None}],
                'wing_media_submissions':[
                    dict(id='p'+str(i),destination_id='a',user_id=author,media_type=media,status=status,withdrawn_at=withdrawn,
                         rating_id='r1',approved_by='founder-a',attribution_preference='founder')
                    for i,(author,media,status,withdrawn) in enumerate([
                        ('founder-a','photo','approved',None),('founder-b','photo','posted',None),
                        *[('community','photo',s,None) for s in sorted(PUBLIC_STATUSES)],
                        ('community','video','approved',None),('community','photo','rejected',None),
                        ('community','photo','approved','withdrawn'),(None,'photo','approved',None)])]}

    def collect(self, sources):
        class Reader:
            def rows(self, table): return sources[table]
        return state_goals(collect_states(Reader(), ['founder-a','founder-a','founder-b']))

    def test_actual_authors_lifecycle_and_no_join_fanout(self):
        sources = self.sources()
        for table in ('destinations','destination_ratings','wing_media_submissions'):
            sources[table].append(dict(sources[table][0]))
        rows = self.collect(sources)
        result = wall_states(rows)
        self.assertEqual([m['current'] for m in result[0]['metrics']], [2,3,7])
        self.assertEqual([m['current'] for m in result[1]['metrics']], [1,2,7])
        # California contributes nationally even though it is not featured.
        self.assertEqual(next(s for s in rows if s['code']=='CA')['metrics'][1]['current'],1)
        projection = json.dumps(rows)
        for private in ('founder-a','founder-b','user_id','rating_id','attribution_preference'):
            self.assertNotIn(private, projection)
        config = Path(__file__).resolve().parents[1]/'data/state-goals.approved-20261231.json'
        approved = wall_states(apply_config({'states':rows}, config)['states'])
        self.assertEqual([m['target'] for m in approved[0]['metrics']], [1400,800,250])
        self.assertEqual([m['gap'] for m in approved[0]['metrics']], [1398,797,243])
        self.assertAlmostEqual(approved[0]['metrics'][1]['fraction'],3/800)

    def test_missing_authorship_or_conflicting_duplicate_fails_closed(self):
        data = self.sources()
        del data['destination_ratings'][0]['user_id']
        with self.assertRaises(KeyError): self.collect(data)
        data = self.sources()
        data['destination_ratings'].append({**data['destination_ratings'][0],'user_id':'other'})
        with self.assertRaisesRegex(ValueError,'Conflicting'): self.collect(data)

    def test_private_configuration_deduplicates_and_fails_without_identities(self):
        fake='00000000-0000-0000-0000-000000000001'
        self.assertEqual(exclusion_ids({'schema_version':1,'excluded_user_ids':[fake,fake]}),{fake})
        for bad in ({}, {'schema_version':1,'excluded_user_ids':[]},
                    {'schema_version':1,'excluded_user_ids':['private-invalid-value']}):
            with self.assertRaises(ValueError) as e: exclusion_ids(bad)
            self.assertNotIn('private-invalid-value',str(e.exception))
        class Store: origin='https://example.supabase.co'; key='test-server-key'
        calls=[]
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                return BytesIO(json.dumps({'schema_version':1,'excluded_user_ids':[fake]}).encode())
        with patch('adapters.state_counts.build_opener',return_value=Opener()):
            self.assertEqual(StateReader(Store()).excluded_users(),{fake})
        self.assertEqual(calls[0].get_method(),'GET')
        self.assertTrue(calls[0].full_url.endswith('/dashboard/goal-exclusions.json'))
        self.assertTrue(all('user_id' in SELECTS[t] for t in ('destination_ratings','wing_media_submissions')))

    def test_unfiltered_old_cache_cannot_claim_community_progress(self):
        rows=self.collect(self.sources())
        for row in rows: row.pop('contribution_basis')
        config=Path(__file__).resolve().parents[1]/'data/state-goals.approved-20261231.json'
        result=wall_states(apply_config({'states':rows},config)['states'])
        self.assertEqual(result[0]['metrics'][0]['current'],2)
        self.assertIsNone(result[0]['metrics'][1]['current'])
        self.assertIsNone(result[0]['metrics'][1]['gap'])
        self.assertIsNone(result[0]['metrics'][2]['fraction'])

    def test_dashboard_dispatch_skips_analytics_and_preserves_schedule(self):
        import yaml
        path=Path(__file__).resolve().parents[2]/'.github/workflows/jalapeno-metrics.yml'
        workflow=yaml.safe_load(path.read_text())
        triggers=workflow.get('on',workflow.get(True))
        self.assertEqual(triggers['schedule'],[{'cron':'30 0 * * *'},{'cron':'30 1 * * *'}])
        steps=workflow['jobs']['analytics']['steps']
        collector=next(s for s in steps if 'reel_metrics.py' in s.get('run',''))
        self.assertEqual(collector['if'],"env.METRICS_MODE != 'dashboard'")
        for name in ('read_only_credentials.py','account_views_probe.py'):
            step=next(s for s in steps if name in s.get('run','') and not s['run'].startswith('python -B -m pytest'))
            self.assertIn("env.METRICS_MODE == 'diagnostic'",step['if'])
        producer=next(s for s in steps if 'adapters/cloud_producer.py' in s.get('run',''))
        self.assertEqual(producer['if'],"env.METRICS_MODE != 'diagnostic'")
