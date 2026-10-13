"""Build an isolated schema-only dependency closure from read-only catalog data."""
from pathlib import Path
import json

HERE=Path(__file__).resolve().parent
b=json.loads((HERE/'catalog-source.json').read_text(encoding='utf-8'))
b['policies']=json.loads((HERE/'catalog-policies-normalized.json').read_text(encoding='utf-8'))
b['functions']+=json.loads((HERE/'edge-direct-dependencies.json').read_text(encoding='utf-8'))['functions']
b['functions']+=json.loads((HERE/'photo-worker-functions.json').read_text(encoding='utf-8'))
signatures={x['oid']:x['arguments'] for x in json.loads((HERE/'catalog-signatures.json').read_text(encoding='utf-8'))}
extra_signatures={
 'wing_jury_restaurant_rating_summary':'uuid',
 'claim_wing_photo_derivative_job':'text, integer, uuid',
 'begin_wing_photo_derivative_job':'uuid, uuid',
 'settle_wing_photo_derivative_job':'uuid, uuid, boolean, boolean, text, text, text, text, text',
}
for f in b['functions']:
 if f['oid'] not in signatures:signatures[f['oid']]=extra_signatures[f['name']]
sequences=json.loads((HERE/'catalog-sequences.json').read_text(encoding='utf-8'))
schemas=json.loads((HERE/'catalog-schemas.json').read_text(encoding='utf-8'))
q=lambda name:'"'+name.replace('"','""')+'"'
qual=lambda s,n:q(s)+'.'+q(n)
roles=set()
for obj in [*b['tables'],*b['functions'],*schemas,*sequences]:
 roles.update(x['role'] for x in obj['grants'] if x['role']!='PUBLIC')
for p in b['policies']:roles.update(r for r in p['roles'] if r.lower()!='public')
out=['-- LOCAL ACCEPTANCE ONLY: schema metadata, no production rows/secrets.',
     'begin;',"set local lock_timeout='5s';","set local statement_timeout='180s';",
     'set local check_function_bodies=off;','set local search_path=pg_catalog,public,extensions;']
for role in sorted(roles):
 out.append(f"do $$begin if not exists(select 1 from pg_roles where rolname='{role}') then create role {q(role)} nologin;end if;end$$;")
for s in schemas:out.append(f'create schema if not exists {q(s["name"])};')
for t in b['types']:
 if t['kind']!='e':raise RuntimeError('Unsupported type '+t['name'])
 out.append('create type '+qual(t['schema'],t['name'])+' as enum ('+','.join("'"+v.replace("'","''")+"'" for v in t['labels'])+');')
defaults='\n'.join(c['default'] or '' for t in b['tables'] for c in t['columns'])
used_sequences=[s for s in sequences if s['name'] in defaults]
for s in used_sequences:
 limit=2147483647 if s['type']=='integer' else 9223372036854775807
 # JSON numeric catalog values can round bigint MAX; clamp only to type bound.
 out.append(f'create sequence {qual(s["schema"],s["name"])} as {s["type"]} increment by {s["increment"]} minvalue {s["min"]} maxvalue {min(int(s["max"]),limit)} start with {s["start"]} cache {s["cache"]} '+('cycle;' if s['cycle'] else 'no cycle;'))
for t in b['tables']:
 columns=[]
 for c in t['columns']:
  if c['generated']:continue
  definition=q(c['name'])+' '+c['type']
  if c['identity']:definition+=' generated '+('always' if c['identity']=='a' else 'by default')+' as identity'
  if c['notnull']:definition+=' not null'
  columns.append(definition)
 out.append('create table '+qual(t['schema'],t['name'])+' ('+','.join(columns)+');')
for f in b['functions']:out.append(f['definition'].rstrip(';')+';')
for t in b['tables']:
 name=qual(t['schema'],t['name'])
 for c in t['columns']:
  if c['generated']:
   out.append(f'alter table {name} add column {q(c["name"])} {c["type"]} generated always as ({c["default"]}) stored'+(' not null;' if c['notnull'] else ';'))
  elif c['default'] and not c['identity']:out.append(f'alter table {name} alter column {q(c["name"])} set default {c["default"]};')
 # FKs must follow all primary/unique keys; use a separate pass below.
 for c in t['constraints']:
  if c['type']!='f':out.append(f'alter table {name} add constraint {q(c["name"])} {c["definition"]};')
for t in b['tables']:
 name=qual(t['schema'],t['name'])
 for c in t['constraints']:
  if c['type']=='f':out.append(f'alter table {name} add constraint {q(c["name"])} {c["definition"]};')
 out.extend(i.rstrip(';')+';' for i in t['indexes'])
 if t['rls']:out.append(f'alter table {name} enable row level security;')
 if t['force_rls']:out.append(f'alter table {name} force row level security;')
for p in b['policies']:
 name=qual(p['schema'],p['table_name'])
 out.append(f'drop policy if exists {q(p["name"])} on {name};')
 rolelist=','.join('PUBLIC' if r.lower()=='public' else q(r) for r in p['roles'])
 definition=f'create policy {q(p["name"])} on {name} as {p["permissive"]} for {p["cmd"]} to {rolelist}'
 if p['qual']:definition+=' using ('+p['qual']+')'
 if p['with_check']:definition+=' with check ('+p['with_check']+')'
 out.append(definition+';')
for t in b['triggers']:out.append(t['definition'].rstrip(';')+';')
def grants(kind,name,values):
 out.append(f'revoke all on {kind} {name} from PUBLIC,anon,authenticated,service_role;')
 for g in values:
  if g['role']=='postgres':continue
  role='PUBLIC' if g['role']=='PUBLIC' else q(g['role'])
  out.append(f'grant {g["privilege"]} on {kind} {name} to {role};')
for s in schemas:grants('schema',q(s['name']),s['grants'])
for t in b['tables']:grants('table',qual(t['schema'],t['name']),t['grants'])
for f in b['functions']:grants('function',qual(f['schema'],f['name'])+'('+signatures[f['oid']]+')',f['grants'])
for s in used_sequences:grants('sequence',qual(s['schema'],s['name']),s['grants'])
out+=['notify pgrst, \'reload schema\';','commit;']
(HERE/'schema-baseline.sql').write_text('\n'.join(out)+'\n',encoding='utf-8')
print(f'Built schema-only closure: {len(b["tables"])} tables, {len(b["functions"])} functions, {len(b["policies"])} policies; no rows.')
