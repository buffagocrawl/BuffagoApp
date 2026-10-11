import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {frozenBytes,version} from './phase7b3b-feature-executor.mjs';

// Offline authoring only: never connects and never modifies frozen artifacts.
const {sql}=await frozenBytes();
const md5=value=>createHash('md5').update(value).digest('hex');
const names=['lock_rating_collection_identities','remove_want_to_try_after_rating','remove_favorite_after_rating_delete','lock_user_destination'];
const functionRows=names.map(name=>{
 const match=sql.match(new RegExp(`create function private\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`));
 if(!match)throw new Error(`Missing frozen helper ${name}`);
 return `('private.${name}','${md5(match[1])}')`;
}).join(',\n');
const triggers=[
 ['destination_ratings_lock_collection_identities','lock_rating_collection_identities',31,false],
 ['destination_ratings_remove_want_to_try','remove_want_to_try_after_rating',5,false],
 ['destination_ratings_update_want_to_try','remove_want_to_try_after_rating',17,false],
 ['destination_ratings_remove_invalid_favorite','remove_favorite_after_rating_delete',25,false],
];
const triggerRows=triggers.map(([name,fn,type,attrs])=>`('${name}','private.${fn}()',${type},${attrs})`).join(',\n');
const exclusions=triggers.map(([name])=>`'${name}'`).join(',');
const output=`-- DRAFT_CONTAINMENT_NOT_APPROVED. No production execution authorized.
-- Exact target vhfxnizaxdanmvmouuaf; direct authenticated verify-full connection,
-- session_user=current_user=postgres, owner-approved incident scope required.
-- FIRST block Jury/saved-list gateways and clients; preserve durable incident logs.
-- This is containment, not a down migration or permission to repair history.
-- Rating writes may continue; saved-list invariants are stale until reconciliation.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path=pg_catalog;
lock table public.destination_ratings in share row exclusive mode;
do $guard$
declare r record;
begin
 if current_database()<>'postgres' or current_user<>'postgres' or session_user<>'postgres' then raise exception 'containment_identity';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}' and name='wing_jury_saved_destinations_forward' and cardinality(statements)=1 and md5(statements[1])='${md5(sql)}' and created_by is null and idempotency_key is null and rollback is null) then raise exception 'containment_ledger';end if;
 if not exists(select 1 from pg_class where oid='public.destination_ratings'::regclass and relowner='postgres'::regrole) then raise exception 'containment_owner';end if;
 for r in select * from (values
${functionRows}
 ) expected(name,body_md5) loop
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=r.name and md5(p.prosrc)=r.body_md5 and p.proowner='postgres'::regrole and p.prosecdef and p.proconfig=array['search_path=pg_catalog']) then raise exception 'containment_function_drift: %',r.name;end if;
 end loop;
 for r in select * from (values
${triggerRows}
 ) expected(name,handler,kind,has_columns) loop
  if not exists(select 1 from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname=r.name and tgfoid::regprocedure::text=r.handler and tgtype=r.kind and tgqual is null and tgnargs=0 and tgargs=''::bytea and tgattr::text=case when r.has_columns then (select string_agg(attnum::text,' ' order by case attname when 'user_id' then 1 else 2 end) from pg_attribute where attrelid='public.destination_ratings'::regclass and attname in ('user_id','destination_id')) else '' end and not tgisinternal and tgenabled='O') then raise exception 'containment_trigger_drift: %',r.name;end if;
 end loop;
 perform set_config('buffago.containment_baseline',coalesce((select md5(string_agg(pg_get_triggerdef(oid)||':'||tgenabled::text,E'\\n' order by tgname)) from pg_trigger where tgrelid='public.destination_ratings'::regclass and not tgisinternal and tgname not in (${exclusions})),''),true);
end;$guard$;
revoke insert,delete on public.user_destination_favorites,public.user_want_to_try from authenticated;
revoke insert on public.wing_jury_votes from authenticated;
${triggers.map(([name])=>`alter table public.destination_ratings disable trigger ${name};`).join('\n')}
do $post$
begin
 if coalesce((select md5(string_agg(pg_get_triggerdef(oid)||':'||tgenabled::text,E'\\n' order by tgname)) from pg_trigger where tgrelid='public.destination_ratings'::regclass and not tgisinternal and tgname not in (${exclusions})),'')<>current_setting('buffago.containment_baseline') then raise exception 'containment_baseline_trigger_changed';end if;
 if (select count(*) from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname in (${exclusions}) and tgenabled='D')<>4 then raise exception 'containment_postflight';end if;
 if exists(select 1 from (values('public.user_destination_favorites'),('public.user_want_to_try'),('public.wing_jury_votes')) t(name) cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege) where has_table_privilege('authenticated',t.name,p.privilege)) then raise exception 'containment_feature_write_still_allowed';end if;
end;$post$;
commit;
-- Independent read-only postflight must confirm these four disabled triggers,
-- closed mutations, unchanged old handlers/ledger and retained feature row counts.
-- Connection loss after COMMIT: unknown; read-only inspect, never automatic replay.
`;
await writeFile(new URL('../../docs/buffago-final-rating-containment-candidate.sql',import.meta.url),output);
console.log('Draft containment authored offline; no authorization or connection.');
