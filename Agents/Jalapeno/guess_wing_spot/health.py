"""Read-only daily/per-platform publication health; never calls a provider."""
from datetime import datetime, time, timezone, date as calendar_date, timedelta
import json
import os
import re
from .clock_gate import EASTERN, closed_publication_date
from .durable import PrivateLedger, DurableError


class HealthLedger(PrivateLedger):
    def request(self,method,path,**kwargs):
        allowed=method=='GET' and (path=='bucket/'+self.BUCKET or path.startswith('object/authenticated/'+self.BUCKET+'/'+self.PREFIX))
        allowed |= method=='POST' and path=='object/list/'+self.BUCKET and kwargs.get('json',{}).get('prefix','').startswith(self.PREFIX+'days/')
        if not allowed:
            raise DurableError('health_forbids_mutations')
        return super().request(method,path,**kwargs)


def assess(state,date,now,enabled=True):
    result={'date':date,'platforms':{p:{'status':(state or {}).get('platforms',{}).get(p,{}).get('status','not_recorded')}
                                   for p in ('instagram','facebook')}}
    for p in result['platforms']:
        reason=(state or {}).get('platforms',{}).get(p,{}).get('reason')
        if isinstance(reason,str) and re.fullmatch('[a-z0-9_]{1,120}',reason): result['platforms'][p]['reason']=reason
    if not enabled: return {**result,'status':'automation_disabled'}
    if all(p['status']=='published' for p in result['platforms'].values()):
        return {**result,'status':'daily_publication_complete'}
    deadline=datetime.combine(calendar_date.fromisoformat(date),time(21),EASTERN)
    if now<deadline: return {**result,'status':'publication_window_not_closed'}
    if any((state or {}).get('platforms',{}).get(p,{}).get('pending') or v['status'] in {'uncertain','processing','pending'} for p,v in result['platforms'].items()):
        return {**result,'status':'publication_unconfirmed_requires_reconciliation'}
    if any(p['status']=='published' for p in result['platforms'].values()):
        return {**result,'status':'partial_daily_publication'}
    if (state or {}).get('status','').startswith('skipped'):
        return {**result,'status':'source_selection_blocked'}
    return {**result,'status':'missed_daily_publication'}


OK={'automation_disabled','daily_publication_complete','publication_window_not_closed'}


def run_health(env=os.environ,now=None):
    repo=env.get('GITHUB_REPOSITORY','')
    if (env.get('GITHUB_ACTIONS')!='true' or env.get('GITHUB_REF')!='refs/heads/main'
            or not re.fullmatch(r'[\w.-]+/[\w.-]+',repo)
            or env.get('GITHUB_WORKFLOW_REF')!=repo+'/.github/workflows/guess-wing-spot.yml@refs/heads/main'):
        raise DurableError('health_requires_expected_main_workflow')
    now=now or datetime.now(timezone.utc)
    date=env.get('PUBLICATION_DATE') or closed_publication_date(now)
    parsed=calendar_date.fromisoformat(date)
    date=parsed.isoformat()
    local=now.astimezone(EASTERN).date()
    if not local-timedelta(days=7)<=parsed<=local:
        raise DurableError('health_date_out_of_range')
    enabled=env.get('GUESS_WING_SPOT_ENABLED')=='true'
    state=None
    if enabled:
        ledger=HealthLedger(env['SUPABASE_URL'],env['SUPABASE_SERVICE_ROLE_KEY'])
        ledger.check_private(); state=ledger.latest(date)
        if state and state.get('date')!=date:
            raise DurableError('ledger_date_mismatch')
    result=assess(state,date,now,enabled)
    print(json.dumps(result))
    summary=env.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary,'a',encoding='utf-8') as stream:
            stream.write('### Daily publication health (ledger verified)\n\n```json\n'+json.dumps(result,indent=2)+'\n```\n')
    if result['status'] not in OK:
        print('::error::Daily publication health: '+result['status']+' for '+date)
    return result
