-- DRAFT_CONTAINMENT_NOT_APPROVED. No production execution authorized.
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
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261010192747' and name='wing_jury_saved_destinations_forward' and cardinality(statements)=1 and md5(statements[1])='23b58a9c58cc88f2a7c02c3aaa474e70' and created_by is null and idempotency_key is null and rollback is null) then raise exception 'containment_ledger';end if;
 if not exists(select 1 from pg_class where oid='public.destination_ratings'::regclass and relowner='postgres'::regrole) then raise exception 'containment_owner';end if;
 for r in select * from (values
('private.lock_rating_collection_identities','d1a1427b8858046ae5c7994cb45100f8'),
('private.remove_want_to_try_after_rating','a3d452a9719f81bebbc30e1ee5b22335'),
('private.remove_favorite_after_rating_delete','a28f7557a1e304278b63139fa9ab14f6'),
('private.lock_user_destination','ca54a798ad63c5fef73c4d8ab8ca33db')
 ) expected(name,body_md5) loop
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=r.name and md5(p.prosrc)=r.body_md5 and p.proowner='postgres'::regrole and p.prosecdef and p.proconfig=array['search_path=pg_catalog']) then raise exception 'containment_function_drift: %',r.name;end if;
 end loop;
 for r in select * from (values
('destination_ratings_lock_collection_identities','private.lock_rating_collection_identities()',31,false),
('destination_ratings_remove_want_to_try','private.remove_want_to_try_after_rating()',5,false),
('destination_ratings_update_want_to_try','private.remove_want_to_try_after_rating()',17,false),
('destination_ratings_remove_invalid_favorite','private.remove_favorite_after_rating_delete()',25,false)
 ) expected(name,handler,kind,has_columns) loop
  if not exists(select 1 from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname=r.name and tgfoid::regprocedure::text=r.handler and tgtype=r.kind and tgqual is null and tgnargs=0 and tgargs=''::bytea and tgattr::text=case when r.has_columns then (select string_agg(attnum::text,' ' order by case attname when 'user_id' then 1 else 2 end) from pg_attribute where attrelid='public.destination_ratings'::regclass and attname in ('user_id','destination_id')) else '' end and not tgisinternal and tgenabled='O') then raise exception 'containment_trigger_drift: %',r.name;end if;
 end loop;
 perform set_config('buffago.containment_baseline',coalesce((select md5(string_agg(pg_get_triggerdef(oid)||':'||tgenabled::text,E'\n' order by tgname)) from pg_trigger where tgrelid='public.destination_ratings'::regclass and not tgisinternal and tgname not in ('destination_ratings_lock_collection_identities','destination_ratings_remove_want_to_try','destination_ratings_update_want_to_try','destination_ratings_remove_invalid_favorite')),''),true);
end;$guard$;
revoke insert,delete on public.user_destination_favorites,public.user_want_to_try from authenticated;
revoke insert on public.wing_jury_votes from authenticated;
alter table public.destination_ratings disable trigger destination_ratings_lock_collection_identities;
alter table public.destination_ratings disable trigger destination_ratings_remove_want_to_try;
alter table public.destination_ratings disable trigger destination_ratings_update_want_to_try;
alter table public.destination_ratings disable trigger destination_ratings_remove_invalid_favorite;
do $post$
begin
 if coalesce((select md5(string_agg(pg_get_triggerdef(oid)||':'||tgenabled::text,E'\n' order by tgname)) from pg_trigger where tgrelid='public.destination_ratings'::regclass and not tgisinternal and tgname not in ('destination_ratings_lock_collection_identities','destination_ratings_remove_want_to_try','destination_ratings_update_want_to_try','destination_ratings_remove_invalid_favorite')),'')<>current_setting('buffago.containment_baseline') then raise exception 'containment_baseline_trigger_changed';end if;
 if (select count(*) from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname in ('destination_ratings_lock_collection_identities','destination_ratings_remove_want_to_try','destination_ratings_update_want_to_try','destination_ratings_remove_invalid_favorite') and tgenabled='D')<>4 then raise exception 'containment_postflight';end if;
 if exists(select 1 from (values('public.user_destination_favorites'),('public.user_want_to_try'),('public.wing_jury_votes')) t(name) cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege) where has_table_privilege('authenticated',t.name,p.privilege)) then raise exception 'containment_feature_write_still_allowed';end if;
end;$post$;
commit;
-- Independent read-only postflight must confirm these four disabled triggers,
-- closed mutations, unchanged old handlers/ledger and retained feature row counts.
-- Connection loss after COMMIT: unknown; read-only inspect, never automatic replay.
