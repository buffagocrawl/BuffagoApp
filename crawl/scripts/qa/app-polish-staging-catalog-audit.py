"""Read-only completeness/unchanged-dependency check after the local bridge."""
from pathlib import Path
import subprocess,json,re
ROOT=Path(__file__).resolve().parents[3]
HERE=ROOT/'crawl/supabase/local/app-polish-acceptance/baseline'
source=json.loads((HERE/'catalog-source.json').read_text(encoding='utf8'))
functions=source['functions']+json.loads((HERE/'edge-direct-dependencies.json').read_text())['functions']+json.loads((HERE/'photo-worker-functions.json').read_text())
def sql(query):
 return subprocess.check_output(['docker','exec','-i','supabase_db_buffago-polish-acceptance','psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=query.encode('utf8')).decode('utf8').strip()
actual=json.loads(sql("select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'"))
normalize=lambda s:re.sub(r'\s+',' ',s).replace('"public".','public.').replace('"private".','private.').strip()
changed={'refresh_wing_media_photo_vote_counts','validate_wing_jury_vote_insert','enforce_wing_jury_vote_immutability'}
failures=[]
for f in functions:
 if f['name'] in changed:continue
 if not any(normalize(a['definition'])==normalize(f['definition']) for a in actual):failures.append(f['schema']+'.'+f['name'])
policies=json.loads(sql("select jsonb_agg(jsonb_build_object('schema',schemaname,'table_name',tablename,'name',policyname,'permissive',permissive,'roles',to_jsonb(roles),'cmd',cmd,'qual',qual,'with_check',with_check)) from pg_policies"))
expected=json.loads((HERE/'catalog-policies-normalized.json').read_text())
for p in expected:
 if p not in policies:failures.append('policy:'+p['schema']+'.'+p['name'])
actual_grants=json.loads(sql("select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'grants',(select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private')"))
canonical=lambda values:sorted((v['role'],v['privilege']) for v in values if v['role']!='postgres')
for t in source['tables']:
 actual_table=next(a for a in actual_grants if a['schema']==t['schema'] and a['name']==t['name'])
 if canonical(actual_table['grants'] or [])!=canonical(t['grants']):failures.append('table-grants:'+t['name'])
for t in source['tables']:
 if sql(f"select to_regclass('{t['schema']}.{t['name']}') is not null")!='t':failures.append('table:'+t['name'])
for name in ['archived_at','is_delete_marker']:
 if sql(f"select exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='{name}' and not attisdropped)")!='t':failures.append('storage:'+name)
result={'status':'FAIL' if failures else 'PASS','readOnlyLocalInspection':True,'baselineTablesPresent':len(source['tables']),'tableACLsCompared':len(source['tables']),'baselineFunctions':len(functions),'unchangedFunctionDefinitionsCompared':len(functions)-len(changed),'expectedBridgeFunctionChanges':sorted(changed),'policiesCompared':len(expected),'failures':failures,'priorTableColumnConstraintRLSValidation':'schema-baseline-validation.json (56 tables, pre-bridge)','scope':'dependency closure, not the entire production database; no platform auth/storage schema replay'}
(ROOT/'artifacts/app-polish/release-qa/deployment/staging-catalog-completeness.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result));assert not failures
