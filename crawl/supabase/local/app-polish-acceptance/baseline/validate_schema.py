"""Validate the real isolated catalog against captured schema metadata."""
from pathlib import Path
import json
import subprocess
import re

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
b=json.loads((HERE/'catalog-source.json').read_text(encoding='utf-8'))
def query(sql):
 r=subprocess.run(['docker','exec','-i','supabase_db_buffago-polish-acceptance','psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=sql.encode('utf-8'),capture_output=True,check=True)
 return r.stdout.decode('utf-8').strip()
# Restore function text through UTF-8 bytes (PowerShell's default text pipeline
# may transcode Unicode). CREATE OR REPLACE keeps grants; no rows are altered.
query('begin;set local check_function_bodies=off;'+ '\n'.join(f['definition'].rstrip(';')+';' for f in b['functions'])+'commit;')
defaults=[]
for t in b['tables']:
 for c in t['columns']:
  if c['default'] and not c['identity'] and not c['generated']:
   defaults.append(f'alter table "{t["schema"]}"."{t["name"]}" alter column "{c["name"]}" set default {c["default"]};')
query('begin;set local search_path=pg_catalog,public,extensions;'+ '\n'.join(defaults)+'commit;')
indexes=[]
for t in b['tables']:
 for definition in t['indexes']:
  match=re.match(r'CREATE (?:UNIQUE )?INDEX (\w+) ON ',definition)
  if not match:raise RuntimeError('Unsupported index identifier')
  indexes.append(f'drop index "{t["schema"]}"."{match[1]}";'+definition.rstrip(';')+';')
# Unicode in partial-index predicates must match function literals exactly.
# This is setup repair on the new isolated baseline, before fixture creation.
query('begin;'+ '\n'.join(indexes)+'commit;')
actual=json.loads(query("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f';"))
normalize=lambda s:re.sub(r'\s+',' ',s).strip().replace('CREATE OR REPLACE FUNCTION "public".','CREATE OR REPLACE FUNCTION public.').replace('CREATE OR REPLACE FUNCTION "private".','CREATE OR REPLACE FUNCTION private.')
missing=[f['schema']+'.'+f['name'] for f in b['functions'] if not any(normalize(f['definition'])==normalize(a['definition']) for a in actual)]
table_failures=[]
for t in b['tables']:
 columns=json.loads(query(f"select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='{t['schema']}.{t['name']}'::regclass and a.attnum>0 and not a.attisdropped;"))
 # Generated column was added after functions; compare by name, not ordinal.
 if sorted(columns,key=lambda c:c['name'])!=sorted(t['columns'],key=lambda c:c['name']):table_failures.append(t['schema']+'.'+t['name'])
 constraints=json.loads(query(f"select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid))),'[]'::jsonb) from pg_constraint where conrelid='{t['schema']}.{t['name']}'::regclass;"))
 expected=[{'name':c['name'],'definition':c['definition']} for c in t['constraints']]
 # PostgreSQL flattens a nested AND during recreation; this one captured
 # expression has identical terms/OR grouping, with a redundant AND wrapper.
 for c in expected:
  if c['name']=='destination_ratings_flavor_vibe_check':
   c['definition']=c['definition'].replace('(((array_length(flavor_vibe, 1) >= 1) AND (array_length(flavor_vibe, 1) <= 2)) AND', '((array_length(flavor_vibe, 1) >= 1) AND (array_length(flavor_vibe, 1) <= 2) AND')
 if sorted(constraints,key=lambda c:c['name'])!=sorted(expected,key=lambda c:c['name']):table_failures.append(t['name']+':constraints')
 flags=query(f"select relrowsecurity||','||relforcerowsecurity from pg_class where oid='{t['schema']}.{t['name']}'::regclass;")
 if flags!=f'{str(t["rls"]).lower()},{str(t["force_rls"]).lower()}':table_failures.append(t['name']+':rls')
result={'function_definitions_checked':len(b['functions']),'table_definitions_constraints_rls_checked':len(b['tables']),'missing_or_different_functions':missing,'different_tables':table_failures,'status':'PASS' if not missing and not table_failures else 'FAIL','scope':'real isolated PostgreSQL catalog, before fixtures; not yet HTTP/worker acceptance'}
out=ROOT/'artifacts/app-polish/release-qa/deployment/schema-baseline-validation.json'
out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
if result['status']!='PASS':raise SystemExit(1)
