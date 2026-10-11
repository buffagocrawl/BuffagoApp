import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyPackage } from '../supabase/local/phase-7b3a/verify-package.mjs';

// No network transport or production CLI. This reviewed kernel is exercised only
// through the dedicated Docker runner. A production adapter is a separate gate.
export const project = 'vhfxnizaxdanmvmouuaf';
export const version = '20261010192747';
export const migrationHash = 'f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3';
export const preflightHash = '66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b';
const base = new URL('../supabase/local/phase-7b3a/', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const literal = text => "E'" + text.replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";

// Fingerprint metadata, not data or literal function bodies. Include the WHOLE
// ledger, role graph, defaults, prerequisite relation shape and dependent code.
export const snapshotExpression = `jsonb_build_object(
 'database',current_database(),'user',current_user,'session',session_user,
 'version',current_setting('server_version_num'),
 'ledger',(select coalesce(jsonb_agg(jsonb_build_array(m.version,m.name,md5(coalesce(m.statements::text,'')),md5(to_jsonb(m)::text)) order by m.version),'[]'::jsonb) from supabase_migrations.schema_migrations m),
 'roles',(select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig) order by rolname) from pg_roles),
 'members',(select coalesce(jsonb_agg(jsonb_build_array(roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) order by roleid::regrole::text,member::regrole::text,grantor::regrole::text),'[]'::jsonb) from pg_auth_members),
 'schemas',(select jsonb_agg(jsonb_build_array(nspname,nspowner::regrole::text,nspacl::text) order by nspname) from pg_namespace where nspname in ('public','private','auth','storage','supabase_migrations')),
 'defaults',(select coalesce(jsonb_agg(jsonb_build_array(defaclrole::regrole::text,defaclnamespace,defaclobjtype,defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype),'[]'::jsonb) from pg_default_acl),
 'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','storage','supabase_migrations') and c.relkind in ('r','p','v','m','S','f')),
 'columns',(select jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),a.attacl::text) order by a.attrelid::regclass::text,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth','storage','supabase_migrations') and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,convalidated,pg_get_constraintdef(oid,true)) order by conrelid::regclass::text,conname) from pg_constraint where connamespace in (select oid from pg_namespace where nspname in ('public','private','auth','storage','supabase_migrations'))),
 'indexes',(select jsonb_agg(jsonb_build_array(i.indexrelid::regclass::text,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) order by i.indexrelid::regclass::text) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','storage','supabase_migrations')),
 'triggers',(select jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private','auth','storage','supabase_migrations')),
 'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner::regrole::text,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text,md5(p.prosrc),p.prorettype::regtype::text,p.proallargtypes,p.proargmodes,p.proargnames,p.prolang,p.prokind) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','storage','supabase_migrations')),
 'rules',(select coalesce(jsonb_agg(jsonb_build_array(ev_class::regclass::text,rulename,md5(pg_get_ruledef(oid,true))) order by ev_class::regclass::text,rulename),'[]'::jsonb) from pg_rewrite),
 'event_triggers',(select coalesce(jsonb_agg(jsonb_build_array(evtname,evtevent,evtowner::regrole::text,evtfoid::regprocedure::text,evtenabled,evttags,md5(p.prosrc),p.proconfig,p.proacl::text) order by evtname),'[]'::jsonb) from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) order by polrelid::regclass::text,polname),'[]'::jsonb) from pg_policy)
)`;
export const snapshotSQL = `begin read only; set local search_path=pg_catalog,public; select md5((${snapshotExpression})::text); rollback;`;

export const effectivePrivilegeGate = `do $acl$
declare r record; t text; p text; allowed boolean;
begin
 for r in select api.rolname api,parent.rolname parent from pg_roles api cross join pg_roles parent where api.rolname in ('anon','authenticated','service_role') and parent.oid<>api.oid and pg_has_role(api.oid,parent.oid,'SET') loop
  raise exception 'phase7b3b_unapproved_set_role_path: % -> %',r.api,r.parent;
 end loop;
 for t in select unnest(array['user_destination_favorites','user_want_to_try','wing_jury_votes','wing_jury_photo_vote_counts']) loop
  if not exists(select 1 from pg_class c where c.oid=('public.'||t)::regclass and c.relowner='postgres'::regrole and c.relrowsecurity) then raise exception 'phase7b3b_owner_rls'; end if;
  if exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=('public.'||t)::regclass and (a.grantee not in ('postgres'::regrole,'authenticated'::regrole,'service_role'::regrole) or (a.grantee<>'postgres'::regrole and a.is_grantable))) then raise exception 'phase7b3b_unapproved_table_grantee'; end if;
  if exists(select 1 from pg_attribute where attrelid=('public.'||t)::regclass and attacl is not null) then raise exception 'phase7b3b_unapproved_column_acl'; end if;
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    allowed := (p='SELECT' and r.rolname in ('authenticated','service_role'))
      or (r.rolname='authenticated' and p='INSERT' and t<>'wing_jury_photo_vote_counts')
      or (r.rolname='authenticated' and p='DELETE' and t in ('user_destination_favorites','user_want_to_try'));
    if has_table_privilege(r.rolname,'public.'||t,p) is distinct from allowed then raise exception 'phase7b3b_effective_acl: %.% %',r.rolname,t,p; end if;
   end loop;
  end loop;
 end loop;
 for r in select p.oid,p.proname,n.nspname,p.proowner,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='public' and p.proname in ('is_public_wing_jury_photo','wing_jury_restaurant_rating_summary','wing_jury_feed_candidates')) or
 (n.nspname='private' and p.proname in ('lock_user_destination','require_authenticated_user','validate_favorite_insert','validate_want_to_try_insert','remove_want_to_try_after_rating','lock_rating_collection_identities','remove_favorite_after_rating_delete','is_public_wing_jury_photo','validate_wing_jury_vote_insert','enforce_wing_jury_vote_immutability','refresh_wing_jury_photo_vote_counts')) loop
  if r.proowner <> 'postgres'::regrole or r.proconfig is distinct from array['search_path=pg_catalog'] then raise exception 'phase7b3b_function_owner_path'; end if;
  for t in select unnest(array['anon','authenticated','service_role']) loop
   allowed := (t='service_role' and r.nspname='public') or (t='authenticated' and r.nspname='private' and r.proname='is_public_wing_jury_photo');
   if has_function_privilege(t,r.oid,'EXECUTE') is distinct from allowed then raise exception 'phase7b3b_effective_function_acl: % %',t,r.proname; end if;
  end loop;
  if exists(select 1 from aclexplode(r.proacl) where grantee=0) then raise exception 'phase7b3b_public_function_acl'; end if;
  if exists(select 1 from aclexplode(r.proacl) a where a.grantee<>'postgres'::regrole and (a.is_grantable or (not (r.nspname='public' and a.grantee='service_role'::regrole) and not (r.nspname='private' and r.proname='is_public_wing_jury_photo' and a.grantee='authenticated'::regrole)))) then raise exception 'phase7b3b_unapproved_function_grantee'; end if;
 end loop;
end; $acl$;`;

export async function frozenBytes() {
 await verifyPackage();
 const sql = await readFile(new URL(`supabase/migrations/${version}_wing_jury_saved_destinations_forward.sql`,base));
 const preflight = await readFile(new URL('production-fingerprint-preflight.sql',base));
 assert.equal(sha(sql),migrationHash); assert.equal(sha(preflight),preflightHash);
 return {sql:sql.toString('utf8'),preflight:preflight.toString('utf8')};
}

// Exact hash identifies this known envelope, not arbitrary SQL parsing. Original
// bytes are retained; only insert guards before body and ledger before COMMIT.
export async function transactionKernel({snapshot, expectedDatabase, strict=true}) {
 assert.match(snapshot,/^[a-f0-9]{32}$/); assert.match(expectedDatabase,/^[a-zA-Z0-9_]+$/);
 assert.equal(typeof strict,'boolean');
 if(!strict) assert.match(expectedDatabase,/^buffago_phase7b25_[0-9]+$/,'Fixture lane cannot target production');
 const {sql,preflight}=await frozenBytes();
 const begin=sql.indexOf('begin;'); const end=sql.lastIndexOf('commit;');
 assert.ok(begin>=0 && end>begin); assert.equal(sql.slice(end).trim(),'commit;');
 assert.equal((sql.match(/^begin;$/gm)||[]).length,1); assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
 const prefix=sql.slice(0,begin+'begin;'.length), body=sql.slice(begin+'begin;'.length,end), terminal=sql.slice(end);
 assert.equal(prefix+body+terminal,sql);
 const fingerprint=preflight.replace('begin read only;','').replace(/rollback;\s*$/,'');
 const guard=`set local lock_timeout='5s'; set local statement_timeout='60s'; set local search_path=pg_catalog,public;
do $authority$ declare s text; begin
 if current_user<>'postgres' or session_user<>'postgres' then raise exception 'phase7b3b_identity'; end if;
 foreach s in array array['public','private','auth','storage','supabase_migrations'] loop
  if not has_schema_privilege('postgres',s,'USAGE') then raise exception 'phase7b3b_schema_usage: %',s; end if;
 end loop;
 if not has_table_privilege('postgres','supabase_migrations.schema_migrations','SELECT') or not has_table_privilege('postgres','supabase_migrations.schema_migrations','INSERT') or not has_table_privilege('postgres','supabase_migrations.schema_migrations','UPDATE') then raise exception 'phase7b3b_ledger_authority'; end if;
end; $authority$;
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table public.destination_ratings,public.wing_media_submissions in share row exclusive mode;
do $executor$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_database()<>${literal(expectedDatabase)} then raise exception 'phase7b3b_identity'; end if;
 if md5((${snapshotExpression})::text)<>${literal(snapshot)} then raise exception 'phase7b3b_snapshot_drift'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version>=${literal(version)}) then raise exception 'phase7b3b_nonforward_ledger'; end if;
end; $executor$;
`;
 // Only the original immutable SQL is stored, not executor controls or ledger SQL.
 const ledger=`${effectivePrivilegeGate}
insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(version)},'wing_jury_saved_destinations_forward',array[${literal(sql)}]::text[]);
`;
 return prefix+'\n'+guard+(strict?fingerprint:'')+body+ledger+terminal;
}

export async function productionPlan(approval) {
 assert.equal(approval?.project,project,'Wrong target project');
 assert.equal(approval?.host,`db.${project}.supabase.co`,'Only reviewed direct target endpoint');
 assert.equal(approval?.port,5432); assert.equal(approval?.database,'postgres');
 assert.equal(approval?.user,'postgres'); assert.equal(approval?.tls,'verify-full');
 assert.equal(approval?.migrationHash,migrationHash);
 for(const key of ['historyException','behaviorClosure','maintenanceWindow','ledgerMechanism','productionWriteAuthorization','targetIdentityEvidence']) assert.ok(approval[key]?.trim(),`Missing explicit ${key}`);
 // Attestations are human/control-plane evidence, not assertions SQL can prove.
 // Actual verified host/certificate/session matching must be enforced by adapter.
 return {project,version,migrationHash,preflightHash,sql:await transactionKernel({snapshot:approval.snapshot,expectedDatabase:'postgres'}),transport:'NOT IMPLEMENTED; production execution prohibited'};
}

export async function executeDisposableKernel(query,db,{strict=true, audit}) {
 assert.match(db,/^buffago_phase7b25_[0-9]+$/,'Only disposable database names');
 assert.equal(typeof audit,'function','Durable external evidence sink required');
 await audit({status:'started',database:db,version,migrationHash,strict,production:false});
 try {
  const snapshot=await query(db,snapshotSQL);
  const sql=await transactionKernel({snapshot,expectedDatabase:db,strict});
  await query(db,sql);
  const evidence=await query(db,`select version||':'||md5(statements[1]) from supabase_migrations.schema_migrations where version='${version}'`);
  await audit({status:'confirmed',database:db,evidence,production:false});
  return evidence;
 } catch(error) {
  await audit({status:'failed-or-unknown',database:db,error:error.message,production:false});
  throw error;
 }
}
