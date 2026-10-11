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


