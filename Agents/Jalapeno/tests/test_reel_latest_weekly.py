from datetime import date, datetime, timedelta, timezone
import copy
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reel_analytics.collector import collect
from reel_analytics.storage import ANALYTICS
from reel_analytics.weekly import DEFINITION, day_bounds, week_rows, retain_daily, account_history
from test_reel_analytics import MemoryStore, FakeMeta, NOW, all_metrics


def test_latest_recovers_permissions_without_touching_history_or_comparable_cohorts():
    class PermissionGap(FakeMeta):
        def insights(self, post):
            values = all_metrics(post['platform'])
            if post['platform']=='facebook':
                values['views']={'value':None,'reason':'permission_denied'}
            return values,{},{}
    store=MemoryStore()
    first=collect(store,PermissionGap(age=2),mode='collect',now=NOW,clock=lambda:NOW,run_key='50.1')
    history={k:copy.deepcopy(v) for k,v in store.data.items() if '/snapshots/' in k}
    later=NOW+timedelta(hours=1)
    second=collect(store,FakeMeta(age=2),mode='collect',now=later,clock=lambda:later,run_key='51.1')
    assert all(store.data[k]==v for k,v in history.items())
    fb=next(r['observation'] for r in second['recent_reels'] if r['platform']=='facebook')
    assert fb['metrics']['views']['value']==0 and fb['metrics']['views']['reason'] is None
    assert fb['captured_at']==later.isoformat() and fb['age_hours']==3
    assert second['health']['duplicates_skipped']==2
    assert second['rankings']==first['rankings']


def test_eastern_calendar_days_are_23_and_25_hours_at_dst():
    a,b=day_bounds(date(2026,3,8));assert b-a==23*3600
    a,b=day_bounds(date(2026,11,1));assert b-a==25*3600


def test_weeks_across_year_boundary_and_missing_is_not_zero():
    now=datetime(2027,1,1,18,tzinfo=timezone.utc)
    start=date(2026,12,28)
    days=[{'date':(start+timedelta(days=i)).isoformat(),'definition':DEFINITION,'value':0} for i in range(5)]
    weeks=week_rows(days,now)
    assert weeks[-1]['week_start']=='2026-12-28'
    assert weeks[-1]['partial'] and weeks[-1]['value']==0
    assert weeks[-2]['value'] is None and not weeks[-2]['partial']
    assert week_rows(days[:-1],now)[-1]['value'] is None
    days[0]['definition']='reel_lifetime_by_publication_week'
    assert week_rows(days,now)[-1]['value'] is None


def test_failed_daily_refresh_keeps_capture_time_and_rejects_incompatible_ranges():
    old={'date':'2026-10-28','value':4,'definition':DEFINITION,'since':1,'until_inclusive':2,
         'partial':False,'captured_at':'2026-10-29T00:00:00Z'}
    new={**old,'value':None,'reason':'network','captured_at':'2026-10-30T00:00:00Z'}
    retained=retain_daily(new,[old])
    assert retained['value']==4 and retained['captured_at']==old['captured_at']
    assert retain_daily({**new,'until_inclusive':3},[old])['value'] is None


def test_account_contract_is_daily_gained_views_with_inclusive_bounds_and_real_zero():
    class Meta:
        ig_id='123';version='v25.0'
        def __init__(self):self.params=[]
        def get(self,path,params):
            self.params.append(params)
            return {'data':[{'name':'views','period':'day','total_value':{'value':0}}]}
    meta=Meta();now=datetime(2026,11,2,18,tzinfo=timezone.utc)
    result=account_history(meta,now,days=2)
    a,b=day_bounds(date(2026,11,1))
    assert meta.params[0]=={'metric':'views','period':'day','metric_type':'total_value','since':a,'until':b-1}
    assert all(r['value']==0 for r in result['days'])
    assert result['scope']=='Account-wide Instagram views'


def test_existing_publishing_and_analytics_cron_controls_are_unchanged():
    import yaml
    root=Path(__file__).resolve().parents[3]
    w=yaml.safe_load((root/'.github/workflows/jalapeno-metrics.yml').read_text())
    trigger=w.get('on',w.get(True))
    assert trigger['schedule']==[{'cron':'30 0 * * *'},{'cron':'30 1 * * *'}]
    p=yaml.safe_load((root/'.github/workflows/guess-wing-spot.yml').read_text())
    trigger=p.get('on',p.get(True))
    assert trigger['schedule']==[{'cron':'30 23 * * *'},{'cron':'30 0 * * *'}]
