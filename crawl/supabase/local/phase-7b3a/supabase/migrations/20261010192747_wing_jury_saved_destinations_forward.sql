-- QUARANTINED DRAFT: no production application authorized.
-- Must be paired with strict production fingerprint preflight and runbook gates.
begin;
-- Embedded at the beginning of the quarantined forward migration.
-- No identity claims, business-function calls or application rows are read.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;
do $preflight$
declare
  r record;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'phase7b3a_requires_verified_postgres_executor';
  end if;
  if current_setting('transaction_isolation') <> 'read committed'
     or current_setting('server_version_num')::integer < 170006
     or current_setting('server_version_num')::integer >= 180000 then
    raise exception 'phase7b3a_runtime_contract_mismatch';
  end if;
  if not (select rolbypassrls from pg_roles where rolname='postgres') then
    raise exception 'phase7b3a_definer_owner_must_bypass_rls';
  end if;
  for r in select role_name from (values ('anon'),('authenticated'),('service_role')) v(role_name) loop
    if not exists(select 1 from pg_roles where rolname=r.role_name) then
      raise exception 'phase7b3a_missing_role: %',r.role_name;
    end if;
    if exists(select 1 from pg_roles parent where
      (parent.rolsuper or parent.rolcreaterole or parent.rolcreatedb or parent.rolreplication
        or (parent.rolbypassrls and r.role_name <> 'service_role'))
      and pg_has_role(r.role_name,parent.oid,'USAGE')) then
      raise exception 'phase7b3a_untrusted_role_membership: %',r.role_name;
    end if;
    if has_schema_privilege(r.role_name,'public','CREATE')
      or has_schema_privilege(r.role_name,'private','CREATE')
      or has_schema_privilege(r.role_name,'private','USAGE') then
      raise exception 'phase7b3a_untrusted_schema_privilege: %',r.role_name;
    end if;
  end loop;
  if not has_schema_privilege('postgres','public','CREATE')
     or not has_schema_privilege('postgres','private','CREATE') then
    raise exception 'phase7b3a_owner_schema_authority_missing';
  end if;
  for r in select * from (values
    ('auth.users','supabase_auth_admin'),('storage.objects','supabase_storage_admin'),
    ('public.destination_ratings','postgres'),('public.destinations','postgres'),
    ('public.wing_media_submissions','postgres')) v(relation_name,owner_name) loop
    if not exists(select 1 from pg_class c where c.oid=to_regclass(r.relation_name)
       and c.relkind='r' and c.relrowsecurity and c.relowner=to_regrole(r.owner_name)) then
      raise exception 'phase7b3a_relation_owner_rls_mismatch: %',r.relation_name;
    end if;
    if not has_table_privilege('postgres',r.relation_name,'SELECT') then
      raise exception 'phase7b3a_owner_read_missing: %',r.relation_name;
    end if;
  end loop;
  if not has_table_privilege('postgres','auth.users','REFERENCES')
    or not has_table_privilege('postgres','storage.objects','UPDATE')
    or not has_table_privilege('postgres','public.destination_ratings','TRIGGER') then
    raise exception 'phase7b3a_owner_fk_lock_trigger_authority_missing';
  end if;
  if to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null then
    raise exception 'phase7b3a_auth_helpers_missing';
  end if;
  for r in select * from (values
    ('auth.users','id','uuid',true),('public.destinations','id','uuid',true),
    ('public.destinations','name','text',true),('public.destinations','address','text',false),
    ('public.destinations','city','text',false),('public.destinations','lat','numeric',false),
    ('public.destinations','lng','numeric',false),('public.crawls','crawl_id','uuid',true),
    ('public.destination_ratings','id','uuid',true),('public.destination_ratings','user_id','uuid',false),
    ('public.destination_ratings','destination_id','uuid',true),('public.destination_ratings','crawl_id','uuid',true),
    ('public.destination_ratings','weight_score','numeric',false),
    ('public.destination_ratings','created_at','timestamp with time zone',true),
    ('public.destination_ratings','is_buffacoin','boolean',true),
    ('public.wing_media_submissions','id','uuid',true),('public.wing_media_submissions','user_id','uuid',false),
    ('public.wing_media_submissions','destination_id','uuid',true),('public.wing_media_submissions','rating_id','uuid',false),
    ('public.wing_media_submissions','media_type','text',true),('public.wing_media_submissions','status','text',true),
    ('public.wing_media_submissions','created_at','timestamp with time zone',true),
    ('public.wing_media_submissions','owner_deleted_at','timestamp with time zone',false),
    ('public.wing_media_submissions','withdrawn_at','timestamp with time zone',false),
    ('public.wing_media_submissions','processed_storage_path','text',false),
    ('public.wing_media_submissions','consent_version','text',true),
    ('public.wing_media_submissions','consented_at','timestamp with time zone',true),
    ('public.wing_media_submissions','attribution_preference','text',true),
    ('storage.objects','bucket_id','text',false),('storage.objects','name','text',false),
    ('storage.objects','archived_at','timestamp with time zone',false),
    ('storage.objects','is_delete_marker','boolean',true)) v(relation_name,column_name,type_name,required_not_null) loop
    if not exists(select 1 from pg_attribute a where a.attrelid=to_regclass(r.relation_name)
      and a.attname=r.column_name and not a.attisdropped
      and format_type(a.atttypid,a.atttypmod)=r.type_name
      and a.attnotnull=r.required_not_null) then
      raise exception 'phase7b3a_column_contract_mismatch: %.%',r.relation_name,r.column_name;
    end if;
  end loop;
end;
$preflight$;

-- Locks protect reused table definitions while adding triggers/FKs/indexes.
-- This is a blocking index build, bounded by timeouts; workload approval is
-- required before application. A coordinated DDL freeze covers schemas/roles.
lock table public.destination_ratings,public.wing_media_submissions in share row exclusive mode;
lock table public.destinations,public.crawls,auth.users,storage.objects in access share mode;

do $collisions$
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array['user_destination_favorites','user_want_to_try','wing_jury_votes','wing_jury_photo_vote_counts','user_destination_favorites_destination_idx','user_want_to_try_destination_idx','wing_jury_votes_user_idx','wing_jury_photo_vote_counts_like_idx','wing_media_submissions_wing_jury_candidate_idx','wing_jury_votes_submission_vote_idx','user_destination_favorites_pkey','user_want_to_try_pkey','wing_jury_votes_pkey','wing_jury_photo_vote_counts_pkey']))
    or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname=any(array['user_destination_favorites','user_want_to_try','wing_jury_votes','wing_jury_photo_vote_counts'])) then
    raise exception 'phase7b3a_relation_type_index_collision';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname||'.'||p.proname)=any(array['private.lock_user_destination','private.require_authenticated_user','private.validate_favorite_insert','private.validate_want_to_try_insert','private.remove_want_to_try_after_rating','private.lock_rating_collection_identities','private.remove_favorite_after_rating_delete','private.is_public_wing_jury_photo','public.is_public_wing_jury_photo','public.wing_jury_restaurant_rating_summary','public.wing_jury_feed_candidates','private.validate_wing_jury_vote_insert','private.enforce_wing_jury_vote_immutability','private.refresh_wing_jury_photo_vote_counts'])) then
    raise exception 'phase7b3a_function_name_or_overload_collision';
  end if;
  if exists(select 1 from pg_trigger t where not t.tgisinternal and (t.tgrelid::regclass::text,t.tgname) in (('user_destination_favorites','user_destination_favorites_validate_insert'),('user_want_to_try','user_want_to_try_validate_insert'),('destination_ratings','destination_ratings_lock_collection_identities'),('destination_ratings','destination_ratings_remove_want_to_try'),('destination_ratings','destination_ratings_update_want_to_try'),('destination_ratings','destination_ratings_remove_invalid_favorite'),('wing_jury_votes','wing_jury_votes_validate_insert'),('wing_jury_votes','wing_jury_votes_enforce_immutability'),('wing_jury_votes','wing_jury_votes_refresh_counts'))) then
    raise exception 'phase7b3a_trigger_collision';
  end if;
end;
$collisions$;

do $constraints$
declare r record;
begin
  for r in select * from (values
    ('public.crawls','crawls_pkey','PRIMARY KEY (crawl_id)'),
    ('public.crawls','crawls_route_id_fkey','FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE'),
    ('public.destination_ratings','destination_ratings_pkey','PRIMARY KEY (id)'),
    ('public.destination_ratings','destination_ratings_crawl_id_fkey','FOREIGN KEY (crawl_id) REFERENCES crawls(crawl_id) ON DELETE CASCADE'),
    ('public.destination_ratings','destination_ratings_destination_id_fkey','FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE'),
    ('public.destination_ratings','destination_ratings_user_id_fkey','FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('public.destination_ratings','destination_ratings_dest_crawl_user_uniq','UNIQUE (destination_id, crawl_id, user_id)'),
    ('public.wing_media_submissions','wing_media_submissions_pkey','PRIMARY KEY (id)'),
    ('public.wing_media_submissions','wing_media_submissions_destination_id_fkey','FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE RESTRICT'),
    ('public.wing_media_submissions','wing_media_submissions_rating_id_fkey','FOREIGN KEY (rating_id) REFERENCES destination_ratings(id) ON DELETE RESTRICT'),
    ('public.wing_media_submissions','wing_media_submissions_user_id_fkey','FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('public.wing_media_submissions','wing_media_submissions_one_per_rating','UNIQUE (rating_id)'),
    ('public.wing_media_submissions','wing_media_submissions_approval_shape','CHECK (approved_at IS NULL AND approved_by IS NULL OR approved_at IS NOT NULL AND approved_by IS NOT NULL)'),
    ('public.wing_media_submissions','wing_media_submissions_owner_deletion_shape','CHECK (user_id IS NOT NULL AND owner_deleted_at IS NULL OR user_id IS NULL AND owner_deleted_at IS NOT NULL)'),
    ('public.wing_media_submissions','wing_media_submissions_path_ownership','CHECK (split_part(original_storage_path, ''/''::text, 3) = id::text AND (user_id IS NOT NULL AND split_part(original_storage_path, ''/''::text, 2) = user_id::text OR user_id IS NULL AND owner_deleted_at IS NOT NULL))'),
    ('public.wing_media_submissions','wing_media_submissions_media_type_check','CHECK (media_type = ANY (ARRAY[''photo''::text, ''video''::text]))'),
    ('public.wing_media_submissions','wing_media_submissions_status_check','CHECK (status = ANY (ARRAY[''uploaded''::text, ''processing''::text, ''in_review''::text, ''approved''::text, ''rejected''::text, ''generation_pending''::text, ''ready_to_post''::text, ''scheduled''::text, ''posting''::text, ''posted''::text, ''failed''::text, ''withdrawn''::text]))'),
    ('public.wing_media_submissions','wing_media_submissions_terminal_shape','CHECK ((status <> ''rejected''::text OR rejected_at IS NOT NULL) AND (status <> ''posted''::text OR featured_at IS NOT NULL) AND (status <> ''withdrawn''::text OR withdrawn_at IS NOT NULL))'),
    ('public.wing_media_submissions','wing_media_submissions_rejection_shape','CHECK (rejected_at IS NULL AND rejection_reason IS NULL OR rejected_at IS NOT NULL AND rejection_reason IS NOT NULL)')) v(relation_name,constraint_name,definition) loop
    if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass(r.relation_name)
      and c.conname=r.constraint_name and c.convalidated
      and replace(pg_get_constraintdef(c.oid,true),'public.','')=r.definition) then
      raise exception 'phase7b3a_constraint_drift: %',r.constraint_name;
    end if;
  end loop;
end;
$constraints$;


do $incoming$
declare r record;
begin
  if (select count(*) from pg_constraint where contype='f' and confrelid='public.wing_media_submissions'::regclass) <> 20 then
    raise exception 'phase7b3a_incoming_media_fk_inventory_drift';
  end if;
  for r in select * from (values
    ('public.social_content_jobs','social_content_jobs_submission_id_fkey','r'),
    ('public.wing_admin_actions','wing_admin_actions_submission_id_fkey','r'),
    ('public.wing_content_review_requests','wing_content_review_requests_submission_id_fkey','r'),
    ('public.wing_creator_badge_events','wing_creator_badge_events_trigger_submission_id_fkey','r'),
    ('public.wing_creator_reward_events','wing_creator_reward_events_submission_id_fkey','r'),
    ('public.wing_generation_jobs','wing_generation_jobs_submission_id_fkey','r'),
    ('public.wing_media_cleanup_jobs','wing_media_cleanup_jobs_submission_id_fkey','r'),
    ('public.wing_media_fingerprints','wing_media_fingerprints_submission_id_fkey','r'),
    ('public.wing_moderation_decisions','wing_moderation_decisions_submission_id_fkey','r'),
    ('public.wing_nightly_run_receipts','wing_nightly_run_receipts_selected_submission_id_fkey','r'),
    ('public.wing_notification_receipts','wing_notification_receipts_submission_id_fkey','r'),
    ('public.wing_photo_derivative_jobs','wing_photo_derivative_jobs_submission_id_fkey','r'),
    ('public.wing_processing_jobs','wing_processing_jobs_submission_id_fkey','r'),
    ('public.wing_submission_abuse_signals','wing_submission_abuse_signals_submission_id_fkey','r'),
    ('public.wing_submission_state_transitions','wing_submission_state_transitions_submission_id_fkey','r'),
    ('public.wing_media_access_requests','wing_media_access_requests_submission_id_fkey','c'),
    ('public.wing_media_exact_fingerprints','wing_media_exact_fingerprints_submission_id_fkey','c'),
    ('public.wing_media_photo_votes','wing_media_photo_votes_submission_id_fkey','c'),
    ('public.wing_media_fingerprints','wing_media_fingerprints_nearest_submission_id_fkey','n'),
    ('public.wing_submission_abuse_signals','wing_submission_abuse_signals_related_submission_id_fkey','n')) v(relation_name,constraint_name,delete_action) loop
    if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass(r.relation_name)
      and c.conname=r.constraint_name and c.contype='f' and c.convalidated
      and c.confrelid='public.wing_media_submissions'::regclass and c.confdeltype::text=r.delete_action) then
      raise exception 'phase7b3a_incoming_media_fk_drift: %',r.constraint_name;
    end if;
  end loop;
end;
$incoming$;

do $attachments$
declare r record;
begin
  if (select count(*) from pg_trigger where not tgisinternal and tgrelid=any(array[
    'public.destination_ratings'::regclass,'public.wing_media_submissions'::regclass,
    'public.wing_media_photo_votes'::regclass,'auth.users'::regclass,'public.users'::regclass,'storage.objects'::regclass])) <> 18 then
    raise exception 'phase7b3a_existing_trigger_inventory_drift';
  end if;

  for r in select * from (values
    ('public.destination_ratings','destination_rating_friend_notification','CREATE TRIGGER destination_rating_friend_notification AFTER INSERT ON destination_ratings FOR EACH ROW EXECUTE FUNCTION enqueue_friend_rating_notification()','698de3165796ddc48b9198b3e7f261b3','postgres'),
    ('public.destination_ratings','guard_buffacoin_rating_writes','CREATE TRIGGER guard_buffacoin_rating_writes BEFORE INSERT OR UPDATE OF is_buffacoin ON destination_ratings FOR EACH ROW EXECUTE FUNCTION guard_buffacoin_rating_writes()','b20e1dd1709b7f4f309086cc44e57511','postgres'),
    ('public.destination_ratings','trg_rating_after_insert','CREATE TRIGGER trg_rating_after_insert AFTER INSERT ON destination_ratings FOR EACH ROW EXECUTE FUNCTION "Badge_Add_Rating_Milestones"()','298aa31f809efe43252005021f089fc1','postgres'),
    ('public.wing_media_submissions','mango_clear_ineligible_priority','CREATE TRIGGER mango_clear_ineligible_priority BEFORE UPDATE OF status, featured_at, is_publish_priority ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION mango_clear_ineligible_priority()','e6afd97295efcd4fd14542212290b7f0','postgres'),
    ('public.wing_media_submissions','wing_media_submissions_owner_pseudonymization','CREATE TRIGGER wing_media_submissions_owner_pseudonymization BEFORE UPDATE OF user_id ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION wing_apply_owner_pseudonymization()','de76b9c0f76f833db3712676d0cc1b60','postgres'),
    ('public.wing_media_submissions','wing_photo_approval_guard','CREATE TRIGGER wing_photo_approval_guard BEFORE UPDATE OF status ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION guard_wing_photo_approval()','fbe2738b657b8f835692585ba351b55c','postgres'),
    ('public.wing_media_submissions','wing_photo_upload_derivatives','CREATE TRIGGER wing_photo_upload_derivatives AFTER INSERT ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION enqueue_wing_photo_upload_derivatives()','c1ba55009a3532cdc7adfb2d18c5297b','postgres'),
    ('public.wing_media_photo_votes','trg_refresh_wing_media_photo_vote_counts','CREATE TRIGGER trg_refresh_wing_media_photo_vote_counts AFTER INSERT OR DELETE OR UPDATE ON wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.refresh_wing_media_photo_vote_counts()','3678ca3e53070266debd85cf6523eea2','postgres'),
    ('public.wing_media_photo_votes','trg_validate_wing_media_photo_vote','CREATE TRIGGER trg_validate_wing_media_photo_vote BEFORE INSERT OR UPDATE ON wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.validate_wing_media_photo_vote()','93667fd6433a290d1cf4e89267327649','postgres'),
    ('auth.users','auth_user_referral_code','CREATE TRIGGER auth_user_referral_code AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION ensure_new_user_referral_code()','5c20b2409660eddfe523ab32b529d1f3','postgres'),
    ('auth.users','auth_user_referral_deletion_signal','CREATE TRIGGER auth_user_referral_deletion_signal BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION flag_referral_account_deletion()','65b376c54d2fdf603650f063d1f14df6','postgres'),
    ('auth.users','on_auth_user_created','CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()','9c1866c2daeab1351b3d638036472baa','postgres'),
    ('auth.users','referral_code_profile_eligibility_auth','CREATE TRIGGER referral_code_profile_eligibility_auth AFTER INSERT OR UPDATE OF deleted_at, banned_until ON auth.users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_auth_change()','d382fa0f1aaad9681d5f8d7c4f7aaced','postgres'),
    ('public.users','referral_code_profile_eligibility','CREATE TRIGGER referral_code_profile_eligibility AFTER INSERT OR UPDATE OF user_id ON users FOR EACH ROW EXECUTE FUNCTION restore_referral_code_after_profile_insert()','3fc4a3265090b05f937b3705970572fa','postgres'),
    ('public.users','referral_code_profile_eligibility_delete','CREATE TRIGGER referral_code_profile_eligibility_delete AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_profile_delete()','e11e33204fc8f4bf6cbccc9f58136fe9','postgres'),
    ('public.users','trg_new_user_starting_coins','CREATE TRIGGER trg_new_user_starting_coins AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION give_new_user_starting_coins()','5afddf6075ef7f42b26bd91672be9766','postgres'),
    ('storage.objects','protect_objects_delete','CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()','998d324ea2b1abc49351e8c2367b5796','supabase_storage_admin'),
    ('storage.objects','update_objects_updated_at','CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()','7596e66a7698d5a6b5129c5ce9b24c5f','supabase_storage_admin')) v(relation_name,trigger_name,definition,source_md5,owner_name) loop
    if not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid=to_regclass(r.relation_name) and t.tgname=r.trigger_name
      and not t.tgisinternal and t.tgenabled='O' and t.tgqual is null

      and (t.tgname<>'guard_buffacoin_rating_writes' or (not p.prosecdef and p.proconfig @> array['search_path=public']))
      and (t.tgname not in ('destination_rating_friend_notification','trg_rating_after_insert') or (p.prosecdef and p.proconfig @> array['search_path=public']))
      and (t.tgname not in ('trg_refresh_wing_media_photo_vote_counts','trg_validate_wing_media_photo_vote') or (p.prosecdef and p.proconfig @> array['search_path=""']))
      and pg_get_triggerdef(t.oid,true)=r.definition and p.proowner=to_regrole(r.owner_name)
      ) then
      raise exception 'phase7b3a_existing_trigger_drift: %',r.trigger_name;
    end if;
  end loop;
end;
$attachments$;



create table public.user_destination_favorites (
  user_id uuid not null constraint user_destination_favorites_user_id_fkey references auth.users(id) on delete cascade,
  destination_id uuid not null constraint user_destination_favorites_destination_id_fkey references public.destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_destination_favorites_pkey primary key (user_id, destination_id)
);

create index user_destination_favorites_destination_idx
  on public.user_destination_favorites (destination_id, created_at desc);

create table public.user_want_to_try (
  user_id uuid not null constraint user_want_to_try_user_id_fkey references auth.users(id) on delete cascade,
  destination_id uuid not null constraint user_want_to_try_destination_id_fkey references public.destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_want_to_try_pkey primary key (user_id, destination_id)
);

create index user_want_to_try_destination_idx
  on public.user_want_to_try (destination_id, created_at desc);

create table public.wing_jury_votes (
  submission_id uuid not null constraint wing_jury_votes_submission_id_fkey references public.wing_media_submissions(id) on delete cascade,
  user_id uuid not null constraint wing_jury_votes_user_id_fkey references auth.users(id) on delete cascade,
  vote smallint not null constraint wing_jury_votes_vote_check check (vote in (-1, 0, 1)),
  created_at timestamptz not null default now(),
  constraint wing_jury_votes_pkey primary key (submission_id, user_id)
);

create index wing_jury_votes_user_idx
  on public.wing_jury_votes (user_id, created_at desc);

create table public.wing_jury_photo_vote_counts (
  submission_id uuid constraint wing_jury_photo_vote_counts_pkey primary key constraint wing_jury_photo_vote_counts_submission_id_fkey references public.wing_media_submissions(id) on delete cascade,
  like_count integer not null default 0 constraint wing_jury_photo_vote_counts_like_count_check check (like_count >= 0),
  neutral_count integer not null default 0 constraint wing_jury_photo_vote_counts_neutral_count_check check (neutral_count >= 0),
  dislike_count integer not null default 0 constraint wing_jury_photo_vote_counts_dislike_count_check check (dislike_count >= 0),
  updated_at timestamptz not null default now(),
  constraint wing_jury_photo_vote_counts_total_nonnegative check (
    like_count + neutral_count + dislike_count >= 0
  )
);

create index wing_jury_photo_vote_counts_like_idx
  on public.wing_jury_photo_vote_counts (like_count desc, submission_id);

-- Wing Jury discovery is served by the trusted Edge Function. Keep candidate
-- selection bounded and make the approved-photo path indexable without
-- changing the historical migration chain.
create index wing_media_submissions_wing_jury_candidate_idx
  on public.wing_media_submissions (destination_id, created_at, id)
  where media_type = 'photo'
    and status = 'approved'
    and processed_storage_path is not null
    and owner_deleted_at is null
    and withdrawn_at is null;

create index wing_jury_votes_submission_vote_idx
  on public.wing_jury_votes (submission_id, vote);

create function private.lock_user_destination(
  p_user_id uuid,
  p_destination_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  -- Advisory locks serialize writers only when subsequent checks can obtain
  -- fresh snapshots. Fixed-snapshot isolation would silently admit stale saves.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'saved_destination_invariants_require_read_committed'
      using errcode = '25001';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('buffago-user-destination:' || p_user_id::text || ':' || p_destination_id::text, 0)
  );
end;
$function$;

create function private.require_authenticated_user()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
begin
  if v_user_id is null or v_anonymous then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  return v_user_id;
end;
$function$;

create function private.validate_favorite_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := private.require_authenticated_user();
begin
  if new.user_id is distinct from v_user_id then
    raise exception 'favorite_owner_mismatch' using errcode = '42501';
  end if;
  perform private.lock_user_destination(new.user_id, new.destination_id);
  if not exists (
    select 1 from public.destination_ratings rating
    where rating.user_id = new.user_id
      and rating.destination_id = new.destination_id
  ) then
    raise exception 'favorite_requires_existing_rating' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create function private.validate_want_to_try_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := private.require_authenticated_user();
begin
  if new.user_id is distinct from v_user_id then
    raise exception 'want_to_try_owner_mismatch' using errcode = '42501';
  end if;
  perform private.lock_user_destination(new.user_id, new.destination_id);
  if exists (
    select 1 from public.destination_ratings rating
    where rating.user_id = new.user_id
      and rating.destination_id = new.destination_id
  ) then
    raise exception 'want_to_try_requires_unrated_restaurant' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create function private.remove_want_to_try_after_rating()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform private.lock_user_destination(new.user_id, new.destination_id);
  delete from public.user_want_to_try
   where user_id = new.user_id and destination_id = new.destination_id;
  return new;
end;
$function$;

-- Lock both identities before any rating mutation, in the same order for
-- reassignment in either direction. Collection inserts use these same locks.
create function private.lock_rating_collection_identities()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_old_user uuid;
  v_old_destination uuid;
  v_new_user uuid;
  v_new_destination uuid;
  v_identity record;
begin
  if tg_op <> 'INSERT' then
    v_old_user := old.user_id;
    v_old_destination := old.destination_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_user := new.user_id;
    v_new_destination := new.destination_id;
  end if;
  for v_identity in
    select distinct identity.user_id, identity.destination_id
    from (values (v_old_user, v_old_destination),
                 (v_new_user, v_new_destination)) identity(user_id, destination_id)
    where identity.user_id is not null and identity.destination_id is not null
    order by identity.user_id, identity.destination_id
  loop
    perform private.lock_user_destination(v_identity.user_id, v_identity.destination_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create function private.remove_favorite_after_rating_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform private.lock_user_destination(old.user_id, old.destination_id);
  delete from public.user_destination_favorites
   where user_id = old.user_id and destination_id = old.destination_id
     and not exists (
       select 1 from public.destination_ratings rating
       where rating.user_id = old.user_id
         and rating.destination_id = old.destination_id
     );
  return old;
end;
$function$;

create function private.is_public_wing_jury_photo(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
      from public.wing_media_submissions photo
     where photo.id = p_submission_id
       and photo.media_type = 'photo'
       and photo.status = 'approved'
       and photo.user_id is not null
       and photo.owner_deleted_at is null
       and photo.withdrawn_at is null
       -- Match JavaScript trim and the fingerprint-matched gallery boundary.
       and nullif(btrim(photo.consent_version, U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'), '') is not null
       and photo.consented_at <= now()
       and photo.attribution_preference in ('username', 'display_name', 'anonymous')
       and photo.processed_storage_path = 'processed/' || photo.id::text || '/primary'
       and exists (
         select 1 from storage.objects object
          where object.bucket_id = 'wing-submissions'
            and object.name = photo.processed_storage_path
            and object.archived_at is null
            and object.is_delete_marker = false
       )
  );
$function$;

-- The Edge service can revalidate a public photo without exposing the private
-- schema or storage catalog to clients. This endpoint is service-role-only.
create function public.is_public_wing_jury_photo(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.is_public_wing_jury_photo(p_submission_id);
$function$;

create function public.wing_jury_restaurant_rating_summary(p_destination_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'average_weight_score', avg(rating.weight_score),
    'rating_count', count(rating.weight_score)
  )
  from public.destination_ratings rating
  where rating.destination_id = p_destination_id;
$function$;

-- Catalog-wide ordering is computed by PostgreSQL before the bounded result.
-- Distance ordering scans/sorts eligible rows; this is not an index-nearest or
-- constant-time query. No radius, destination cap, or photo cap truncates it.
create function public.wing_jury_feed_candidates(
  p_latitude double precision,
  p_longitude double precision,
  p_user_id uuid,
  p_judged_submission_ids uuid[],
  p_after_distance double precision,
  p_after_destination_id uuid,
  p_after_created_at timestamptz,
  p_after_submission_id uuid,
  p_limit integer
)
returns table (
  id uuid, destination_id uuid, user_id uuid, media_type text, status text,
  processed_storage_path text, owner_deleted_at timestamptz,
  withdrawn_at timestamptz, consent_version text, consented_at timestamptz,
  attribution_preference text, created_at text, distance double precision
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 120 then
    raise exception 'invalid_feed_limit' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and not (p_latitude between -90 and 90
       and p_longitude between -180 and 180)) then
    raise exception 'invalid_feed_location' using errcode = '22023';
  end if;
  if cardinality(p_judged_submission_ids) > 500
     or array_position(p_judged_submission_ids, null) is not null then
    raise exception 'invalid_feed_exclusions' using errcode = '22023';
  end if;
  if (p_after_destination_id is null and (p_after_created_at is not null
       or p_after_submission_id is not null or p_after_distance is not null))
     or (p_after_destination_id is not null and (p_after_created_at is null
       or p_after_submission_id is null))
     or (p_after_distance is not null and not (p_after_distance >= 0
       and p_after_distance <= pi() * 6371000))
     or (p_latitude is null and p_after_distance is not null)
     or (p_after_created_at is not null and not isfinite(p_after_created_at)) then
    raise exception 'invalid_feed_position' using errcode = '22023';
  end if;
  return query
    with candidates as (
      select photo.*,
        case when p_latitude is not null
          and destination.lat between -90 and 90
          and destination.lng between -180 and 180
        then 2 * 6371000 * asin(sqrt(least(1::double precision, greatest(0::double precision,
          power(sin(radians(destination.lat::double precision - p_latitude) / 2), 2)
          + cos(radians(p_latitude)) * cos(radians(destination.lat::double precision))
          * power(sin(radians(destination.lng::double precision - p_longitude) / 2), 2)
        )))) else null::double precision end as feed_distance
      from public.wing_media_submissions photo
      join public.destinations destination on destination.id = photo.destination_id
      where photo.media_type = 'photo' and photo.status = 'approved'
        and photo.processed_storage_path is not null
        and photo.owner_deleted_at is null and photo.withdrawn_at is null
        and photo.created_at is not null and isfinite(photo.created_at)
        and private.is_public_wing_jury_photo(photo.id)
        and (p_user_id is null or not exists (
          select 1 from public.wing_jury_votes verdict
          where verdict.submission_id = photo.id and verdict.user_id = p_user_id
        ))
        and (p_user_id is not null or not (photo.id = any(coalesce(p_judged_submission_ids, '{}'::uuid[]))))
    )
    select candidate.id, candidate.destination_id, candidate.user_id,
      candidate.media_type::text, candidate.status::text,
      candidate.processed_storage_path::text, candidate.owner_deleted_at,
      candidate.withdrawn_at, candidate.consent_version::text, candidate.consented_at,
      candidate.attribution_preference::text,
      to_char(candidate.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      candidate.feed_distance
    from candidates candidate
    where p_after_destination_id is null or
      (coalesce(candidate.feed_distance, 'Infinity'::double precision),
        candidate.destination_id, candidate.created_at, candidate.id) >
      (coalesce(p_after_distance, 'Infinity'::double precision),
        p_after_destination_id, p_after_created_at, p_after_submission_id)
    order by candidate.feed_distance nulls last,
      candidate.destination_id, candidate.created_at, candidate.id
    limit p_limit;
end;
$function$;

create function private.validate_wing_jury_vote_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := private.require_authenticated_user();
begin
  if new.user_id is distinct from v_user_id then
    raise exception 'wing_jury_vote_owner_mismatch' using errcode = '42501';
  end if;
  -- Hold eligibility metadata steady until the vote and its counts commit.
  perform 1 from public.wing_media_submissions photo
   where photo.id = new.submission_id for share;
  perform 1 from storage.objects object
   where object.bucket_id = 'wing-submissions'
     and object.name = 'processed/' || new.submission_id::text || '/primary'
   for share;
  if not private.is_public_wing_jury_photo(new.submission_id) then
    raise exception 'photo_is_not_eligible_for_wing_jury' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create function private.enforce_wing_jury_vote_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  -- Account or media parent disappearance permits only its FK-driven cascade.
  -- Withdrawal retains immutable votes; direct verdict edits remain forbidden.
  if tg_op = 'DELETE' and not exists (
    select 1 from auth.users account where account.id = old.user_id
  ) then
    return old;
  end if;
  if tg_op = 'DELETE' and not exists (
    select 1 from public.wing_media_submissions photo where photo.id = old.submission_id
  ) then return old; end if;
  raise exception 'wing_jury_vote_is_immutable' using errcode = '42501';
end;
$function$;

create function private.refresh_wing_jury_photo_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_submission_id uuid := new.submission_id;
begin
  -- Atomic row arithmetic serializes concurrent changes without recounting a
  -- potentially stale statement snapshot. DELETE is limited to parent cascades.
  if tg_op = 'DELETE' then
    -- During media cascade the count row is also deleted; do not recreate it
    -- or depend on FK-trigger ordering. Auth cascade retains media and decrements.
    if not exists(select 1 from public.wing_media_submissions where id=old.submission_id) then
      return old;
    end if;
    update public.wing_jury_photo_vote_counts set
      like_count = like_count - (old.vote = 1)::integer,
      neutral_count = neutral_count - (old.vote = 0)::integer,
      dislike_count = dislike_count - (old.vote = -1)::integer,
      updated_at = now()
    where submission_id = old.submission_id;
    return old;
  end if;
  insert into public.wing_jury_photo_vote_counts (
    submission_id, like_count, neutral_count, dislike_count, updated_at
  )
  values (v_submission_id, (new.vote = 1)::integer,
    (new.vote = 0)::integer, (new.vote = -1)::integer, now())
  on conflict (submission_id) do update set
    like_count = public.wing_jury_photo_vote_counts.like_count + excluded.like_count,
    neutral_count = public.wing_jury_photo_vote_counts.neutral_count + excluded.neutral_count,
    dislike_count = public.wing_jury_photo_vote_counts.dislike_count + excluded.dislike_count,
    updated_at = excluded.updated_at;
  return new;
end;
$function$;

create trigger user_destination_favorites_validate_insert
before insert on public.user_destination_favorites
for each row execute function private.validate_favorite_insert();

create trigger user_want_to_try_validate_insert
before insert on public.user_want_to_try
for each row execute function private.validate_want_to_try_insert();

create trigger destination_ratings_lock_collection_identities
before insert or update or delete on public.destination_ratings
for each row execute function private.lock_rating_collection_identities();

create trigger destination_ratings_remove_want_to_try
after insert on public.destination_ratings
for each row execute function private.remove_want_to_try_after_rating();

create trigger destination_ratings_update_want_to_try
after update on public.destination_ratings
for each row execute function private.remove_want_to_try_after_rating();

create trigger destination_ratings_remove_invalid_favorite
after delete or update on public.destination_ratings
for each row execute function private.remove_favorite_after_rating_delete();

create trigger wing_jury_votes_validate_insert
before insert on public.wing_jury_votes
for each row execute function private.validate_wing_jury_vote_insert();

create trigger wing_jury_votes_enforce_immutability
before update or delete on public.wing_jury_votes
for each row execute function private.enforce_wing_jury_vote_immutability();

create trigger wing_jury_votes_refresh_counts
after insert or delete on public.wing_jury_votes
for each row execute function private.refresh_wing_jury_photo_vote_counts();

alter table public.user_destination_favorites enable row level security;
alter table public.user_want_to_try enable row level security;
alter table public.wing_jury_votes enable row level security;
alter table public.wing_jury_photo_vote_counts enable row level security;

revoke all on public.user_destination_favorites from public, anon, authenticated, service_role;
grant select on public.user_destination_favorites to service_role;
grant select, insert, delete on public.user_destination_favorites to authenticated;
create policy user_destination_favorites_own_select
  on public.user_destination_favorites for select to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_destination_favorites_own_insert
  on public.user_destination_favorites for insert to authenticated
  with check (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_destination_favorites_own_delete
  on public.user_destination_favorites for delete to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on public.user_want_to_try from public, anon, authenticated, service_role;
grant select on public.user_want_to_try to service_role;
grant select, insert, delete on public.user_want_to_try to authenticated;
create policy user_want_to_try_own_select
  on public.user_want_to_try for select to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_want_to_try_own_insert
  on public.user_want_to_try for insert to authenticated
  with check (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_want_to_try_own_delete
  on public.user_want_to_try for delete to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on public.wing_jury_votes from public, anon, authenticated, service_role;
grant select on public.wing_jury_votes to service_role;
grant select, insert on public.wing_jury_votes to authenticated;
create policy wing_jury_votes_own_select
  on public.wing_jury_votes for select to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy wing_jury_votes_own_insert
  on public.wing_jury_votes for insert to authenticated
  with check (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on public.wing_jury_photo_vote_counts from public, anon, authenticated, service_role;
grant select on public.wing_jury_photo_vote_counts to service_role;
grant select on public.wing_jury_photo_vote_counts to authenticated;
create policy wing_jury_photo_vote_counts_public_select
  on public.wing_jury_photo_vote_counts for select to authenticated
  using ((select auth.uid()) is not null
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
    and private.is_public_wing_jury_photo(submission_id));

revoke all on function private.lock_user_destination(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.require_authenticated_user()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_favorite_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_want_to_try_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.remove_want_to_try_after_rating()
  from public, anon, authenticated, service_role;
revoke all on function private.remove_favorite_after_rating_delete()
  from public, anon, authenticated, service_role;
revoke all on function private.is_public_wing_jury_photo(uuid)
  from public, anon, authenticated, service_role;
-- RLS needs to evaluate the trusted eligibility predicate. The private schema
-- remains non-exposed; this grant is not a public API grant.
grant execute on function private.is_public_wing_jury_photo(uuid)
  to authenticated;
revoke all on function private.validate_wing_jury_vote_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.refresh_wing_jury_photo_vote_counts()
  from public, anon, authenticated, service_role;
revoke all on function private.lock_rating_collection_identities()
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_wing_jury_vote_immutability()
  from public, anon, authenticated, service_role;
revoke all on function public.is_public_wing_jury_photo(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_public_wing_jury_photo(uuid) to service_role;
revoke all on function public.wing_jury_restaurant_rating_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.wing_jury_restaurant_rating_summary(uuid) to service_role;
revoke all on function public.wing_jury_feed_candidates(double precision, double precision, uuid, uuid[], double precision, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wing_jury_feed_candidates(double precision, double precision, uuid, uuid[], double precision, uuid, timestamptz, uuid, integer)
  to service_role;

comment on table public.user_destination_favorites is
  'Quarantined Phase 7B.3A forward draft: one authenticated user favorite per destination, requiring an existing user rating.';
comment on table public.user_want_to_try is
  'Quarantined Phase 7B.3A forward draft: one authenticated unrated destination save per user; successful rating insertion or update removes it.';
comment on table public.wing_jury_votes is
  'Quarantined Phase 7B.3A forward draft: immutable authenticated blind-jury votes, separate from mutable gallery votes.';

alter table public.user_destination_favorites owner to postgres;
alter table public.user_want_to_try owner to postgres;
alter table public.wing_jury_votes owner to postgres;
alter table public.wing_jury_photo_vote_counts owner to postgres;
alter function private.lock_user_destination(uuid, uuid) owner to postgres;
alter function private.require_authenticated_user() owner to postgres;
alter function private.validate_favorite_insert() owner to postgres;
alter function private.validate_want_to_try_insert() owner to postgres;
alter function private.remove_want_to_try_after_rating() owner to postgres;
alter function private.lock_rating_collection_identities() owner to postgres;
alter function private.remove_favorite_after_rating_delete() owner to postgres;
alter function private.is_public_wing_jury_photo(uuid) owner to postgres;
alter function public.is_public_wing_jury_photo(uuid) owner to postgres;
alter function public.wing_jury_restaurant_rating_summary(uuid) owner to postgres;
alter function public.wing_jury_feed_candidates(double precision, double precision, uuid, uuid[], double precision, uuid, timestamptz, uuid, integer) owner to postgres;
alter function private.validate_wing_jury_vote_insert() owner to postgres;
alter function private.enforce_wing_jury_vote_immutability() owner to postgres;
alter function private.refresh_wing_jury_photo_vote_counts() owner to postgres;

commit;
