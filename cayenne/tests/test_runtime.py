import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from cayenne_runtime import disposition, redact, safety, validate_selectors

ROOT=Path(__file__).parents[2]
def test_production_mutation_fails_closed():
    r=safety('production-readonly',True,True,'https://example.supabase.co',{})
    assert r['decision']=='BLOCK' and not r['mutationAllowed']
def test_unknown_environment_fails_closed():
    assert safety('unknown',False,False,'',{})['decision']=='BLOCK'
def test_redaction_removes_secrets_and_email():
    r=redact({'password':'secret','message':'Bearer abcdefghijklmnopqrstuvwxyz.12345678 user@example.com'})
    assert 'secret' not in json.dumps(r) and 'user@example.com' not in json.dumps(r)
def test_selectors_are_unique_and_known():
    result=validate_selectors(ROOT,ROOT/'cayenne'/'flows')
    assert result['duplicateIds'] is False and result['unknownReferences']==[]
def test_serrano_blocked_is_not_rejected():
    result={'status':'BLOCKED','safety':{'decision':'BLOCK'},'failures':[],'limitations':['DEVICE_UNAVAILABLE'],'redaction':{'validated':True},'summary':{}}
    request={'acceptanceCriteria':['launch']}
    assert disposition(result,request)['disposition']=='BLOCKED'
def test_serrano_failed_app_defect_rejects():
    result={'status':'FAILED','safety':{'decision':'ALLOW'},'failures':[{'failureCategory':'APP_DEFECT'}],'limitations':[],'redaction':{'validated':True},'summary':{}}
    assert disposition(result,{'acceptanceCriteria':[]})['disposition']=='REJECT'
def test_serrano_missing_evidence_is_insufficient():
    result={'status':'PASSED','safety':{'decision':'ALLOW'},'failures':[],'limitations':['missing screenshot'],'redaction':{'validated':True},'summary':{'acceptanceCriteriaCovered':[]}}
    assert disposition(result,{'acceptanceCriteria':['launch']})['disposition']=='INSUFFICIENT_EVIDENCE'
