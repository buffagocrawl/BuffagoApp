-- LOCAL ACCEPTANCE ONLY: schema metadata, no production rows/secrets.
begin;
set local lock_timeout='5s';
set local statement_timeout='180s';
set local check_function_bodies=off;
set local search_path=pg_catalog,public,extensions;
do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role "anon" nologin;end if;end$$;
do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role "authenticated" nologin;end if;end$$;
do $$begin if not exists(select 1 from pg_roles where rolname='pg_database_owner') then create role "pg_database_owner" nologin;end if;end$$;
do $$begin if not exists(select 1 from pg_roles where rolname='postgres') then create role "postgres" nologin;end if;end$$;
do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role "service_role" nologin;end if;end$$;
create schema if not exists "public";
create schema if not exists "private";
create type "public"."route_submission_status" as enum ('pending','approved','rejected');
create sequence "public"."states_state_id_seq" as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1 no cycle;
create sequence "public"."badge_catalog_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;
create table "public"."android_qa_early_bird_eligibility" ("user_id" uuid not null,"cutoff" timestamp with time zone not null,"registered_at" timestamp with time zone not null);
create table "public"."api_rate_limits" ("id" uuid not null,"user_id" uuid,"ip_address" text,"feature" text not null,"created_at" timestamp with time zone not null);
create table "public"."app_user_roles" ("user_id" uuid not null,"role" text not null,"active" boolean not null,"assigned_by" uuid,"assigned_at" timestamp with time zone not null,"revoked_by" uuid,"revoked_at" timestamp with time zone,"reason" text,"correlation_id" uuid not null);
create table "public"."badge_catalog" ("id" bigint not null,"code" text not null,"name" text not null,"description" text,"icon" text,"xp_reward" integer not null,"category" text,"tier" integer,"is_active" boolean not null);
create table "public"."buffacoin_ledger" ("id" uuid not null,"user_id" uuid not null,"delta" integer not null,"reason" text not null,"crawl_id" uuid,"state_id" integer,"destination_id" uuid,"created_at" timestamp with time zone not null);
create table "public"."buffacoin_wallets" ("user_id" uuid not null,"balance" integer not null,"updated_at" timestamp with time zone not null,"created_at" timestamp with time zone not null);
create table "public"."crawls" ("crawl_id" uuid not null,"route_id" uuid,"user_id" uuid,"status" text not null,"start_time" timestamp with time zone,"end_time" timestamp with time zone,"crawl_type" text not null,"is_solo" boolean not null);
create table "public"."destination_ratings" ("id" uuid not null,"destination_id" uuid not null,"crawl_id" uuid not null,"user_id" uuid,"crispiness" smallint,"sauce" smallint,"meat" smallint,"overall" smallint,"created_at" timestamp with time zone not null,"tag_id" bigint,"wings_eaten" smallint,"sauce_style" smallint,"flavor_vibe" smallint[],"spice_level" smallint,"would_order_again" boolean,"is_buffacoin" boolean not null,"buffacoin_operation_id" uuid);
create table "public"."destination_tags" ("id" bigint generated always as identity not null,"tag" text not null,"created_at" timestamp with time zone not null);
create table "public"."destinations" ("id" uuid not null,"name" text not null,"address" text,"lat" numeric,"lng" numeric,"city" text,"created_by" uuid,"created_at" timestamp with time zone not null,"state_id" integer);
create table "public"."engagement_feature_flags" ("flag_key" text not null,"enabled" boolean not null,"rollout_percent" integer not null,"updated_at" timestamp with time zone not null);
create table "public"."friendships" ("id" uuid not null,"requester_id" uuid not null,"addressee_id" uuid not null,"status" text not null,"created_at" timestamp with time zone not null,"responded_at" timestamp with time zone,"updated_at" timestamp with time zone not null);
create table "public"."lb_user_badges_counts" ("user_id" uuid not null,"badges_count" integer not null);
create table "public"."level_thresholds" ("level" integer not null,"xp_required" integer not null,"level_title" text);
create table "public"."notification_outbox" ("id" uuid not null,"user_id" uuid not null,"event_type" text not null,"source_entity_type" text not null,"source_entity_id" text not null,"deduplication_key" text not null,"eligible_at" timestamp with time zone not null,"expires_at" timestamp with time zone,"status" text not null,"suppression_reason" text,"failure_code" text,"retry_count" integer not null,"next_attempt_at" timestamp with time zone not null,"sent_at" timestamp with time zone,"deep_link" text not null,"fallback_route" text not null,"copy_data" jsonb not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."notification_preferences" ("user_id" uuid not null,"daily_streak_reminders" boolean not null,"streak_at_risk" boolean not null,"comeback" boolean not null,"friend_activity" boolean not null,"crawl_proximity" boolean not null,"product_announcements" boolean not null,"quiet_hours_enabled" boolean not null,"quiet_start" time without time zone not null,"quiet_end" time without time zone not null,"reminder_local_time" time without time zone not null,"timezone" text not null,"updated_at" timestamp with time zone not null,"legendary_start" boolean not null,"legendary_expiry" boolean not null,"legendary_completion" boolean not null,"legendary_reward_ready" boolean not null,"creator_updates" boolean not null);
create table "public"."referral_abuse_signals" ("id" uuid not null,"referral_attribution_id" uuid not null,"signal_type" text not null,"severity" text not null,"deduplication_key" text not null,"details" jsonb not null,"resolved_at" timestamp with time zone,"created_at" timestamp with time zone not null);
create table "public"."referral_attributions" ("id" uuid not null,"referral_code_id" uuid not null,"inviter_user_id" uuid not null,"invitee_user_id" uuid,"anonymous_install_hash" text,"source" text not null,"campaign" text,"placement" text,"status" text not null,"review_status" text not null,"clicked_at" timestamp with time zone,"claimed_at" timestamp with time zone,"signed_up_at" timestamp with time zone,"onboarding_completed_at" timestamp with time zone,"qualified_at" timestamp with time zone,"rewarded_at" timestamp with time zone,"rejected_at" timestamp with time zone,"expired_at" timestamp with time zone,"reversed_at" timestamp with time zone,"rejection_reason" text,"qualifying_rating_id" uuid,"correlation_id" uuid not null,"metadata" jsonb not null,"internal_review_metadata" jsonb not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."referral_codes" ("id" uuid not null,"user_id" uuid not null,"code" text not null,"is_active" boolean not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null,"dormant_due_to_missing_profile" boolean not null);
create table "public"."route_travel_tag" ("id" smallint not null,"travel" text not null);
create table "public"."routes" ("id" uuid not null,"title" text not null,"city" text not null,"created_by" uuid,"is_public" boolean not null,"stop1_id" uuid,"stop2_id" uuid,"stop3_id" uuid,"stop4_id" uuid,"stop5_id" uuid,"created_at" timestamp with time zone not null,"travel_tag_id" smallint,"is_token_route" boolean not null);
create table "public"."social_content_jobs" ("id" uuid not null,"submission_id" uuid not null,"platform" text not null,"post_type" text not null,"generated_media_path" text not null,"generated_caption" text not null,"generated_alt_text" text,"generated_metadata" jsonb not null,"status" text not null,"dry_run" boolean not null,"human_approved_at" timestamp with time zone,"human_approved_by" uuid,"scheduled_for" timestamp with time zone,"claimed_at" timestamp with time zone,"lease_expires_at" timestamp with time zone,"claim_token" uuid,"claimed_by" text,"attempt_count" integer not null,"max_attempts" integer not null,"external_post_id" text,"external_permalink" text,"posted_at" timestamp with time zone,"failure_code" text,"failure_reason" text,"idempotency_key" text not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."states" ("state_id" integer not null,"state_code" character(2) not null,"state_name" text not null);
create table "public"."user_badges" ("user_id" uuid not null,"badge_id" bigint not null,"earned_at" timestamp with time zone not null);
create table "public"."user_blocks" ("blocker_id" uuid not null,"blocked_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."user_destination_favorites" ("user_id" uuid not null,"destination_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."user_events" ("id" uuid not null,"occurred_at" timestamp with time zone not null,"received_at" timestamp with time zone not null,"user_id" uuid,"anonymous_id" text,"session_id" uuid not null,"event_name" text not null,"screen" text,"platform" text,"app_version" text,"state_id" integer,"route_id" uuid,"crawl_id" uuid,"destination_id" uuid,"metadata" jsonb not null);
create table "public"."user_want_to_try" ("user_id" uuid not null,"destination_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."users" ("user_id" uuid not null,"avatar_url" text,"created_at" timestamp with time zone not null,"username" text,"xp" integer not null,"taste_persona" text,"facebook_connected" boolean not null,"facebook_provider_id" text,"facebook_connected_at" timestamp with time zone,"social_opt_out" boolean not null,"share_username" boolean not null,"share_location" boolean not null,"hide_visit_date" boolean not null,"public_profile" boolean not null,"display_name" text,"instagram_handle" text,"facebook_profile_or_page" text,"allow_social_tagging" boolean not null,"social_attribution_preference" text not null,"social_attribution_updated_at" timestamp with time zone);
create table "public"."wing_admin_actions" ("id" uuid not null,"submission_id" uuid,"social_job_id" uuid,"actor_id" uuid,"action" text not null,"reason_category" text,"notes" text,"before_state" jsonb not null,"after_state" jsonb not null,"idempotency_key" text not null,"request_fingerprint" text not null,"correlation_id" uuid not null,"occurred_at" timestamp with time zone not null);
create table "public"."wing_creator_badge_events" ("id" uuid not null,"user_id" uuid,"owner_pseudonym_id" uuid not null,"owner_deleted_at" timestamp with time zone,"badge_id" bigint not null,"badge_code" text not null,"event_kind" text not null,"trigger_submission_id" uuid,"reverses_badge_event_id" uuid,"idempotency_key" text not null,"reason" text not null,"metadata" jsonb not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."wing_creator_reward_config" ("config_key" text not null,"approval_xp" integer not null,"featured_xp" integer not null,"enabled" boolean not null,"economy_version" text not null,"updated_at" timestamp with time zone not null);
create table "public"."wing_creator_reward_events" ("id" uuid not null,"submission_id" uuid not null,"rating_id" uuid not null,"user_id" uuid,"owner_pseudonym_id" uuid not null,"owner_deleted_at" timestamp with time zone,"event_kind" text not null,"amount" integer not null,"xp_ledger_id" uuid not null,"source_transition_id" uuid,"reverses_reward_event_id" uuid,"idempotency_key" text not null,"reason" text not null,"metadata" jsonb not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."wing_generation_jobs" ("id" uuid not null,"submission_id" uuid not null,"nightly_receipt_id" uuid not null,"status" text not null,"instagram_job_id" uuid not null,"facebook_job_id" uuid not null,"instagram_media_path" text not null,"facebook_media_path" text not null,"available_at" timestamp with time zone not null,"claimed_at" timestamp with time zone,"lease_expires_at" timestamp with time zone,"claim_token" uuid,"claimed_by" text,"attempt_count" integer not null,"max_attempts" integer not null,"failure_code" text,"failure_reason" text,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."wing_jury_photo_vote_counts" ("submission_id" uuid not null,"like_count" integer not null,"neutral_count" integer not null,"dislike_count" integer not null,"updated_at" timestamp with time zone not null);
create table "public"."wing_jury_votes" ("submission_id" uuid not null,"user_id" uuid not null,"vote" smallint not null,"created_at" timestamp with time zone not null);
create table "public"."wing_media_cleanup_jobs" ("id" uuid not null,"cleanup_kind" text not null,"submission_id" uuid,"upload_intent_id" uuid,"bucket" text not null,"object_path" text not null,"status" text not null,"available_at" timestamp with time zone not null,"claimed_at" timestamp with time zone,"lease_expires_at" timestamp with time zone,"claim_token" uuid,"claimed_by" text,"attempt_count" integer not null,"max_attempts" integer not null,"last_error_code" text,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null,"completed_at" timestamp with time zone);
create table "public"."wing_media_cleanup_receipts" ("id" uuid not null,"cleanup_job_id" uuid not null,"attempt_number" integer not null,"cleanup_kind" text not null,"object_path_hash" text not null,"outcome" text not null,"error_code" text,"correlation_id" uuid not null,"occurred_at" timestamp with time zone not null);
create table "public"."wing_media_exact_fingerprints" ("submission_id" uuid not null,"media_type" text not null,"sha256" text not null,"size_bytes" bigint not null,"created_at" timestamp with time zone not null);
create table "public"."wing_media_fingerprints" ("id" uuid not null,"submission_id" uuid not null,"media_type" text not null,"algorithm" text not null,"algorithm_version" text not null,"fingerprint" text not null,"duplicate_group" uuid,"nearest_submission_id" uuid,"similarity" numeric(5,4),"created_at" timestamp with time zone not null);
create table "public"."wing_media_photo_votes" ("submission_id" uuid not null,"user_id" uuid not null,"vote" smallint not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."wing_media_submissions" ("id" uuid not null,"user_id" uuid,"owner_pseudonym_id" uuid not null,"owner_deleted_at" timestamp with time zone,"rating_id" uuid,"destination_id" uuid not null,"media_type" text not null,"original_storage_path" text not null,"processed_storage_path" text,"thumbnail_storage_path" text,"status" text not null,"moderation_status" text not null,"wing_verification_status" text not null,"wing_confidence" numeric(5,4),"quality_score" numeric(6,3),"content_score" numeric(8,3),"duplicate_group" uuid,"perceptual_hash" text,"consent_version" text not null,"consented_at" timestamp with time zone not null,"attribution_preference" text not null,"user_caption" text,"reviewer_notes" text,"priority" integer not null,"approved_at" timestamp with time zone,"approved_by" uuid,"rejected_at" timestamp with time zone,"rejection_reason" text,"featured_at" timestamp with time zone,"withdrawn_at" timestamp with time zone,"original_retain_until" timestamp with time zone,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null,"correlation_id" uuid not null,"original_deleted_at" timestamp with time zone,"submission_source" text not null,"reviewed_at" timestamp with time zone,"reviewed_by" uuid,"is_publish_priority" boolean not null,"priority_set_at" timestamp with time zone,"priority_set_by" uuid,"like_count" integer not null,"dislike_count" integer not null);
create table "public"."wing_media_validation_receipts" ("id" uuid not null,"user_id" uuid not null,"correlation_id" uuid not null,"staging_bucket" text not null,"staging_path" text not null,"sha256" text not null,"size_bytes" bigint not null,"mime_type" text not null,"width" integer not null,"height" integer not null,"validated_at" timestamp with time zone not null,"expires_at" timestamp with time zone not null,"submission_id" uuid,"promoted_at" timestamp with time zone);
create table "public"."wing_moderation_config" ("singleton" boolean not null,"schema_version" integer not null,"minimum_wing_confidence" numeric(5,4) not null,"clear_reject_wing_confidence" numeric(5,4) not null,"maximum_spam_probability" numeric(5,4) not null,"maximum_duplicate_probability" numeric(5,4) not null,"daily_upload_limit" integer not null,"hourly_upload_limit" integer not null,"nightly_enabled" boolean not null,"publishing_dry_run" boolean not null,"updated_at" timestamp with time zone not null,"updated_by" uuid,"original_retention_days" integer not null,"rolling_upload_limit" integer not null,"rolling_upload_window_seconds" integer not null);
create table "public"."wing_moderation_decisions" ("id" uuid not null,"submission_id" uuid not null,"decision_source" text not null,"recommendation" text not null,"contains_food" boolean,"contains_chicken_wings" boolean,"wing_confidence" numeric(5,4),"nudity_or_sexual_content" boolean,"graphic_content" boolean,"weapons" boolean,"hate_symbols" boolean,"illegal_activity" boolean,"intoxication_concern" boolean,"minors_visible" boolean,"personal_information_visible" boolean,"faces_visible" boolean,"alcohol_dominant" boolean,"offensive_text" boolean,"spam_probability" numeric(5,4),"duplicate_probability" numeric(5,4),"quality_score" numeric(6,3),"explanation" text,"model_provider" text,"model_name" text,"model_version" text,"schema_version" integer not null,"reviewer_id" uuid,"override_reason" text,"raw_result" jsonb not null,"idempotency_key" text not null,"correlation_id" uuid not null,"evaluated_at" timestamp with time zone not null,"created_at" timestamp with time zone not null);
create table "public"."wing_nightly_run_receipts" ("id" uuid not null,"business_date" date not null,"timezone" text not null,"status" text not null,"selected_submission_id" uuid,"selection_score" numeric(8,3),"score_components" jsonb not null,"candidate_count" integer not null,"dry_run" boolean not null,"started_at" timestamp with time zone not null,"completed_at" timestamp with time zone,"failure_code" text,"failure_reason" text,"correlation_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."wing_notification_receipts" ("id" uuid not null,"user_id" uuid,"owner_pseudonym_id" uuid not null,"owner_deleted_at" timestamp with time zone,"submission_id" uuid,"badge_event_id" uuid,"event_type" text not null,"outbox_id" uuid,"outcome" text not null,"deduplication_key" text not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."wing_photo_derivative_jobs" ("id" uuid not null,"submission_id" uuid not null,"purpose" text not null,"status" text not null,"attempt_count" integer not null,"max_attempts" integer not null,"available_at" timestamp with time zone not null,"claim_token" uuid,"claimed_by" text,"lease_expires_at" timestamp with time zone,"last_error_code" text,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."wing_photo_derivative_receipts" ("id" uuid not null,"submission_id" uuid not null,"job_id" uuid,"attempt_number" integer not null,"event" text not null,"error_code" text,"correlation_id" uuid not null,"occurred_at" timestamp with time zone not null);
create table "public"."wing_processing_jobs" ("id" uuid not null,"submission_id" uuid not null,"job_kind" text not null,"generation" integer not null,"status" text not null,"available_at" timestamp with time zone not null,"claimed_at" timestamp with time zone,"lease_expires_at" timestamp with time zone,"claim_token" uuid,"claimed_by" text,"attempt_count" integer not null,"max_attempts" integer not null,"last_error_code" text,"last_error_reason" text,"completed_at" timestamp with time zone,"idempotency_key" text not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null);
create table "public"."wing_submission_abuse_signals" ("id" uuid not null,"submission_id" uuid not null,"signal_type" text not null,"severity" text not null,"related_submission_id" uuid,"score" numeric(5,4),"model_version" text,"notes" text,"idempotency_key" text not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."wing_submission_mutation_receipts" ("id" uuid not null,"user_id" uuid,"owner_pseudonym_id" uuid not null,"owner_deleted_at" timestamp with time zone,"submission_id" uuid,"mutation_kind" text not null,"idempotency_key" text not null,"request_fingerprint" text not null,"result" jsonb not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null);
create table "public"."wing_submission_state_transitions" ("id" uuid not null,"submission_id" uuid not null,"from_status" text,"to_status" text not null,"actor_type" text not null,"actor_id" uuid,"trigger_source" text not null,"idempotency_key" text not null,"request_fingerprint" text not null,"correlation_id" uuid not null,"metadata" jsonb not null,"occurred_at" timestamp with time zone not null);
create table "public"."wing_submission_upload_intents" ("id" uuid not null,"submission_id" uuid not null,"user_id" uuid not null,"rating_id" uuid,"destination_id" uuid not null,"media_type" text not null,"expected_mime_type" text not null,"expected_size_bytes" bigint not null,"expected_storage_path" text not null,"consent_version" text not null,"consented_at" timestamp with time zone not null,"attribution_preference" text not null,"user_caption" text,"status" text not null,"expires_at" timestamp with time zone not null,"finalized_at" timestamp with time zone,"idempotency_key" text not null,"request_fingerprint" text not null,"correlation_id" uuid not null,"created_at" timestamp with time zone not null,"updated_at" timestamp with time zone not null,"submission_source" text not null);
create table "public"."wing_user_moderation_state" ("user_id" uuid not null,"status" text not null,"limit_multiplier" numeric(4,2) not null,"reason_category" text,"expires_at" timestamp with time zone,"updated_by" uuid,"updated_at" timestamp with time zone not null);
create table "public"."xp_ledger" ("id" uuid not null,"user_id" uuid not null,"amount" integer not null,"source" text not null,"reason" text,"idempotency_key" text not null,"destination_id" uuid,"crawl_id" uuid,"route_id" uuid,"badge_id" bigint,"battle_id" bigint,"challenge_id" uuid,"referral_id" uuid,"level_before" integer,"level_after" integer,"xp_before" integer not null,"xp_after" integer not null,"metadata" jsonb not null,"created_at" timestamp with time zone not null);
CREATE OR REPLACE FUNCTION private.enforce_wing_jury_vote_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.is_public_wing_jury_photo(p_submission_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.lock_rating_collection_identities()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.lock_user_destination(p_user_id uuid, p_destination_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.refresh_wing_jury_photo_vote_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.refresh_wing_media_photo_vote_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_submission_id uuid;
  -- Keep the post-lock eligibility check identical to the validation above.
  v_consent_whitespace constant text := U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff';
begin
  v_submission_id := coalesce(new.submission_id, old.submission_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wing-photo-votes:' || v_submission_id::text, 0)
  );

  update public.wing_media_submissions s
  set like_count = (
        select count(*)::integer from public.wing_media_photo_votes v
        where v.submission_id = v_submission_id and v.vote = 1
      ),
      dislike_count = (
        select count(*)::integer from public.wing_media_photo_votes v
        where v.submission_id = v_submission_id and v.vote = -1
      )
  where s.id = v_submission_id
    and (tg_op = 'DELETE' or (
      s.media_type = 'photo' and s.status = 'approved'
      and s.user_id is not null and s.owner_deleted_at is null
      and s.withdrawn_at is null
      and nullif(pg_catalog.btrim(s.consent_version, v_consent_whitespace), '') is not null
      and s.consented_at <= now()
      and s.attribution_preference in ('username', 'display_name', 'anonymous')
      and s.processed_storage_path = 'processed/' || s.id::text || '/primary'
      and exists (
        select 1 from storage.objects object
        where object.bucket_id = 'wing-submissions'
          and object.name = s.processed_storage_path
      )
    ));
  if not found and tg_op <> 'DELETE' then
    raise exception 'photo is not eligible for voting' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.remove_favorite_after_rating_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.remove_want_to_try_after_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform private.lock_user_destination(new.user_id, new.destination_id);
  delete from public.user_want_to_try
   where user_id = new.user_id and destination_id = new.destination_id;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.require_authenticated_user()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
begin
  if v_user_id is null or v_anonymous then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  return v_user_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_favorite_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.validate_want_to_try_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.validate_wing_jury_vote_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.validate_wing_media_photo_vote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_photo public.wing_media_submissions%rowtype;
  -- Match JavaScript String.trim in the gallery, including non-ASCII whitespace.
  v_consent_whitespace constant text := U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff';
begin
  if tg_op = 'UPDATE' and (new.submission_id is distinct from old.submission_id
                           or new.user_id is distinct from old.user_id) then
    raise exception 'photo vote identity cannot change' using errcode = '42501';
  end if;

  if new.user_id is distinct from (select auth.uid())
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'photo vote requires a signed-in user' using errcode = '42501';
  end if;

  select * into v_photo
  from public.wing_media_submissions
  where id = new.submission_id;

  if not found or v_photo.media_type is distinct from 'photo'
     or v_photo.status is distinct from 'approved'
     or v_photo.user_id is null or v_photo.owner_deleted_at is not null
     or v_photo.withdrawn_at is not null
     or nullif(pg_catalog.btrim(v_photo.consent_version, v_consent_whitespace), '') is null
     or v_photo.consented_at is null or v_photo.consented_at > now()
     or v_photo.attribution_preference not in ('username', 'display_name', 'anonymous')
     or v_photo.processed_storage_path is distinct from
        'processed/' || v_photo.id::text || '/primary'
     or not exists (
       select 1 from storage.objects object
       where object.bucket_id = 'wing-submissions'
         and object.name = v_photo.processed_storage_path
     ) then
    raise exception 'photo is not eligible for voting' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public."Badge_Add_Crawl_Milestones"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_streak int;
begin
  -- Only act when a crawl is (or becomes) completed
  if NEW.end_time is not null then
    -- ✅ Badge 12: “Completed a crawl” (first completion)
    insert into public.user_badges(user_id, badge_id, earned_at)
    values (NEW.user_id, 12, now())
    on conflict (user_id, badge_id) do nothing;

    -- ✅ Badge 24: “Maintain a 52-week streak”
    -- Look at the view for the user's current streak
    select cws.current_streak_weeks
      into v_streak
      from public.crawl_weekly_streak cws
     where cws.user_id = NEW.user_id
     limit 1;

    if coalesce(v_streak, 0) >= 52 then
      insert into public.user_badges(user_id, badge_id, earned_at)
      values (NEW.user_id, 24, now())
      on conflict (user_id, badge_id) do nothing;
    end if;
  end if;

  return NEW;

exception
  when others then
    -- Don't block writes; just surface a notice for debugging
    raise notice '[Badge_Add_Crawl_Milestones] %: %', SQLSTATE, SQLERRM;
    return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public."Badge_Add_Rating_Milestones"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_distinct_rated int;
  v_tagged_count   int;
begin
  -- Skip guests
  if NEW.user_id is null then
    return NEW;
  end if;

  -- Always try to award "First Bite" (unique constraint prevents dupes)
  insert into public.user_badges (user_id, badge_id, earned_at)
  values (NEW.user_id, 5, now())
  on conflict (user_id, badge_id) do nothing;

  -- Distinct restaurants rated by this user (all-time)
  select count(distinct destination_id)
    into v_distinct_rated
  from public.destination_ratings
  where user_id = NEW.user_id;

  if v_distinct_rated >= 10 then
    insert into public.user_badges (user_id, badge_id, earned_at)
    values (NEW.user_id, 6, now())
    on conflict (user_id, badge_id) do nothing;
  end if;

  if v_distinct_rated >= 50 then
    insert into public.user_badges (user_id, badge_id, earned_at)
    values (NEW.user_id, 7, now())
    on conflict (user_id, badge_id) do nothing;
  end if;

  if v_distinct_rated >= 100 then
    insert into public.user_badges (user_id, badge_id, earned_at)
    values (NEW.user_id, 27, now())
    on conflict (user_id, badge_id) do nothing;
  end if;

  -- Tagged ratings count (per spec: any row with tag_id not null)
  select count(*)
    into v_tagged_count
  from public.destination_ratings
  where user_id = NEW.user_id
    and tag_id is not null;

  if v_tagged_count >= 10 then
    insert into public.user_badges (user_id, badge_id, earned_at)
    values (NEW.user_id, 25, now())
    on conflict (user_id, badge_id) do nothing;
  end if;

  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.android_qa_welcome_coins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.deleted_at is null and not coalesce(new.is_anonymous, false) then
    insert into public.buffacoin_ledger(user_id, delta, reason)
    values (new.id, 100, 'Welcome Bonus — 100 BuffaCoins')
    on conflict (user_id, reason) where reason in
      ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins') do nothing;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp(p_user uuid, p_amount integer, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.users
     set xp = greatest(0, xp + p_amount)
   where user_id = p_user;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp(p_amount integer, p_source text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT auth.uid(), p_idempotency_key text DEFAULT NULL::text, p_destination_id uuid DEFAULT NULL::uuid, p_crawl_id uuid DEFAULT NULL::uuid, p_route_id uuid DEFAULT NULL::uuid, p_badge_id bigint DEFAULT NULL::bigint, p_battle_id bigint DEFAULT NULL::bigint, p_challenge_id uuid DEFAULT NULL::uuid, p_referral_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(awarded boolean, amount integer, xp_before integer, xp_after integer, level_before integer, level_after integer, ledger_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_source text := lower(coalesce(nullif(trim(p_source), ''), 'unknown'));
  v_amount integer := coalesce(p_amount, 0);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_idempotency_key text;
  v_existing public.xp_ledger%rowtype;
  v_xp_before integer;
  v_xp_after integer;
  v_level_before integer;
  v_level_after integer;
  v_ledger_id uuid;
begin
  if v_user_id is null then
    raise exception 'award_xp requires a user id';
  end if;

  if auth.uid() is not null and v_user_id <> auth.uid() then
    raise exception 'cannot award XP to a different user';
  end if;

  if v_amount = 0 then
    raise exception 'award_xp amount must be non-zero';
  end if;

  if v_source !~ '^[a-z0-9_]+$' then
    raise exception 'award_xp source must be snake_case';
  end if;

  insert into public.users (user_id, xp)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  v_idempotency_key := coalesce(
    nullif(trim(p_idempotency_key), ''),
    concat_ws(
      ':',
      'xp',
      v_user_id::text,
      v_source,
      coalesce(p_destination_id::text, 'none'),
      coalesce(p_crawl_id::text, 'none'),
      coalesce(p_route_id::text, 'none'),
      coalesce(p_badge_id::text, 'none'),
      coalesce(p_battle_id::text, 'none'),
      coalesce(p_challenge_id::text, 'none'),
      coalesce(p_referral_id::text, 'none'),
      coalesce(v_reason, 'none')
    )
  );

  select *
  into v_existing
  from public.xp_ledger
  where idempotency_key = v_idempotency_key
  limit 1;

  if found then
    return query
    select
      false,
      v_existing.amount,
      v_existing.xp_before,
      v_existing.xp_after,
      v_existing.level_before,
      v_existing.level_after,
      v_existing.id,
      'duplicate'::text;
    return;
  end if;

  select coalesce(xp, 0)
  into v_xp_before
  from public.users
  where user_id = v_user_id
  for update;

  v_xp_after := greatest(0, v_xp_before + v_amount);
  v_level_before := public.xp_level_for(v_xp_before);
  v_level_after := public.xp_level_for(v_xp_after);

  update public.users
  set xp = v_xp_after
  where user_id = v_user_id;

  insert into public.xp_ledger (
    user_id,
    amount,
    source,
    reason,
    idempotency_key,
    destination_id,
    crawl_id,
    route_id,
    badge_id,
    battle_id,
    challenge_id,
    referral_id,
    level_before,
    level_after,
    xp_before,
    xp_after,
    metadata
  )
  values (
    v_user_id,
    v_amount,
    v_source,
    v_reason,
    v_idempotency_key,
    p_destination_id,
    p_crawl_id,
    p_route_id,
    p_badge_id,
    p_battle_id,
    p_challenge_id,
    p_referral_id,
    v_level_before,
    v_level_after,
    v_xp_before,
    v_xp_after,
    v_metadata
  )
  returning id into v_ledger_id;

  insert into public.user_events (
    user_id,
    session_id,
    event_name,
    destination_id,
    crawl_id,
    route_id,
    metadata
  )
  values (
    v_user_id,
    gen_random_uuid(),
    'xp_awarded',
    p_destination_id,
    p_crawl_id,
    p_route_id,
    jsonb_build_object(
      'amount', v_amount,
      'source', v_source,
      'reason', v_reason,
      'ledger_id', v_ledger_id,
      'idempotency_key', v_idempotency_key,
      'level_before', v_level_before,
      'level_after', v_level_after,
      'xp_before', v_xp_before,
      'xp_after', v_xp_after
    ) || v_metadata
  )
  on conflict do nothing;

  if v_level_after > v_level_before then
    insert into public.user_events (
      user_id,
      session_id,
      event_name,
      destination_id,
      crawl_id,
      route_id,
      metadata
    )
    values (
      v_user_id,
      gen_random_uuid(),
      'level_up',
      p_destination_id,
      p_crawl_id,
      p_route_id,
      jsonb_build_object(
        'source', v_source,
        'ledger_id', v_ledger_id,
        'level_before', v_level_before,
        'level_after', v_level_after,
        'xp_before', v_xp_before,
        'xp_after', v_xp_after
      ) || v_metadata
    )
    on conflict do nothing;
  end if;

  return query
  select
    true,
    v_amount,
    v_xp_before,
    v_xp_after,
    v_level_before,
    v_level_after,
    v_ledger_id,
    coalesce(v_reason, v_source);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.begin_wing_processing_job(p_job_id uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
declare
  v_job public.wing_processing_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
begin
  select *
    into v_job
    from public.wing_processing_jobs
   where id = p_job_id
   for update;

  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_job_claim';
  end if;
  if v_job.job_kind not in ('photo_process', 'video_process') then
    raise exception 'unsupported_processing_job_kind';
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = v_job.submission_id
   for update;

  if not found
     or v_submission.status not in (
       'uploaded', 'processing', 'in_review', 'approved'
     ) then
    raise exception 'submission_not_processable';
  end if;
  if v_job.job_kind <> (v_submission.media_type || '_process') then
    raise exception 'processing_job_media_mismatch';
  end if;
  if not exists (
    select 1
      from storage.objects object
     where object.bucket_id = 'wing-submissions'
       and object.name = v_submission.original_storage_path
  ) then
    raise exception 'original_media_not_found';
  end if;

  -- Legacy uploaded rows still use the old processing transition. New review
  -- rows keep their review state while the private derivative is prepared.
  if v_submission.status = 'uploaded' then
    perform public.wing_transition_submission(
      v_submission.id,
      'processing',
      'uploaded',
      'worker',
      null,
      'media_processing_started',
      'worker-begin:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object(
        'job_id', v_job.id,
        'generation', v_job.generation
      )
    );
  end if;

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'media_type', v_submission.media_type,
    'bucket', 'wing-submissions',
    'original_path', v_submission.original_storage_path,
    'processed_path', 'processed/' || v_submission.id::text || '/primary',
    'thumbnail_path', 'thumbnails/' || v_submission.id::text || '/preview',
    'correlation_id', v_job.correlation_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.buffacoin_apply_ledger_delta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Ensure wallet row exists
  insert into public.buffacoin_wallets (user_id, balance)
  values (new.user_id, 0)
  on conflict (user_id) do nothing;

  -- Apply delta (and keep updated_at fresh)
  update public.buffacoin_wallets
  set
    balance = balance + new.delta,
    updated_at = now()
  where user_id = new.user_id;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.buffacoin_wallets_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.can_user_appear_socially(user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (
      select not u.social_opt_out
      from public.users u
      where u.user_id = $1
    ),
    false
  );
$function$
;
CREATE OR REPLACE FUNCTION public.claim_wing_media_cleanup_job(p_worker text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.wing_media_cleanup_jobs%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if char_length(coalesce(p_worker, '')) not between 3 and 120
     or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_cleanup_worker_lease';
  end if;

  update public.wing_media_cleanup_jobs
  set status = case when attempt_count >= max_attempts then 'dead' else 'retry' end,
      available_at = case
        when attempt_count >= max_attempts then available_at
        else now() + least(
          interval '30 minutes',
          interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
        )
      end,
      claim_token = null,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      last_error_code = 'STALE_LEASE',
      completed_at = case
        when attempt_count >= max_attempts then now()
        else completed_at
      end,
      updated_at = now()
  where status = 'claimed'
    and lease_expires_at <= now();

  select *
  into v_job
  from public.wing_media_cleanup_jobs
  where status in ('pending', 'retry')
    and available_at <= now()
    and attempt_count < max_attempts
  order by available_at, created_at, id
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.wing_media_cleanup_jobs
  set status = 'claimed',
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      claim_token = v_token,
      claimed_by = p_worker,
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_job.id;

  return jsonb_build_object(
    'job_id', v_job.id,
    'cleanup_kind', v_job.cleanup_kind,
    'bucket', v_job.bucket,
    'object_path', v_job.object_path,
    'claim_token', v_token,
    'correlation_id', v_job.correlation_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_wing_processing_job(p_worker text, p_lease_seconds integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_job public.wing_processing_jobs%rowtype; v_token uuid:=gen_random_uuid();
begin
  if char_length(coalesce(p_worker,'')) not between 3 and 120
     or p_lease_seconds not between 30 and 900 then raise exception 'invalid_worker_lease'; end if;
  update public.wing_processing_jobs set
    status=case when attempt_count>=max_attempts then 'dead' else 'retry' end,
    available_at=case when attempt_count>=max_attempts then available_at
      else now()+least(interval '30 minutes', interval '30 seconds'*(2^greatest(attempt_count-1,0))) end,
    claim_token=null,claimed_by=null,claimed_at=null,lease_expires_at=null,
    last_error_code='STALE_LEASE',updated_at=now()
  where status='claimed' and lease_expires_at<=now();
  select * into v_job from public.wing_processing_jobs
  where status in ('pending','retry') and available_at<=now() and attempt_count<max_attempts
  order by available_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.wing_processing_jobs set status='claimed',claimed_at=now(),
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds),claim_token=v_token,
    claimed_by=p_worker,attempt_count=attempt_count+1,updated_at=now()
  where id=v_job.id;
  return jsonb_build_object('job_id',v_job.id,'submission_id',v_job.submission_id,
    'job_kind',v_job.job_kind,'claim_token',v_token,
    'lease_expires_at',now()+make_interval(secs=>p_lease_seconds));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_friend_rating_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_user_appear_socially(new.user_id) then return new; end if;
  insert into public.notification_outbox(
    user_id, event_type, source_entity_type, source_entity_id, deduplication_key,
    deep_link, fallback_route, copy_data, expires_at
  )
  select
    case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end,
    'friend_rating', 'destination_rating', new.id::text, 'rating:' || new.id::text,
    'buffago://rating/' || new.id::text, '/(tabs)/home',
    jsonb_build_object('actor_id', new.user_id, 'rating_id', new.id,
      'destination_id', new.destination_id),
    now() + interval '3 days'
  from public.friendships f
  join public.notification_preferences np
    on np.user_id = case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
   and np.friend_activity
  join public.engagement_feature_flags flag
    on flag.flag_key = 'friend_rating_push' and flag.enabled
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id)
    and not public.friend_pair_is_blocked(f.requester_id, f.addressee_id)
  on conflict (user_id, event_type, deduplication_key) do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_wing_creator_badge_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text := 'creator_badge_earned:' || new.id::text;
  v_outbox_id uuid;
  v_outcome text;
  v_flag_enabled boolean;
  v_preference_enabled boolean;
begin
  if new.event_kind <> 'awarded' or new.user_id is null then
    return new;
  end if;
  insert into public.notification_preferences (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  select enabled into v_flag_enabled
    from public.engagement_feature_flags
   where flag_key = 'wing_shot_featured_notifications';
  select creator_updates into v_preference_enabled
    from public.notification_preferences where user_id = new.user_id;

  if coalesce(v_flag_enabled, false) and coalesce(v_preference_enabled, true) then
    insert into public.notification_outbox (
      user_id, event_type, source_entity_type, source_entity_id,
      deduplication_key, eligible_at, expires_at, deep_link,
      fallback_route, copy_data, correlation_id
    ) values (
      new.user_id, 'creator_badge_earned', 'wing_creator_badge_event',
      new.id::text, v_key, now(), now() + interval '7 days',
      'buffago://wing-shots/badges',
      '/wing-shots/history',
      jsonb_build_object(
        'title', 'Creator badge earned',
        'body', 'You earned the ' || new.badge_code || ' badge.',
        'badge_code', new.badge_code
      ),
      new.correlation_id
    )
    on conflict (user_id, event_type, deduplication_key) do update
      set deduplication_key = excluded.deduplication_key
    returning id into v_outbox_id;
    v_outcome := 'queued';
  else
    v_outcome := case
      when not coalesce(v_flag_enabled, false) then 'flag_disabled'
      else 'preference_disabled'
    end;
  end if;

  insert into public.wing_notification_receipts (
    user_id, badge_event_id, event_type, outbox_id, outcome,
    deduplication_key, correlation_id
  ) values (
    new.user_id, new.id, 'creator_badge_earned', v_outbox_id, v_outcome,
    v_key, new.correlation_id
  )
  on conflict (deduplication_key) do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_wing_media_cleanup(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_inserted integer;
begin
  if p_limit not between 1 and 500 then
    raise exception 'invalid_cleanup_enqueue_limit';
  end if;

  -- Progressively cover pre-migration rows without a large deployment lock.
  with missing_retention as (
    select submission.id
    from public.wing_media_submissions submission
    where submission.original_retain_until is null
      and submission.original_deleted_at is null
    order by submission.created_at, submission.id
    for update skip locked
    limit 500
  )
  update public.wing_media_submissions submission
  set original_retain_until = submission.created_at + make_interval(days => (
        select config.original_retention_days
        from public.wing_moderation_config config
        where config.singleton
      )),
      updated_at = now()
  from missing_retention
  where submission.id = missing_retention.id;

  with cleanup_candidates as (
    select
      'expired_original'::text as cleanup_kind,
      submission.id as submission_id,
      null::uuid as upload_intent_id,
      submission.original_storage_path as object_path,
      submission.correlation_id,
      submission.original_retain_until as due_at
    from public.wing_media_submissions submission
    where submission.original_retain_until <= now()
      and submission.original_deleted_at is null
      and (
        submission.processed_storage_path is not null
        or submission.status in ('failed', 'rejected', 'withdrawn')
      )
      and not exists (
        select 1
        from public.wing_media_cleanup_jobs cleanup
        where cleanup.cleanup_kind = 'expired_original'
          and cleanup.object_path = submission.original_storage_path
      )
    union all
    select
      'abandoned_upload'::text,
      null::uuid,
      intent.id,
      intent.expected_storage_path,
      intent.correlation_id,
      intent.expires_at + interval '1 hour'
    from public.wing_submission_upload_intents intent
    where intent.status = 'reserved'
      and intent.expires_at <= now() - interval '1 hour'
      and not exists (
        select 1
        from public.wing_media_cleanup_jobs cleanup
        where cleanup.cleanup_kind = 'abandoned_upload'
          and cleanup.object_path = intent.expected_storage_path
      )
    order by due_at, object_path
    limit p_limit
  )
  insert into public.wing_media_cleanup_jobs (
    cleanup_kind,
    submission_id,
    upload_intent_id,
    object_path,
    correlation_id
  )
  select
    candidate.cleanup_kind,
    candidate.submission_id,
    candidate.upload_intent_id,
    candidate.object_path,
    candidate.correlation_id
  from cleanup_candidates candidate
  on conflict (cleanup_kind, object_path) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_wing_photo_upload_derivatives()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.media_type='photo' and new.status='in_review' then
    insert into public.wing_photo_derivative_jobs(submission_id,purpose,correlation_id)
      values(new.id,'upload',new.correlation_id) on conflict(submission_id) do nothing;
    insert into public.wing_photo_derivative_receipts(submission_id,event,correlation_id)
      values(new.id,'upload_queued',new.correlation_id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_wing_processing_backlog(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare n integer;
begin
  if p_limit not between 1 and 500 then raise exception 'invalid_backfill_limit'; end if;
  with candidates as (
    select s.id,s.media_type,s.correlation_id from public.wing_media_submissions s
    where s.media_type='video' and s.status in ('uploaded','processing','in_review','approved') and s.processed_storage_path is null
      and not exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id
        and j.job_kind='video_process' and j.status in ('pending','claimed','retry','succeeded'))
    order by s.created_at,s.id for update skip locked limit p_limit
  ) insert into public.wing_processing_jobs(submission_id,job_kind,generation,status,idempotency_key,correlation_id)
    select c.id,'video_process',coalesce((select max(j.generation)+1 from public.wing_processing_jobs j
      where j.submission_id=c.id and j.job_kind='video_process'),1),'pending','process-review:'||c.id::text||':'||md5(now()::text),c.correlation_id from candidates c;
  get diagnostics n=row_count; return n;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_wing_submission_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_event_type text;
  v_key text;
  v_copy jsonb;
  v_outbox_id uuid;
  v_outcome text;
  v_flag_enabled boolean;
  v_preference_enabled boolean;
begin
  v_event_type := case new.to_status
    when 'approved' then 'wing_shot_approved'
    when 'rejected' then 'wing_shot_rejected'
    when 'posted' then 'wing_shot_featured'
    else null
  end;
  if v_event_type is null then
    return new;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = new.submission_id;
  if not found or v_submission.user_id is null then
    return new;
  end if;

  insert into public.notification_preferences (user_id)
  values (v_submission.user_id)
  on conflict (user_id) do nothing;

  select enabled
    into v_flag_enabled
    from public.engagement_feature_flags
   where flag_key = 'wing_shot_featured_notifications';
  select creator_updates
    into v_preference_enabled
    from public.notification_preferences
   where user_id = v_submission.user_id;

  v_key := v_event_type || ':' || v_submission.id::text;
  v_copy := case v_event_type
    when 'wing_shot_approved' then jsonb_build_object(
      'title', 'Wing Shot approved',
      'body', case when exists (
        select 1 from public.destination_ratings r
        where r.id = v_submission.rating_id
          and r.user_id = v_submission.user_id
          and r.destination_id = v_submission.destination_id
          and r.is_buffacoin = true
      ) then 'Your Wing Shot was approved.'
      else 'Your Wing Shot was approved and earned Creator XP.' end,
      'submission_id', v_submission.id
    )
    when 'wing_shot_rejected' then jsonb_build_object(
      'title', 'Wing Shot update',
      'body', 'Your Wing Shot was not approved. Open your history for the next step.',
      'submission_id', v_submission.id,
      'rejection_category', v_submission.rejection_reason
    )
    else jsonb_build_object(
      'title', '🌶️ You''re featured on BuffaGo today!',
      'body', 'Your Wing Shot is live. Open it from your featured history.',
      'submission_id', v_submission.id
    )
  end;

  if coalesce(v_flag_enabled, false) and coalesce(v_preference_enabled, true) then
    insert into public.notification_outbox (
      user_id, event_type, source_entity_type, source_entity_id,
      deduplication_key, eligible_at, expires_at, deep_link,
      fallback_route, copy_data, correlation_id
    ) values (
      v_submission.user_id, v_event_type, 'wing_media_submission',
      v_submission.id::text, v_key, now(), now() + interval '7 days',
      'buffago://wing-shots/' || v_submission.id::text,
      '/wing-shots/' || v_submission.id::text,
      v_copy, new.correlation_id
    )
    on conflict (user_id, event_type, deduplication_key) do update
      set deduplication_key = excluded.deduplication_key
    returning id into v_outbox_id;
    v_outcome := 'queued';
  else
    v_outcome := case
      when not coalesce(v_flag_enabled, false) then 'flag_disabled'
      else 'preference_disabled'
    end;
  end if;

  insert into public.wing_notification_receipts (
    user_id, submission_id, event_type, outbox_id, outcome,
    deduplication_key, correlation_id
  ) values (
    v_submission.user_id, v_submission.id, v_event_type, v_outbox_id,
    v_outcome, v_key, new.correlation_id
  )
  on conflict (deduplication_key) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_new_user_referral_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.provision_referral_code_internal(new.id);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.finalize_wing_submission_upload(p_submission_id uuid, p_idempotency_key text, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_intent public.wing_submission_upload_intents%rowtype;
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_object storage.objects%rowtype;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_submission_id is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'invalid_finalize_request';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-mutation:' || p_idempotency_key, 0)
  );
  v_fingerprint := md5(concat_ws('|', p_submission_id::text, 'finalize'));

  select * into v_existing
    from public.wing_submission_mutation_receipts
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.result;
  end if;

  select * into v_intent
    from public.wing_submission_upload_intents
   where submission_id = p_submission_id
     and user_id = v_user_id
   for update;
  if not found
     or v_intent.submission_id is distinct from p_submission_id
     or v_intent.status not in ('reserved', 'finalized')
     or (v_intent.status = 'reserved' and v_intent.expires_at <= now()) then
    raise exception 'upload_intent_unavailable';
  end if;
  if not exists (
    select 1 from public.wing_media_validation_receipts receipt
    where receipt.submission_id = v_intent.submission_id
      and receipt.user_id = v_user_id
      and receipt.size_bytes = v_intent.expected_size_bytes
      and receipt.mime_type = v_intent.expected_mime_type
      and receipt.promoted_at is not null
      and receipt.expires_at > receipt.promoted_at
  ) then
    raise exception 'validated_promotion_required';
  end if;

  select * into v_submission
    from public.wing_media_submissions
   where id = v_intent.submission_id
   for update;
  if found then
    if v_submission.user_id is distinct from v_user_id
       or v_submission.status in ('withdrawn', 'rejected') then
      raise exception 'upload_intent_unavailable';
    end if;
    v_result := jsonb_build_object(
      'submission_id', v_submission.id,
      'status', v_submission.status,
      'review_status', case when v_submission.status = 'in_review'
        then 'pending_review' else null end,
      'display_status', case when v_submission.status = 'in_review'
        then 'In Review' else v_submission.status end,
      'processing_job_id', null
    );
    insert into public.wing_submission_mutation_receipts (
      user_id, submission_id, mutation_kind, idempotency_key,
      request_fingerprint, result, correlation_id
    ) values (
      v_user_id, v_submission.id, 'finalize_upload', p_idempotency_key,
      v_fingerprint, v_result, p_correlation_id
    ) on conflict (idempotency_key) do nothing;
    return v_result;
  end if;

  -- The object must exist at the immutable reservation location. Ownership
  -- metadata is intentionally not consulted because promotion is service-role.
  select * into v_object
    from storage.objects
   where bucket_id = 'wing-submissions'
     and name = v_intent.expected_storage_path;
  if not found then
    raise exception 'uploaded_object_not_found';
  end if;
  if coalesce(nullif(v_object.metadata->>'size', '')::bigint, -1)
       <> v_intent.expected_size_bytes
     or lower(coalesce(v_object.metadata->>'mimetype', v_object.metadata->>'contentType', ''))
       <> lower(v_intent.expected_mime_type) then
    raise exception 'uploaded_object_invalid';
  end if;

  if v_intent.rating_id is not null and not exists (
    select 1 from public.destination_ratings r where r.id = v_intent.rating_id
      and r.user_id = v_user_id and r.destination_id = v_intent.destination_id
  ) then
    raise exception 'rating_association_changed' using errcode = '42501';
  end if;

  insert into public.wing_media_submissions (
    id, user_id, rating_id, destination_id, submission_source, media_type,
    original_storage_path, consent_version, consented_at,
    attribution_preference, user_caption, status, correlation_id
  ) values (
    v_intent.submission_id, v_intent.user_id, v_intent.rating_id,
    v_intent.destination_id, v_intent.submission_source, v_intent.media_type,
    v_intent.expected_storage_path, v_intent.consent_version,
    v_intent.consented_at, v_intent.attribution_preference,
    v_intent.user_caption, 'in_review', p_correlation_id
  );

  update public.wing_submission_upload_intents
     set status = 'finalized', finalized_at = now(), updated_at = now()
   where id = v_intent.id;

  insert into public.wing_submission_state_transitions (
    submission_id, from_status, to_status, actor_type, actor_id,
    trigger_source, idempotency_key, request_fingerprint, correlation_id,
    metadata
  ) values (
    v_intent.submission_id, null, 'in_review', 'user', v_user_id,
    'upload_finalized_for_review', 'initial:' || md5(p_idempotency_key),
    md5('initial|in_review|' || v_intent.submission_id::text),
    p_correlation_id, jsonb_build_object('storage_verified', true)
  ) on conflict (idempotency_key) do nothing;

  v_result := jsonb_build_object(
    'submission_id', v_intent.submission_id,
    'status', 'in_review',
    'review_status', 'pending_review',
    'display_status', 'In Review',
    'processing_job_id', null
  );
  insert into public.wing_submission_mutation_receipts (
    user_id, submission_id, mutation_kind, idempotency_key,
    request_fingerprint, result, correlation_id
  ) values (
    v_user_id, v_intent.submission_id, 'finalize_upload', p_idempotency_key,
    v_fingerprint, v_result, p_correlation_id
  );
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.finish_wing_media_cleanup_job(p_job_id uuid, p_claim_token uuid, p_object_outcome text, p_retryable boolean DEFAULT false, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.wing_media_cleanup_jobs%rowtype;
  v_status text;
  v_audit_outcome text;
begin
  if p_object_outcome not in ('deleted', 'missing', 'failed') then
    raise exception 'invalid_cleanup_outcome';
  end if;

  select *
  into v_job
  from public.wing_media_cleanup_jobs
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_cleanup_claim';
  end if;

  v_status := case
    when p_object_outcome in ('deleted', 'missing') then 'succeeded'
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'retry'
    else 'dead'
  end;
  v_audit_outcome := case
    when p_object_outcome in ('deleted', 'missing') then p_object_outcome
    when v_status = 'retry' then 'retry'
    else 'dead'
  end;

  update public.wing_media_cleanup_jobs
  set status = v_status,
      available_at = case
        when v_status = 'retry' then now() + least(
          interval '30 minutes',
          interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
        )
        else available_at
      end,
      claim_token = null,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      last_error_code = case
        when v_status = 'succeeded' then null
        else coalesce(left(p_error_code, 100), 'STORAGE_DELETE_FAILED')
      end,
      completed_at = case when v_status in ('succeeded', 'dead') then now() end,
      updated_at = now()
  where id = v_job.id;

  if v_status = 'succeeded' and v_job.cleanup_kind = 'expired_original' then
    update public.wing_media_submissions
    set original_deleted_at = coalesce(original_deleted_at, now()),
        updated_at = now()
    where id = v_job.submission_id;
  elsif v_status = 'succeeded'
        and v_job.cleanup_kind = 'abandoned_upload' then
    update public.wing_submission_upload_intents
    set status = 'expired',
        updated_at = now()
    where id = v_job.upload_intent_id
      and status = 'reserved';
  end if;

  insert into public.wing_media_cleanup_receipts (
    cleanup_job_id,
    attempt_number,
    cleanup_kind,
    object_path_hash,
    outcome,
    error_code,
    correlation_id
  ) values (
    v_job.id,
    v_job.attempt_count,
    v_job.cleanup_kind,
    md5(v_job.object_path),
    v_audit_outcome,
    case
      when v_audit_outcome in ('deleted', 'missing') then null
      else coalesce(left(p_error_code, 100), 'STORAGE_DELETE_FAILED')
    end,
    v_job.correlation_id
  )
  on conflict (cleanup_job_id, attempt_number) do nothing;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_status,
    'outcome', v_audit_outcome
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.finish_wing_processing_job(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_error_code text DEFAULT NULL::text, p_error_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_job public.wing_processing_jobs%rowtype; v_status text;
begin
  select * into v_job from public.wing_processing_jobs where id=p_job_id for update;
  if not found or v_job.status<>'claimed' or v_job.claim_token<>p_claim_token
     or v_job.lease_expires_at<=now() then raise exception 'invalid_or_expired_job_claim'; end if;
  v_status:=case when p_succeeded then 'succeeded'
    when p_retryable and v_job.attempt_count<v_job.max_attempts then 'retry' else 'dead' end;
  update public.wing_processing_jobs set status=v_status,
    available_at=case when v_status='retry' then now()+least(interval '30 minutes',
      interval '30 seconds'*(2^greatest(attempt_count-1,0))) else available_at end,
    completed_at=case when v_status in ('succeeded','dead') then now() else null end,
    last_error_code=p_error_code,last_error_reason=left(p_error_reason,1000),
    claim_token=null,claimed_by=null,claimed_at=null,lease_expires_at=null,updated_at=now()
  where id=p_job_id;
  return v_status;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.flag_referral_account_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.referral_abuse_signals(
    referral_attribution_id,signal_type,severity,deduplication_key,details
  )
  select a.id,'invitee_deleted','review','invitee_deleted:'||a.id,
    jsonb_build_object('status_at_deletion',a.status)
  from public.referral_attributions a where a.invitee_user_id=old.id
  on conflict(deduplication_key) do nothing;
  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.friend_pair_is_blocked(p_user_a uuid, p_user_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
       or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.generate_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  for v_attempt in 1..40 loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1,8);
    exit when not exists (
      select 1 from public.referral_codes where lower(code)=lower(v_code)
    );
  end loop;
  if v_code is null or exists (
    select 1 from public.referral_codes where lower(code)=lower(v_code)
  ) then raise exception 'referral_code_generation_exhausted'; end if;
  return v_code;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_wing_fingerprint_candidates(p_submission_id uuid, p_media_type text, p_algorithm text, p_algorithm_version text, p_limit integer DEFAULT 500)
 RETURNS TABLE(submission_id uuid, fingerprint text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_media_type not in ('photo', 'video')
     or char_length(coalesce(p_algorithm, '')) not between 2 and 80
     or char_length(coalesce(p_algorithm_version, '')) not between 1 and 40
     or p_limit not between 1 and 500 then
    raise exception 'invalid_fingerprint_candidate_request';
  end if;

  return query
  select fingerprint_row.submission_id, fingerprint_row.fingerprint
  from public.wing_media_fingerprints fingerprint_row
  join public.wing_media_submissions submission
    on submission.id = fingerprint_row.submission_id
  where fingerprint_row.submission_id <> p_submission_id
    and fingerprint_row.media_type = p_media_type
    and fingerprint_row.algorithm = p_algorithm
    and fingerprint_row.algorithm_version = p_algorithm_version
    and submission.status not in ('withdrawn', 'rejected', 'failed')
  order by fingerprint_row.created_at desc, fingerprint_row.id desc
  limit p_limit;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_wing_shots_feature_flags()
 RETURNS TABLE(flag_key text, configured_enabled boolean, rollout_percent integer, enabled_for_user boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    f.flag_key,
    f.enabled as configured_enabled,
    f.rollout_percent,
    (
      f.enabled
      and (
        f.rollout_percent = 100
        or (
          auth.uid() is not null
          and mod(
            mod(
              hashtextextended(auth.uid()::text || ':' || f.flag_key, 0),
              100
            ) + 100,
            100
          ) < f.rollout_percent
        )
      )
    ) as enabled_for_user
  from public.engagement_feature_flags f
  where f.flag_key like 'wing_shot_%'
  order by f.flag_key
$function$
;
CREATE OR REPLACE FUNCTION public.give_new_user_starting_coins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.grant_badge(p_user uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_badge_id bigint;
begin
  select id into v_badge_id from public.badge_catalog where code = p_code;
  if v_badge_id is null then
    raise notice 'Badge % not found', p_code;
    return;
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (p_user, v_badge_id)
  on conflict do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_android_qa_coin_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.reason in ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins',
                    'onboarding_seed_bonus', 'new_user_starter_coins') then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'Coin bonuses are server-authoritative' using errcode = '42501';
    end if;
    if new.reason in ('onboarding_seed_bonus', 'new_user_starter_coins') then
      return null; -- retired paths must not add to the 100-coin welcome balance
    end if;
    if new.reason = 'Welcome Bonus — 100 BuffaCoins' and new.delta is distinct from 100 then
      raise exception 'Welcome bonus must be 100';
    end if;
    if new.reason = 'Early Bird Bonus — 250 BuffaCoins' then
      if new.delta is distinct from 250 or not exists (
        select 1 from public.android_qa_early_bird_eligibility e where e.user_id = new.user_id
      ) then raise exception 'Invalid Early Bird bonus'; end if;
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_buffacoin_rating_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.is_buffacoin and
     current_setting('buffago.atomic_buffacoin_write', true) is distinct from 'on' then
    raise exception 'buffacoin_rating_requires_atomic_transaction';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_legacy_wing_photo_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.job_kind='photo_process' and (tg_op='INSERT' or (new.status in ('pending','claimed','retry')
    and exists(select 1 from public.wing_photo_derivative_jobs j where j.submission_id=new.submission_id))) then
    raise exception 'photo_uses_derivative_queue';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_wing_photo_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
begin
  if new.media_type='photo' and new.status='approved' and old.status is distinct from 'approved' then
    if public.wing_photo_processing_blocker(new.id) is not null
      or not (exists(select 1 from public.wing_photo_derivative_jobs j where j.submission_id=new.id and j.status='succeeded')
        or exists(select 1 from public.wing_processing_jobs j where j.submission_id=new.id and j.job_kind='photo_process' and j.status='succeeded'))
      or new.processed_storage_path is distinct from 'processed/'||new.id::text||'/primary'
      or new.thumbnail_storage_path is distinct from 'thumbnails/'||new.id::text||'/preview'
      or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=new.processed_storage_path)
      or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=new.thumbnail_storage_path)
    then raise exception 'processed_photo_required_for_approval'; end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (user_id, username, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_public_wing_jury_photo(p_submission_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select private.is_public_wing_jury_photo(p_submission_id);
$function$
;
CREATE OR REPLACE FUNCTION public.mango_clear_ineligible_priority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.status <> 'approved' or new.featured_at is not null then
    new.is_publish_priority := false;
    new.priority_set_at := null;
    new.priority_set_by := null;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.on_crawl_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_user uuid;
  v_completed_before int;
begin
  if new.status is distinct from old.status
     and lower(new.status) = 'completed'
     and new.user_id is not null
  then
    v_user := new.user_id;

    perform public.award_xp(v_user, 30, 'crawl_completed');

    select count(*) into v_completed_before
      from public.crawls
     where user_id = v_user and lower(status) = 'completed' and crawl_id <> new.crawl_id;

    if v_completed_before = 0 then
      perform public.grant_badge(v_user, 'FIRST_CRAWL');
    end if;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.provision_referral_code_internal(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text;
begin
  select code into v_code from public.referral_codes where user_id=p_user_id;
  if found then return v_code; end if;
  for v_attempt in 1..20 loop
    begin
      v_code:=public.generate_referral_code();
      insert into public.referral_codes(user_id,code) values(p_user_id,v_code)
      on conflict(user_id) do update set updated_at=referral_codes.updated_at
      returning code into v_code;
      return v_code;
    exception when unique_violation then
      v_code:=null;
    end;
  end loop;
  raise exception 'referral_code_generation_exhausted';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_wing_ai_moderation(p_submission_id uuid, p_result jsonb, p_idempotency_key text, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_config public.wing_moderation_config%rowtype;
  v_existing public.wing_moderation_decisions%rowtype;
  v_decision_id uuid;
  v_wing numeric;
  v_spam numeric;
  v_duplicate numeric;
  v_quality numeric;
  v_recommendation text;
  v_required text[] := array[
    'contains_food','contains_chicken_wings','wing_confidence',
    'nudity_or_sexual_content','graphic_content','weapons','hate_symbols',
    'illegal_activity','intoxication_concern','minors_visible',
    'personal_information_visible','faces_visible','alcohol_dominant',
    'offensive_text','spam_probability','duplicate_probability','quality_score',
    'explanation','model','version','evaluated_at'
  ];
begin
  if p_result is null
     or jsonb_typeof(p_result) <> 'object'
     or not (p_result ?& v_required) then
    raise exception 'invalid_moderation_contract';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'moderation_identity_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-moderation:' || p_idempotency_key, 0)
  );
  select *
    into v_existing
    from public.wing_moderation_decisions
   where idempotency_key = p_idempotency_key;
  if found then
    return v_existing.id;
  end if;

  v_wing := (p_result->>'wing_confidence')::numeric;
  v_spam := (p_result->>'spam_probability')::numeric;
  v_duplicate := (p_result->>'duplicate_probability')::numeric;
  v_quality := (p_result->>'quality_score')::numeric;
  if v_wing not between 0 and 1
     or v_spam not between 0 and 1
     or v_duplicate not between 0 and 1
     or v_quality not between 0 and 100 then
    raise exception 'moderation_score_out_of_range';
  end if;
  if coalesce(p_result->>'model', '') = ''
     or coalesce(p_result->>'version', '') = '' then
    raise exception 'moderation_model_version_required';
  end if;

  select *
    into v_config
    from public.wing_moderation_config
   where singleton;

  v_recommendation := case
    when (p_result->>'nudity_or_sexual_content')::boolean
      or (p_result->>'graphic_content')::boolean
      or (p_result->>'hate_symbols')::boolean
      or (p_result->>'personal_information_visible')::boolean
      or v_wing <= v_config.clear_reject_wing_confidence then 'reject'
    when v_wing < v_config.minimum_wing_confidence
      or v_spam >= v_config.maximum_spam_probability
      or v_duplicate >= v_config.maximum_duplicate_probability
      or (p_result->>'minors_visible')::boolean then 'manual_review'
    else 'accept'
  end;

  insert into public.wing_moderation_decisions (
    submission_id,
    decision_source,
    recommendation,
    contains_food,
    contains_chicken_wings,
    wing_confidence,
    nudity_or_sexual_content,
    graphic_content,
    weapons,
    hate_symbols,
    illegal_activity,
    intoxication_concern,
    minors_visible,
    personal_information_visible,
    faces_visible,
    alcohol_dominant,
    offensive_text,
    spam_probability,
    duplicate_probability,
    quality_score,
    explanation,
    model_name,
    model_version,
    raw_result,
    idempotency_key,
    correlation_id,
    evaluated_at
  ) values (
    p_submission_id,
    'ai',
    v_recommendation,
    (p_result->>'contains_food')::boolean,
    (p_result->>'contains_chicken_wings')::boolean,
    v_wing,
    (p_result->>'nudity_or_sexual_content')::boolean,
    (p_result->>'graphic_content')::boolean,
    (p_result->>'weapons')::boolean,
    (p_result->>'hate_symbols')::boolean,
    (p_result->>'illegal_activity')::boolean,
    (p_result->>'intoxication_concern')::boolean,
    (p_result->>'minors_visible')::boolean,
    (p_result->>'personal_information_visible')::boolean,
    (p_result->>'faces_visible')::boolean,
    (p_result->>'alcohol_dominant')::boolean,
    (p_result->>'offensive_text')::boolean,
    v_spam,
    v_duplicate,
    v_quality,
    left(p_result->>'explanation', 2000),
    p_result->>'model',
    p_result->>'version',
    p_result,
    p_idempotency_key,
    p_correlation_id,
    (p_result->>'evaluated_at')::timestamptz
  )
  returning id into v_decision_id;

  update public.wing_media_submissions
     set moderation_status = case
           when status = 'approved'
             and moderation_status = 'overridden'
             and v_recommendation = 'manual_review'
             then 'overridden'
           when v_recommendation = 'accept' then 'likely_acceptable'
           when v_recommendation = 'reject' then 'clear_rejection'
           else 'manual_review'
         end,
         wing_verification_status = case
           when status = 'approved'
             and wing_verification_status = 'overridden'
             and v_recommendation = 'manual_review'
             then 'overridden'
           when v_wing >= v_config.minimum_wing_confidence
             then 'likely_wings'
           when v_wing <= v_config.clear_reject_wing_confidence
             then 'not_wings'
           else 'uncertain'
         end,
         wing_confidence = v_wing,
         quality_score = v_quality,
         updated_at = now()
   where id = p_submission_id;

  return v_decision_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_wing_fingerprint(p_submission_id uuid, p_media_type text, p_algorithm text, p_algorithm_version text, p_fingerprint text, p_nearest_submission_id uuid, p_similarity numeric, p_idempotency_key text, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid; v_group uuid; v_severity text;
begin
  if p_similarity is not null and p_similarity not between 0 and 1 then
    raise exception 'fingerprint_similarity_out_of_range';
  end if;
  select coalesce(f.duplicate_group, gen_random_uuid()) into v_group
  from public.wing_media_fingerprints f
  where f.submission_id = p_nearest_submission_id limit 1;
  v_group := coalesce(v_group, gen_random_uuid());
  insert into public.wing_media_fingerprints(
    submission_id,media_type,algorithm,algorithm_version,fingerprint,
    duplicate_group,nearest_submission_id,similarity
  ) values (
    p_submission_id,p_media_type,p_algorithm,p_algorithm_version,p_fingerprint,
    case when coalesce(p_similarity,0) >= .90 then v_group else null end,
    p_nearest_submission_id,p_similarity
  ) on conflict(submission_id,algorithm,algorithm_version) do update
    set fingerprint=excluded.fingerprint, duplicate_group=excluded.duplicate_group,
        nearest_submission_id=excluded.nearest_submission_id, similarity=excluded.similarity
  returning id into v_id;
  if coalesce(p_similarity,0) >= .90 then
    v_severity := case when p_similarity >= .98 then 'high' else 'medium' end;
    insert into public.wing_submission_abuse_signals(
      submission_id,signal_type,severity,related_submission_id,score,
      model_version,idempotency_key,correlation_id
    ) values (
      p_submission_id,
      case when p_media_type='photo' then 'perceptual_duplicate'
        else 'video_fingerprint_match' end,
      v_severity,p_nearest_submission_id,p_similarity,p_algorithm_version,
      p_idempotency_key,p_correlation_id
    ) on conflict(idempotency_key) do nothing;
    update public.wing_media_submissions set duplicate_group=v_group,
      moderation_status='manual_review',updated_at=now() where id=p_submission_id;
  end if;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.referral_profile_eligibility(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_user_id is not null
    and exists (
      select 1 from auth.users au
      where au.id = p_user_id
        and au.deleted_at is null
        and (au.banned_until is null or au.banned_until < now())
    )
    and exists (select 1 from public.users pu where pu.user_id = p_user_id);
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_referral_code_after_auth_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refresh_referral_code_profile_eligibility(new.id);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_referral_code_after_profile_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refresh_referral_code_profile_eligibility(old.user_id);
  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_referral_code_profile_eligibility(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.referral_codes c
  set is_active = true,
      dormant_due_to_missing_profile = false,
      updated_at = now()
  where c.user_id = p_user_id
    and c.dormant_due_to_missing_profile
    and public.referral_profile_eligibility(c.user_id);

  update public.referral_codes c
  set is_active = false,
      dormant_due_to_missing_profile = true,
      updated_at = now()
  where c.user_id = p_user_id
    and c.is_active
    and not public.referral_profile_eligibility(c.user_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.register_wing_exact_media(p_submission_id uuid, p_media_type text, p_sha256 text, p_size_bytes bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_existing uuid;
begin
  if p_submission_id is null or p_media_type not in ('photo', 'video')
     or p_sha256 !~ '^[a-f0-9]{64}$' or p_size_bytes <= 0 then
    raise exception 'invalid_exact_media_fingerprint';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-exact-media:' || p_media_type || ':' || p_sha256 || ':' || p_size_bytes::text, 0));
  select submission_id into v_existing
  from public.wing_media_exact_fingerprints
  where media_type = p_media_type and sha256 = p_sha256 and size_bytes = p_size_bytes
    and submission_id <> p_submission_id
  order by created_at, submission_id
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('duplicate', true);
  end if;
  insert into public.wing_media_exact_fingerprints(submission_id, media_type, sha256, size_bytes)
  values (p_submission_id, p_media_type, p_sha256, p_size_bytes)
  on conflict (submission_id) do update set sha256 = excluded.sha256, size_bytes = excluded.size_bytes;
  return jsonb_build_object('duplicate', false);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reject_new_wing_video_upload_intent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.media_type <> 'photo' then
    raise exception 'unsupported_media_type';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reserve_wing_submission_upload(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_intent public.wing_submission_upload_intents%rowtype;
  v_config public.wing_moderation_config%rowtype;
  v_state public.wing_user_moderation_state%rowtype;
  v_completed_count integer;
  v_oldest_completed timestamptz;
  v_retry_after integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_media_type is distinct from 'photo' or p_expected_mime_type is null
     or p_expected_mime_type not in ('image/jpeg','image/png') then
    raise exception 'unsupported_media_type';
  end if;
  if p_expected_size_bytes is null or p_expected_size_bytes not between 1 and 20971520
     or p_consent_version is null or char_length(p_consent_version) not between 1 and 40
     or p_attribution_preference is null or p_attribution_preference not in ('username','display_name','anonymous')
     or (p_user_caption is not null and char_length(p_user_caption) > 500)
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'invalid_upload_request';
  end if;
  if p_destination_id is null or p_submission_source is null
     or p_submission_source not in ('rating','onboarding','buffacoin','profile','home_cta') then
    raise exception 'invalid_submission_source';
  end if;
  if p_rating_id is not null then
    if not exists(select 1 from public.destination_ratings r where r.id = p_rating_id and r.user_id = v_user_id) then
      raise exception 'rating_not_owned' using errcode = '42501';
    end if;
    if not exists(select 1 from public.destination_ratings r where r.id = p_rating_id and r.destination_id = p_destination_id) then
      raise exception 'destination_mismatch' using errcode = '42501';
    end if;
    if public.wing_shot_rating_eligibility_reason(p_rating_id,v_user_id,p_destination_id) <> 'eligible' then
      raise exception 'rating_not_eligible' using errcode = '42501';
    end if;
  end if;
  if not public.wing_feature_enabled_for_user('wing_shot_prompt') or not public.wing_feature_enabled_for_user('wing_shot_photo_upload') then
    raise exception 'wing_shot_photo_upload_disabled' using errcode = '42501';
  end if;
  select * into v_state from public.wing_user_moderation_state where user_id = v_user_id;
  if found and v_state.status = 'suspended' and (v_state.expires_at is null or v_state.expires_at > now()) then
    raise exception 'wing_uploads_suspended' using errcode = '42501';
  end if;

  -- Idempotent retries resume the existing reservation before quota is read.
  if p_rating_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0));
    if exists (select 1 from public.wing_media_submissions where rating_id = p_rating_id) then
      raise exception 'wing_submission_already_finalized';
    end if;
    select * into v_intent from public.wing_submission_upload_intents
      where rating_id = p_rating_id and user_id = v_user_id
        and status in ('reserved', 'finalized')
      order by created_at desc limit 1 for update;
    if found then
      if v_intent.created_at + interval '30 minutes' <= now() then
        update public.wing_submission_upload_intents set status = 'expired', updated_at = now() where id = v_intent.id;
      else
      if v_intent.destination_id is distinct from p_destination_id
         or v_intent.submission_source is distinct from p_submission_source then
        raise exception 'destination_mismatch' using errcode = '42501';
      end if;
      if exists(select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = v_intent.expected_storage_path)
         and (v_intent.expected_mime_type is distinct from p_expected_mime_type
           or v_intent.expected_size_bytes is distinct from p_expected_size_bytes
           or v_intent.correlation_id is distinct from p_correlation_id) then
        raise exception 'upload_reservation_media_changed';
      end if;
      update public.wing_submission_upload_intents
         set media_type = p_media_type, expected_mime_type = p_expected_mime_type,
             expected_size_bytes = p_expected_size_bytes, consent_version = p_consent_version,
             consented_at = now(), attribution_preference = p_attribution_preference,
             user_caption = nullif(trim(p_user_caption), ''), expires_at = least(now() + interval '15 minutes', created_at + interval '30 minutes'),
             updated_at = now(), correlation_id = coalesce(p_correlation_id, correlation_id)
       where id = v_intent.id;
      return jsonb_build_object('submission_id', v_intent.submission_id,
        'bucket', 'wing-submissions', 'upload_path', v_intent.expected_storage_path,
        'expires_at', least(now() + interval '15 minutes', v_intent.created_at + interval '30 minutes'), 'resumed', true,
        'existing_record_found', true, 'existing_record_id', v_intent.submission_id,
        'existing_record_status', v_intent.status);
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-user-upload-quota:' || v_user_id::text, 0));
  select * into v_config from public.wing_moderation_config where singleton;
  select * into v_state from public.wing_user_moderation_state where user_id = v_user_id;
  if found and v_state.status = 'suspended'
     and (v_state.expires_at is null or v_state.expires_at > now()) then
    raise exception 'wing_uploads_suspended' using errcode = '42501';
  end if;

  select count(*), min(created_at) into v_completed_count, v_oldest_completed
    from public.wing_media_submissions
   where user_id = v_user_id
     and status not in ('failed', 'withdrawn')
     and created_at >= now() - make_interval(secs => coalesce(v_config.rolling_upload_window_seconds, 900));
  if v_completed_count >= greatest(1, floor(coalesce(v_config.rolling_upload_limit, 5)
      * coalesce(v_state.limit_multiplier, 1)))::integer then
    v_retry_after := greatest(1, ceil(extract(epoch from
      ((v_oldest_completed + make_interval(secs => coalesce(v_config.rolling_upload_window_seconds, 900))) - now())))::integer);
    return jsonb_build_object('error_code', 'WING_SHOT_RATE_LIMITED',
      'retry_after_seconds', v_retry_after);
  end if;

  return public.reserve_wing_submission_upload_legacy(
    p_rating_id, p_media_type, p_expected_mime_type, p_expected_size_bytes,
    p_consent_version, p_attribution_preference, p_user_caption, p_idempotency_key,
    p_correlation_id, p_destination_id, p_submission_source);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reserve_wing_submission_upload_legacy(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_active public.wing_submission_upload_intents%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_destination_exists boolean;
  v_path text;
  v_fingerprint text;
  v_result jsonb;
  v_max_size bigint;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_submission_source not in ('rating', 'onboarding', 'buffacoin', 'profile', 'home_cta') then
    raise exception 'invalid_submission_source';
  end if;
  if p_destination_id is null then
    raise exception 'restaurant_required';
  end if;
  select exists (select 1 from public.destinations where id = p_destination_id)
    into v_destination_exists;
  if not v_destination_exists then
    raise exception 'restaurant_not_found';
  end if;
  if p_submission_source = 'rating' and p_rating_id is null then
    raise exception 'rating_required';
  end if;

  if p_rating_id is not null then
    select * into v_rating
      from public.destination_ratings
     where id = p_rating_id;
    if not found then
      raise exception 'rating_not_found' using errcode = '42501';
    end if;
    if v_rating.user_id is distinct from v_user_id then
      raise exception 'rating_not_owned' using errcode = '42501';
    end if;
    if v_rating.destination_id is distinct from p_destination_id then
      raise exception 'destination_mismatch' using errcode = '42501';
    end if;
    v_reason := public.wing_shot_rating_eligibility_reason(
      p_rating_id, v_user_id, p_destination_id
    );
    if v_reason <> 'eligible' then
      raise exception '%', v_reason using errcode = '42501';
    end if;
  end if;

  if p_media_type not in ('photo', 'video') then
    raise exception 'unsupported_media_type';
  end if;
  if p_expected_mime_type not in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime'
  ) then
    raise exception 'unsupported_mime_type';
  end if;
  if (p_media_type = 'photo' and p_expected_mime_type not like 'image/%')
     or (p_media_type = 'video' and p_expected_mime_type not like 'video/%') then
    raise exception 'media_mime_mismatch';
  end if;
  v_max_size := case when p_media_type = 'photo' then 20971520 else 52428800 end;
  if p_expected_size_bytes is null or p_expected_size_bytes not between 1 and v_max_size then
    raise exception 'invalid_media_size';
  end if;
  if p_consent_version is null or char_length(p_consent_version) not between 1 and 40 then
    raise exception 'affirmative_consent_required';
  end if;
  if p_attribution_preference not in ('username', 'display_name', 'anonymous') then
    raise exception 'invalid_attribution_preference';
  end if;
  if p_user_caption is not null and char_length(p_user_caption) > 500 then
    raise exception 'caption_too_long';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if not public.wing_feature_enabled_for_user('wing_shot_prompt') then
    raise exception 'wing_shot_prompt_disabled' using errcode = '42501';
  end if;
  if p_media_type = 'photo' and not public.wing_feature_enabled_for_user('wing_shot_photo_upload') then
    raise exception 'wing_shot_photo_upload_disabled' using errcode = '42501';
  end if;
  if p_media_type = 'video' and not public.wing_feature_enabled_for_user('wing_shot_video_upload') then
    raise exception 'wing_shot_video_upload_disabled' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|', coalesce(p_rating_id::text, ''), p_media_type,
    p_expected_mime_type, p_expected_size_bytes::text, p_consent_version,
    p_attribution_preference, coalesce(p_user_caption, ''), p_destination_id::text,
    p_submission_source));
  select * into v_existing from public.wing_submission_mutation_receipts
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.result;
  end if;

  if p_rating_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0));
    if exists (select 1 from public.wing_media_submissions where rating_id = p_rating_id) then
      raise exception 'wing_submission_already_finalized';
    end if;
    select * into v_active from public.wing_submission_upload_intents
     where rating_id = p_rating_id and status in ('reserved', 'finalized') limit 1;
    if found then
      raise exception 'wing_submission_already_reserved';
    end if;
  end if;

  v_path := 'originals/' || v_user_id::text || '/' || v_submission_id::text || '/source';
  insert into public.wing_submission_upload_intents (
    submission_id, user_id, rating_id, destination_id, media_type,
    expected_mime_type, expected_size_bytes, expected_storage_path,
    consent_version, consented_at, attribution_preference, user_caption,
    submission_source, expires_at, idempotency_key, request_fingerprint,
    correlation_id
  ) values (
    v_submission_id, v_user_id, p_rating_id, p_destination_id, p_media_type,
    p_expected_mime_type, p_expected_size_bytes, v_path, p_consent_version,
    now(), p_attribution_preference, nullif(trim(p_user_caption), ''),
    p_submission_source, now() + interval '15 minutes', p_idempotency_key,
    v_fingerprint, p_correlation_id
  );
  v_result := jsonb_build_object(
    'submission_id', v_submission_id, 'bucket', 'wing-submissions',
    'upload_path', v_path, 'expires_at', now() + interval '15 minutes'
  );
  insert into public.wing_submission_mutation_receipts (
    user_id, submission_id, mutation_kind, idempotency_key,
    request_fingerprint, result, correlation_id
  ) values (
    v_user_id, v_submission_id, 'reserve_upload', p_idempotency_key,
    v_fingerprint, v_result, p_correlation_id
  );
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.restore_referral_code_after_profile_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refresh_referral_code_profile_eligibility(new.user_id);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_wing_submission(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_actor uuid:=auth.uid(); v_s public.wing_media_submissions%rowtype;
  v_action_id uuid; v_to text; v_sensitive boolean;
begin
  if v_actor is null or not (public.wing_has_app_role('wing_reviewer')
    or public.wing_has_app_role('wing_admin')) then
    raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  if p_action not in ('approve','reject','retry_processing','prioritize',
    'remove_priority','withdraw_from_queue','mark_abuse') then raise exception 'invalid_admin_action'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 180
     or p_correlation_id is null then raise exception 'admin_action_identity_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-admin:'||p_idempotency_key,0));
  select id into v_action_id from public.wing_admin_actions
  where idempotency_key='admin:'||p_idempotency_key;
  if found then return v_action_id; end if;
  v_sensitive:=p_action in ('reject','mark_abuse');
  if (v_sensitive or p_action='approve') and
    (nullif(trim(p_reason_category),'') is null or nullif(trim(p_notes),'') is null)
  then raise exception 'review_reason_and_notes_required'; end if;
  select * into v_s from public.wing_media_submissions where id=p_submission_id for update;
  if not found then raise exception 'wing_submission_not_found'; end if;
  if v_s.status<>'in_review' then raise exception 'submission_not_in_review'; end if;
  if p_action='approve' then
    if v_s.status<>'in_review' then raise exception 'submission_not_in_review'; end if;
    if (v_s.moderation_status='clear_rejection' or
        v_s.wing_verification_status in ('not_wings','uncertain') or
        v_s.duplicate_group is not null) and p_reason_category<>'documented_override'
    then raise exception 'sensitive_override_requires_documented_override'; end if;
    v_to:='approved';
    perform public.wing_transition_submission(p_submission_id,v_to,'in_review',
      'reviewer',v_actor,'human_review',p_idempotency_key,p_correlation_id,
      jsonb_build_object('reason_category',p_reason_category,'notes',p_notes));
  elsif p_action='reject' then
    perform public.wing_transition_submission(p_submission_id,'rejected','in_review',
      'reviewer',v_actor,'human_review',p_idempotency_key,p_correlation_id,
      jsonb_build_object('rejection_reason',p_reason_category,'notes',p_notes));
  elsif p_action='retry_processing' then
    perform public.wing_transition_submission(p_submission_id,'processing',v_s.status,
      'reviewer',v_actor,'review_retry',p_idempotency_key,p_correlation_id,'{}');
  elsif p_action='prioritize' then
    update public.wing_media_submissions set priority=least(priority+10,100),updated_at=now()
    where id=p_submission_id;
  elsif p_action='remove_priority' then
    update public.wing_media_submissions set priority=0,updated_at=now() where id=p_submission_id;
  elsif p_action='withdraw_from_queue' then
    perform public.wing_transition_submission(p_submission_id,'withdrawn',v_s.status,
      'reviewer',v_actor,'admin_withdrawal',p_idempotency_key,p_correlation_id,'{}');
  else
    insert into public.wing_submission_abuse_signals(
      submission_id,signal_type,severity,notes,idempotency_key,correlation_id
    ) values(p_submission_id,'reviewer_marked_abuse','high',p_notes,
      'abuse:'||p_idempotency_key,p_correlation_id);
  end if;
  insert into public.wing_admin_actions(
    submission_id,actor_id,action,reason_category,notes,before_state,after_state,
    idempotency_key,request_fingerprint,correlation_id
  ) values(p_submission_id,v_actor,p_action,p_reason_category,p_notes,
    jsonb_build_object('status',v_s.status,'priority',v_s.priority),
    jsonb_build_object('target_status',v_to),
    'admin:'||p_idempotency_key,md5(concat_ws('|',p_submission_id,p_action,p_reason_category,p_notes)),
    p_correlation_id) returning id into v_action_id;
  return v_action_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_wing_submission_v2(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_action_id uuid;
begin
  if v_actor is null or not (
    public.wing_has_app_role('wing_reviewer')
    or public.wing_has_app_role('wing_admin')
  ) then
    raise exception 'wing_reviewer_role_required' using errcode = '42501';
  end if;
  if not public.wing_moderation_queue_enabled_for_user() then
    raise exception 'wing_moderation_queue_disabled' using errcode = '42501';
  end if;
  if nullif(trim(p_notes), '') is null
     or char_length(trim(p_notes)) not between 8 and 1000 then
    raise exception 'review_notes_required';
  end if;
  if nullif(trim(p_reason_category), '') is null then
    raise exception 'review_reason_required';
  end if;
  if not (
    (p_action = 'approve' and p_reason_category in (
      'standard_acceptable', 'documented_override'
    ))
    or (p_action = 'reject' and p_reason_category in (
      'not_wings', 'unsafe_content', 'privacy_concern', 'duplicate',
      'spam_abuse', 'rights_concern', 'quality_unusable', 'other_policy'
    ))
    or (p_action = 'retry_processing' and p_reason_category = 'processing_retry')
    or (p_action = 'prioritize' and p_reason_category = 'editorial_priority')
    or (p_action = 'remove_priority' and p_reason_category = 'editorial_priority_removed')
    or (p_action = 'withdraw_from_queue' and p_reason_category = 'queue_removal')
    or (p_action = 'mark_abuse' and p_reason_category in (
      'spam_abuse', 'duplicate_abuse', 'policy_abuse'
    ))
  ) then
    raise exception 'invalid_review_reason_for_action';
  end if;

  v_action_id := public.review_wing_submission(
    p_submission_id,
    p_action,
    p_reason_category,
    trim(p_notes),
    p_idempotency_key,
    p_correlation_id
  );

  if p_action in ('approve', 'reject') then
    insert into public.wing_moderation_decisions (
      submission_id,
      decision_source,
      recommendation,
      explanation,
      reviewer_id,
      override_reason,
      raw_result,
      idempotency_key,
      correlation_id
    ) values (
      p_submission_id,
      'human',
      case when p_action = 'approve' then 'accept' else 'reject' end,
      left(trim(p_notes), 1000),
      v_actor,
      case when p_reason_category = 'documented_override' then trim(p_notes) else null end,
      '{}'::jsonb,
      'human-review:' || p_idempotency_key,
      p_correlation_id
    )
    on conflict (idempotency_key) do nothing;

    update public.wing_media_submissions
    set reviewer_notes = trim(p_notes),
        moderation_status = case
          when p_reason_category = 'documented_override' then 'overridden'
          else moderation_status
        end,
        wing_verification_status = case
          when p_reason_category = 'documented_override' then 'overridden'
          else wing_verification_status
        end,
        updated_at = now()
    where id = p_submission_id;
  end if;

  return v_action_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.settle_wing_processing_job(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_processed_path text DEFAULT NULL::text, p_thumbnail_path text DEFAULT NULL::text, p_perceptual_hash text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_error_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
declare
  v_job public.wing_processing_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_expected_processed text;
  v_expected_thumbnail text;
  v_job_status text;
  v_failure_from_status text;
  v_submission_status text;
begin
  select *
    into v_job
    from public.wing_processing_jobs
   where id = p_job_id
   for update;

  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_job_claim';
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = v_job.submission_id
   for update;

  if not found then
    raise exception 'wing_submission_not_found';
  end if;

  -- A reviewer or owner can reject/withdraw while a worker holds a lease.
  -- End that job cleanly; never resurrect terminal content from a late result.
  if v_submission.status in ('rejected', 'withdrawn', 'posted') then
    update public.wing_processing_jobs
       set status = 'cancelled',
           completed_at = now(),
           claimed_at = null,
           lease_expires_at = null,
           claim_token = null,
           claimed_by = null,
           updated_at = now()
     where id = v_job.id;
    return jsonb_build_object(
      'job_id', v_job.id,
      'submission_id', v_submission.id,
      'job_status', 'cancelled',
      'submission_status', v_submission.status
    );
  end if;

  v_expected_processed :=
    'processed/' || v_submission.id::text || '/primary';
  v_expected_thumbnail :=
    'thumbnails/' || v_submission.id::text || '/preview';

  if p_succeeded then
    if v_submission.status not in ('processing', 'in_review', 'approved') then
      raise exception 'submission_not_processable';
    end if;
    if p_processed_path is distinct from v_expected_processed
       or p_thumbnail_path is distinct from v_expected_thumbnail then
      raise exception 'processed_media_path_mismatch';
    end if;
    if not exists (
      select 1
        from storage.objects object
       where object.bucket_id = 'wing-submissions'
         and object.name = v_expected_processed
    ) or not exists (
      select 1
        from storage.objects object
       where object.bucket_id = 'wing-submissions'
         and object.name = v_expected_thumbnail
    ) then
      raise exception 'processed_media_not_found';
    end if;
    if p_perceptual_hash is not null
       and char_length(p_perceptual_hash) not between 16 and 256 then
      raise exception 'invalid_perceptual_hash';
    end if;

    update public.wing_media_submissions
       set processed_storage_path = v_expected_processed,
           thumbnail_storage_path = v_expected_thumbnail,
           perceptual_hash = p_perceptual_hash,
           original_retain_until = coalesce(
             original_retain_until,
             now() + interval '30 days'
           ),
           updated_at = now()
     where id = v_submission.id;

    if v_submission.status = 'processing' then
      perform public.wing_transition_submission(
        v_submission.id,
        'in_review',
        'processing',
        'worker',
        null,
        'media_processing_completed',
        'worker-complete:' || v_job.id::text,
        v_job.correlation_id,
        jsonb_build_object(
          'job_id', v_job.id,
          'generation', v_job.generation
        )
      );
      v_submission_status := 'in_review';
    else
      v_submission_status := v_submission.status;
    end if;
  end if;

  v_job_status := public.finish_wing_processing_job(
    p_job_id,
    p_claim_token,
    p_succeeded,
    p_retryable,
    case when p_succeeded then null else left(p_error_code, 100) end,
    case when p_succeeded then null else left(p_error_reason, 1000) end
  );

  if not p_succeeded
     and v_job_status = 'dead'
     and v_submission.status in (
       'uploaded', 'processing', 'in_review', 'approved'
     ) then
    if v_submission.status = 'uploaded' then
      perform public.wing_transition_submission(
        v_submission.id,
        'processing',
        'uploaded',
        'worker',
        null,
        'media_processing_failed_validation',
        'worker-failure-begin:' || v_job.id::text,
        v_job.correlation_id,
        jsonb_build_object(
          'job_id', v_job.id,
          'error_code', coalesce(
            left(p_error_code, 100),
            'PROCESSING_FAILED'
          )
        )
      );
      v_failure_from_status := 'processing';
    else
      v_failure_from_status := v_submission.status;
    end if;

    perform public.wing_transition_submission(
      v_submission.id,
      'failed',
      v_failure_from_status,
      'worker',
      null,
      'media_processing_dead_lettered',
      'worker-dead:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object(
        'job_id', v_job.id,
        'error_code', coalesce(
          left(p_error_code, 100),
          'PROCESSING_FAILED'
        ),
        'review_decision_reversed',
          v_failure_from_status = 'approved'
      )
    );
    v_submission_status := 'failed';
  elsif not p_succeeded then
    v_submission_status := v_submission.status;
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'submission_id', v_submission.id,
    'job_status', v_job_status,
    'submission_status', v_submission_status
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tf_user_badges_count_after_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.user_id is null then
    return null;
  end if;

  update public.lb_user_badges_counts
  set badges_count = greatest(badges_count - 1, 0)
  where user_id = old.user_id;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tf_user_badges_count_after_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is null then
    return null;
  end if;

  insert into public.lb_user_badges_counts (user_id, badges_count)
  values (new.user_id, 1)
  on conflict (user_id)
    do update set badges_count = public.lb_user_badges_counts.badges_count + 1;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tf_user_badges_count_after_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is distinct from old.user_id then
    if old.user_id is not null then
      update public.lb_user_badges_counts
      set badges_count = greatest(badges_count - 1, 0)
      where user_id = old.user_id;
    end if;
    if new.user_id is not null then
      insert into public.lb_user_badges_counts (user_id, badges_count)
      values (new.user_id, 1)
      on conflict (user_id)
        do update set badges_count = public.lb_user_badges_counts.badges_count + 1;
    end if;
  end if;
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_apply_owner_pseudonymization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.user_id is not null and new.user_id is null then
    new.owner_deleted_at := coalesce(new.owner_deleted_at, now());
  elsif old.user_id is null and new.user_id is not null then
    raise exception 'wing_owner_reidentification_forbidden';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_award_creator_reward_internal(p_submission_id uuid, p_reward_kind text, p_transition_id uuid, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_transition public.wing_submission_state_transitions%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_config public.wing_creator_reward_config%rowtype;
  v_existing uuid;
  v_amount integer;
  v_source text;
  v_event_kind text;
  v_ledger_id uuid;
  v_event_id uuid;
begin
  if p_reward_kind not in ('approval', 'featured') then
    raise exception 'invalid_creator_reward_kind';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-creator-reward:' || p_idempotency_key, 0)
  );

  select id
    into v_existing
    from public.wing_creator_reward_events
   where idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;
  if not found then
    raise exception 'wing_submission_not_found';
  end if;

  select *
    into v_transition
    from public.wing_submission_state_transitions
   where id = p_transition_id
     and submission_id = p_submission_id;
  if not found then
    raise exception 'creator_reward_transition_not_found';
  end if;

  select *
    into v_rating
    from public.destination_ratings
   where id = v_submission.rating_id
     and user_id = v_submission.user_id
     and destination_id = v_submission.destination_id
     and is_buffacoin = false;
  if not found then
    raise exception 'creator_reward_rating_ineligible';
  end if;

  if v_submission.duplicate_group is not null then
    raise exception 'creator_reward_duplicate_ineligible';
  end if;

  select *
    into v_config
    from public.wing_creator_reward_config
   where config_key = 'default'
     and enabled;
  if not found then
    raise exception 'creator_rewards_disabled';
  end if;

  if p_reward_kind = 'approval' then
    if v_transition.to_status <> 'approved'
       or v_submission.status <> 'approved'
       or v_submission.approved_at is null
       or v_submission.approved_by is null then
      raise exception 'creator_approval_reward_requires_approved_transition';
    end if;
    v_amount := v_config.approval_xp;
    v_source := 'wing_creator_approval';
    v_event_kind := 'approval_xp';
  else
    if v_transition.to_status <> 'posted'
       or v_submission.status <> 'posted'
       or v_submission.featured_at is null
       or not exists (
         select 1
         from public.social_content_jobs job
         where job.submission_id = v_submission.id
           and job.status = 'posted'
           and not job.dry_run
           and job.external_post_id is not null
           and job.posted_at is not null
       )
       or not exists (
         select 1
         from public.wing_creator_reward_events approval
         where approval.submission_id = v_submission.id
           and approval.event_kind = 'approval_xp'
           and not exists (
             select 1
             from public.wing_creator_reward_events reversal
             where reversal.reverses_reward_event_id = approval.id
           )
       ) then
      raise exception 'creator_feature_reward_requires_real_feature';
    end if;
    v_amount := v_config.featured_xp;
    v_source := 'wing_creator_featured';
    v_event_kind := 'featured_xp';
  end if;

  select award.ledger_id
    into v_ledger_id
    from public.award_xp(
      p_amount := v_amount,
      p_source := v_source,
      p_reason := case
        when p_reward_kind = 'approval' then 'Wing Shot approved'
        else 'Wing Shot featured'
      end,
      p_user_id := v_submission.user_id,
      p_idempotency_key := p_idempotency_key,
      p_destination_id := v_submission.destination_id,
      p_crawl_id := v_rating.crawl_id,
      p_metadata := jsonb_build_object(
        'submission_id', v_submission.id,
        'rating_id', v_submission.rating_id,
        'reward_kind', p_reward_kind,
        'economy_version', v_config.economy_version,
        'transition_id', v_transition.id
      )
    ) award
   limit 1;

  if v_ledger_id is null then
    raise exception 'creator_reward_ledger_missing';
  end if;

  insert into public.wing_creator_reward_events (
    submission_id, rating_id, user_id, event_kind, amount, xp_ledger_id,
    source_transition_id, idempotency_key, reason, metadata, correlation_id
  ) values (
    v_submission.id, v_submission.rating_id, v_submission.user_id,
    v_event_kind, v_amount, v_ledger_id, v_transition.id,
    p_idempotency_key,
    case
      when p_reward_kind = 'approval' then 'Approved Wing Shot Creator XP'
      else 'Featured Wing Shot Creator XP'
    end,
    jsonb_build_object(
      'economy_version', v_config.economy_version,
      'media_type', v_submission.media_type
    ),
    v_transition.correlation_id
  )
  returning id into v_event_id;

  perform public.wing_sync_creator_badges_internal(
    v_submission.user_id,
    v_submission.id,
    v_transition.correlation_id
  );

  return v_event_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_can_upload_reserved_original(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.wing_submission_upload_intents intent
      where intent.user_id = auth.uid()
        and intent.expected_storage_path = p_object_name
        and intent.status = 'reserved'
        and intent.expires_at > now()
    );
$function$
;
CREATE OR REPLACE FUNCTION public.wing_creator_audit_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.user_id is not null
     and new.user_id is null
     and new.owner_deleted_at is not null
     and new.owner_pseudonym_id is not null
     and (
       to_jsonb(new) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) = (
       to_jsonb(old) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) then
    return new;
  end if;
  raise exception 'wing_creator_audit_is_append_only';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_creator_reward_on_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  -- Buffacoin ratings are valid media, but excluded from creator XP.
  -- Match ownership/destination first; malformed ratings still fail closed.
  if new.to_status in ('approved', 'posted') and exists (
    select 1 from public.wing_media_submissions s
    join public.destination_ratings r on r.id = s.rating_id
      and r.user_id = s.user_id and r.destination_id = s.destination_id
    where s.id = new.submission_id and r.is_buffacoin = true
  ) then
    return new;
  end if;
  if new.to_status = 'approved' then
    perform public.wing_award_creator_reward_internal(
      new.submission_id,
      'approval',
      new.id,
      'wing-creator-approval:' || new.submission_id::text
    );
  elsif new.to_status = 'posted' then
    perform public.wing_award_creator_reward_internal(
      new.submission_id,
      'featured',
      new.id,
      'wing-creator-featured:' || new.submission_id::text
    );
  elsif new.to_status = 'withdrawn' then
    perform public.wing_reverse_creator_rewards_internal(
      new.submission_id,
      'Submission withdrawn before publication',
      'wing-auto-withdraw:' || new.id::text,
      new.id
    );
  elsif new.to_status = 'failed' and new.from_status = 'approved' then
    perform public.wing_reverse_creator_rewards_internal(
      new.submission_id,
      'Approved Wing Shot failed mandatory media preparation',
      'wing-auto-processing-failure:' || new.id::text,
      new.id
    );
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_feature_enabled_for_user(p_flag_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
        from public.engagement_feature_flags flag
       where flag.flag_key = p_flag_key
         and flag.enabled
         and (
           flag.rollout_percent = 100
           or mod(
             mod(
               hashtextextended(auth.uid()::text || ':' || flag.flag_key, 0),
               100
             ) + 100,
             100
           ) < flag.rollout_percent
         )
    );
$function$
;
CREATE OR REPLACE FUNCTION public.wing_guard_upload_intent_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.status in ('finalized', 'expired', 'cancelled')
     and new.status is distinct from old.status then
    raise exception 'wing_upload_intent_terminal_state_is_immutable';
  end if;
  if old.status = 'reserved'
     and new.status not in ('reserved', 'finalized', 'expired', 'cancelled') then
    raise exception 'invalid_wing_upload_intent_transition';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_has_app_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select auth.uid() is not null
    and p_role in ('wing_reviewer', 'wing_admin', 'wing_publisher')
    and exists (
      select 1
      from public.app_user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.role = p_role
        and role_assignment.active
        and role_assignment.revoked_at is null
    );
$function$
;
CREATE OR REPLACE FUNCTION public.wing_media_is_public_status(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select p_status in ('approved','generation_pending','ready_to_post','scheduled','posting','posted') $function$
;
CREATE OR REPLACE FUNCTION public.wing_moderation_queue_enabled_for_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce((
    select flags.enabled_for_user
    from public.get_wing_shots_feature_flags() flags
    where flags.flag_key = 'wing_shot_moderation_queue'
  ), false);
$function$
;
CREATE OR REPLACE FUNCTION public.wing_notification_receipt_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.user_id is not null
     and new.user_id is null
     and new.owner_deleted_at is not null
     and new.owner_pseudonym_id is not null
     and (
       to_jsonb(new) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) = (
       to_jsonb(old) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) then
    return new;
  end if;
  raise exception 'wing_notification_receipt_is_append_only';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_photo_processing_blocker(p_submission_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
  select case
    when s.media_type <> 'photo' or s.status not in ('in_review','approved') then 'not_processable'
    when s.withdrawn_at is not null then 'withdrawn'
    when s.user_id is null or s.owner_deleted_at is not null
      or not exists(select 1 from auth.users u where u.id=s.user_id) then 'owner_deleted'
    when s.status='approved' and (s.approved_at is null or s.approved_by is null) then 'approval_missing'
    when s.featured_at is not null
      or exists(select 1 from public.wing_generation_jobs g where g.submission_id=s.id)
      or exists(select 1 from public.social_content_jobs c where c.submission_id=s.id) then 'publication_started'
    when nullif(trim(s.consent_version),'') is null or s.consented_at is null or s.consented_at>now()
      or s.attribution_preference is null or s.attribution_preference not in ('username','display_name','anonymous') then 'consent_required'
    when s.original_deleted_at is not null then 'original_deleted'
    when coalesce(s.original_retain_until,s.created_at+make_interval(days=>coalesce(
      (select original_retention_days from public.wing_moderation_config where singleton limit 1),30)))<=now() then 'retention_expired'
    when s.original_storage_path is distinct from 'originals/'||s.user_id::text||'/'||s.id::text||'/source' then 'original_path_invalid'
    when not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.original_storage_path) then 'original_missing'
    when s.moderation_status in ('clear_rejection','failed') or s.wing_verification_status in ('not_wings','failed') then 'moderation_blocked'
    when exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id
      and j.job_kind='photo_process' and j.status in ('pending','claimed','retry')) then 'legacy_processing_active'
    else null end
  from public.wing_media_submissions s where s.id=p_submission_id;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_photo_receipt_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin raise exception 'photo_receipts_are_append_only'; end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_reject_cleanup_receipt_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  raise exception 'wing_cleanup_receipts_are_append_only';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_reverse_creator_rewards_internal(p_submission_id uuid, p_reason text, p_idempotency_key text, p_transition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_reward public.wing_creator_reward_events%rowtype;
  v_ledger_id uuid;
  v_reversed integer := 0;
  v_correlation_id uuid := gen_random_uuid();
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'creator_reward_reversal_reason_required';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-creator-reversal:' || p_idempotency_key, 0)
  );

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;
  if not found then
    raise exception 'wing_submission_not_found';
  end if;

  if p_transition_id is not null then
    select transition.correlation_id
      into v_correlation_id
      from public.wing_submission_state_transitions transition
     where transition.id = p_transition_id
       and transition.submission_id = p_submission_id;
    if not found then
      raise exception 'creator_reward_reversal_transition_not_found';
    end if;
  end if;

  for v_reward in
    select reward.*
    from public.wing_creator_reward_events reward
    where reward.submission_id = p_submission_id
      and reward.event_kind in ('approval_xp', 'featured_xp')
      and not exists (
        select 1
        from public.wing_creator_reward_events reversal
        where reversal.reverses_reward_event_id = reward.id
      )
    order by reward.created_at, reward.id
    for update
  loop
    select award.ledger_id
      into v_ledger_id
      from public.award_xp(
        p_amount := -abs(v_reward.amount),
        p_source := 'wing_creator_reversal',
        p_reason := left(trim(p_reason), 500),
        p_user_id := v_reward.user_id,
        p_idempotency_key := 'wing-creator-reversal:' || v_reward.id::text,
        p_metadata := jsonb_build_object(
          'submission_id', v_reward.submission_id,
          'reversed_reward_event_id', v_reward.id,
          'reversal_request_key', p_idempotency_key
        )
      ) award
     limit 1;

    insert into public.wing_creator_reward_events (
      submission_id, rating_id, user_id, event_kind, amount, xp_ledger_id,
      source_transition_id, reverses_reward_event_id, idempotency_key,
      reason, metadata, correlation_id
    ) values (
      v_reward.submission_id, v_reward.rating_id, v_reward.user_id,
      'reward_reversal', -abs(v_reward.amount), v_ledger_id,
      p_transition_id, v_reward.id,
      'wing-creator-reversal:' || v_reward.id::text,
      left(trim(p_reason), 500),
      jsonb_build_object('reversal_request_key', p_idempotency_key),
      v_correlation_id
    )
    on conflict (reverses_reward_event_id) do nothing;

    if found then
      v_reversed := v_reversed + 1;
    end if;
  end loop;

  perform public.wing_sync_creator_badges_internal(
    v_submission.user_id,
    v_submission.id,
    v_correlation_id
  );

  return v_reversed;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_shot_rating_eligibility_reason(p_rating_id uuid, p_user_id uuid, p_destination_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_rating public.destination_ratings%rowtype;
begin
  select *
    into v_rating
    from public.destination_ratings
   where id = p_rating_id;

  if not found then
    return 'rating_not_found';
  end if;
  if v_rating.user_id is distinct from p_user_id then
    return 'rating_not_owned';
  end if;
  if v_rating.destination_id is distinct from p_destination_id then
    return 'destination_mismatch';
  end if;
  if v_rating.crispiness is null or v_rating.crispiness not between 1 and 10
     or v_rating.sauce is null or v_rating.sauce not between 1 and 10
     or v_rating.meat is null or v_rating.meat not between 1 and 10
     or v_rating.overall is null or v_rating.overall not between 1 and 10 then
    return 'incomplete_rating';
  end if;

  -- Duplicate active/finalized submissions are enforced by the reservation
  -- RPC, which returns its more specific duplicate error. This function's
  -- reason vocabulary intentionally describes the rating, not the upload
  -- mutation state.
  return 'eligible';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_sync_creator_badges_internal(p_user_id uuid, p_trigger_submission_id uuid, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_approved_count integer;
  v_photo_count integer;
  v_video_count integer;
  v_featured_count integer;
  v_crawl_count integer;
  v_state_count integer;
  v_rule record;
  v_badge public.badge_catalog%rowtype;
  v_active_award_id uuid;
  v_cycle integer;
  v_awarded text[] := array[]::text[];
  v_revoked text[] := array[]::text[];
begin
  if p_user_id is null or p_correlation_id is null then
    raise exception 'creator_badge_sync_identity_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-creator-badges:' || p_user_id::text, 0)
  );

  with active_rewards as (
    select reward.*
    from public.wing_creator_reward_events reward
    where reward.user_id = p_user_id
      and reward.event_kind in ('approval_xp', 'featured_xp')
      and not exists (
        select 1
        from public.wing_creator_reward_events reversal
        where reversal.reverses_reward_event_id = reward.id
      )
  )
  select
    count(*) filter (where active.event_kind = 'approval_xp')::integer,
    count(*) filter (
      where active.event_kind = 'approval_xp' and submission.media_type = 'photo'
    )::integer,
    count(*) filter (
      where active.event_kind = 'approval_xp' and submission.media_type = 'video'
    )::integer,
    count(*) filter (where active.event_kind = 'featured_xp')::integer,
    count(distinct rating.crawl_id) filter (
      where active.event_kind = 'approval_xp'
    )::integer,
    count(distinct destination.state_id) filter (
      where active.event_kind = 'approval_xp' and destination.state_id is not null
    )::integer
  into
    v_approved_count, v_photo_count, v_video_count, v_featured_count,
    v_crawl_count, v_state_count
  from active_rewards active
  join public.wing_media_submissions submission
    on submission.id = active.submission_id
  join public.destination_ratings rating
    on rating.id = active.rating_id
  join public.destinations destination
    on destination.id = submission.destination_id;

  for v_rule in
    select *
    from (values
      ('wing_shot_first', v_approved_count >= 1),
      ('wing_photographer', v_photo_count >= 5),
      ('wing_videographer', v_video_count >= 3),
      ('jalapenos_pick', v_featured_count >= 1),
      ('wing_creator', v_approved_count >= 10),
      ('crawl_cameraperson', v_crawl_count >= 5),
      ('state_correspondent', v_state_count >= 3)
    ) rules(code, qualifies)
  loop
    select *
      into v_badge
      from public.badge_catalog
     where code = v_rule.code
       and category = 'creator'
       and is_active;

    if not found then
      raise exception 'creator_badge_catalog_missing:%', v_rule.code;
    end if;

    select badge_event.id
      into v_active_award_id
      from public.wing_creator_badge_events badge_event
     where badge_event.user_id = p_user_id
       and badge_event.badge_id = v_badge.id
       and badge_event.event_kind = 'awarded'
       and not exists (
         select 1
         from public.wing_creator_badge_events reversal
         where reversal.reverses_badge_event_id = badge_event.id
       )
     order by badge_event.created_at desc, badge_event.id desc
     limit 1;

    if v_rule.qualifies and v_active_award_id is null then
      select count(*)::integer + 1
        into v_cycle
        from public.wing_creator_badge_events
       where user_id = p_user_id
         and badge_id = v_badge.id
         and event_kind = 'awarded';

      insert into public.user_badges (user_id, badge_id)
      values (p_user_id, v_badge.id)
      on conflict do nothing;

      insert into public.wing_creator_badge_events (
        user_id, badge_id, badge_code, event_kind, trigger_submission_id,
        idempotency_key, reason, metadata, correlation_id
      ) values (
        p_user_id, v_badge.id, v_badge.code, 'awarded',
        p_trigger_submission_id,
        format('wing-badge:%s:%s:award:%s', p_user_id, v_badge.code, v_cycle),
        'Creator badge threshold reached',
        jsonb_build_object(
          'approved_count', v_approved_count,
          'photo_count', v_photo_count,
          'video_count', v_video_count,
          'featured_count', v_featured_count,
          'crawl_count', v_crawl_count,
          'state_count', v_state_count
        ),
        p_correlation_id
      );
      v_awarded := array_append(v_awarded, v_badge.code);
    elsif not v_rule.qualifies and v_active_award_id is not null then
      delete from public.user_badges
       where user_id = p_user_id
         and badge_id = v_badge.id;

      insert into public.wing_creator_badge_events (
        user_id, badge_id, badge_code, event_kind, trigger_submission_id,
        reverses_badge_event_id, idempotency_key, reason, metadata,
        correlation_id
      ) values (
        p_user_id, v_badge.id, v_badge.code, 'revoked',
        p_trigger_submission_id, v_active_award_id,
        'wing-badge-revoke:' || v_active_award_id::text,
        'Creator badge threshold no longer satisfied',
        jsonb_build_object(
          'approved_count', v_approved_count,
          'photo_count', v_photo_count,
          'video_count', v_video_count,
          'featured_count', v_featured_count,
          'crawl_count', v_crawl_count,
          'state_count', v_state_count
        ),
        p_correlation_id
      );
      v_revoked := array_append(v_revoked, v_badge.code);
    end if;
  end loop;

  return jsonb_build_object(
    'awarded', to_jsonb(v_awarded),
    'revoked', to_jsonb(v_revoked),
    'approved_count', v_approved_count,
    'featured_count', v_featured_count
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_transition_submission(p_submission_id uuid, p_to_status text, p_expected_from_status text, p_actor_type text, p_actor_id uuid, p_trigger_source text, p_idempotency_key text, p_correlation_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_existing public.wing_submission_state_transitions%rowtype;
  v_transition_id uuid;
  v_fingerprint text;
  v_allowed boolean := false;
begin
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if p_actor_type not in (
    'user', 'reviewer', 'worker', 'scheduler', 'publisher', 'system'
  ) then
    raise exception 'invalid_actor_type';
  end if;
  if p_trigger_source is null
     or char_length(p_trigger_source) not between 2 and 100 then
    raise exception 'invalid_trigger_source';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_metadata';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-transition:' || p_idempotency_key, 0)
  );
  v_fingerprint := md5(concat_ws(
    '|',
    p_submission_id::text,
    p_to_status,
    coalesce(p_expected_from_status, ''),
    p_actor_type,
    coalesce(p_actor_id::text, ''),
    p_trigger_source,
    p_metadata::text
  ));

  select *
    into v_existing
    from public.wing_submission_state_transitions
   where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.id;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'wing_submission_not_found';
  end if;
  if p_expected_from_status is null
     or v_submission.status <> p_expected_from_status then
    raise exception 'wing_submission_state_precondition_failed';
  end if;

  v_allowed := case v_submission.status
    when 'uploaded' then p_to_status in ('processing', 'in_review', 'withdrawn')
    when 'processing' then p_to_status in ('in_review', 'failed', 'withdrawn')
    when 'failed' then p_to_status in (
      'processing', 'generation_pending', 'ready_to_post', 'withdrawn'
    )
    when 'in_review' then p_to_status in (
      'approved', 'rejected', 'processing', 'failed', 'withdrawn'
    )
    when 'approved' then p_to_status in (
      'generation_pending', 'failed', 'withdrawn'
    )
    when 'generation_pending' then p_to_status in (
      'ready_to_post', 'failed', 'withdrawn'
    )
    when 'ready_to_post' then p_to_status in (
      'scheduled', 'posting', 'withdrawn'
    )
    when 'scheduled' then p_to_status in (
      'posting', 'ready_to_post', 'withdrawn'
    )
    when 'posting' then p_to_status in ('posted', 'failed')
    else false
  end;

  if not v_allowed then
    raise exception 'invalid_wing_submission_transition:%->%',
      v_submission.status, p_to_status;
  end if;
  if p_to_status = 'approved' and p_actor_id is null then
    raise exception 'approval_actor_required';
  end if;
  if p_to_status = 'rejected'
     and nullif(trim(p_metadata->>'rejection_reason'), '') is null then
    raise exception 'rejection_reason_required';
  end if;

  update public.wing_media_submissions
     set status = p_to_status,
         withdrawn_at = case
           when p_to_status = 'withdrawn' then now()
           else withdrawn_at
         end,
         rejected_at = case
           when p_to_status = 'rejected' then now()
           else rejected_at
         end,
         rejection_reason = case
           when p_to_status = 'rejected'
             then nullif(trim(p_metadata->>'rejection_reason'), '')
           else rejection_reason
         end,
         approved_at = case
           when p_to_status = 'approved' then now()
           else approved_at
         end,
         approved_by = case
           when p_to_status = 'approved' then p_actor_id
           else approved_by
         end,
         featured_at = case
           when p_to_status = 'posted' then now()
           else featured_at
         end,
         updated_at = now(),
         correlation_id = p_correlation_id
   where id = p_submission_id;

  insert into public.wing_submission_state_transitions (
    submission_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    trigger_source,
    idempotency_key,
    request_fingerprint,
    correlation_id,
    metadata
  ) values (
    p_submission_id,
    v_submission.status,
    p_to_status,
    p_actor_type,
    p_actor_id,
    p_trigger_source,
    p_idempotency_key,
    v_fingerprint,
    p_correlation_id,
    p_metadata
  )
  returning id into v_transition_id;

  return v_transition_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wingman_consume_rate_limit(p_user_id uuid, p_ip_address text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 ip text := coalesce(nullif(btrim(p_ip_address),''),'unknown'); ts timestamptz;
 hourly integer := case when p_user_id is null then 3 else 10 end;
 daily integer := case when p_user_id is null then 10 else 30 end;
 hour_count bigint; day_count bigint;
begin
 if length(ip)>200 then raise exception 'invalid_rate_limit_actor'; end if;
 -- Preserve existing anonymous semantics: it counts all calls from the IP,
 -- including signed-in calls. Acquire IP first, then user, in a fixed order.
 perform pg_advisory_xact_lock(hashtextextended('wingman-rate-ip:'||ip,0));
 if p_user_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('wingman-rate-user:'||p_user_id::text,0));
 end if;
 ts := clock_timestamp();
 select count(*) filter(where created_at >= ts-interval '1 hour'),count(*)
 into hour_count,day_count from public.api_rate_limits
 where feature='wingman' and created_at >= ts-interval '24 hours'
 and ((p_user_id is not null and user_id=p_user_id) or (p_user_id is null and ip_address=ip));
 if hour_count>=hourly or day_count>=daily then return false; end if;
 insert into public.api_rate_limits(user_id,ip_address,feature,created_at)
 values(p_user_id,ip,'wingman',ts);
 return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wingman_create_destination(p_destination jsonb, p_created_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 n text := btrim(p_destination->>'name'); a text := btrim(p_destination->>'address');
 c text := btrim(p_destination->>'city'); st integer := (p_destination->>'state_id')::integer;
 latitude numeric := nullif(p_destination->>'lat','')::numeric;
 longitude numeric := nullif(p_destination->>'lng','')::numeric;
 d public.destinations; matches integer;
begin
 if n is null or n='' or a is null or a='' or c is null or c='' or st is null
   or latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180
 then raise exception 'restaurant_location_required'; end if;
 -- Serialize with all destination writes, including old clients, while looking
 -- for an existing identity. Held only during this short database transaction.
 lock table public.destinations in share row exclusive mode;
 select count(*) into matches from public.destinations x
 where x.state_id=st and lower(btrim(x.name))=lower(n)
 and (lower(btrim(x.address))=lower(a) or lower(btrim(x.city))=lower(c));
 if matches>1 then raise exception 'restaurant_match_ambiguous'; end if;
 if matches=1 then
   select * into d from public.destinations x where x.state_id=st and lower(btrim(x.name))=lower(n)
   and (lower(btrim(x.address))=lower(a) or lower(btrim(x.city))=lower(c));
   -- Same name/city with a different address might be another branch. Do not
   -- silently merge it or create a likely duplicate; require operator resolution.
   if lower(btrim(coalesce(d.address,'')))<>lower(a) then raise exception 'restaurant_match_ambiguous'; end if;
 else
   insert into public.destinations(name,address,city,state_id,lat,lng,created_by)
   values(n,a,c,st,latitude,longitude,p_created_by) returning * into d;
 end if;
 return to_jsonb(d);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.xp_level_for(p_xp integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (
      select max(level)
      from public.level_thresholds
      where xp_required <= greatest(coalesce(p_xp, 0), 0)
    ),
    1
  );
$function$
;
CREATE OR REPLACE FUNCTION public.wing_jury_restaurant_rating_summary(p_destination_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'average_weight_score', avg(rating.weight_score),
    'rating_count', count(rating.weight_score)
  )
  from public.destination_ratings rating
  where rating.destination_id = p_destination_id;
$function$
;
CREATE OR REPLACE FUNCTION public.begin_wing_photo_derivative_job(p_job_id uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare j public.wing_photo_derivative_jobs%rowtype; s public.wing_media_submissions%rowtype; reason text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id;
  select * into s from public.wing_media_submissions where id=j.submission_id for update;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id for update;
  if j.id is null or j.status<>'claimed' or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=now() then raise exception 'invalid_or_expired_job_claim'; end if;
  reason:=public.wing_photo_processing_blocker(j.submission_id);
  if s.id is null or reason is not null then raise exception 'photo_processing_blocked:%',coalesce(reason,'submission_missing'); end if;
  return jsonb_build_object('submission_id',s.id,'media_type','photo','bucket','wing-submissions',
    'original_path',s.original_storage_path,'processed_path','processed/'||s.id::text||'/primary',
    'thumbnail_path','thumbnails/'||s.id::text||'/preview','correlation_id',j.correlation_id,
    'preserve_approval',s.status='approved');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_wing_photo_derivative_job(p_worker text, p_lease_seconds integer DEFAULT 300, p_submission_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare j public.wing_photo_derivative_jobs%rowtype; token uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if char_length(coalesce(p_worker,'')) not between 3 and 120 or p_lease_seconds not between 30 and 900 then raise exception 'invalid_worker_lease'; end if;
  -- Expired lease receipts survive crashes. SKIP LOCKED keeps concurrent workers independent.
  for j in select * from public.wing_photo_derivative_jobs where status='claimed' and lease_expires_at<=now()
    and (p_submission_id is null or submission_id=p_submission_id) for update skip locked loop
    insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,error_code,correlation_id)
      values(j.submission_id,j.id,j.attempt_count,'lease_expired','STALE_LEASE',j.correlation_id);
    update public.wing_photo_derivative_jobs set status=case when attempt_count>=max_attempts then 'dead' else 'retry' end,
      claim_token=null,claimed_by=null,lease_expires_at=null,available_at=now(),last_error_code='STALE_LEASE',updated_at=now() where id=j.id;
  end loop;
  select * into j from public.wing_photo_derivative_jobs where status in ('pending','retry') and available_at<=now()
    and (p_submission_id is null or submission_id=p_submission_id)
    and attempt_count<max_attempts order by available_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.wing_photo_derivative_jobs set status='claimed',attempt_count=attempt_count+1,
    claim_token=token,claimed_by=p_worker,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where id=j.id;
  insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,correlation_id)
    values(j.submission_id,j.id,j.attempt_count+1,'claimed',j.correlation_id);
  return jsonb_build_object('job_id',j.id,'submission_id',j.submission_id,'job_kind','photo_process','claim_token',token);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.settle_wing_photo_derivative_job(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_processed_path text DEFAULT NULL::text, p_thumbnail_path text DEFAULT NULL::text, p_perceptual_hash text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_error_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
declare j public.wing_photo_derivative_jobs%rowtype; s public.wing_media_submissions%rowtype;
  reason text; state text; processed text; thumbnail text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_succeeded is null or p_retryable is null then raise exception 'invalid_settlement'; end if;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id;
  select * into s from public.wing_media_submissions where id=j.submission_id for update;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id for update;
  if j.id is null then raise exception 'job_missing'; end if;
  -- Network retry of a settled result is idempotent, but only for its exact lease.
  if j.status in ('succeeded','dead','retry','cancelled') and j.claim_token=p_claim_token then
    return jsonb_build_object('job_status',j.status,'submission_status',s.status); end if;
  if j.status<>'claimed' or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=now() then raise exception 'invalid_or_expired_job_claim'; end if;
  reason:=coalesce(public.wing_photo_processing_blocker(j.submission_id),case when s.id is null then 'submission_missing' end);
  processed:='processed/'||j.submission_id::text||'/primary'; thumbnail:='thumbnails/'||j.submission_id::text||'/preview';
  if reason is not null then state:='cancelled';
  elsif p_succeeded then
    if p_processed_path is distinct from processed or p_thumbnail_path is distinct from thumbnail then raise exception 'processed_media_path_mismatch'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=processed and
        lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType',''))='image/jpeg' and (o.metadata->>'size')::bigint>0)
      or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=thumbnail and
        lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType',''))='image/jpeg' and (o.metadata->>'size')::bigint>0)
    then raise exception 'processed_media_not_found'; end if;
    if p_perceptual_hash is not null and char_length(p_perceptual_hash) not between 16 and 256 then raise exception 'invalid_perceptual_hash'; end if;
    update public.wing_media_submissions set processed_storage_path=processed,thumbnail_storage_path=thumbnail,
      perceptual_hash=p_perceptual_hash,updated_at=now() where id=s.id;
    state:='succeeded';
  else state:=case when p_retryable and j.attempt_count<j.max_attempts then 'retry' else 'dead' end; end if;
  update public.wing_photo_derivative_jobs set status=state,lease_expires_at=null,claimed_by=null,
    available_at=case when state='retry' then now()+least(interval '30 minutes',interval '30 seconds'*(2^greatest(j.attempt_count-1,0))) else available_at end,
    last_error_code=case when state='succeeded' then null else coalesce(reason,left(p_error_code,100),'PROCESSING_FAILED') end,updated_at=now() where id=j.id;
  insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,error_code,correlation_id)
    values(j.submission_id,j.id,j.attempt_count,state,case when state='succeeded' then null else coalesce(reason,left(p_error_code,100),'PROCESSING_FAILED') end,j.correlation_id);
  return jsonb_build_object('job_id',j.id,'submission_id',s.id,'job_status',state,'submission_status',s.status);
end;
$function$
;
alter table "public"."android_qa_early_bird_eligibility" alter column "cutoff" set default '2026-10-11 14:14:10+00'::timestamp with time zone;
alter table "public"."android_qa_early_bird_eligibility" add constraint "android_qa_early_bird_eligibility_pkey" PRIMARY KEY (user_id);
alter table "public"."android_qa_early_bird_eligibility" add constraint "before_cutoff" CHECK ((registered_at < cutoff));
alter table "public"."android_qa_early_bird_eligibility" add constraint "fixed_cutoff" CHECK ((cutoff = '2026-10-11 14:14:10+00'::timestamp with time zone));
alter table "public"."api_rate_limits" alter column "id" set default gen_random_uuid();
alter table "public"."api_rate_limits" alter column "created_at" set default now();
alter table "public"."api_rate_limits" add constraint "api_rate_limits_pkey" PRIMARY KEY (id);
alter table "public"."app_user_roles" alter column "active" set default true;
alter table "public"."app_user_roles" alter column "assigned_at" set default now();
alter table "public"."app_user_roles" alter column "correlation_id" set default gen_random_uuid();
alter table "public"."app_user_roles" add constraint "app_user_roles_pkey" PRIMARY KEY (user_id, role);
alter table "public"."app_user_roles" add constraint "app_user_roles_reason_check" CHECK (((reason IS NULL) OR ((char_length(reason) >= 3) AND (char_length(reason) <= 500))));
alter table "public"."app_user_roles" add constraint "app_user_roles_revocation_shape" CHECK (((active AND (revoked_at IS NULL) AND (revoked_by IS NULL)) OR ((NOT active) AND (revoked_at IS NOT NULL))));
alter table "public"."app_user_roles" add constraint "app_user_roles_role_check" CHECK ((role = ANY (ARRAY['wing_reviewer'::text, 'wing_admin'::text, 'wing_publisher'::text])));
alter table "public"."badge_catalog" alter column "id" set default nextval('badge_catalog_id_seq'::regclass);
alter table "public"."badge_catalog" alter column "xp_reward" set default 0;
alter table "public"."badge_catalog" alter column "tier" set default 1;
alter table "public"."badge_catalog" alter column "is_active" set default true;
alter table "public"."badge_catalog" add constraint "badge_catalog_code_key" UNIQUE (code);
alter table "public"."badge_catalog" add constraint "badge_catalog_pkey" PRIMARY KEY (id);
alter table "public"."buffacoin_ledger" alter column "id" set default gen_random_uuid();
alter table "public"."buffacoin_ledger" alter column "created_at" set default now();
alter table "public"."buffacoin_ledger" add constraint "buffacoin_ledger_delta_check" CHECK ((delta <> 0));
alter table "public"."buffacoin_ledger" add constraint "buffacoin_ledger_pkey" PRIMARY KEY (id);
alter table "public"."buffacoin_wallets" alter column "balance" set default 0;
alter table "public"."buffacoin_wallets" alter column "updated_at" set default now();
alter table "public"."buffacoin_wallets" alter column "created_at" set default now();
alter table "public"."buffacoin_wallets" add constraint "buffacoin_wallets_balance_check" CHECK ((balance >= 0));
alter table "public"."buffacoin_wallets" add constraint "buffacoin_wallets_pkey" PRIMARY KEY (user_id);
alter table "public"."crawls" alter column "crawl_id" set default gen_random_uuid();
alter table "public"."crawls" alter column "status" set default 'created'::text;
alter table "public"."crawls" alter column "crawl_type" set default 'route'::text;
alter table "public"."crawls" alter column "is_solo" set default false;
alter table "public"."crawls" add constraint "crawls_pkey" PRIMARY KEY (crawl_id);
alter table "public"."crawls" add constraint "crawls_route_id_required_for_route" CHECK ((((is_solo = true) AND (route_id IS NULL)) OR ((is_solo = false) AND (route_id IS NOT NULL))));
alter table "public"."destination_ratings" alter column "id" set default gen_random_uuid();
alter table "public"."destination_ratings" add column "weight_score" numeric generated always as (((((COALESCE((crispiness)::integer, 0) * 2) + (COALESCE((sauce)::integer, 0) * 2)) + (COALESCE((meat)::integer, 0) * 2)) + (COALESCE((overall)::integer, 0) * 4))) stored;
alter table "public"."destination_ratings" alter column "created_at" set default now();
alter table "public"."destination_ratings" alter column "wings_eaten" set default 0;
alter table "public"."destination_ratings" alter column "is_buffacoin" set default false;
alter table "public"."destination_ratings" add constraint "destination_ratings_crispiness_check" CHECK (((crispiness >= 1) AND (crispiness <= 10)));
alter table "public"."destination_ratings" add constraint "destination_ratings_dest_crawl_user_uniq" UNIQUE (destination_id, crawl_id, user_id);
alter table "public"."destination_ratings" add constraint "destination_ratings_flavor_vibe_check" CHECK (((flavor_vibe IS NULL) OR (((array_length(flavor_vibe, 1) >= 1) AND (array_length(flavor_vibe, 1) <= 2)) AND (flavor_vibe <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))));
alter table "public"."destination_ratings" add constraint "destination_ratings_meat_check" CHECK (((meat >= 1) AND (meat <= 10)));
alter table "public"."destination_ratings" add constraint "destination_ratings_overall_check" CHECK (((overall >= 1) AND (overall <= 10)));
alter table "public"."destination_ratings" add constraint "destination_ratings_pkey" PRIMARY KEY (id);
alter table "public"."destination_ratings" add constraint "destination_ratings_sauce_check" CHECK (((sauce >= 1) AND (sauce <= 10)));
alter table "public"."destination_ratings" add constraint "destination_ratings_sauce_style_check" CHECK ((sauce_style = ANY (ARRAY[1, 2, 3])));
alter table "public"."destination_ratings" add constraint "destination_ratings_spice_level_check" CHECK (((spice_level >= 1) AND (spice_level <= 10)));
alter table "public"."destination_ratings" add constraint "destination_ratings_wings_eaten_check" CHECK ((wings_eaten >= 0));
alter table "public"."destination_tags" alter column "created_at" set default now();
alter table "public"."destination_tags" add constraint "destination_tags_pkey" PRIMARY KEY (id);
alter table "public"."destination_tags" add constraint "destination_tags_tag_chk" CHECK (((length(TRIM(BOTH FROM tag)) >= 3) AND (length(TRIM(BOTH FROM tag)) <= 64)));
alter table "public"."destinations" alter column "id" set default gen_random_uuid();
alter table "public"."destinations" alter column "created_at" set default now();
alter table "public"."destinations" add constraint "destinations_pkey" PRIMARY KEY (id);
alter table "public"."engagement_feature_flags" alter column "enabled" set default false;
alter table "public"."engagement_feature_flags" alter column "rollout_percent" set default 0;
alter table "public"."engagement_feature_flags" alter column "updated_at" set default now();
alter table "public"."engagement_feature_flags" add constraint "engagement_feature_flags_flag_key_check" CHECK ((flag_key ~ '^[a-z0-9_]+$'::text));
alter table "public"."engagement_feature_flags" add constraint "engagement_feature_flags_pkey" PRIMARY KEY (flag_key);
alter table "public"."engagement_feature_flags" add constraint "engagement_feature_flags_rollout_percent_check" CHECK (((rollout_percent >= 0) AND (rollout_percent <= 100)));
alter table "public"."friendships" alter column "id" set default gen_random_uuid();
alter table "public"."friendships" alter column "status" set default 'pending'::text;
alter table "public"."friendships" alter column "created_at" set default now();
alter table "public"."friendships" alter column "updated_at" set default now();
alter table "public"."friendships" add constraint "friendships_no_self" CHECK ((requester_id <> addressee_id));
alter table "public"."friendships" add constraint "friendships_pkey" PRIMARY KEY (id);
alter table "public"."friendships" add constraint "friendships_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])));
alter table "public"."lb_user_badges_counts" alter column "badges_count" set default 0;
alter table "public"."lb_user_badges_counts" add constraint "lb_user_badges_counts_pkey" PRIMARY KEY (user_id);
alter table "public"."level_thresholds" add constraint "level_thresholds_pkey" PRIMARY KEY (level);
alter table "public"."notification_outbox" alter column "id" set default gen_random_uuid();
alter table "public"."notification_outbox" alter column "eligible_at" set default now();
alter table "public"."notification_outbox" alter column "status" set default 'queued'::text;
alter table "public"."notification_outbox" alter column "retry_count" set default 0;
alter table "public"."notification_outbox" alter column "next_attempt_at" set default now();
alter table "public"."notification_outbox" alter column "fallback_route" set default '/(tabs)/home'::text;
alter table "public"."notification_outbox" alter column "copy_data" set default '{}'::jsonb;
alter table "public"."notification_outbox" alter column "correlation_id" set default gen_random_uuid();
alter table "public"."notification_outbox" alter column "created_at" set default now();
alter table "public"."notification_outbox" alter column "updated_at" set default now();
alter table "public"."notification_outbox" add constraint "notification_outbox_event_type_check" CHECK ((event_type = ANY (ARRAY['streak_at_risk'::text, 'streak_comeback'::text, 'friend_rating'::text, 'crawl_proximity'::text, 'wing_shot_approved'::text, 'wing_shot_rejected'::text, 'wing_shot_featured'::text, 'creator_badge_earned'::text])));
alter table "public"."notification_outbox" add constraint "notification_outbox_pkey" PRIMARY KEY (id);
alter table "public"."notification_outbox" add constraint "notification_outbox_retry_count_check" CHECK (((retry_count >= 0) AND (retry_count <= 12)));
alter table "public"."notification_outbox" add constraint "notification_outbox_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'sent'::text, 'suppressed'::text, 'retry'::text, 'failed'::text, 'cancelled'::text])));
alter table "public"."notification_outbox" add constraint "notification_outbox_user_id_event_type_deduplication_key_key" UNIQUE (user_id, event_type, deduplication_key);
alter table "public"."notification_preferences" alter column "daily_streak_reminders" set default false;
alter table "public"."notification_preferences" alter column "streak_at_risk" set default false;
alter table "public"."notification_preferences" alter column "comeback" set default false;
alter table "public"."notification_preferences" alter column "friend_activity" set default false;
alter table "public"."notification_preferences" alter column "crawl_proximity" set default false;
alter table "public"."notification_preferences" alter column "product_announcements" set default false;
alter table "public"."notification_preferences" alter column "quiet_hours_enabled" set default true;
alter table "public"."notification_preferences" alter column "quiet_start" set default '22:00:00'::time without time zone;
alter table "public"."notification_preferences" alter column "quiet_end" set default '08:00:00'::time without time zone;
alter table "public"."notification_preferences" alter column "reminder_local_time" set default '18:30:00'::time without time zone;
alter table "public"."notification_preferences" alter column "timezone" set default 'UTC'::text;
alter table "public"."notification_preferences" alter column "updated_at" set default now();
alter table "public"."notification_preferences" alter column "legendary_start" set default false;
alter table "public"."notification_preferences" alter column "legendary_expiry" set default false;
alter table "public"."notification_preferences" alter column "legendary_completion" set default false;
alter table "public"."notification_preferences" alter column "legendary_reward_ready" set default false;
alter table "public"."notification_preferences" alter column "creator_updates" set default true;
alter table "public"."notification_preferences" add constraint "notification_preferences_pkey" PRIMARY KEY (user_id);
alter table "public"."referral_abuse_signals" alter column "id" set default gen_random_uuid();
alter table "public"."referral_abuse_signals" alter column "severity" set default 'review'::text;
alter table "public"."referral_abuse_signals" alter column "details" set default '{}'::jsonb;
alter table "public"."referral_abuse_signals" alter column "created_at" set default now();
alter table "public"."referral_abuse_signals" add constraint "referral_abuse_signals_deduplication_key_key" UNIQUE (deduplication_key);
alter table "public"."referral_abuse_signals" add constraint "referral_abuse_signals_pkey" PRIMARY KEY (id);
alter table "public"."referral_abuse_signals" add constraint "referral_abuse_signals_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'review'::text, 'high'::text])));
alter table "public"."referral_abuse_signals" add constraint "referral_abuse_signals_signal_type_check" CHECK ((signal_type = ANY (ARRAY['self_referral'::text, 'installation_reuse'::text, 'rapid_qualification'::text, 'inviter_velocity'::text, 'invitee_deleted'::text, 'rating_reversed'::text])));
alter table "public"."referral_attributions" alter column "id" set default gen_random_uuid();
alter table "public"."referral_attributions" alter column "source" set default 'direct'::text;
alter table "public"."referral_attributions" alter column "status" set default 'clicked'::text;
alter table "public"."referral_attributions" alter column "review_status" set default 'clear'::text;
alter table "public"."referral_attributions" alter column "correlation_id" set default gen_random_uuid();
alter table "public"."referral_attributions" alter column "metadata" set default '{}'::jsonb;
alter table "public"."referral_attributions" alter column "internal_review_metadata" set default '{}'::jsonb;
alter table "public"."referral_attributions" alter column "created_at" set default now();
alter table "public"."referral_attributions" alter column "updated_at" set default now();
alter table "public"."referral_attributions" add constraint "referral_attributions_check" CHECK (((invitee_user_id IS NULL) OR (invitee_user_id <> inviter_user_id)));
alter table "public"."referral_attributions" add constraint "referral_attributions_pkey" PRIMARY KEY (id);
alter table "public"."referral_attributions" add constraint "referral_attributions_review_status_check" CHECK ((review_status = ANY (ARRAY['clear'::text, 'flagged'::text, 'under_review'::text, 'approved'::text, 'rejected'::text])));
alter table "public"."referral_attributions" add constraint "referral_attributions_source_check" CHECK (((char_length(source) >= 1) AND (char_length(source) <= 64)));
alter table "public"."referral_attributions" add constraint "referral_attributions_status_check" CHECK ((status = ANY (ARRAY['clicked'::text, 'claimed'::text, 'signed_up'::text, 'pending_qualification'::text, 'qualified'::text, 'rewarded'::text, 'rejected'::text, 'expired'::text, 'reversed'::text])));
alter table "public"."referral_codes" alter column "id" set default gen_random_uuid();
alter table "public"."referral_codes" alter column "is_active" set default true;
alter table "public"."referral_codes" alter column "created_at" set default now();
alter table "public"."referral_codes" alter column "updated_at" set default now();
alter table "public"."referral_codes" alter column "dormant_due_to_missing_profile" set default false;
alter table "public"."referral_codes" add constraint "referral_codes_code_check" CHECK ((code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'::text));
alter table "public"."referral_codes" add constraint "referral_codes_pkey" PRIMARY KEY (id);
alter table "public"."referral_codes" add constraint "referral_codes_user_id_key" UNIQUE (user_id);
alter table "public"."route_travel_tag" add constraint "route_travel_tag_pkey" PRIMARY KEY (id);
alter table "public"."routes" alter column "id" set default gen_random_uuid();
alter table "public"."routes" alter column "is_public" set default true;
alter table "public"."routes" alter column "created_at" set default now();
alter table "public"."routes" alter column "is_token_route" set default false;
alter table "public"."routes" add constraint "routes_pkey" PRIMARY KEY (id);
alter table "public"."routes" add constraint "routes_title_city_key" UNIQUE (title, city);
alter table "public"."social_content_jobs" alter column "id" set default gen_random_uuid();
alter table "public"."social_content_jobs" alter column "generated_metadata" set default '{}'::jsonb;
alter table "public"."social_content_jobs" alter column "status" set default 'ready'::text;
alter table "public"."social_content_jobs" alter column "dry_run" set default true;
alter table "public"."social_content_jobs" alter column "attempt_count" set default 0;
alter table "public"."social_content_jobs" alter column "max_attempts" set default 5;
alter table "public"."social_content_jobs" alter column "created_at" set default now();
alter table "public"."social_content_jobs" alter column "updated_at" set default now();
alter table "public"."social_content_jobs" add constraint "social_content_jobs_approval_shape" CHECK ((((human_approved_at IS NULL) AND (human_approved_by IS NULL)) OR ((human_approved_at IS NOT NULL) AND (human_approved_by IS NOT NULL))));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_attempt_count_check" CHECK (((attempt_count >= 0) AND (attempt_count <= 12)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_claim_shape" CHECK ((((status = ANY (ARRAY['claimed'::text, 'posting'::text])) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (claim_token IS NOT NULL) AND (claimed_by IS NOT NULL)) OR (status <> ALL (ARRAY['claimed'::text, 'posting'::text]))));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_generated_alt_text_check" CHECK (((generated_alt_text IS NULL) OR (char_length(generated_alt_text) <= 1000)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_generated_caption_check" CHECK (((char_length(generated_caption) >= 1) AND (char_length(generated_caption) <= 2200)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_generated_media_path_check" CHECK ((generated_media_path ~ '^publication/[0-9a-f-]{36}/(instagram|facebook)/[0-9a-f-]{36}$'::text));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_generated_metadata_check" CHECK ((jsonb_typeof(generated_metadata) = 'object'::text));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."social_content_jobs" add constraint "social_content_jobs_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 12)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_path_identity" CHECK (((split_part(generated_media_path, '/'::text, 2) = (submission_id)::text) AND (split_part(generated_media_path, '/'::text, 3) = platform) AND (split_part(generated_media_path, '/'::text, 4) = (id)::text)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_pkey" PRIMARY KEY (id);
alter table "public"."social_content_jobs" add constraint "social_content_jobs_platform_check" CHECK ((platform = ANY (ARRAY['instagram'::text, 'facebook'::text])));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_post_type_check" CHECK ((post_type = ANY (ARRAY['photo'::text, 'reel'::text, 'video'::text])));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_posted_shape" CHECK (((status <> 'posted'::text) OR ((NOT dry_run) AND (external_post_id IS NOT NULL) AND (posted_at IS NOT NULL))));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_real_post_requires_approval" CHECK ((dry_run OR (human_approved_at IS NOT NULL)));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_status_check" CHECK ((status = ANY (ARRAY['ready'::text, 'scheduled'::text, 'claimed'::text, 'posting'::text, 'posted'::text, 'retry'::text, 'failed'::text, 'cancelled'::text, 'dry_run_succeeded'::text])));
alter table "public"."social_content_jobs" add constraint "social_content_jobs_submission_id_platform_key" UNIQUE (submission_id, platform);
alter table "public"."states" alter column "state_id" set default nextval('states_state_id_seq'::regclass);
alter table "public"."states" add constraint "states_pkey" PRIMARY KEY (state_id);
alter table "public"."states" add constraint "states_state_code_key" UNIQUE (state_code);
alter table "public"."user_badges" alter column "earned_at" set default now();
alter table "public"."user_badges" add constraint "user_badges_pkey" PRIMARY KEY (user_id, badge_id);
alter table "public"."user_badges" add constraint "user_badges_user_badge_unique" UNIQUE (user_id, badge_id);
alter table "public"."user_blocks" alter column "created_at" set default now();
alter table "public"."user_blocks" add constraint "user_blocks_no_self" CHECK ((blocker_id <> blocked_id));
alter table "public"."user_blocks" add constraint "user_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);
alter table "public"."user_destination_favorites" alter column "created_at" set default now();
alter table "public"."user_destination_favorites" add constraint "user_destination_favorites_pkey" PRIMARY KEY (user_id, destination_id);
alter table "public"."user_events" alter column "id" set default gen_random_uuid();
alter table "public"."user_events" alter column "occurred_at" set default now();
alter table "public"."user_events" alter column "received_at" set default now();
alter table "public"."user_events" alter column "metadata" set default '{}'::jsonb;
alter table "public"."user_events" add constraint "user_events_event_name_check" CHECK ((event_name ~ '^[a-z0-9_]+$'::text));
alter table "public"."user_events" add constraint "user_events_identity_check" CHECK (((user_id IS NOT NULL) OR (anonymous_id IS NOT NULL)));
alter table "public"."user_events" add constraint "user_events_pkey" PRIMARY KEY (id);
alter table "public"."user_want_to_try" alter column "created_at" set default now();
alter table "public"."user_want_to_try" add constraint "user_want_to_try_pkey" PRIMARY KEY (user_id, destination_id);
alter table "public"."users" alter column "created_at" set default now();
alter table "public"."users" alter column "xp" set default 0;
alter table "public"."users" alter column "facebook_connected" set default false;
alter table "public"."users" alter column "social_opt_out" set default false;
alter table "public"."users" alter column "share_username" set default true;
alter table "public"."users" alter column "share_location" set default true;
alter table "public"."users" alter column "hide_visit_date" set default false;
alter table "public"."users" alter column "public_profile" set default true;
alter table "public"."users" alter column "allow_social_tagging" set default false;
alter table "public"."users" alter column "social_attribution_preference" set default 'username'::text;
alter table "public"."users" add constraint "users_pkey" PRIMARY KEY (user_id);
alter table "public"."wing_admin_actions" alter column "id" set default gen_random_uuid();
alter table "public"."wing_admin_actions" alter column "before_state" set default '{}'::jsonb;
alter table "public"."wing_admin_actions" alter column "after_state" set default '{}'::jsonb;
alter table "public"."wing_admin_actions" alter column "occurred_at" set default now();
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_action_check" CHECK ((action = ANY (ARRAY['reveal_sensitive_preview'::text, 'approve'::text, 'reject'::text, 'override_moderation'::text, 'override_wing_verification'::text, 'retry_processing'::text, 'prioritize'::text, 'remove_priority'::text, 'generate_preview'::text, 'approve_generated_post'::text, 'schedule'::text, 'publish_now'::text, 'withdraw_from_queue'::text, 'mark_abuse'::text])));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_after_state_check" CHECK ((jsonb_typeof(after_state) = 'object'::text));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_before_state_check" CHECK ((jsonb_typeof(before_state) = 'object'::text));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_notes_check" CHECK (((notes IS NULL) OR (char_length(notes) <= 2000)));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_pkey" PRIMARY KEY (id);
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_request_fingerprint_check" CHECK ((char_length(request_fingerprint) = 32));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_sensitive_notes" CHECK (((action <> ALL (ARRAY['reject'::text, 'override_moderation'::text, 'override_wing_verification'::text, 'mark_abuse'::text])) OR ((reason_category IS NOT NULL) AND (notes IS NOT NULL))));
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_target_shape" CHECK (((submission_id IS NOT NULL) OR (social_job_id IS NOT NULL)));
alter table "public"."wing_creator_badge_events" alter column "id" set default gen_random_uuid();
alter table "public"."wing_creator_badge_events" alter column "owner_pseudonym_id" set default gen_random_uuid();
alter table "public"."wing_creator_badge_events" alter column "metadata" set default '{}'::jsonb;
alter table "public"."wing_creator_badge_events" alter column "created_at" set default now();
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_event_reversal_shape" CHECK ((((event_kind = 'awarded'::text) AND (reverses_badge_event_id IS NULL)) OR ((event_kind = 'revoked'::text) AND (reverses_badge_event_id IS NOT NULL))));
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_event_kind_check" CHECK ((event_kind = ANY (ARRAY['awarded'::text, 'revoked'::text])));
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_pkey" PRIMARY KEY (id);
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_reason_check" CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 500)));
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_reverses_badge_event_id_key" UNIQUE (reverses_badge_event_id);
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_owner_deletion_shape" CHECK ((((user_id IS NOT NULL) AND (owner_deleted_at IS NULL)) OR ((user_id IS NULL) AND (owner_deleted_at IS NOT NULL))));
alter table "public"."wing_creator_reward_config" alter column "enabled" set default true;
alter table "public"."wing_creator_reward_config" alter column "updated_at" set default now();
alter table "public"."wing_creator_reward_config" add constraint "wing_creator_reward_config_approval_xp_check" CHECK (((approval_xp >= 1) AND (approval_xp <= 500)));
alter table "public"."wing_creator_reward_config" add constraint "wing_creator_reward_config_config_key_check" CHECK ((config_key ~ '^[a-z0-9_]+$'::text));
alter table "public"."wing_creator_reward_config" add constraint "wing_creator_reward_config_economy_version_check" CHECK (((char_length(economy_version) >= 1) AND (char_length(economy_version) <= 40)));
alter table "public"."wing_creator_reward_config" add constraint "wing_creator_reward_config_featured_xp_check" CHECK (((featured_xp >= 1) AND (featured_xp <= 500)));
alter table "public"."wing_creator_reward_config" add constraint "wing_creator_reward_config_pkey" PRIMARY KEY (config_key);
alter table "public"."wing_creator_reward_events" alter column "id" set default gen_random_uuid();
alter table "public"."wing_creator_reward_events" alter column "owner_pseudonym_id" set default gen_random_uuid();
alter table "public"."wing_creator_reward_events" alter column "metadata" set default '{}'::jsonb;
alter table "public"."wing_creator_reward_events" alter column "created_at" set default now();
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_event_amount_shape" CHECK ((((event_kind = ANY (ARRAY['approval_xp'::text, 'featured_xp'::text])) AND (amount > 0) AND (reverses_reward_event_id IS NULL)) OR ((event_kind = 'reward_reversal'::text) AND (amount < 0) AND (reverses_reward_event_id IS NOT NULL))));
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_amount_check" CHECK ((amount <> 0));
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_event_kind_check" CHECK ((event_kind = ANY (ARRAY['approval_xp'::text, 'featured_xp'::text, 'reward_reversal'::text])));
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_pkey" PRIMARY KEY (id);
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_reason_check" CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 500)));
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_reverses_reward_event_id_key" UNIQUE (reverses_reward_event_id);
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_xp_ledger_id_key" UNIQUE (xp_ledger_id);
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_owner_deletion_shape" CHECK ((((user_id IS NOT NULL) AND (owner_deleted_at IS NULL)) OR ((user_id IS NULL) AND (owner_deleted_at IS NOT NULL))));
alter table "public"."wing_generation_jobs" alter column "id" set default gen_random_uuid();
alter table "public"."wing_generation_jobs" alter column "status" set default 'pending'::text;
alter table "public"."wing_generation_jobs" alter column "instagram_job_id" set default gen_random_uuid();
alter table "public"."wing_generation_jobs" alter column "facebook_job_id" set default gen_random_uuid();
alter table "public"."wing_generation_jobs" alter column "available_at" set default now();
alter table "public"."wing_generation_jobs" alter column "attempt_count" set default 0;
alter table "public"."wing_generation_jobs" alter column "max_attempts" set default 4;
alter table "public"."wing_generation_jobs" alter column "created_at" set default now();
alter table "public"."wing_generation_jobs" alter column "updated_at" set default now();
alter table "public"."wing_generation_jobs" add constraint "wing_generation_claim_shape" CHECK ((((status = 'claimed'::text) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (claim_token IS NOT NULL) AND (claimed_by IS NOT NULL)) OR (status <> 'claimed'::text)));
alter table "public"."wing_generation_jobs" add constraint "wing_generation_facebook_path" CHECK ((facebook_media_path = ((('publication/'::text || (submission_id)::text) || '/facebook/'::text) || (facebook_job_id)::text)));
alter table "public"."wing_generation_jobs" add constraint "wing_generation_instagram_path" CHECK ((instagram_media_path = ((('publication/'::text || (submission_id)::text) || '/instagram/'::text) || (instagram_job_id)::text)));
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_attempt_count_check" CHECK (((attempt_count >= 0) AND (attempt_count <= 8)));
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_facebook_job_id_key" UNIQUE (facebook_job_id);
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_instagram_job_id_key" UNIQUE (instagram_job_id);
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 8)));
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_nightly_receipt_id_key" UNIQUE (nightly_receipt_id);
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_pkey" PRIMARY KEY (id);
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'retry'::text, 'succeeded'::text, 'dead'::text, 'cancelled'::text])));
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_submission_id_key" UNIQUE (submission_id);
alter table "public"."wing_jury_photo_vote_counts" alter column "like_count" set default 0;
alter table "public"."wing_jury_photo_vote_counts" alter column "neutral_count" set default 0;
alter table "public"."wing_jury_photo_vote_counts" alter column "dislike_count" set default 0;
alter table "public"."wing_jury_photo_vote_counts" alter column "updated_at" set default now();
alter table "public"."wing_jury_photo_vote_counts" add constraint "wing_jury_photo_vote_counts_dislike_count_check" CHECK ((dislike_count >= 0));
alter table "public"."wing_jury_photo_vote_counts" add constraint "wing_jury_photo_vote_counts_like_count_check" CHECK ((like_count >= 0));
alter table "public"."wing_jury_photo_vote_counts" add constraint "wing_jury_photo_vote_counts_neutral_count_check" CHECK ((neutral_count >= 0));
alter table "public"."wing_jury_photo_vote_counts" add constraint "wing_jury_photo_vote_counts_pkey" PRIMARY KEY (submission_id);
alter table "public"."wing_jury_photo_vote_counts" add constraint "wing_jury_photo_vote_counts_total_nonnegative" CHECK ((((like_count + neutral_count) + dislike_count) >= 0));
alter table "public"."wing_jury_votes" alter column "created_at" set default now();
alter table "public"."wing_jury_votes" add constraint "wing_jury_votes_pkey" PRIMARY KEY (submission_id, user_id);
alter table "public"."wing_jury_votes" add constraint "wing_jury_votes_vote_check" CHECK ((vote = ANY (ARRAY['-1'::integer, 0, 1])));
alter table "public"."wing_media_cleanup_jobs" alter column "id" set default gen_random_uuid();
alter table "public"."wing_media_cleanup_jobs" alter column "bucket" set default 'wing-submissions'::text;
alter table "public"."wing_media_cleanup_jobs" alter column "status" set default 'pending'::text;
alter table "public"."wing_media_cleanup_jobs" alter column "available_at" set default now();
alter table "public"."wing_media_cleanup_jobs" alter column "attempt_count" set default 0;
alter table "public"."wing_media_cleanup_jobs" alter column "max_attempts" set default 4;
alter table "public"."wing_media_cleanup_jobs" alter column "created_at" set default now();
alter table "public"."wing_media_cleanup_jobs" alter column "updated_at" set default now();
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_claim_shape" CHECK ((((status = 'claimed'::text) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (claim_token IS NOT NULL) AND (claimed_by IS NOT NULL)) OR (status <> 'claimed'::text)));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_attempt_count_check" CHECK (((attempt_count >= 0) AND (attempt_count <= 8)));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_bucket_check" CHECK ((bucket = 'wing-submissions'::text));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_cleanup_kind_check" CHECK ((cleanup_kind = ANY (ARRAY['expired_original'::text, 'abandoned_upload'::text])));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_cleanup_kind_object_path_key" UNIQUE (cleanup_kind, object_path);
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 8)));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_object_path_check" CHECK ((object_path ~ '^originals/[0-9a-f-]{36}/[0-9a-f-]{36}/source$'::text));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_pkey" PRIMARY KEY (id);
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'retry'::text, 'succeeded'::text, 'dead'::text])));
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_target_shape" CHECK ((((cleanup_kind = 'expired_original'::text) AND (submission_id IS NOT NULL)) OR ((cleanup_kind = 'abandoned_upload'::text) AND (submission_id IS NULL) AND (upload_intent_id IS NOT NULL))));
alter table "public"."wing_media_cleanup_receipts" alter column "id" set default gen_random_uuid();
alter table "public"."wing_media_cleanup_receipts" alter column "occurred_at" set default now();
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_attempt_number_check" CHECK (((attempt_number >= 1) AND (attempt_number <= 8)));
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_cleanup_job_id_attempt_number_key" UNIQUE (cleanup_job_id, attempt_number);
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_cleanup_kind_check" CHECK ((cleanup_kind = ANY (ARRAY['expired_original'::text, 'abandoned_upload'::text])));
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_object_path_hash_check" CHECK ((char_length(object_path_hash) = 32));
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_outcome_check" CHECK ((outcome = ANY (ARRAY['deleted'::text, 'missing'::text, 'retry'::text, 'dead'::text])));
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_pkey" PRIMARY KEY (id);
alter table "public"."wing_media_exact_fingerprints" alter column "created_at" set default now();
alter table "public"."wing_media_exact_fingerprints" add constraint "wing_media_exact_fingerprints_media_type_check" CHECK ((media_type = ANY (ARRAY['photo'::text, 'video'::text])));
alter table "public"."wing_media_exact_fingerprints" add constraint "wing_media_exact_fingerprints_media_type_sha256_size_bytes_key" UNIQUE (media_type, sha256, size_bytes);
alter table "public"."wing_media_exact_fingerprints" add constraint "wing_media_exact_fingerprints_pkey" PRIMARY KEY (submission_id);
alter table "public"."wing_media_exact_fingerprints" add constraint "wing_media_exact_fingerprints_sha256_check" CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text));
alter table "public"."wing_media_exact_fingerprints" add constraint "wing_media_exact_fingerprints_size_bytes_check" CHECK ((size_bytes > 0));
alter table "public"."wing_media_fingerprints" alter column "id" set default gen_random_uuid();
alter table "public"."wing_media_fingerprints" alter column "created_at" set default now();
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_algorithm_check" CHECK (((char_length(algorithm) >= 2) AND (char_length(algorithm) <= 80)));
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_algorithm_version_check" CHECK (((char_length(algorithm_version) >= 1) AND (char_length(algorithm_version) <= 40)));
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_fingerprint_check" CHECK (((char_length(fingerprint) >= 16) AND (char_length(fingerprint) <= 512)));
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_media_type_check" CHECK ((media_type = ANY (ARRAY['photo'::text, 'video'::text])));
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_not_self_nearest" CHECK (((nearest_submission_id IS NULL) OR (nearest_submission_id <> submission_id)));
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_pkey" PRIMARY KEY (id);
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_similarity_check" CHECK (((similarity IS NULL) OR ((similarity >= (0)::numeric) AND (similarity <= (1)::numeric))));
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_submission_id_algorithm_algorithm_v_key" UNIQUE (submission_id, algorithm, algorithm_version);
alter table "public"."wing_media_photo_votes" alter column "created_at" set default now();
alter table "public"."wing_media_photo_votes" alter column "updated_at" set default now();
alter table "public"."wing_media_photo_votes" add constraint "wing_media_photo_votes_pkey" PRIMARY KEY (submission_id, user_id);
alter table "public"."wing_media_photo_votes" add constraint "wing_media_photo_votes_vote_check" CHECK ((vote = ANY (ARRAY['-1'::integer, 1])));
alter table "public"."wing_media_submissions" alter column "id" set default gen_random_uuid();
alter table "public"."wing_media_submissions" alter column "owner_pseudonym_id" set default gen_random_uuid();
alter table "public"."wing_media_submissions" alter column "status" set default 'uploaded'::text;
alter table "public"."wing_media_submissions" alter column "moderation_status" set default 'pending'::text;
alter table "public"."wing_media_submissions" alter column "wing_verification_status" set default 'pending'::text;
alter table "public"."wing_media_submissions" alter column "priority" set default 0;
alter table "public"."wing_media_submissions" alter column "created_at" set default now();
alter table "public"."wing_media_submissions" alter column "updated_at" set default now();
alter table "public"."wing_media_submissions" alter column "correlation_id" set default gen_random_uuid();
alter table "public"."wing_media_submissions" alter column "submission_source" set default 'rating'::text;
alter table "public"."wing_media_submissions" alter column "is_publish_priority" set default false;
alter table "public"."wing_media_submissions" alter column "like_count" set default 0;
alter table "public"."wing_media_submissions" alter column "dislike_count" set default 0;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_approval_shape" CHECK ((((approved_at IS NULL) AND (approved_by IS NULL)) OR ((approved_at IS NOT NULL) AND (approved_by IS NOT NULL))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_attribution_preference_check" CHECK ((attribution_preference = ANY (ARRAY['username'::text, 'display_name'::text, 'anonymous'::text])));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_consent_version_check" CHECK (((char_length(consent_version) >= 1) AND (char_length(consent_version) <= 40)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_dislike_count_nonnegative" CHECK ((dislike_count >= 0));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_like_count_nonnegative" CHECK ((like_count >= 0));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_media_type_check" CHECK ((media_type = ANY (ARRAY['photo'::text, 'video'::text])));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_moderation_status_check" CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'evaluating'::text, 'likely_acceptable'::text, 'manual_review'::text, 'clear_rejection'::text, 'overridden'::text, 'failed'::text])));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_one_per_rating" UNIQUE (rating_id);
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_original_storage_path_check" CHECK ((original_storage_path ~ '^originals/[0-9a-f-]{36}/[0-9a-f-]{36}/source$'::text));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_original_storage_path_key" UNIQUE (original_storage_path);
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_owner_deletion_shape" CHECK ((((user_id IS NOT NULL) AND (owner_deleted_at IS NULL)) OR ((user_id IS NULL) AND (owner_deleted_at IS NOT NULL))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_path_ownership" CHECK (((split_part(original_storage_path, '/'::text, 3) = (id)::text) AND (((user_id IS NOT NULL) AND (split_part(original_storage_path, '/'::text, 2) = (user_id)::text)) OR ((user_id IS NULL) AND (owner_deleted_at IS NOT NULL)))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_perceptual_hash_check" CHECK (((perceptual_hash IS NULL) OR ((char_length(perceptual_hash) >= 16) AND (char_length(perceptual_hash) <= 256))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_pkey" PRIMARY KEY (id);
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_priority_check" CHECK (((priority >= 0) AND (priority <= 100)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_processed_path_identity" CHECK (((processed_storage_path IS NULL) OR (split_part(processed_storage_path, '/'::text, 2) = (id)::text)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_processed_storage_path_check" CHECK (((processed_storage_path IS NULL) OR (processed_storage_path ~ '^processed/[0-9a-f-]{36}/primary$'::text)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_processed_storage_path_key" UNIQUE (processed_storage_path);
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_quality_score_check" CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (100)::numeric))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_rejection_shape" CHECK ((((rejected_at IS NULL) AND (rejection_reason IS NULL)) OR ((rejected_at IS NOT NULL) AND (rejection_reason IS NOT NULL))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_reviewer_notes_check" CHECK (((reviewer_notes IS NULL) OR (char_length(reviewer_notes) <= 2000)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_status_check" CHECK ((status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'generation_pending'::text, 'ready_to_post'::text, 'scheduled'::text, 'posting'::text, 'posted'::text, 'failed'::text, 'withdrawn'::text])));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_submission_source_check" CHECK ((submission_source = ANY (ARRAY['rating'::text, 'onboarding'::text, 'buffacoin'::text, 'profile'::text, 'home_cta'::text])));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_terminal_shape" CHECK ((((status <> 'rejected'::text) OR (rejected_at IS NOT NULL)) AND ((status <> 'posted'::text) OR (featured_at IS NOT NULL)) AND ((status <> 'withdrawn'::text) OR (withdrawn_at IS NOT NULL))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_thumbnail_path_identity" CHECK (((thumbnail_storage_path IS NULL) OR (split_part(thumbnail_storage_path, '/'::text, 2) = (id)::text)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_thumbnail_storage_path_check" CHECK (((thumbnail_storage_path IS NULL) OR (thumbnail_storage_path ~ '^thumbnails/[0-9a-f-]{36}/preview$'::text)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_thumbnail_storage_path_key" UNIQUE (thumbnail_storage_path);
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_user_caption_check" CHECK (((user_caption IS NULL) OR (char_length(user_caption) <= 500)));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_wing_confidence_check" CHECK (((wing_confidence IS NULL) OR ((wing_confidence >= (0)::numeric) AND (wing_confidence <= (1)::numeric))));
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_wing_verification_status_check" CHECK ((wing_verification_status = ANY (ARRAY['pending'::text, 'likely_wings'::text, 'uncertain'::text, 'not_wings'::text, 'overridden'::text, 'failed'::text])));
alter table "public"."wing_media_validation_receipts" alter column "id" set default gen_random_uuid();
alter table "public"."wing_media_validation_receipts" alter column "validated_at" set default now();
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipt_user_id_correlation_id_stagin_key" UNIQUE (user_id, correlation_id, staging_path);
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_height_check" CHECK (((height >= 1) AND (height <= 2048)));
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_mime_type_check" CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text])));
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_pkey" PRIMARY KEY (id);
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_sha256_check" CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text));
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 20971520)));
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_staging_bucket_check" CHECK ((staging_bucket = 'wing-shot-staging'::text));
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_submission_id_key" UNIQUE (submission_id);
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_width_check" CHECK (((width >= 1) AND (width <= 2048)));
alter table "public"."wing_moderation_config" alter column "singleton" set default true;
alter table "public"."wing_moderation_config" alter column "schema_version" set default 1;
alter table "public"."wing_moderation_config" alter column "minimum_wing_confidence" set default 0.6500;
alter table "public"."wing_moderation_config" alter column "clear_reject_wing_confidence" set default 0.1500;
alter table "public"."wing_moderation_config" alter column "maximum_spam_probability" set default 0.7000;
alter table "public"."wing_moderation_config" alter column "maximum_duplicate_probability" set default 0.8500;
alter table "public"."wing_moderation_config" alter column "daily_upload_limit" set default 5;
alter table "public"."wing_moderation_config" alter column "hourly_upload_limit" set default 3;
alter table "public"."wing_moderation_config" alter column "nightly_enabled" set default false;
alter table "public"."wing_moderation_config" alter column "publishing_dry_run" set default true;
alter table "public"."wing_moderation_config" alter column "updated_at" set default now();
alter table "public"."wing_moderation_config" alter column "original_retention_days" set default 30;
alter table "public"."wing_moderation_config" alter column "rolling_upload_limit" set default 5;
alter table "public"."wing_moderation_config" alter column "rolling_upload_window_seconds" set default 900;
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_clear_reject_wing_confidence_check" CHECK (((clear_reject_wing_confidence >= (0)::numeric) AND (clear_reject_wing_confidence <= (1)::numeric)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_daily_upload_limit_check" CHECK (((daily_upload_limit >= 1) AND (daily_upload_limit <= 20)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_hourly_upload_limit_check" CHECK (((hourly_upload_limit >= 1) AND (hourly_upload_limit <= 10)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_maximum_duplicate_probability_check" CHECK (((maximum_duplicate_probability >= (0)::numeric) AND (maximum_duplicate_probability <= (1)::numeric)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_maximum_spam_probability_check" CHECK (((maximum_spam_probability >= (0)::numeric) AND (maximum_spam_probability <= (1)::numeric)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_minimum_wing_confidence_check" CHECK (((minimum_wing_confidence >= (0)::numeric) AND (minimum_wing_confidence <= (1)::numeric)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_original_retention_days_check" CHECK (((original_retention_days >= 1) AND (original_retention_days <= 90)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_pkey" PRIMARY KEY (singleton);
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_rolling_upload_limit_check" CHECK (((rolling_upload_limit >= 1) AND (rolling_upload_limit <= 20)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_rolling_upload_window_seconds_check" CHECK (((rolling_upload_window_seconds >= 60) AND (rolling_upload_window_seconds <= 86400)));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_schema_version_check" CHECK ((schema_version > 0));
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_singleton_check" CHECK (singleton);
alter table "public"."wing_moderation_config" add constraint "wing_moderation_threshold_order" CHECK ((clear_reject_wing_confidence < minimum_wing_confidence));
alter table "public"."wing_moderation_decisions" alter column "id" set default gen_random_uuid();
alter table "public"."wing_moderation_decisions" alter column "schema_version" set default 1;
alter table "public"."wing_moderation_decisions" alter column "raw_result" set default '{}'::jsonb;
alter table "public"."wing_moderation_decisions" alter column "evaluated_at" set default now();
alter table "public"."wing_moderation_decisions" alter column "created_at" set default now();
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_decision_source_check" CHECK ((decision_source = ANY (ARRAY['ai'::text, 'human'::text, 'policy'::text, 'system'::text])));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_duplicate_probability_check" CHECK (((duplicate_probability IS NULL) OR ((duplicate_probability >= (0)::numeric) AND (duplicate_probability <= (1)::numeric))));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_explanation_check" CHECK (((explanation IS NULL) OR (char_length(explanation) <= 2000)));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_pkey" PRIMARY KEY (id);
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_quality_score_check" CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (100)::numeric))));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_raw_result_check" CHECK ((jsonb_typeof(raw_result) = 'object'::text));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_recommendation_check" CHECK ((recommendation = ANY (ARRAY['accept'::text, 'manual_review'::text, 'reject'::text, 'error'::text])));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_schema_version_check" CHECK ((schema_version > 0));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_spam_probability_check" CHECK (((spam_probability IS NULL) OR ((spam_probability >= (0)::numeric) AND (spam_probability <= (1)::numeric))));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_wing_confidence_check" CHECK (((wing_confidence IS NULL) OR ((wing_confidence >= (0)::numeric) AND (wing_confidence <= (1)::numeric))));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_human_reviewer_shape" CHECK (((decision_source <> 'human'::text) OR (reviewer_id IS NOT NULL)));
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_override_reason_shape" CHECK (((override_reason IS NULL) OR (reviewer_id IS NOT NULL)));
alter table "public"."wing_nightly_run_receipts" alter column "id" set default gen_random_uuid();
alter table "public"."wing_nightly_run_receipts" alter column "timezone" set default 'America/New_York'::text;
alter table "public"."wing_nightly_run_receipts" alter column "score_components" set default '{}'::jsonb;
alter table "public"."wing_nightly_run_receipts" alter column "candidate_count" set default 0;
alter table "public"."wing_nightly_run_receipts" alter column "dry_run" set default true;
alter table "public"."wing_nightly_run_receipts" alter column "started_at" set default now();
alter table "public"."wing_nightly_run_receipts" alter column "created_at" set default now();
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_business_date_key" UNIQUE (business_date);
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_candidate_count_check" CHECK ((candidate_count >= 0));
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_correlation_id_key" UNIQUE (correlation_id);
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_pkey" PRIMARY KEY (id);
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_score_components_check" CHECK ((jsonb_typeof(score_components) = 'object'::text));
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_selection_shape" CHECK (((status <> ALL (ARRAY['selected'::text, 'completed'::text, 'partially_completed'::text])) OR (selected_submission_id IS NOT NULL)));
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_skip_shape" CHECK (((status <> 'skipped_no_approved_content'::text) OR ((selected_submission_id IS NULL) AND (candidate_count = 0) AND (score_components = '{}'::jsonb))));
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'selected'::text, 'skipped_no_approved_content'::text, 'completed'::text, 'partially_completed'::text, 'failed'::text])));
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_timezone_check" CHECK ((timezone = 'America/New_York'::text));
alter table "public"."wing_notification_receipts" alter column "id" set default gen_random_uuid();
alter table "public"."wing_notification_receipts" alter column "owner_pseudonym_id" set default gen_random_uuid();
alter table "public"."wing_notification_receipts" alter column "created_at" set default now();
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipt_owner_deletion_shape" CHECK ((((user_id IS NOT NULL) AND (owner_deleted_at IS NULL)) OR ((user_id IS NULL) AND (owner_deleted_at IS NOT NULL))));
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipt_target_shape" CHECK ((((event_type = 'creator_badge_earned'::text) AND (badge_event_id IS NOT NULL)) OR ((event_type <> 'creator_badge_earned'::text) AND (submission_id IS NOT NULL))));
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_deduplication_key_key" UNIQUE (deduplication_key);
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_event_type_check" CHECK ((event_type = ANY (ARRAY['wing_shot_approved'::text, 'wing_shot_rejected'::text, 'wing_shot_featured'::text, 'creator_badge_earned'::text])));
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_outcome_check" CHECK ((outcome = ANY (ARRAY['queued'::text, 'preference_disabled'::text, 'flag_disabled'::text])));
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_pkey" PRIMARY KEY (id);
alter table "public"."wing_photo_derivative_jobs" alter column "id" set default gen_random_uuid();
alter table "public"."wing_photo_derivative_jobs" alter column "status" set default 'pending'::text;
alter table "public"."wing_photo_derivative_jobs" alter column "attempt_count" set default 0;
alter table "public"."wing_photo_derivative_jobs" alter column "max_attempts" set default 4;
alter table "public"."wing_photo_derivative_jobs" alter column "available_at" set default now();
alter table "public"."wing_photo_derivative_jobs" alter column "created_at" set default now();
alter table "public"."wing_photo_derivative_jobs" alter column "updated_at" set default now();
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_attempt_count_check" CHECK (((attempt_count >= 0) AND (attempt_count <= 32)));
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_check" CHECK (((status <> 'claimed'::text) OR ((claim_token IS NOT NULL) AND (claimed_by IS NOT NULL) AND (lease_expires_at IS NOT NULL))));
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 32)));
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_pkey" PRIMARY KEY (id);
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_purpose_check" CHECK ((purpose = ANY (ARRAY['upload'::text, 'recovery'::text])));
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'retry'::text, 'succeeded'::text, 'dead'::text, 'cancelled'::text])));
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_submission_id_key" UNIQUE (submission_id);
alter table "public"."wing_photo_derivative_receipts" alter column "id" set default gen_random_uuid();
alter table "public"."wing_photo_derivative_receipts" alter column "attempt_number" set default 0;
alter table "public"."wing_photo_derivative_receipts" alter column "occurred_at" set default now();
alter table "public"."wing_photo_derivative_receipts" add constraint "wing_photo_derivative_receipts_pkey" PRIMARY KEY (id);
alter table "public"."wing_processing_jobs" alter column "id" set default gen_random_uuid();
alter table "public"."wing_processing_jobs" alter column "generation" set default 1;
alter table "public"."wing_processing_jobs" alter column "status" set default 'pending'::text;
alter table "public"."wing_processing_jobs" alter column "available_at" set default now();
alter table "public"."wing_processing_jobs" alter column "attempt_count" set default 0;
alter table "public"."wing_processing_jobs" alter column "max_attempts" set default 5;
alter table "public"."wing_processing_jobs" alter column "created_at" set default now();
alter table "public"."wing_processing_jobs" alter column "updated_at" set default now();
alter table "public"."wing_processing_jobs" add constraint "wing_processing_job_claim_shape" CHECK ((((status = 'claimed'::text) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (claim_token IS NOT NULL) AND (claimed_by IS NOT NULL)) OR (status <> 'claimed'::text)));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_job_lease_order" CHECK (((lease_expires_at IS NULL) OR (claimed_at IS NULL) OR (lease_expires_at > claimed_at)));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_attempt_count_check" CHECK (((attempt_count >= 0) AND (attempt_count <= 12)));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_generation_check" CHECK ((generation > 0));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_job_kind_check" CHECK ((job_kind = ANY (ARRAY['validate'::text, 'photo_process'::text, 'video_process'::text, 'moderate'::text, 'fingerprint'::text])));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 12)));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_pkey" PRIMARY KEY (id);
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'retry'::text, 'succeeded'::text, 'dead'::text, 'cancelled'::text])));
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_submission_id_job_kind_generation_key" UNIQUE (submission_id, job_kind, generation);
alter table "public"."wing_submission_abuse_signals" alter column "id" set default gen_random_uuid();
alter table "public"."wing_submission_abuse_signals" alter column "created_at" set default now();
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_check" CHECK (((related_submission_id IS NULL) OR (related_submission_id <> submission_id)));
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_notes_check" CHECK (((notes IS NULL) OR (char_length(notes) <= 1000)));
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_pkey" PRIMARY KEY (id);
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_score_check" CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (1)::numeric))));
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_severity_check" CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_signal_type_check" CHECK ((signal_type = ANY (ARRAY['exact_duplicate'::text, 'perceptual_duplicate'::text, 'video_fingerprint_match'::text, 'upload_burst'::text, 'repeat_restaurant'::text, 'reviewer_marked_abuse'::text])));
alter table "public"."wing_submission_mutation_receipts" alter column "id" set default gen_random_uuid();
alter table "public"."wing_submission_mutation_receipts" alter column "owner_pseudonym_id" set default gen_random_uuid();
alter table "public"."wing_submission_mutation_receipts" alter column "result" set default '{}'::jsonb;
alter table "public"."wing_submission_mutation_receipts" alter column "created_at" set default now();
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_mutation_receipts_owner_deletion_shape" CHECK ((((user_id IS NOT NULL) AND (owner_deleted_at IS NULL)) OR ((user_id IS NULL) AND (owner_deleted_at IS NOT NULL))));
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_mutation_kind_check" CHECK ((mutation_kind = ANY (ARRAY['reserve_upload'::text, 'finalize_upload'::text, 'withdraw'::text, 'request_media_access'::text])));
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_pkey" PRIMARY KEY (id);
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_request_fingerprint_check" CHECK ((char_length(request_fingerprint) = 32));
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_result_check" CHECK ((jsonb_typeof(result) = 'object'::text));
alter table "public"."wing_submission_state_transitions" alter column "id" set default gen_random_uuid();
alter table "public"."wing_submission_state_transitions" alter column "metadata" set default '{}'::jsonb;
alter table "public"."wing_submission_state_transitions" alter column "occurred_at" set default now();
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transition_changes_state" CHECK (((from_status IS NULL) OR (from_status <> to_status)));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'reviewer'::text, 'worker'::text, 'scheduler'::text, 'publisher'::text, 'system'::text])));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_from_status_check" CHECK (((from_status IS NULL) OR (from_status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'generation_pending'::text, 'ready_to_post'::text, 'scheduled'::text, 'posting'::text, 'posted'::text, 'failed'::text, 'withdrawn'::text]))));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_pkey" PRIMARY KEY (id);
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_request_fingerprint_check" CHECK ((char_length(request_fingerprint) = 32));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_to_status_check" CHECK ((to_status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'generation_pending'::text, 'ready_to_post'::text, 'scheduled'::text, 'posting'::text, 'posted'::text, 'failed'::text, 'withdrawn'::text])));
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_trigger_source_check" CHECK (((char_length(trigger_source) >= 2) AND (char_length(trigger_source) <= 100)));
alter table "public"."wing_submission_upload_intents" alter column "id" set default gen_random_uuid();
alter table "public"."wing_submission_upload_intents" alter column "submission_id" set default gen_random_uuid();
alter table "public"."wing_submission_upload_intents" alter column "status" set default 'reserved'::text;
alter table "public"."wing_submission_upload_intents" alter column "created_at" set default now();
alter table "public"."wing_submission_upload_intents" alter column "updated_at" set default now();
alter table "public"."wing_submission_upload_intents" alter column "submission_source" set default 'rating'::text;
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_attribution_preference_check" CHECK ((attribution_preference = ANY (ARRAY['username'::text, 'display_name'::text, 'anonymous'::text])));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_consent_version_check" CHECK (((char_length(consent_version) >= 1) AND (char_length(consent_version) <= 40)));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_expected_mime_type_check" CHECK ((expected_mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text, 'video/mp4'::text, 'video/quicktime'::text])));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_expected_size_bytes_check" CHECK (((expected_size_bytes >= 1) AND (expected_size_bytes <= 52428800)));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_expected_storage_path_key" UNIQUE (expected_storage_path);
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_idempotency_key_check" CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 200)));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_idempotency_key_key" UNIQUE (idempotency_key);
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_media_type_check" CHECK ((media_type = ANY (ARRAY['photo'::text, 'video'::text])));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_pkey" PRIMARY KEY (id);
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_request_fingerprint_check" CHECK ((char_length(request_fingerprint) = 32));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_status_check" CHECK ((status = ANY (ARRAY['reserved'::text, 'finalized'::text, 'expired'::text, 'cancelled'::text])));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_submission_id_key" UNIQUE (submission_id);
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_submission_source_check" CHECK ((submission_source = ANY (ARRAY['rating'::text, 'onboarding'::text, 'buffacoin'::text, 'profile'::text, 'home_cta'::text])));
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_user_caption_check" CHECK (((user_caption IS NULL) OR (char_length(user_caption) <= 500)));
alter table "public"."wing_submission_upload_intents" add constraint "wing_upload_intents_expiry_bound" CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:30:00'::interval))));
alter table "public"."wing_submission_upload_intents" add constraint "wing_upload_intents_finalize_shape" CHECK ((((status = 'finalized'::text) AND (finalized_at IS NOT NULL)) OR ((status <> 'finalized'::text) AND (finalized_at IS NULL))));
alter table "public"."wing_submission_upload_intents" add constraint "wing_upload_intents_media_mime_shape" CHECK ((((media_type = 'photo'::text) AND (expected_mime_type ~~ 'image/%'::text)) OR ((media_type = 'video'::text) AND (expected_mime_type ~~ 'video/%'::text))));
alter table "public"."wing_submission_upload_intents" add constraint "wing_upload_intents_path_shape" CHECK ((expected_storage_path = (((('originals/'::text || (user_id)::text) || '/'::text) || (submission_id)::text) || '/source'::text)));
alter table "public"."wing_user_moderation_state" alter column "status" set default 'active'::text;
alter table "public"."wing_user_moderation_state" alter column "limit_multiplier" set default 1;
alter table "public"."wing_user_moderation_state" alter column "updated_at" set default now();
alter table "public"."wing_user_moderation_state" add constraint "wing_user_moderation_state_limit_multiplier_check" CHECK (((limit_multiplier >= (0)::numeric) AND (limit_multiplier <= (1)::numeric)));
alter table "public"."wing_user_moderation_state" add constraint "wing_user_moderation_state_pkey" PRIMARY KEY (user_id);
alter table "public"."wing_user_moderation_state" add constraint "wing_user_moderation_state_reason" CHECK (((status = 'active'::text) OR (reason_category IS NOT NULL)));
alter table "public"."wing_user_moderation_state" add constraint "wing_user_moderation_state_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'limited'::text, 'suspended'::text])));
alter table "public"."xp_ledger" alter column "id" set default gen_random_uuid();
alter table "public"."xp_ledger" alter column "metadata" set default '{}'::jsonb;
alter table "public"."xp_ledger" alter column "created_at" set default now();
alter table "public"."xp_ledger" add constraint "xp_ledger_amount_nonzero" CHECK ((amount <> 0));
alter table "public"."xp_ledger" add constraint "xp_ledger_pkey" PRIMARY KEY (id);
alter table "public"."xp_ledger" add constraint "xp_ledger_source_format" CHECK ((source ~ '^[a-z0-9_]+$'::text));
alter table "public"."android_qa_early_bird_eligibility" add constraint "android_qa_early_bird_eligibility_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."android_qa_early_bird_eligibility" enable row level security;
CREATE INDEX api_rate_limits_feature_user_time_idx ON public.api_rate_limits USING btree (feature, user_id, created_at);
CREATE INDEX api_rate_limits_feature_ip_time_idx ON public.api_rate_limits USING btree (feature, ip_address, created_at);
alter table "public"."api_rate_limits" enable row level security;
alter table "public"."app_user_roles" add constraint "app_user_roles_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."app_user_roles" add constraint "app_user_roles_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."app_user_roles" add constraint "app_user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX app_user_roles_active_role_idx ON public.app_user_roles USING btree (role, user_id) WHERE active;
alter table "public"."app_user_roles" enable row level security;
alter table "public"."badge_catalog" enable row level security;
alter table "public"."buffacoin_ledger" add constraint "buffacoin_ledger_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id);
alter table "public"."buffacoin_ledger" add constraint "buffacoin_ledger_state_id_fkey" FOREIGN KEY (state_id) REFERENCES states(state_id);
alter table "public"."buffacoin_ledger" add constraint "buffacoin_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX buffacoin_ledger_one_starter_grant_per_user ON public.buffacoin_ledger USING btree (user_id, reason) WHERE (reason = 'new_user_starter_coins'::text);
CREATE UNIQUE INDEX buffacoin_once_android_qa_bonus ON public.buffacoin_ledger USING btree (user_id, reason) WHERE (reason = ANY (ARRAY['Welcome Bonus — 100 BuffaCoins'::text, 'Early Bird Bonus — 250 BuffaCoins'::text]));
CREATE INDEX idx_buffacoin_ledger_destination ON public.buffacoin_ledger USING btree (destination_id);
CREATE INDEX idx_buffacoin_ledger_user_created ON public.buffacoin_ledger USING btree (user_id, created_at DESC);
CREATE INDEX idx_buffacoin_ledger_reason ON public.buffacoin_ledger USING btree (reason);
alter table "public"."buffacoin_ledger" enable row level security;
alter table "public"."buffacoin_wallets" add constraint "buffacoin_wallets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."buffacoin_wallets" enable row level security;
alter table "public"."crawls" add constraint "crawls_route_id_fkey" FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE;
alter table "public"."crawls" enable row level security;
alter table "public"."destination_ratings" add constraint "destination_ratings_crawl_id_fkey" FOREIGN KEY (crawl_id) REFERENCES crawls(crawl_id) ON DELETE CASCADE;
alter table "public"."destination_ratings" add constraint "destination_ratings_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE;
alter table "public"."destination_ratings" add constraint "destination_ratings_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES destination_tags(id) ON DELETE SET NULL;
alter table "public"."destination_ratings" add constraint "destination_ratings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX destination_ratings_one_per_dest_per_crawl_user_noncoin ON public.destination_ratings USING btree (crawl_id, destination_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (is_buffacoin IS NOT TRUE);
CREATE INDEX dr_crawl_user_created_idx ON public.destination_ratings USING btree (crawl_id, user_id, created_at DESC);
CREATE UNIQUE INDEX destination_ratings_buffacoin_operation_unique ON public.destination_ratings USING btree (buffacoin_operation_id) WHERE (buffacoin_operation_id IS NOT NULL);
CREATE INDEX destination_ratings_created_at_idx ON public.destination_ratings USING btree (created_at DESC);
CREATE INDEX destination_ratings_tag_id_idx ON public.destination_ratings USING btree (tag_id);
CREATE INDEX buffacoin_rating_price_lookup ON public.destination_ratings USING btree (user_id, destination_id) WHERE is_buffacoin;
alter table "public"."destination_ratings" enable row level security;
CREATE UNIQUE INDEX destination_tags_tag_uniq_ci ON public.destination_tags USING btree (lower(tag));
alter table "public"."destinations" add constraint "destinations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."destinations" add constraint "destinations_state_id_fkey" FOREIGN KEY (state_id) REFERENCES states(state_id) ON DELETE SET NULL;
CREATE UNIQUE INDEX destinations_name_address_key ON public.destinations USING btree (lower(name), lower(COALESCE(address, ''::text)));
alter table "public"."destinations" enable row level security;
alter table "public"."engagement_feature_flags" enable row level security;
alter table "public"."friendships" add constraint "friendships_addressee_id_fkey" FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."friendships" add constraint "friendships_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX friendships_status_created_idx ON public.friendships USING btree (status, created_at DESC);
CREATE UNIQUE INDEX friendships_unique_pair_idx ON public.friendships USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_addressee_status_idx ON public.friendships USING btree (addressee_id, status, created_at DESC);
CREATE INDEX friendships_requester_status_idx ON public.friendships USING btree (requester_id, status, created_at DESC);
alter table "public"."friendships" enable row level security;
alter table "public"."lb_user_badges_counts" add constraint "lb_user_badges_counts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
alter table "public"."lb_user_badges_counts" enable row level security;
alter table "public"."notification_outbox" add constraint "notification_outbox_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX notification_outbox_dispatch_idx ON public.notification_outbox USING btree (next_attempt_at, eligible_at) WHERE (status = ANY (ARRAY['queued'::text, 'retry'::text]));
alter table "public"."notification_outbox" enable row level security;
alter table "public"."notification_preferences" add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."notification_preferences" enable row level security;
alter table "public"."referral_abuse_signals" add constraint "referral_abuse_signals_referral_attribution_id_fkey" FOREIGN KEY (referral_attribution_id) REFERENCES referral_attributions(id);
alter table "public"."referral_abuse_signals" enable row level security;
alter table "public"."referral_attributions" add constraint "referral_attributions_referral_code_id_fkey" FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id);
CREATE UNIQUE INDEX referral_click_dedupe_unique ON public.referral_attributions USING btree (referral_code_id, anonymous_install_hash) WHERE ((invitee_user_id IS NULL) AND (anonymous_install_hash IS NOT NULL) AND (status = 'clicked'::text));
CREATE UNIQUE INDEX referral_attributions_invitee_unique ON public.referral_attributions USING btree (invitee_user_id) WHERE (invitee_user_id IS NOT NULL);
CREATE INDEX referral_attributions_inviter_status_idx ON public.referral_attributions USING btree (inviter_user_id, status, created_at DESC);
CREATE UNIQUE INDEX referral_attributions_rating_unique ON public.referral_attributions USING btree (qualifying_rating_id) WHERE (qualifying_rating_id IS NOT NULL);
alter table "public"."referral_attributions" enable row level security;
CREATE UNIQUE INDEX referral_codes_code_ci_unique ON public.referral_codes USING btree (lower(code));
alter table "public"."referral_codes" enable row level security;
alter table "public"."routes" add constraint "routes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."routes" add constraint "routes_stop1_id_fkey" FOREIGN KEY (stop1_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."routes" add constraint "routes_stop2_id_fkey" FOREIGN KEY (stop2_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."routes" add constraint "routes_stop3_id_fkey" FOREIGN KEY (stop3_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."routes" add constraint "routes_stop4_id_fkey" FOREIGN KEY (stop4_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."routes" add constraint "routes_stop5_id_fkey" FOREIGN KEY (stop5_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."routes" add constraint "routes_travel_tag_id_fkey" FOREIGN KEY (travel_tag_id) REFERENCES route_travel_tag(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX routes_token_route_unique ON public.routes USING btree (city) WHERE (is_token_route = true);
alter table "public"."routes" enable row level security;
alter table "public"."social_content_jobs" add constraint "social_content_jobs_human_approved_by_fkey" FOREIGN KEY (human_approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."social_content_jobs" add constraint "social_content_jobs_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX social_content_jobs_stale_lease_idx ON public.social_content_jobs USING btree (lease_expires_at, id) WHERE (status = ANY (ARRAY['claimed'::text, 'posting'::text]));
CREATE INDEX social_content_jobs_claim_idx ON public.social_content_jobs USING btree (scheduled_for, created_at, id) WHERE (status = ANY (ARRAY['ready'::text, 'scheduled'::text, 'retry'::text]));
alter table "public"."social_content_jobs" enable row level security;
alter table "public"."user_badges" add constraint "user_badges_badge_id_fkey" FOREIGN KEY (badge_id) REFERENCES badge_catalog(id) ON DELETE CASCADE;
alter table "public"."user_badges" add constraint "user_badges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX user_badges_user_badge_unique_idx ON public.user_badges USING btree (user_id, badge_id);
CREATE UNIQUE INDEX user_badges_user_id_badge_id_key ON public.user_badges USING btree (user_id, badge_id);
CREATE INDEX idx_user_badges_user_id ON public.user_badges USING btree (user_id);
alter table "public"."user_badges" enable row level security;
alter table "public"."user_blocks" add constraint "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."user_blocks" add constraint "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX user_blocks_blocked_idx ON public.user_blocks USING btree (blocked_id, created_at DESC);
alter table "public"."user_blocks" enable row level security;
alter table "public"."user_destination_favorites" add constraint "user_destination_favorites_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE;
alter table "public"."user_destination_favorites" add constraint "user_destination_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX user_destination_favorites_destination_idx ON public.user_destination_favorites USING btree (destination_id, created_at DESC);
alter table "public"."user_destination_favorites" enable row level security;
CREATE INDEX user_events_route_time_idx ON public.user_events USING btree (route_id, occurred_at DESC) WHERE (route_id IS NOT NULL);
CREATE INDEX user_events_destination_time_idx ON public.user_events USING btree (destination_id, occurred_at DESC) WHERE (destination_id IS NOT NULL);
CREATE INDEX user_events_screen_time_idx ON public.user_events USING btree (screen, occurred_at DESC) WHERE (screen IS NOT NULL);
CREATE INDEX user_events_session_time_idx ON public.user_events USING btree (session_id, occurred_at);
CREATE INDEX user_events_user_time_idx ON public.user_events USING btree (user_id, occurred_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX user_events_anonymous_time_idx ON public.user_events USING btree (anonymous_id, occurred_at DESC) WHERE (anonymous_id IS NOT NULL);
CREATE INDEX user_events_metadata_gin_idx ON public.user_events USING gin (metadata);
CREATE INDEX user_events_event_time_idx ON public.user_events USING btree (event_name, occurred_at DESC);
CREATE INDEX user_events_state_time_idx ON public.user_events USING btree (state_id, occurred_at DESC) WHERE (state_id IS NOT NULL);
CREATE INDEX user_events_occurred_at_idx ON public.user_events USING btree (occurred_at DESC);
CREATE INDEX user_events_crawl_time_idx ON public.user_events USING btree (crawl_id, occurred_at DESC) WHERE (crawl_id IS NOT NULL);
alter table "public"."user_events" enable row level security;
alter table "public"."user_want_to_try" add constraint "user_want_to_try_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE;
alter table "public"."user_want_to_try" add constraint "user_want_to_try_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX user_want_to_try_destination_idx ON public.user_want_to_try USING btree (destination_id, created_at DESC);
alter table "public"."user_want_to_try" enable row level security;
alter table "public"."users" add constraint "users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX users_username_unique_ci ON public.users USING btree (lower(NULLIF(username, ''::text))) WHERE (NULLIF(username, ''::text) IS NOT NULL);
CREATE UNIQUE INDEX users_facebook_provider_id_unique ON public.users USING btree (facebook_provider_id) WHERE (facebook_provider_id IS NOT NULL);
CREATE INDEX users_created_at_idx ON public.users USING btree (created_at DESC);
alter table "public"."users" enable row level security;
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_social_job_id_fkey" FOREIGN KEY (social_job_id) REFERENCES social_content_jobs(id) ON DELETE RESTRICT;
alter table "public"."wing_admin_actions" add constraint "wing_admin_actions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_admin_actions_submission_time_idx ON public.wing_admin_actions USING btree (submission_id, occurred_at, id) WHERE (submission_id IS NOT NULL);
alter table "public"."wing_admin_actions" enable row level security;
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_badge_id_fkey" FOREIGN KEY (badge_id) REFERENCES badge_catalog(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_reverses_badge_event_id_fkey" FOREIGN KEY (reverses_badge_event_id) REFERENCES wing_creator_badge_events(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_trigger_submission_id_fkey" FOREIGN KEY (trigger_submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_badge_events" add constraint "wing_creator_badge_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX wing_creator_badge_user_time_idx ON public.wing_creator_badge_events USING btree (user_id, created_at DESC, id);
alter table "public"."wing_creator_badge_events" enable row level security;
alter table "public"."wing_creator_reward_config" enable row level security;
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_rating_id_fkey" FOREIGN KEY (rating_id) REFERENCES destination_ratings(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_reverses_reward_event_id_fkey" FOREIGN KEY (reverses_reward_event_id) REFERENCES wing_creator_reward_events(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_source_transition_id_fkey" FOREIGN KEY (source_transition_id) REFERENCES wing_submission_state_transitions(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_creator_reward_events" add constraint "wing_creator_reward_events_xp_ledger_id_fkey" FOREIGN KEY (xp_ledger_id) REFERENCES xp_ledger(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX wing_creator_approval_once_per_rating ON public.wing_creator_reward_events USING btree (rating_id) WHERE (event_kind = 'approval_xp'::text);
CREATE INDEX wing_creator_reward_user_time_idx ON public.wing_creator_reward_events USING btree (user_id, created_at DESC, id);
CREATE UNIQUE INDEX wing_creator_reward_once_per_submission_kind ON public.wing_creator_reward_events USING btree (submission_id, event_kind) WHERE (event_kind = ANY (ARRAY['approval_xp'::text, 'featured_xp'::text]));
CREATE INDEX wing_creator_reward_submission_time_idx ON public.wing_creator_reward_events USING btree (submission_id, created_at, id);
alter table "public"."wing_creator_reward_events" enable row level security;
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_nightly_receipt_id_fkey" FOREIGN KEY (nightly_receipt_id) REFERENCES wing_nightly_run_receipts(id) ON DELETE RESTRICT;
alter table "public"."wing_generation_jobs" add constraint "wing_generation_jobs_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_generation_jobs_claim_idx ON public.wing_generation_jobs USING btree (available_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));
alter table "public"."wing_generation_jobs" enable row level security;
alter table "public"."wing_jury_photo_vote_counts" add constraint "wing_jury_photo_vote_counts_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE CASCADE;
CREATE INDEX wing_jury_photo_vote_counts_like_idx ON public.wing_jury_photo_vote_counts USING btree (like_count DESC, submission_id);
alter table "public"."wing_jury_photo_vote_counts" enable row level security;
alter table "public"."wing_jury_votes" add constraint "wing_jury_votes_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE CASCADE;
alter table "public"."wing_jury_votes" add constraint "wing_jury_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX wing_jury_votes_user_idx ON public.wing_jury_votes USING btree (user_id, created_at DESC);
CREATE INDEX wing_jury_votes_submission_vote_idx ON public.wing_jury_votes USING btree (submission_id, vote);
alter table "public"."wing_jury_votes" enable row level security;
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
alter table "public"."wing_media_cleanup_jobs" add constraint "wing_media_cleanup_jobs_upload_intent_id_fkey" FOREIGN KEY (upload_intent_id) REFERENCES wing_submission_upload_intents(id) ON DELETE SET NULL;
CREATE INDEX wing_media_cleanup_jobs_claim_idx ON public.wing_media_cleanup_jobs USING btree (available_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));
alter table "public"."wing_media_cleanup_jobs" enable row level security;
alter table "public"."wing_media_cleanup_receipts" add constraint "wing_media_cleanup_receipts_cleanup_job_id_fkey" FOREIGN KEY (cleanup_job_id) REFERENCES wing_media_cleanup_jobs(id) ON DELETE RESTRICT;
alter table "public"."wing_media_cleanup_receipts" enable row level security;
alter table "public"."wing_media_exact_fingerprints" add constraint "wing_media_exact_fingerprints_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE CASCADE;
alter table "public"."wing_media_exact_fingerprints" enable row level security;
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_nearest_submission_id_fkey" FOREIGN KEY (nearest_submission_id) REFERENCES wing_media_submissions(id) ON DELETE SET NULL;
alter table "public"."wing_media_fingerprints" add constraint "wing_media_fingerprints_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_media_fingerprints_lookup_idx ON public.wing_media_fingerprints USING btree (media_type, algorithm, algorithm_version, fingerprint);
CREATE INDEX wing_media_fingerprints_duplicate_group_idx ON public.wing_media_fingerprints USING btree (duplicate_group, submission_id) WHERE (duplicate_group IS NOT NULL);
alter table "public"."wing_media_fingerprints" enable row level security;
alter table "public"."wing_media_photo_votes" add constraint "wing_media_photo_votes_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE CASCADE;
alter table "public"."wing_media_photo_votes" add constraint "wing_media_photo_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_wing_media_photo_votes_user ON public.wing_media_photo_votes USING btree (user_id, submission_id);
alter table "public"."wing_media_photo_votes" enable row level security;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_priority_set_by_fkey" FOREIGN KEY (priority_set_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_rating_id_fkey" FOREIGN KEY (rating_id) REFERENCES destination_ratings(id) ON DELETE RESTRICT;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_media_submissions" add constraint "wing_media_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX wing_media_submissions_wing_jury_candidate_idx ON public.wing_media_submissions USING btree (destination_id, created_at, id) WHERE ((media_type = 'photo'::text) AND (status = 'approved'::text) AND (processed_storage_path IS NOT NULL) AND (owner_deleted_at IS NULL) AND (withdrawn_at IS NULL));
CREATE INDEX wing_media_submissions_owner_time_idx ON public.wing_media_submissions USING btree (user_id, created_at DESC);
CREATE INDEX wing_media_public_photo_destination_idx ON public.wing_media_submissions USING btree (destination_id, created_at DESC, id) WHERE (wing_media_is_public_status(status) AND (media_type = 'photo'::text));
CREATE INDEX wing_media_submissions_approved_queue_idx ON public.wing_media_submissions USING btree (created_at, id) WHERE ((status = 'approved'::text) AND (featured_at IS NULL));
CREATE INDEX wing_media_submissions_review_queue_idx ON public.wing_media_submissions USING btree (priority DESC, quality_score DESC, created_at, id) WHERE (status = 'in_review'::text);
CREATE INDEX wing_media_submissions_mango_queue_idx ON public.wing_media_submissions USING btree (status, created_at DESC, id) WHERE (status = ANY (ARRAY['in_review'::text, 'approved'::text, 'rejected'::text, 'posted'::text, 'failed'::text]));
CREATE UNIQUE INDEX wing_media_submissions_one_active_priority_idx ON public.wing_media_submissions USING btree (is_publish_priority) WHERE (is_publish_priority AND (status = 'approved'::text) AND (featured_at IS NULL));
CREATE INDEX wing_media_submissions_destination_time_idx ON public.wing_media_submissions USING btree (destination_id, featured_at DESC) WHERE (featured_at IS NOT NULL);
CREATE INDEX idx_wing_media_title_card_rank ON public.wing_media_submissions USING btree (destination_id, like_count DESC, dislike_count, created_at, id) WHERE ((media_type = 'photo'::text) AND (status = 'approved'::text));
alter table "public"."wing_media_submissions" enable row level security;
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_submission_upload_intents(submission_id) ON DELETE CASCADE;
alter table "public"."wing_media_validation_receipts" add constraint "wing_media_validation_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX wing_media_validation_receipts_expiry_idx ON public.wing_media_validation_receipts USING btree (expires_at) WHERE (promoted_at IS NULL);
alter table "public"."wing_media_validation_receipts" enable row level security;
alter table "public"."wing_moderation_config" add constraint "wing_moderation_config_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_moderation_config" enable row level security;
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_moderation_decisions" add constraint "wing_moderation_decisions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_moderation_submission_time_idx ON public.wing_moderation_decisions USING btree (submission_id, evaluated_at DESC, id);
alter table "public"."wing_moderation_decisions" enable row level security;
alter table "public"."wing_nightly_run_receipts" add constraint "wing_nightly_run_receipts_selected_submission_id_fkey" FOREIGN KEY (selected_submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_nightly_run_receipts_status_date_idx ON public.wing_nightly_run_receipts USING btree (status, business_date DESC);
alter table "public"."wing_nightly_run_receipts" enable row level security;
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_badge_event_id_fkey" FOREIGN KEY (badge_event_id) REFERENCES wing_creator_badge_events(id) ON DELETE RESTRICT;
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_outbox_id_fkey" FOREIGN KEY (outbox_id) REFERENCES notification_outbox(id) ON DELETE SET NULL;
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
alter table "public"."wing_notification_receipts" add constraint "wing_notification_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_notification_receipts" enable row level security;
alter table "public"."wing_photo_derivative_jobs" add constraint "wing_photo_derivative_jobs_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_photo_derivative_claim_idx ON public.wing_photo_derivative_jobs USING btree (available_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));
alter table "public"."wing_photo_derivative_jobs" enable row level security;
CREATE INDEX wing_photo_derivative_receipts_submission_idx ON public.wing_photo_derivative_receipts USING btree (submission_id, occurred_at);
alter table "public"."wing_photo_derivative_receipts" enable row level security;
alter table "public"."wing_processing_jobs" add constraint "wing_processing_jobs_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_processing_jobs_claim_idx ON public.wing_processing_jobs USING btree (available_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));
CREATE INDEX wing_processing_jobs_stale_lease_idx ON public.wing_processing_jobs USING btree (lease_expires_at, id) WHERE (status = 'claimed'::text);
alter table "public"."wing_processing_jobs" enable row level security;
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_related_submission_id_fkey" FOREIGN KEY (related_submission_id) REFERENCES wing_media_submissions(id) ON DELETE SET NULL;
alter table "public"."wing_submission_abuse_signals" add constraint "wing_submission_abuse_signals_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_submission_abuse_signals_submission_idx ON public.wing_submission_abuse_signals USING btree (submission_id, severity, created_at DESC);
alter table "public"."wing_submission_abuse_signals" enable row level security;
alter table "public"."wing_submission_mutation_receipts" add constraint "wing_submission_mutation_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX wing_submission_mutation_receipts_owner_time_idx ON public.wing_submission_mutation_receipts USING btree (user_id, created_at DESC);
alter table "public"."wing_submission_mutation_receipts" enable row level security;
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_submission_state_transitions" add constraint "wing_submission_state_transitions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES wing_media_submissions(id) ON DELETE RESTRICT;
CREATE INDEX wing_submission_transitions_submission_time_idx ON public.wing_submission_state_transitions USING btree (submission_id, occurred_at, id);
alter table "public"."wing_submission_state_transitions" enable row level security;
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_rating_id_fkey" FOREIGN KEY (rating_id) REFERENCES destination_ratings(id) ON DELETE RESTRICT;
alter table "public"."wing_submission_upload_intents" add constraint "wing_submission_upload_intents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX wing_upload_intents_owner_expiry_idx ON public.wing_submission_upload_intents USING btree (user_id, expires_at) WHERE (status = 'reserved'::text);
CREATE UNIQUE INDEX wing_upload_intents_one_active_per_rating ON public.wing_submission_upload_intents USING btree (rating_id) WHERE ((rating_id IS NOT NULL) AND (status = ANY (ARRAY['reserved'::text, 'finalized'::text])));
alter table "public"."wing_submission_upload_intents" enable row level security;
alter table "public"."wing_user_moderation_state" add constraint "wing_user_moderation_state_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."wing_user_moderation_state" add constraint "wing_user_moderation_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."wing_user_moderation_state" enable row level security;
alter table "public"."xp_ledger" add constraint "xp_ledger_referral_id_fkey" FOREIGN KEY (referral_id) REFERENCES referral_attributions(id) NOT VALID;
CREATE INDEX xp_ledger_crawl_time_idx ON public.xp_ledger USING btree (crawl_id, created_at DESC) WHERE (crawl_id IS NOT NULL);
CREATE INDEX xp_ledger_source_time_idx ON public.xp_ledger USING btree (source, created_at DESC);
CREATE INDEX xp_ledger_destination_time_idx ON public.xp_ledger USING btree (destination_id, created_at DESC) WHERE (destination_id IS NOT NULL);
CREATE UNIQUE INDEX xp_ledger_idempotency_key_unique ON public.xp_ledger USING btree (idempotency_key);
CREATE INDEX xp_ledger_route_time_idx ON public.xp_ledger USING btree (route_id, created_at DESC) WHERE (route_id IS NOT NULL);
CREATE INDEX xp_ledger_user_time_idx ON public.xp_ledger USING btree (user_id, created_at DESC);
alter table "public"."xp_ledger" enable row level security;
drop policy if exists "badge_catalog_read" on "public"."badge_catalog";
create policy "badge_catalog_read" on "public"."badge_catalog" as PERMISSIVE for SELECT to PUBLIC using ((is_active = true));
drop policy if exists "ledger_insert_own" on "public"."buffacoin_ledger";
create policy "ledger_insert_own" on "public"."buffacoin_ledger" as PERMISSIVE for INSERT to "authenticated" with check ((user_id = auth.uid()));
drop policy if exists "ledger_select_own" on "public"."buffacoin_ledger";
create policy "ledger_select_own" on "public"."buffacoin_ledger" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "wallet_select_own" on "public"."buffacoin_wallets";
create policy "wallet_select_own" on "public"."buffacoin_wallets" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "wallets_select_own" on "public"."buffacoin_wallets";
create policy "wallets_select_own" on "public"."buffacoin_wallets" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));
drop policy if exists "crawls_delete" on "public"."crawls";
create policy "crawls_delete" on "public"."crawls" as PERMISSIVE for DELETE to PUBLIC using ((auth.uid() = user_id));
drop policy if exists "crawls_insert" on "public"."crawls";
create policy "crawls_insert" on "public"."crawls" as PERMISSIVE for INSERT to PUBLIC with check ((auth.uid() = user_id));
drop policy if exists "crawls_insert_guest" on "public"."crawls";
create policy "crawls_insert_guest" on "public"."crawls" as PERMISSIVE for INSERT to "anon" with check ((user_id IS NULL));
drop policy if exists "crawls_insert_host" on "public"."crawls";
create policy "crawls_insert_host" on "public"."crawls" as PERMISSIVE for INSERT to PUBLIC with check ((user_id = auth.uid()));
drop policy if exists "crawls_insert_self" on "public"."crawls";
create policy "crawls_insert_self" on "public"."crawls" as PERMISSIVE for INSERT to "authenticated" with check ((user_id = auth.uid()));
drop policy if exists "crawls_owner_may_detach" on "public"."crawls";
create policy "crawls_owner_may_detach" on "public"."crawls" as PERMISSIVE for UPDATE to "authenticated" using ((user_id = auth.uid())) with check (((user_id IS NULL) OR (user_id = auth.uid())));
drop policy if exists "crawls_select" on "public"."crawls";
create policy "crawls_select" on "public"."crawls" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));
drop policy if exists "crawls_select_guest" on "public"."crawls";
create policy "crawls_select_guest" on "public"."crawls" as PERMISSIVE for SELECT to "anon" using ((user_id IS NULL));
drop policy if exists "crawls_select_self" on "public"."crawls";
create policy "crawls_select_self" on "public"."crawls" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "crawls_update" on "public"."crawls";
create policy "crawls_update" on "public"."crawls" as PERMISSIVE for UPDATE to PUBLIC using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "crawls_update_host" on "public"."crawls";
create policy "crawls_update_host" on "public"."crawls" as PERMISSIVE for UPDATE to PUBLIC using ((user_id = auth.uid()));
drop policy if exists "crawls_update_self" on "public"."crawls";
create policy "crawls_update_self" on "public"."crawls" as PERMISSIVE for UPDATE to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
drop policy if exists "public read for crawl_public" on "public"."crawls";
create policy "public read for crawl_public" on "public"."crawls" as PERMISSIVE for SELECT to "anon","authenticated" using (true);
drop policy if exists "user can read own crawls" on "public"."crawls";
create policy "user can read own crawls" on "public"."crawls" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));
drop policy if exists "auth can manage own ratings" on "public"."destination_ratings";
create policy "auth can manage own ratings" on "public"."destination_ratings" as PERMISSIVE for ALL to "authenticated" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "destination_ratings_insert_own" on "public"."destination_ratings";
create policy "destination_ratings_insert_own" on "public"."destination_ratings" as PERMISSIVE for INSERT to PUBLIC with check ((user_id = auth.uid()));
drop policy if exists "guests can insert guest ratings" on "public"."destination_ratings";
create policy "guests can insert guest ratings" on "public"."destination_ratings" as PERMISSIVE for INSERT to "anon" with check ((user_id IS NULL));
drop policy if exists "guests can read guest ratings" on "public"."destination_ratings";
create policy "guests can read guest ratings" on "public"."destination_ratings" as PERMISSIVE for SELECT to "anon" using ((user_id IS NULL));
drop policy if exists "public read ratings" on "public"."destination_ratings";
create policy "public read ratings" on "public"."destination_ratings" as PERMISSIVE for SELECT to PUBLIC using (true);
drop policy if exists "user can read own ratings" on "public"."destination_ratings";
create policy "user can read own ratings" on "public"."destination_ratings" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));
drop policy if exists "public read tags" on "public"."destination_tags";
create policy "public read tags" on "public"."destination_tags" as PERMISSIVE for SELECT to PUBLIC using (true);
drop policy if exists "destinations_public_read" on "public"."destinations";
create policy "destinations_public_read" on "public"."destinations" as PERMISSIVE for SELECT to PUBLIC using (true);
drop policy if exists "destinations_write_by_creator" on "public"."destinations";
create policy "destinations_write_by_creator" on "public"."destinations" as PERMISSIVE for ALL to PUBLIC using ((created_by = auth.uid())) with check ((created_by = auth.uid()));
drop policy if exists "public read destinations" on "public"."destinations";
create policy "public read destinations" on "public"."destinations" as PERMISSIVE for SELECT to PUBLIC using (true);
drop policy if exists "engagement_flags_authenticated_read" on "public"."engagement_feature_flags";
create policy "engagement_flags_authenticated_read" on "public"."engagement_feature_flags" as PERMISSIVE for SELECT to "authenticated" using (true);
drop policy if exists "friendships_select_participant" on "public"."friendships";
create policy "friendships_select_participant" on "public"."friendships" as PERMISSIVE for SELECT to "authenticated" using (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
drop policy if exists "lb_counts_everyone_select" on "public"."lb_user_badges_counts";
create policy "lb_counts_everyone_select" on "public"."lb_user_badges_counts" as PERMISSIVE for SELECT to "anon","authenticated" using (true);
drop policy if exists "notification_outbox_own_read" on "public"."notification_outbox";
create policy "notification_outbox_own_read" on "public"."notification_outbox" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "notification_preferences_own_read" on "public"."notification_preferences";
create policy "notification_preferences_own_read" on "public"."notification_preferences" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "referral_codes_owner_read" on "public"."referral_codes";
create policy "referral_codes_owner_read" on "public"."referral_codes" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "public read routes for stop counts" on "public"."routes";
create policy "public read routes for stop counts" on "public"."routes" as PERMISSIVE for SELECT to "anon","authenticated" using (true);
drop policy if exists "routes_public_read" on "public"."routes";
create policy "routes_public_read" on "public"."routes" as PERMISSIVE for SELECT to PUBLIC using ((is_public = true));
drop policy if exists "routes_write_by_creator" on "public"."routes";
create policy "routes_write_by_creator" on "public"."routes" as PERMISSIVE for ALL to PUBLIC using ((created_by = auth.uid())) with check ((created_by = auth.uid()));
drop policy if exists "user_badges insert own" on "public"."user_badges";
create policy "user_badges insert own" on "public"."user_badges" as PERMISSIVE for INSERT to "authenticated" with check ((user_id = auth.uid()));
drop policy if exists "user_badges select own" on "public"."user_badges";
create policy "user_badges select own" on "public"."user_badges" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "user_badges_insert_block" on "public"."user_badges";
create policy "user_badges_insert_block" on "public"."user_badges" as PERMISSIVE for INSERT to PUBLIC with check (false);
drop policy if exists "user_badges_insert_own" on "public"."user_badges";
create policy "user_badges_insert_own" on "public"."user_badges" as PERMISSIVE for INSERT to "authenticated" with check ((user_id = auth.uid()));
drop policy if exists "user_badges_insert_self" on "public"."user_badges";
create policy "user_badges_insert_self" on "public"."user_badges" as PERMISSIVE for INSERT to PUBLIC with check ((user_id = auth.uid()));
drop policy if exists "user_badges_select_own" on "public"."user_badges";
create policy "user_badges_select_own" on "public"."user_badges" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "user_badges_select_self" on "public"."user_badges";
create policy "user_badges_select_self" on "public"."user_badges" as PERMISSIVE for SELECT to PUBLIC using ((user_id = auth.uid()));
drop policy if exists "users can insert their own badges" on "public"."user_badges";
create policy "users can insert their own badges" on "public"."user_badges" as PERMISSIVE for INSERT to "authenticated" with check ((user_id = auth.uid()));
drop policy if exists "users can select their own badges" on "public"."user_badges";
create policy "users can select their own badges" on "public"."user_badges" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
drop policy if exists "blocks_select_owner" on "public"."user_blocks";
create policy "blocks_select_owner" on "public"."user_blocks" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() = blocker_id));
drop policy if exists "user_destination_favorites_own_delete" on "public"."user_destination_favorites";
create policy "user_destination_favorites_own_delete" on "public"."user_destination_favorites" as PERMISSIVE for DELETE to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "user_destination_favorites_own_insert" on "public"."user_destination_favorites";
create policy "user_destination_favorites_own_insert" on "public"."user_destination_favorites" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "user_destination_favorites_own_select" on "public"."user_destination_favorites";
create policy "user_destination_favorites_own_select" on "public"."user_destination_favorites" as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "user_events_insert_own_or_anonymous" on "public"."user_events";
create policy "user_events_insert_own_or_anonymous" on "public"."user_events" as PERMISSIVE for INSERT to "anon","authenticated" with check ((((auth.uid() IS NULL) AND (user_id IS NULL) AND (anonymous_id IS NOT NULL)) OR ((auth.uid() IS NOT NULL) AND ((user_id = auth.uid()) OR (user_id IS NULL)) AND (anonymous_id IS NOT NULL))));
drop policy if exists "user_want_to_try_own_delete" on "public"."user_want_to_try";
create policy "user_want_to_try_own_delete" on "public"."user_want_to_try" as PERMISSIVE for DELETE to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "user_want_to_try_own_insert" on "public"."user_want_to_try";
create policy "user_want_to_try_own_insert" on "public"."user_want_to_try" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "user_want_to_try_own_select" on "public"."user_want_to_try";
create policy "user_want_to_try_own_select" on "public"."user_want_to_try" as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "public read basic user profile" on "public"."users";
create policy "public read basic user profile" on "public"."users" as PERMISSIVE for SELECT to "anon","authenticated" using (true);
drop policy if exists "users self read" on "public"."users";
create policy "users self read" on "public"."users" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));
drop policy if exists "users self update" on "public"."users";
create policy "users self update" on "public"."users" as PERMISSIVE for UPDATE to PUBLIC using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "users_insert_own" on "public"."users";
create policy "users_insert_own" on "public"."users" as PERMISSIVE for INSERT to PUBLIC with check ((auth.uid() = user_id));
drop policy if exists "users_rw_self" on "public"."users";
create policy "users_rw_self" on "public"."users" as PERMISSIVE for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
drop policy if exists "users_select_own" on "public"."users";
create policy "users_select_own" on "public"."users" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() = user_id));
drop policy if exists "users_update_own" on "public"."users";
create policy "users_update_own" on "public"."users" as PERMISSIVE for UPDATE to "authenticated" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "wing_jury_photo_vote_counts_public_select" on "public"."wing_jury_photo_vote_counts";
create policy "wing_jury_photo_vote_counts_public_select" on "public"."wing_jury_photo_vote_counts" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text) AND private.is_public_wing_jury_photo(submission_id)));
drop policy if exists "wing_jury_votes_own_insert" on "public"."wing_jury_votes";
create policy "wing_jury_votes_own_insert" on "public"."wing_jury_votes" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "wing_jury_votes_own_select" on "public"."wing_jury_votes";
create policy "wing_jury_votes_own_select" on "public"."wing_jury_votes" as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(( SELECT (auth.jwt() ->> 'is_anonymous'::text)), 'false'::text) = 'false'::text)));
drop policy if exists "photo_votes_delete_own" on "public"."wing_media_photo_votes";
create policy "photo_votes_delete_own" on "public"."wing_media_photo_votes" as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "photo_votes_insert_own" on "public"."wing_media_photo_votes";
create policy "photo_votes_insert_own" on "public"."wing_media_photo_votes" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "photo_votes_select_own" on "public"."wing_media_photo_votes";
create policy "photo_votes_select_own" on "public"."wing_media_photo_votes" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "photo_votes_update_own" on "public"."wing_media_photo_votes";
create policy "photo_votes_update_own" on "public"."wing_media_photo_votes" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "xp_ledger_select_own" on "public"."xp_ledger";
create policy "xp_ledger_select_own" on "public"."xp_ledger" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() = user_id));
drop policy if exists "Auth delete badge icons" on "storage"."objects";
create policy "Auth delete badge icons" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using ((bucket_id = 'badge_icons'::text));
drop policy if exists "Auth update badge icons" on "storage"."objects";
create policy "Auth update badge icons" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using ((bucket_id = 'badge_icons'::text));
drop policy if exists "Auth write badge icons" on "storage"."objects";
create policy "Auth write badge icons" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check ((bucket_id = 'badge_icons'::text));
drop policy if exists "Public read badge icons" on "storage"."objects";
create policy "Public read badge icons" on "storage"."objects" as PERMISSIVE for SELECT to "anon","authenticated" using ((bucket_id = 'badge_icons'::text));
drop policy if exists "wing_shot_staging_delete" on "storage"."objects";
create policy "wing_shot_staging_delete" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'wing-shot-staging'::text) AND (name ~~ ((auth.uid())::text || '/%'::text))));
drop policy if exists "wing_submissions_original_insert" on "storage"."objects";
create policy "wing_submissions_original_insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'wing-submissions'::text) AND (owner_id = (auth.uid())::text) AND (split_part(name, '/'::text, 1) = 'originals'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND (split_part(name, '/'::text, 3) ~ '^[0-9a-f-]{36}$'::text) AND (split_part(name, '/'::text, 4) = 'source'::text) AND (split_part(name, '/'::text, 5) = ''::text) AND wing_can_upload_reserved_original(name)));
CREATE TRIGGER android_qa_welcome_coins AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION android_qa_welcome_coins();
CREATE TRIGGER auth_user_referral_code AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION ensure_new_user_referral_code();
CREATE TRIGGER auth_user_referral_deletion_signal BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION flag_referral_account_deletion();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER referral_code_profile_eligibility_auth AFTER INSERT OR UPDATE OF deleted_at, banned_until ON auth.users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_auth_change();
CREATE TRIGGER guard_android_qa_coin_bonus BEFORE INSERT ON public.buffacoin_ledger FOR EACH ROW EXECUTE FUNCTION guard_android_qa_coin_bonus();
CREATE TRIGGER trg_buffacoin_ledger_apply_delta AFTER INSERT ON public.buffacoin_ledger FOR EACH ROW EXECUTE FUNCTION buffacoin_apply_ledger_delta();
CREATE TRIGGER trg_buffacoin_wallets_updated_at BEFORE UPDATE ON public.buffacoin_wallets FOR EACH ROW EXECUTE FUNCTION buffacoin_wallets_touch_updated_at();
CREATE TRIGGER trg_crawl_after_update AFTER UPDATE ON public.crawls FOR EACH ROW WHEN ((new.status IS DISTINCT FROM old.status)) EXECUTE FUNCTION on_crawl_after_update();
CREATE TRIGGER trg_crawl_after_write AFTER INSERT OR UPDATE OF end_time ON public.crawls FOR EACH ROW EXECUTE FUNCTION "Badge_Add_Crawl_Milestones"();
CREATE TRIGGER destination_rating_friend_notification AFTER INSERT ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION enqueue_friend_rating_notification();
CREATE TRIGGER destination_ratings_lock_collection_identities BEFORE INSERT OR DELETE OR UPDATE ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION private.lock_rating_collection_identities();
CREATE TRIGGER destination_ratings_remove_invalid_favorite AFTER DELETE OR UPDATE ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION private.remove_favorite_after_rating_delete();
CREATE TRIGGER destination_ratings_remove_want_to_try AFTER INSERT ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION private.remove_want_to_try_after_rating();
CREATE TRIGGER destination_ratings_update_want_to_try AFTER UPDATE ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION private.remove_want_to_try_after_rating();
CREATE TRIGGER guard_buffacoin_rating_writes BEFORE INSERT OR UPDATE OF is_buffacoin ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION guard_buffacoin_rating_writes();
CREATE TRIGGER trg_rating_after_insert AFTER INSERT ON public.destination_ratings FOR EACH ROW EXECUTE FUNCTION "Badge_Add_Rating_Milestones"();
CREATE TRIGGER trg_user_badges_ad AFTER DELETE ON public.user_badges FOR EACH ROW EXECUTE FUNCTION tf_user_badges_count_after_del();
CREATE TRIGGER trg_user_badges_ai AFTER INSERT ON public.user_badges FOR EACH ROW EXECUTE FUNCTION tf_user_badges_count_after_ins();
CREATE TRIGGER trg_user_badges_au AFTER UPDATE OF user_id ON public.user_badges FOR EACH ROW EXECUTE FUNCTION tf_user_badges_count_after_upd();
CREATE TRIGGER user_destination_favorites_validate_insert BEFORE INSERT ON public.user_destination_favorites FOR EACH ROW EXECUTE FUNCTION private.validate_favorite_insert();
CREATE TRIGGER user_want_to_try_validate_insert BEFORE INSERT ON public.user_want_to_try FOR EACH ROW EXECUTE FUNCTION private.validate_want_to_try_insert();
CREATE TRIGGER referral_code_profile_eligibility AFTER INSERT OR UPDATE OF user_id ON public.users FOR EACH ROW EXECUTE FUNCTION restore_referral_code_after_profile_insert();
CREATE TRIGGER referral_code_profile_eligibility_delete AFTER DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_profile_delete();
CREATE TRIGGER trg_new_user_starting_coins AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION give_new_user_starting_coins();
CREATE TRIGGER wing_creator_badge_events_append_only BEFORE DELETE OR UPDATE ON public.wing_creator_badge_events FOR EACH ROW EXECUTE FUNCTION wing_creator_audit_append_only();
CREATE TRIGGER wing_creator_badge_notification AFTER INSERT ON public.wing_creator_badge_events FOR EACH ROW EXECUTE FUNCTION enqueue_wing_creator_badge_notification();
CREATE TRIGGER wing_creator_reward_events_append_only BEFORE DELETE OR UPDATE ON public.wing_creator_reward_events FOR EACH ROW EXECUTE FUNCTION wing_creator_audit_append_only();
CREATE TRIGGER wing_jury_votes_enforce_immutability BEFORE DELETE OR UPDATE ON public.wing_jury_votes FOR EACH ROW EXECUTE FUNCTION private.enforce_wing_jury_vote_immutability();
CREATE TRIGGER wing_jury_votes_refresh_counts AFTER INSERT OR DELETE ON public.wing_jury_votes FOR EACH ROW EXECUTE FUNCTION private.refresh_wing_jury_photo_vote_counts();
CREATE TRIGGER wing_jury_votes_validate_insert BEFORE INSERT ON public.wing_jury_votes FOR EACH ROW EXECUTE FUNCTION private.validate_wing_jury_vote_insert();
CREATE TRIGGER wing_media_cleanup_receipts_append_only BEFORE DELETE OR UPDATE ON public.wing_media_cleanup_receipts FOR EACH ROW EXECUTE FUNCTION wing_reject_cleanup_receipt_mutation();
CREATE TRIGGER trg_refresh_wing_media_photo_vote_counts AFTER INSERT OR DELETE OR UPDATE ON public.wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.refresh_wing_media_photo_vote_counts();
CREATE TRIGGER trg_validate_wing_media_photo_vote BEFORE INSERT OR UPDATE ON public.wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.validate_wing_media_photo_vote();
CREATE TRIGGER mango_clear_ineligible_priority BEFORE UPDATE OF status, featured_at, is_publish_priority ON public.wing_media_submissions FOR EACH ROW EXECUTE FUNCTION mango_clear_ineligible_priority();
CREATE TRIGGER wing_media_submissions_owner_pseudonymization BEFORE UPDATE OF user_id ON public.wing_media_submissions FOR EACH ROW EXECUTE FUNCTION wing_apply_owner_pseudonymization();
CREATE TRIGGER wing_photo_approval_guard BEFORE UPDATE OF status ON public.wing_media_submissions FOR EACH ROW EXECUTE FUNCTION guard_wing_photo_approval();
CREATE TRIGGER wing_photo_upload_derivatives AFTER INSERT ON public.wing_media_submissions FOR EACH ROW EXECUTE FUNCTION enqueue_wing_photo_upload_derivatives();
CREATE TRIGGER wing_notification_receipts_append_only BEFORE DELETE OR UPDATE ON public.wing_notification_receipts FOR EACH ROW EXECUTE FUNCTION wing_notification_receipt_append_only();
CREATE TRIGGER wing_photo_receipt_append_only BEFORE DELETE OR UPDATE ON public.wing_photo_derivative_receipts FOR EACH ROW EXECUTE FUNCTION wing_photo_receipt_append_only();
CREATE TRIGGER wing_legacy_photo_job_guard BEFORE INSERT OR UPDATE ON public.wing_processing_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_wing_photo_job();
CREATE TRIGGER wing_mutation_receipts_owner_pseudonymization BEFORE UPDATE OF user_id ON public.wing_submission_mutation_receipts FOR EACH ROW EXECUTE FUNCTION wing_apply_owner_pseudonymization();
CREATE TRIGGER wing_submission_creator_reward_transition AFTER INSERT ON public.wing_submission_state_transitions FOR EACH ROW EXECUTE FUNCTION wing_creator_reward_on_transition();
CREATE TRIGGER wing_submission_notification_transition AFTER INSERT ON public.wing_submission_state_transitions FOR EACH ROW EXECUTE FUNCTION enqueue_wing_submission_notification();
CREATE TRIGGER wing_photo_only_upload_intent BEFORE INSERT OR UPDATE OF media_type ON public.wing_submission_upload_intents FOR EACH ROW EXECUTE FUNCTION reject_new_wing_video_upload_intent();
CREATE TRIGGER wing_upload_intent_status_guard BEFORE UPDATE OF status ON public.wing_submission_upload_intents FOR EACH ROW EXECUTE FUNCTION wing_guard_upload_intent_status();
revoke all on schema "public" from PUBLIC,anon,authenticated,service_role;
grant USAGE on schema "public" to "pg_database_owner";
grant CREATE on schema "public" to "pg_database_owner";
grant USAGE on schema "public" to PUBLIC;
grant USAGE on schema "public" to "anon";
grant USAGE on schema "public" to "authenticated";
grant USAGE on schema "public" to "service_role";
revoke all on schema "private" from PUBLIC,anon,authenticated,service_role;
revoke all on table "public"."android_qa_early_bird_eligibility" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant SELECT on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant UPDATE on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant DELETE on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant TRUNCATE on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant REFERENCES on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant TRIGGER on table "public"."android_qa_early_bird_eligibility" to "service_role";
grant MAINTAIN on table "public"."android_qa_early_bird_eligibility" to "service_role";
revoke all on table "public"."api_rate_limits" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."api_rate_limits" to "service_role";
grant SELECT on table "public"."api_rate_limits" to "service_role";
grant UPDATE on table "public"."api_rate_limits" to "service_role";
grant DELETE on table "public"."api_rate_limits" to "service_role";
grant TRUNCATE on table "public"."api_rate_limits" to "service_role";
grant REFERENCES on table "public"."api_rate_limits" to "service_role";
grant TRIGGER on table "public"."api_rate_limits" to "service_role";
grant MAINTAIN on table "public"."api_rate_limits" to "service_role";
revoke all on table "public"."app_user_roles" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."app_user_roles" to "service_role";
grant SELECT on table "public"."app_user_roles" to "service_role";
grant UPDATE on table "public"."app_user_roles" to "service_role";
grant DELETE on table "public"."app_user_roles" to "service_role";
grant TRUNCATE on table "public"."app_user_roles" to "service_role";
grant REFERENCES on table "public"."app_user_roles" to "service_role";
grant TRIGGER on table "public"."app_user_roles" to "service_role";
grant MAINTAIN on table "public"."app_user_roles" to "service_role";
revoke all on table "public"."badge_catalog" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."badge_catalog" to "anon";
grant SELECT on table "public"."badge_catalog" to "anon";
grant UPDATE on table "public"."badge_catalog" to "anon";
grant DELETE on table "public"."badge_catalog" to "anon";
grant TRUNCATE on table "public"."badge_catalog" to "anon";
grant REFERENCES on table "public"."badge_catalog" to "anon";
grant TRIGGER on table "public"."badge_catalog" to "anon";
grant MAINTAIN on table "public"."badge_catalog" to "anon";
grant INSERT on table "public"."badge_catalog" to "authenticated";
grant SELECT on table "public"."badge_catalog" to "authenticated";
grant UPDATE on table "public"."badge_catalog" to "authenticated";
grant DELETE on table "public"."badge_catalog" to "authenticated";
grant TRUNCATE on table "public"."badge_catalog" to "authenticated";
grant REFERENCES on table "public"."badge_catalog" to "authenticated";
grant TRIGGER on table "public"."badge_catalog" to "authenticated";
grant MAINTAIN on table "public"."badge_catalog" to "authenticated";
grant INSERT on table "public"."badge_catalog" to "service_role";
grant SELECT on table "public"."badge_catalog" to "service_role";
grant UPDATE on table "public"."badge_catalog" to "service_role";
grant DELETE on table "public"."badge_catalog" to "service_role";
grant TRUNCATE on table "public"."badge_catalog" to "service_role";
grant REFERENCES on table "public"."badge_catalog" to "service_role";
grant TRIGGER on table "public"."badge_catalog" to "service_role";
grant MAINTAIN on table "public"."badge_catalog" to "service_role";
revoke all on table "public"."buffacoin_ledger" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."buffacoin_ledger" to "anon";
grant SELECT on table "public"."buffacoin_ledger" to "anon";
grant UPDATE on table "public"."buffacoin_ledger" to "anon";
grant DELETE on table "public"."buffacoin_ledger" to "anon";
grant TRUNCATE on table "public"."buffacoin_ledger" to "anon";
grant REFERENCES on table "public"."buffacoin_ledger" to "anon";
grant TRIGGER on table "public"."buffacoin_ledger" to "anon";
grant MAINTAIN on table "public"."buffacoin_ledger" to "anon";
grant INSERT on table "public"."buffacoin_ledger" to "authenticated";
grant SELECT on table "public"."buffacoin_ledger" to "authenticated";
grant UPDATE on table "public"."buffacoin_ledger" to "authenticated";
grant DELETE on table "public"."buffacoin_ledger" to "authenticated";
grant TRUNCATE on table "public"."buffacoin_ledger" to "authenticated";
grant REFERENCES on table "public"."buffacoin_ledger" to "authenticated";
grant TRIGGER on table "public"."buffacoin_ledger" to "authenticated";
grant MAINTAIN on table "public"."buffacoin_ledger" to "authenticated";
grant INSERT on table "public"."buffacoin_ledger" to "service_role";
grant SELECT on table "public"."buffacoin_ledger" to "service_role";
grant UPDATE on table "public"."buffacoin_ledger" to "service_role";
grant DELETE on table "public"."buffacoin_ledger" to "service_role";
grant TRUNCATE on table "public"."buffacoin_ledger" to "service_role";
grant REFERENCES on table "public"."buffacoin_ledger" to "service_role";
grant TRIGGER on table "public"."buffacoin_ledger" to "service_role";
grant MAINTAIN on table "public"."buffacoin_ledger" to "service_role";
revoke all on table "public"."buffacoin_wallets" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."buffacoin_wallets" to "anon";
grant SELECT on table "public"."buffacoin_wallets" to "anon";
grant UPDATE on table "public"."buffacoin_wallets" to "anon";
grant DELETE on table "public"."buffacoin_wallets" to "anon";
grant TRUNCATE on table "public"."buffacoin_wallets" to "anon";
grant REFERENCES on table "public"."buffacoin_wallets" to "anon";
grant TRIGGER on table "public"."buffacoin_wallets" to "anon";
grant MAINTAIN on table "public"."buffacoin_wallets" to "anon";
grant INSERT on table "public"."buffacoin_wallets" to "authenticated";
grant SELECT on table "public"."buffacoin_wallets" to "authenticated";
grant UPDATE on table "public"."buffacoin_wallets" to "authenticated";
grant DELETE on table "public"."buffacoin_wallets" to "authenticated";
grant TRUNCATE on table "public"."buffacoin_wallets" to "authenticated";
grant REFERENCES on table "public"."buffacoin_wallets" to "authenticated";
grant TRIGGER on table "public"."buffacoin_wallets" to "authenticated";
grant MAINTAIN on table "public"."buffacoin_wallets" to "authenticated";
grant INSERT on table "public"."buffacoin_wallets" to "service_role";
grant SELECT on table "public"."buffacoin_wallets" to "service_role";
grant UPDATE on table "public"."buffacoin_wallets" to "service_role";
grant DELETE on table "public"."buffacoin_wallets" to "service_role";
grant TRUNCATE on table "public"."buffacoin_wallets" to "service_role";
grant REFERENCES on table "public"."buffacoin_wallets" to "service_role";
grant TRIGGER on table "public"."buffacoin_wallets" to "service_role";
grant MAINTAIN on table "public"."buffacoin_wallets" to "service_role";
revoke all on table "public"."crawls" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."crawls" to "anon";
grant SELECT on table "public"."crawls" to "anon";
grant UPDATE on table "public"."crawls" to "anon";
grant DELETE on table "public"."crawls" to "anon";
grant TRUNCATE on table "public"."crawls" to "anon";
grant REFERENCES on table "public"."crawls" to "anon";
grant TRIGGER on table "public"."crawls" to "anon";
grant MAINTAIN on table "public"."crawls" to "anon";
grant INSERT on table "public"."crawls" to "authenticated";
grant SELECT on table "public"."crawls" to "authenticated";
grant UPDATE on table "public"."crawls" to "authenticated";
grant DELETE on table "public"."crawls" to "authenticated";
grant TRUNCATE on table "public"."crawls" to "authenticated";
grant REFERENCES on table "public"."crawls" to "authenticated";
grant TRIGGER on table "public"."crawls" to "authenticated";
grant MAINTAIN on table "public"."crawls" to "authenticated";
grant INSERT on table "public"."crawls" to "service_role";
grant SELECT on table "public"."crawls" to "service_role";
grant UPDATE on table "public"."crawls" to "service_role";
grant DELETE on table "public"."crawls" to "service_role";
grant TRUNCATE on table "public"."crawls" to "service_role";
grant REFERENCES on table "public"."crawls" to "service_role";
grant TRIGGER on table "public"."crawls" to "service_role";
grant MAINTAIN on table "public"."crawls" to "service_role";
revoke all on table "public"."destination_ratings" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."destination_ratings" to "anon";
grant SELECT on table "public"."destination_ratings" to "anon";
grant UPDATE on table "public"."destination_ratings" to "anon";
grant DELETE on table "public"."destination_ratings" to "anon";
grant TRUNCATE on table "public"."destination_ratings" to "anon";
grant REFERENCES on table "public"."destination_ratings" to "anon";
grant TRIGGER on table "public"."destination_ratings" to "anon";
grant MAINTAIN on table "public"."destination_ratings" to "anon";
grant INSERT on table "public"."destination_ratings" to "authenticated";
grant SELECT on table "public"."destination_ratings" to "authenticated";
grant UPDATE on table "public"."destination_ratings" to "authenticated";
grant DELETE on table "public"."destination_ratings" to "authenticated";
grant TRUNCATE on table "public"."destination_ratings" to "authenticated";
grant REFERENCES on table "public"."destination_ratings" to "authenticated";
grant TRIGGER on table "public"."destination_ratings" to "authenticated";
grant MAINTAIN on table "public"."destination_ratings" to "authenticated";
grant INSERT on table "public"."destination_ratings" to "service_role";
grant SELECT on table "public"."destination_ratings" to "service_role";
grant UPDATE on table "public"."destination_ratings" to "service_role";
grant DELETE on table "public"."destination_ratings" to "service_role";
grant TRUNCATE on table "public"."destination_ratings" to "service_role";
grant REFERENCES on table "public"."destination_ratings" to "service_role";
grant TRIGGER on table "public"."destination_ratings" to "service_role";
grant MAINTAIN on table "public"."destination_ratings" to "service_role";
revoke all on table "public"."destination_tags" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."destination_tags" to "anon";
grant SELECT on table "public"."destination_tags" to "anon";
grant UPDATE on table "public"."destination_tags" to "anon";
grant DELETE on table "public"."destination_tags" to "anon";
grant TRUNCATE on table "public"."destination_tags" to "anon";
grant REFERENCES on table "public"."destination_tags" to "anon";
grant TRIGGER on table "public"."destination_tags" to "anon";
grant MAINTAIN on table "public"."destination_tags" to "anon";
grant INSERT on table "public"."destination_tags" to "authenticated";
grant SELECT on table "public"."destination_tags" to "authenticated";
grant UPDATE on table "public"."destination_tags" to "authenticated";
grant DELETE on table "public"."destination_tags" to "authenticated";
grant TRUNCATE on table "public"."destination_tags" to "authenticated";
grant REFERENCES on table "public"."destination_tags" to "authenticated";
grant TRIGGER on table "public"."destination_tags" to "authenticated";
grant MAINTAIN on table "public"."destination_tags" to "authenticated";
grant INSERT on table "public"."destination_tags" to "service_role";
grant SELECT on table "public"."destination_tags" to "service_role";
grant UPDATE on table "public"."destination_tags" to "service_role";
grant DELETE on table "public"."destination_tags" to "service_role";
grant TRUNCATE on table "public"."destination_tags" to "service_role";
grant REFERENCES on table "public"."destination_tags" to "service_role";
grant TRIGGER on table "public"."destination_tags" to "service_role";
grant MAINTAIN on table "public"."destination_tags" to "service_role";
revoke all on table "public"."destinations" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."destinations" to "anon";
grant SELECT on table "public"."destinations" to "anon";
grant UPDATE on table "public"."destinations" to "anon";
grant DELETE on table "public"."destinations" to "anon";
grant TRUNCATE on table "public"."destinations" to "anon";
grant REFERENCES on table "public"."destinations" to "anon";
grant TRIGGER on table "public"."destinations" to "anon";
grant MAINTAIN on table "public"."destinations" to "anon";
grant INSERT on table "public"."destinations" to "authenticated";
grant SELECT on table "public"."destinations" to "authenticated";
grant UPDATE on table "public"."destinations" to "authenticated";
grant DELETE on table "public"."destinations" to "authenticated";
grant TRUNCATE on table "public"."destinations" to "authenticated";
grant REFERENCES on table "public"."destinations" to "authenticated";
grant TRIGGER on table "public"."destinations" to "authenticated";
grant MAINTAIN on table "public"."destinations" to "authenticated";
grant INSERT on table "public"."destinations" to "service_role";
grant SELECT on table "public"."destinations" to "service_role";
grant UPDATE on table "public"."destinations" to "service_role";
grant DELETE on table "public"."destinations" to "service_role";
grant TRUNCATE on table "public"."destinations" to "service_role";
grant REFERENCES on table "public"."destinations" to "service_role";
grant TRIGGER on table "public"."destinations" to "service_role";
grant MAINTAIN on table "public"."destinations" to "service_role";
revoke all on table "public"."engagement_feature_flags" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."engagement_feature_flags" to "service_role";
grant SELECT on table "public"."engagement_feature_flags" to "service_role";
grant UPDATE on table "public"."engagement_feature_flags" to "service_role";
grant DELETE on table "public"."engagement_feature_flags" to "service_role";
grant TRUNCATE on table "public"."engagement_feature_flags" to "service_role";
grant REFERENCES on table "public"."engagement_feature_flags" to "service_role";
grant TRIGGER on table "public"."engagement_feature_flags" to "service_role";
grant MAINTAIN on table "public"."engagement_feature_flags" to "service_role";
grant SELECT on table "public"."engagement_feature_flags" to "authenticated";
revoke all on table "public"."friendships" from PUBLIC,anon,authenticated,service_role;
grant SELECT on table "public"."friendships" to "anon";
grant TRUNCATE on table "public"."friendships" to "anon";
grant REFERENCES on table "public"."friendships" to "anon";
grant TRIGGER on table "public"."friendships" to "anon";
grant MAINTAIN on table "public"."friendships" to "anon";
grant SELECT on table "public"."friendships" to "authenticated";
grant TRUNCATE on table "public"."friendships" to "authenticated";
grant REFERENCES on table "public"."friendships" to "authenticated";
grant TRIGGER on table "public"."friendships" to "authenticated";
grant MAINTAIN on table "public"."friendships" to "authenticated";
grant INSERT on table "public"."friendships" to "service_role";
grant SELECT on table "public"."friendships" to "service_role";
grant UPDATE on table "public"."friendships" to "service_role";
grant DELETE on table "public"."friendships" to "service_role";
grant TRUNCATE on table "public"."friendships" to "service_role";
grant REFERENCES on table "public"."friendships" to "service_role";
grant TRIGGER on table "public"."friendships" to "service_role";
grant MAINTAIN on table "public"."friendships" to "service_role";
revoke all on table "public"."lb_user_badges_counts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."lb_user_badges_counts" to "anon";
grant SELECT on table "public"."lb_user_badges_counts" to "anon";
grant UPDATE on table "public"."lb_user_badges_counts" to "anon";
grant DELETE on table "public"."lb_user_badges_counts" to "anon";
grant TRUNCATE on table "public"."lb_user_badges_counts" to "anon";
grant REFERENCES on table "public"."lb_user_badges_counts" to "anon";
grant TRIGGER on table "public"."lb_user_badges_counts" to "anon";
grant MAINTAIN on table "public"."lb_user_badges_counts" to "anon";
grant INSERT on table "public"."lb_user_badges_counts" to "authenticated";
grant SELECT on table "public"."lb_user_badges_counts" to "authenticated";
grant UPDATE on table "public"."lb_user_badges_counts" to "authenticated";
grant DELETE on table "public"."lb_user_badges_counts" to "authenticated";
grant TRUNCATE on table "public"."lb_user_badges_counts" to "authenticated";
grant REFERENCES on table "public"."lb_user_badges_counts" to "authenticated";
grant TRIGGER on table "public"."lb_user_badges_counts" to "authenticated";
grant MAINTAIN on table "public"."lb_user_badges_counts" to "authenticated";
grant INSERT on table "public"."lb_user_badges_counts" to "service_role";
grant SELECT on table "public"."lb_user_badges_counts" to "service_role";
grant UPDATE on table "public"."lb_user_badges_counts" to "service_role";
grant DELETE on table "public"."lb_user_badges_counts" to "service_role";
grant TRUNCATE on table "public"."lb_user_badges_counts" to "service_role";
grant REFERENCES on table "public"."lb_user_badges_counts" to "service_role";
grant TRIGGER on table "public"."lb_user_badges_counts" to "service_role";
grant MAINTAIN on table "public"."lb_user_badges_counts" to "service_role";
revoke all on table "public"."level_thresholds" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."level_thresholds" to "anon";
grant SELECT on table "public"."level_thresholds" to "anon";
grant UPDATE on table "public"."level_thresholds" to "anon";
grant DELETE on table "public"."level_thresholds" to "anon";
grant TRUNCATE on table "public"."level_thresholds" to "anon";
grant REFERENCES on table "public"."level_thresholds" to "anon";
grant TRIGGER on table "public"."level_thresholds" to "anon";
grant MAINTAIN on table "public"."level_thresholds" to "anon";
grant INSERT on table "public"."level_thresholds" to "authenticated";
grant SELECT on table "public"."level_thresholds" to "authenticated";
grant UPDATE on table "public"."level_thresholds" to "authenticated";
grant DELETE on table "public"."level_thresholds" to "authenticated";
grant TRUNCATE on table "public"."level_thresholds" to "authenticated";
grant REFERENCES on table "public"."level_thresholds" to "authenticated";
grant TRIGGER on table "public"."level_thresholds" to "authenticated";
grant MAINTAIN on table "public"."level_thresholds" to "authenticated";
grant INSERT on table "public"."level_thresholds" to "service_role";
grant SELECT on table "public"."level_thresholds" to "service_role";
grant UPDATE on table "public"."level_thresholds" to "service_role";
grant DELETE on table "public"."level_thresholds" to "service_role";
grant TRUNCATE on table "public"."level_thresholds" to "service_role";
grant REFERENCES on table "public"."level_thresholds" to "service_role";
grant TRIGGER on table "public"."level_thresholds" to "service_role";
grant MAINTAIN on table "public"."level_thresholds" to "service_role";
revoke all on table "public"."notification_outbox" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."notification_outbox" to "service_role";
grant SELECT on table "public"."notification_outbox" to "service_role";
grant UPDATE on table "public"."notification_outbox" to "service_role";
grant DELETE on table "public"."notification_outbox" to "service_role";
grant TRUNCATE on table "public"."notification_outbox" to "service_role";
grant REFERENCES on table "public"."notification_outbox" to "service_role";
grant TRIGGER on table "public"."notification_outbox" to "service_role";
grant MAINTAIN on table "public"."notification_outbox" to "service_role";
grant SELECT on table "public"."notification_outbox" to "authenticated";
revoke all on table "public"."notification_preferences" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."notification_preferences" to "service_role";
grant SELECT on table "public"."notification_preferences" to "service_role";
grant UPDATE on table "public"."notification_preferences" to "service_role";
grant DELETE on table "public"."notification_preferences" to "service_role";
grant TRUNCATE on table "public"."notification_preferences" to "service_role";
grant REFERENCES on table "public"."notification_preferences" to "service_role";
grant TRIGGER on table "public"."notification_preferences" to "service_role";
grant MAINTAIN on table "public"."notification_preferences" to "service_role";
grant SELECT on table "public"."notification_preferences" to "authenticated";
revoke all on table "public"."referral_abuse_signals" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."referral_abuse_signals" to "service_role";
grant SELECT on table "public"."referral_abuse_signals" to "service_role";
grant UPDATE on table "public"."referral_abuse_signals" to "service_role";
grant DELETE on table "public"."referral_abuse_signals" to "service_role";
grant TRUNCATE on table "public"."referral_abuse_signals" to "service_role";
grant REFERENCES on table "public"."referral_abuse_signals" to "service_role";
grant TRIGGER on table "public"."referral_abuse_signals" to "service_role";
grant MAINTAIN on table "public"."referral_abuse_signals" to "service_role";
revoke all on table "public"."referral_attributions" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."referral_attributions" to "service_role";
grant SELECT on table "public"."referral_attributions" to "service_role";
grant UPDATE on table "public"."referral_attributions" to "service_role";
grant DELETE on table "public"."referral_attributions" to "service_role";
grant TRUNCATE on table "public"."referral_attributions" to "service_role";
grant REFERENCES on table "public"."referral_attributions" to "service_role";
grant TRIGGER on table "public"."referral_attributions" to "service_role";
grant MAINTAIN on table "public"."referral_attributions" to "service_role";
revoke all on table "public"."referral_codes" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."referral_codes" to "service_role";
grant SELECT on table "public"."referral_codes" to "service_role";
grant UPDATE on table "public"."referral_codes" to "service_role";
grant DELETE on table "public"."referral_codes" to "service_role";
grant TRUNCATE on table "public"."referral_codes" to "service_role";
grant REFERENCES on table "public"."referral_codes" to "service_role";
grant TRIGGER on table "public"."referral_codes" to "service_role";
grant MAINTAIN on table "public"."referral_codes" to "service_role";
grant SELECT on table "public"."referral_codes" to "authenticated";
revoke all on table "public"."route_travel_tag" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."route_travel_tag" to "anon";
grant SELECT on table "public"."route_travel_tag" to "anon";
grant UPDATE on table "public"."route_travel_tag" to "anon";
grant DELETE on table "public"."route_travel_tag" to "anon";
grant TRUNCATE on table "public"."route_travel_tag" to "anon";
grant REFERENCES on table "public"."route_travel_tag" to "anon";
grant TRIGGER on table "public"."route_travel_tag" to "anon";
grant MAINTAIN on table "public"."route_travel_tag" to "anon";
grant INSERT on table "public"."route_travel_tag" to "authenticated";
grant SELECT on table "public"."route_travel_tag" to "authenticated";
grant UPDATE on table "public"."route_travel_tag" to "authenticated";
grant DELETE on table "public"."route_travel_tag" to "authenticated";
grant TRUNCATE on table "public"."route_travel_tag" to "authenticated";
grant REFERENCES on table "public"."route_travel_tag" to "authenticated";
grant TRIGGER on table "public"."route_travel_tag" to "authenticated";
grant MAINTAIN on table "public"."route_travel_tag" to "authenticated";
grant INSERT on table "public"."route_travel_tag" to "service_role";
grant SELECT on table "public"."route_travel_tag" to "service_role";
grant UPDATE on table "public"."route_travel_tag" to "service_role";
grant DELETE on table "public"."route_travel_tag" to "service_role";
grant TRUNCATE on table "public"."route_travel_tag" to "service_role";
grant REFERENCES on table "public"."route_travel_tag" to "service_role";
grant TRIGGER on table "public"."route_travel_tag" to "service_role";
grant MAINTAIN on table "public"."route_travel_tag" to "service_role";
revoke all on table "public"."routes" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."routes" to "anon";
grant SELECT on table "public"."routes" to "anon";
grant UPDATE on table "public"."routes" to "anon";
grant DELETE on table "public"."routes" to "anon";
grant TRUNCATE on table "public"."routes" to "anon";
grant REFERENCES on table "public"."routes" to "anon";
grant TRIGGER on table "public"."routes" to "anon";
grant MAINTAIN on table "public"."routes" to "anon";
grant INSERT on table "public"."routes" to "authenticated";
grant SELECT on table "public"."routes" to "authenticated";
grant UPDATE on table "public"."routes" to "authenticated";
grant DELETE on table "public"."routes" to "authenticated";
grant TRUNCATE on table "public"."routes" to "authenticated";
grant REFERENCES on table "public"."routes" to "authenticated";
grant TRIGGER on table "public"."routes" to "authenticated";
grant MAINTAIN on table "public"."routes" to "authenticated";
grant INSERT on table "public"."routes" to "service_role";
grant SELECT on table "public"."routes" to "service_role";
grant UPDATE on table "public"."routes" to "service_role";
grant DELETE on table "public"."routes" to "service_role";
grant TRUNCATE on table "public"."routes" to "service_role";
grant REFERENCES on table "public"."routes" to "service_role";
grant TRIGGER on table "public"."routes" to "service_role";
grant MAINTAIN on table "public"."routes" to "service_role";
revoke all on table "public"."social_content_jobs" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."social_content_jobs" to "service_role";
grant SELECT on table "public"."social_content_jobs" to "service_role";
grant UPDATE on table "public"."social_content_jobs" to "service_role";
grant DELETE on table "public"."social_content_jobs" to "service_role";
grant TRUNCATE on table "public"."social_content_jobs" to "service_role";
grant REFERENCES on table "public"."social_content_jobs" to "service_role";
grant TRIGGER on table "public"."social_content_jobs" to "service_role";
grant MAINTAIN on table "public"."social_content_jobs" to "service_role";
revoke all on table "public"."states" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."states" to "anon";
grant SELECT on table "public"."states" to "anon";
grant UPDATE on table "public"."states" to "anon";
grant DELETE on table "public"."states" to "anon";
grant TRUNCATE on table "public"."states" to "anon";
grant REFERENCES on table "public"."states" to "anon";
grant TRIGGER on table "public"."states" to "anon";
grant MAINTAIN on table "public"."states" to "anon";
grant INSERT on table "public"."states" to "authenticated";
grant SELECT on table "public"."states" to "authenticated";
grant UPDATE on table "public"."states" to "authenticated";
grant DELETE on table "public"."states" to "authenticated";
grant TRUNCATE on table "public"."states" to "authenticated";
grant REFERENCES on table "public"."states" to "authenticated";
grant TRIGGER on table "public"."states" to "authenticated";
grant MAINTAIN on table "public"."states" to "authenticated";
grant INSERT on table "public"."states" to "service_role";
grant SELECT on table "public"."states" to "service_role";
grant UPDATE on table "public"."states" to "service_role";
grant DELETE on table "public"."states" to "service_role";
grant TRUNCATE on table "public"."states" to "service_role";
grant REFERENCES on table "public"."states" to "service_role";
grant TRIGGER on table "public"."states" to "service_role";
grant MAINTAIN on table "public"."states" to "service_role";
revoke all on table "public"."user_badges" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."user_badges" to "anon";
grant SELECT on table "public"."user_badges" to "anon";
grant UPDATE on table "public"."user_badges" to "anon";
grant DELETE on table "public"."user_badges" to "anon";
grant TRUNCATE on table "public"."user_badges" to "anon";
grant REFERENCES on table "public"."user_badges" to "anon";
grant TRIGGER on table "public"."user_badges" to "anon";
grant MAINTAIN on table "public"."user_badges" to "anon";
grant INSERT on table "public"."user_badges" to "authenticated";
grant SELECT on table "public"."user_badges" to "authenticated";
grant UPDATE on table "public"."user_badges" to "authenticated";
grant DELETE on table "public"."user_badges" to "authenticated";
grant TRUNCATE on table "public"."user_badges" to "authenticated";
grant REFERENCES on table "public"."user_badges" to "authenticated";
grant TRIGGER on table "public"."user_badges" to "authenticated";
grant MAINTAIN on table "public"."user_badges" to "authenticated";
grant INSERT on table "public"."user_badges" to "service_role";
grant SELECT on table "public"."user_badges" to "service_role";
grant UPDATE on table "public"."user_badges" to "service_role";
grant DELETE on table "public"."user_badges" to "service_role";
grant TRUNCATE on table "public"."user_badges" to "service_role";
grant REFERENCES on table "public"."user_badges" to "service_role";
grant TRIGGER on table "public"."user_badges" to "service_role";
grant MAINTAIN on table "public"."user_badges" to "service_role";
revoke all on table "public"."user_blocks" from PUBLIC,anon,authenticated,service_role;
grant SELECT on table "public"."user_blocks" to "anon";
grant TRUNCATE on table "public"."user_blocks" to "anon";
grant REFERENCES on table "public"."user_blocks" to "anon";
grant TRIGGER on table "public"."user_blocks" to "anon";
grant MAINTAIN on table "public"."user_blocks" to "anon";
grant SELECT on table "public"."user_blocks" to "authenticated";
grant TRUNCATE on table "public"."user_blocks" to "authenticated";
grant REFERENCES on table "public"."user_blocks" to "authenticated";
grant TRIGGER on table "public"."user_blocks" to "authenticated";
grant MAINTAIN on table "public"."user_blocks" to "authenticated";
grant INSERT on table "public"."user_blocks" to "service_role";
grant SELECT on table "public"."user_blocks" to "service_role";
grant UPDATE on table "public"."user_blocks" to "service_role";
grant DELETE on table "public"."user_blocks" to "service_role";
grant TRUNCATE on table "public"."user_blocks" to "service_role";
grant REFERENCES on table "public"."user_blocks" to "service_role";
grant TRIGGER on table "public"."user_blocks" to "service_role";
grant MAINTAIN on table "public"."user_blocks" to "service_role";
revoke all on table "public"."user_destination_favorites" from PUBLIC,anon,authenticated,service_role;
grant SELECT on table "public"."user_destination_favorites" to "service_role";
grant INSERT on table "public"."user_destination_favorites" to "authenticated";
grant SELECT on table "public"."user_destination_favorites" to "authenticated";
grant DELETE on table "public"."user_destination_favorites" to "authenticated";
revoke all on table "public"."user_events" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."user_events" to "service_role";
grant SELECT on table "public"."user_events" to "service_role";
grant UPDATE on table "public"."user_events" to "service_role";
grant DELETE on table "public"."user_events" to "service_role";
grant TRUNCATE on table "public"."user_events" to "service_role";
grant REFERENCES on table "public"."user_events" to "service_role";
grant TRIGGER on table "public"."user_events" to "service_role";
grant MAINTAIN on table "public"."user_events" to "service_role";
grant INSERT on table "public"."user_events" to "anon";
grant INSERT on table "public"."user_events" to "authenticated";
revoke all on table "public"."user_want_to_try" from PUBLIC,anon,authenticated,service_role;
grant SELECT on table "public"."user_want_to_try" to "service_role";
grant INSERT on table "public"."user_want_to_try" to "authenticated";
grant SELECT on table "public"."user_want_to_try" to "authenticated";
grant DELETE on table "public"."user_want_to_try" to "authenticated";
revoke all on table "public"."users" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."users" to "anon";
grant SELECT on table "public"."users" to "anon";
grant UPDATE on table "public"."users" to "anon";
grant DELETE on table "public"."users" to "anon";
grant TRUNCATE on table "public"."users" to "anon";
grant REFERENCES on table "public"."users" to "anon";
grant TRIGGER on table "public"."users" to "anon";
grant MAINTAIN on table "public"."users" to "anon";
grant INSERT on table "public"."users" to "authenticated";
grant SELECT on table "public"."users" to "authenticated";
grant UPDATE on table "public"."users" to "authenticated";
grant DELETE on table "public"."users" to "authenticated";
grant TRUNCATE on table "public"."users" to "authenticated";
grant REFERENCES on table "public"."users" to "authenticated";
grant TRIGGER on table "public"."users" to "authenticated";
grant MAINTAIN on table "public"."users" to "authenticated";
grant INSERT on table "public"."users" to "service_role";
grant SELECT on table "public"."users" to "service_role";
grant UPDATE on table "public"."users" to "service_role";
grant DELETE on table "public"."users" to "service_role";
grant TRUNCATE on table "public"."users" to "service_role";
grant REFERENCES on table "public"."users" to "service_role";
grant TRIGGER on table "public"."users" to "service_role";
grant MAINTAIN on table "public"."users" to "service_role";
revoke all on table "public"."wing_admin_actions" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_admin_actions" to "service_role";
grant SELECT on table "public"."wing_admin_actions" to "service_role";
grant UPDATE on table "public"."wing_admin_actions" to "service_role";
grant DELETE on table "public"."wing_admin_actions" to "service_role";
grant TRUNCATE on table "public"."wing_admin_actions" to "service_role";
grant REFERENCES on table "public"."wing_admin_actions" to "service_role";
grant TRIGGER on table "public"."wing_admin_actions" to "service_role";
grant MAINTAIN on table "public"."wing_admin_actions" to "service_role";
revoke all on table "public"."wing_creator_badge_events" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_creator_badge_events" to "service_role";
grant SELECT on table "public"."wing_creator_badge_events" to "service_role";
grant UPDATE on table "public"."wing_creator_badge_events" to "service_role";
grant DELETE on table "public"."wing_creator_badge_events" to "service_role";
grant TRUNCATE on table "public"."wing_creator_badge_events" to "service_role";
grant REFERENCES on table "public"."wing_creator_badge_events" to "service_role";
grant TRIGGER on table "public"."wing_creator_badge_events" to "service_role";
grant MAINTAIN on table "public"."wing_creator_badge_events" to "service_role";
revoke all on table "public"."wing_creator_reward_config" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_creator_reward_config" to "service_role";
grant SELECT on table "public"."wing_creator_reward_config" to "service_role";
grant UPDATE on table "public"."wing_creator_reward_config" to "service_role";
grant DELETE on table "public"."wing_creator_reward_config" to "service_role";
grant TRUNCATE on table "public"."wing_creator_reward_config" to "service_role";
grant REFERENCES on table "public"."wing_creator_reward_config" to "service_role";
grant TRIGGER on table "public"."wing_creator_reward_config" to "service_role";
grant MAINTAIN on table "public"."wing_creator_reward_config" to "service_role";
revoke all on table "public"."wing_creator_reward_events" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_creator_reward_events" to "service_role";
grant SELECT on table "public"."wing_creator_reward_events" to "service_role";
grant UPDATE on table "public"."wing_creator_reward_events" to "service_role";
grant DELETE on table "public"."wing_creator_reward_events" to "service_role";
grant TRUNCATE on table "public"."wing_creator_reward_events" to "service_role";
grant REFERENCES on table "public"."wing_creator_reward_events" to "service_role";
grant TRIGGER on table "public"."wing_creator_reward_events" to "service_role";
grant MAINTAIN on table "public"."wing_creator_reward_events" to "service_role";
revoke all on table "public"."wing_generation_jobs" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_generation_jobs" to "service_role";
grant SELECT on table "public"."wing_generation_jobs" to "service_role";
grant UPDATE on table "public"."wing_generation_jobs" to "service_role";
grant DELETE on table "public"."wing_generation_jobs" to "service_role";
grant TRUNCATE on table "public"."wing_generation_jobs" to "service_role";
grant REFERENCES on table "public"."wing_generation_jobs" to "service_role";
grant TRIGGER on table "public"."wing_generation_jobs" to "service_role";
grant MAINTAIN on table "public"."wing_generation_jobs" to "service_role";
revoke all on table "public"."wing_jury_photo_vote_counts" from PUBLIC,anon,authenticated,service_role;
grant SELECT on table "public"."wing_jury_photo_vote_counts" to "service_role";
grant SELECT on table "public"."wing_jury_photo_vote_counts" to "authenticated";
revoke all on table "public"."wing_jury_votes" from PUBLIC,anon,authenticated,service_role;
grant SELECT on table "public"."wing_jury_votes" to "service_role";
grant INSERT on table "public"."wing_jury_votes" to "authenticated";
grant SELECT on table "public"."wing_jury_votes" to "authenticated";
revoke all on table "public"."wing_media_cleanup_jobs" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_cleanup_jobs" to "service_role";
grant SELECT on table "public"."wing_media_cleanup_jobs" to "service_role";
grant UPDATE on table "public"."wing_media_cleanup_jobs" to "service_role";
grant DELETE on table "public"."wing_media_cleanup_jobs" to "service_role";
grant TRUNCATE on table "public"."wing_media_cleanup_jobs" to "service_role";
grant REFERENCES on table "public"."wing_media_cleanup_jobs" to "service_role";
grant TRIGGER on table "public"."wing_media_cleanup_jobs" to "service_role";
grant MAINTAIN on table "public"."wing_media_cleanup_jobs" to "service_role";
revoke all on table "public"."wing_media_cleanup_receipts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_cleanup_receipts" to "service_role";
grant SELECT on table "public"."wing_media_cleanup_receipts" to "service_role";
grant UPDATE on table "public"."wing_media_cleanup_receipts" to "service_role";
grant DELETE on table "public"."wing_media_cleanup_receipts" to "service_role";
grant TRUNCATE on table "public"."wing_media_cleanup_receipts" to "service_role";
grant REFERENCES on table "public"."wing_media_cleanup_receipts" to "service_role";
grant TRIGGER on table "public"."wing_media_cleanup_receipts" to "service_role";
grant MAINTAIN on table "public"."wing_media_cleanup_receipts" to "service_role";
revoke all on table "public"."wing_media_exact_fingerprints" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_exact_fingerprints" to "service_role";
grant SELECT on table "public"."wing_media_exact_fingerprints" to "service_role";
grant UPDATE on table "public"."wing_media_exact_fingerprints" to "service_role";
grant DELETE on table "public"."wing_media_exact_fingerprints" to "service_role";
grant TRUNCATE on table "public"."wing_media_exact_fingerprints" to "service_role";
grant REFERENCES on table "public"."wing_media_exact_fingerprints" to "service_role";
grant TRIGGER on table "public"."wing_media_exact_fingerprints" to "service_role";
grant MAINTAIN on table "public"."wing_media_exact_fingerprints" to "service_role";
revoke all on table "public"."wing_media_fingerprints" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_fingerprints" to "service_role";
grant SELECT on table "public"."wing_media_fingerprints" to "service_role";
grant UPDATE on table "public"."wing_media_fingerprints" to "service_role";
grant DELETE on table "public"."wing_media_fingerprints" to "service_role";
grant TRUNCATE on table "public"."wing_media_fingerprints" to "service_role";
grant REFERENCES on table "public"."wing_media_fingerprints" to "service_role";
grant TRIGGER on table "public"."wing_media_fingerprints" to "service_role";
grant MAINTAIN on table "public"."wing_media_fingerprints" to "service_role";
revoke all on table "public"."wing_media_photo_votes" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_photo_votes" to "service_role";
grant SELECT on table "public"."wing_media_photo_votes" to "service_role";
grant UPDATE on table "public"."wing_media_photo_votes" to "service_role";
grant DELETE on table "public"."wing_media_photo_votes" to "service_role";
grant TRUNCATE on table "public"."wing_media_photo_votes" to "service_role";
grant REFERENCES on table "public"."wing_media_photo_votes" to "service_role";
grant TRIGGER on table "public"."wing_media_photo_votes" to "service_role";
grant MAINTAIN on table "public"."wing_media_photo_votes" to "service_role";
grant INSERT on table "public"."wing_media_photo_votes" to "authenticated";
grant SELECT on table "public"."wing_media_photo_votes" to "authenticated";
grant UPDATE on table "public"."wing_media_photo_votes" to "authenticated";
grant DELETE on table "public"."wing_media_photo_votes" to "authenticated";
revoke all on table "public"."wing_media_submissions" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_submissions" to "service_role";
grant SELECT on table "public"."wing_media_submissions" to "service_role";
grant UPDATE on table "public"."wing_media_submissions" to "service_role";
grant DELETE on table "public"."wing_media_submissions" to "service_role";
grant TRUNCATE on table "public"."wing_media_submissions" to "service_role";
grant REFERENCES on table "public"."wing_media_submissions" to "service_role";
grant TRIGGER on table "public"."wing_media_submissions" to "service_role";
grant MAINTAIN on table "public"."wing_media_submissions" to "service_role";
revoke all on table "public"."wing_media_validation_receipts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_media_validation_receipts" to "service_role";
grant SELECT on table "public"."wing_media_validation_receipts" to "service_role";
grant UPDATE on table "public"."wing_media_validation_receipts" to "service_role";
grant DELETE on table "public"."wing_media_validation_receipts" to "service_role";
grant TRUNCATE on table "public"."wing_media_validation_receipts" to "service_role";
grant REFERENCES on table "public"."wing_media_validation_receipts" to "service_role";
grant TRIGGER on table "public"."wing_media_validation_receipts" to "service_role";
grant MAINTAIN on table "public"."wing_media_validation_receipts" to "service_role";
revoke all on table "public"."wing_moderation_config" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_moderation_config" to "service_role";
grant SELECT on table "public"."wing_moderation_config" to "service_role";
grant UPDATE on table "public"."wing_moderation_config" to "service_role";
grant DELETE on table "public"."wing_moderation_config" to "service_role";
grant TRUNCATE on table "public"."wing_moderation_config" to "service_role";
grant REFERENCES on table "public"."wing_moderation_config" to "service_role";
grant TRIGGER on table "public"."wing_moderation_config" to "service_role";
grant MAINTAIN on table "public"."wing_moderation_config" to "service_role";
revoke all on table "public"."wing_moderation_decisions" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_moderation_decisions" to "service_role";
grant SELECT on table "public"."wing_moderation_decisions" to "service_role";
grant UPDATE on table "public"."wing_moderation_decisions" to "service_role";
grant DELETE on table "public"."wing_moderation_decisions" to "service_role";
grant TRUNCATE on table "public"."wing_moderation_decisions" to "service_role";
grant REFERENCES on table "public"."wing_moderation_decisions" to "service_role";
grant TRIGGER on table "public"."wing_moderation_decisions" to "service_role";
grant MAINTAIN on table "public"."wing_moderation_decisions" to "service_role";
revoke all on table "public"."wing_nightly_run_receipts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_nightly_run_receipts" to "service_role";
grant SELECT on table "public"."wing_nightly_run_receipts" to "service_role";
grant UPDATE on table "public"."wing_nightly_run_receipts" to "service_role";
grant DELETE on table "public"."wing_nightly_run_receipts" to "service_role";
grant TRUNCATE on table "public"."wing_nightly_run_receipts" to "service_role";
grant REFERENCES on table "public"."wing_nightly_run_receipts" to "service_role";
grant TRIGGER on table "public"."wing_nightly_run_receipts" to "service_role";
grant MAINTAIN on table "public"."wing_nightly_run_receipts" to "service_role";
revoke all on table "public"."wing_notification_receipts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_notification_receipts" to "service_role";
grant SELECT on table "public"."wing_notification_receipts" to "service_role";
grant UPDATE on table "public"."wing_notification_receipts" to "service_role";
grant DELETE on table "public"."wing_notification_receipts" to "service_role";
grant TRUNCATE on table "public"."wing_notification_receipts" to "service_role";
grant REFERENCES on table "public"."wing_notification_receipts" to "service_role";
grant TRIGGER on table "public"."wing_notification_receipts" to "service_role";
grant MAINTAIN on table "public"."wing_notification_receipts" to "service_role";
revoke all on table "public"."wing_photo_derivative_jobs" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_photo_derivative_jobs" to "service_role";
grant SELECT on table "public"."wing_photo_derivative_jobs" to "service_role";
grant UPDATE on table "public"."wing_photo_derivative_jobs" to "service_role";
grant DELETE on table "public"."wing_photo_derivative_jobs" to "service_role";
grant TRUNCATE on table "public"."wing_photo_derivative_jobs" to "service_role";
grant REFERENCES on table "public"."wing_photo_derivative_jobs" to "service_role";
grant TRIGGER on table "public"."wing_photo_derivative_jobs" to "service_role";
grant MAINTAIN on table "public"."wing_photo_derivative_jobs" to "service_role";
revoke all on table "public"."wing_photo_derivative_receipts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_photo_derivative_receipts" to "service_role";
grant SELECT on table "public"."wing_photo_derivative_receipts" to "service_role";
grant UPDATE on table "public"."wing_photo_derivative_receipts" to "service_role";
grant DELETE on table "public"."wing_photo_derivative_receipts" to "service_role";
grant TRUNCATE on table "public"."wing_photo_derivative_receipts" to "service_role";
grant REFERENCES on table "public"."wing_photo_derivative_receipts" to "service_role";
grant TRIGGER on table "public"."wing_photo_derivative_receipts" to "service_role";
grant MAINTAIN on table "public"."wing_photo_derivative_receipts" to "service_role";
revoke all on table "public"."wing_processing_jobs" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_processing_jobs" to "service_role";
grant SELECT on table "public"."wing_processing_jobs" to "service_role";
grant UPDATE on table "public"."wing_processing_jobs" to "service_role";
grant DELETE on table "public"."wing_processing_jobs" to "service_role";
grant TRUNCATE on table "public"."wing_processing_jobs" to "service_role";
grant REFERENCES on table "public"."wing_processing_jobs" to "service_role";
grant TRIGGER on table "public"."wing_processing_jobs" to "service_role";
grant MAINTAIN on table "public"."wing_processing_jobs" to "service_role";
revoke all on table "public"."wing_submission_abuse_signals" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_submission_abuse_signals" to "service_role";
grant SELECT on table "public"."wing_submission_abuse_signals" to "service_role";
grant UPDATE on table "public"."wing_submission_abuse_signals" to "service_role";
grant DELETE on table "public"."wing_submission_abuse_signals" to "service_role";
grant TRUNCATE on table "public"."wing_submission_abuse_signals" to "service_role";
grant REFERENCES on table "public"."wing_submission_abuse_signals" to "service_role";
grant TRIGGER on table "public"."wing_submission_abuse_signals" to "service_role";
grant MAINTAIN on table "public"."wing_submission_abuse_signals" to "service_role";
revoke all on table "public"."wing_submission_mutation_receipts" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_submission_mutation_receipts" to "service_role";
grant SELECT on table "public"."wing_submission_mutation_receipts" to "service_role";
grant UPDATE on table "public"."wing_submission_mutation_receipts" to "service_role";
grant DELETE on table "public"."wing_submission_mutation_receipts" to "service_role";
grant TRUNCATE on table "public"."wing_submission_mutation_receipts" to "service_role";
grant REFERENCES on table "public"."wing_submission_mutation_receipts" to "service_role";
grant TRIGGER on table "public"."wing_submission_mutation_receipts" to "service_role";
grant MAINTAIN on table "public"."wing_submission_mutation_receipts" to "service_role";
revoke all on table "public"."wing_submission_state_transitions" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_submission_state_transitions" to "service_role";
grant SELECT on table "public"."wing_submission_state_transitions" to "service_role";
grant UPDATE on table "public"."wing_submission_state_transitions" to "service_role";
grant DELETE on table "public"."wing_submission_state_transitions" to "service_role";
grant TRUNCATE on table "public"."wing_submission_state_transitions" to "service_role";
grant REFERENCES on table "public"."wing_submission_state_transitions" to "service_role";
grant TRIGGER on table "public"."wing_submission_state_transitions" to "service_role";
grant MAINTAIN on table "public"."wing_submission_state_transitions" to "service_role";
revoke all on table "public"."wing_submission_upload_intents" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_submission_upload_intents" to "service_role";
grant SELECT on table "public"."wing_submission_upload_intents" to "service_role";
grant UPDATE on table "public"."wing_submission_upload_intents" to "service_role";
grant DELETE on table "public"."wing_submission_upload_intents" to "service_role";
grant TRUNCATE on table "public"."wing_submission_upload_intents" to "service_role";
grant REFERENCES on table "public"."wing_submission_upload_intents" to "service_role";
grant TRIGGER on table "public"."wing_submission_upload_intents" to "service_role";
grant MAINTAIN on table "public"."wing_submission_upload_intents" to "service_role";
revoke all on table "public"."wing_user_moderation_state" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."wing_user_moderation_state" to "service_role";
grant SELECT on table "public"."wing_user_moderation_state" to "service_role";
grant UPDATE on table "public"."wing_user_moderation_state" to "service_role";
grant DELETE on table "public"."wing_user_moderation_state" to "service_role";
grant TRUNCATE on table "public"."wing_user_moderation_state" to "service_role";
grant REFERENCES on table "public"."wing_user_moderation_state" to "service_role";
grant TRIGGER on table "public"."wing_user_moderation_state" to "service_role";
grant MAINTAIN on table "public"."wing_user_moderation_state" to "service_role";
revoke all on table "public"."xp_ledger" from PUBLIC,anon,authenticated,service_role;
grant INSERT on table "public"."xp_ledger" to "service_role";
grant SELECT on table "public"."xp_ledger" to "service_role";
grant UPDATE on table "public"."xp_ledger" to "service_role";
grant DELETE on table "public"."xp_ledger" to "service_role";
grant TRUNCATE on table "public"."xp_ledger" to "service_role";
grant REFERENCES on table "public"."xp_ledger" to "service_role";
grant TRIGGER on table "public"."xp_ledger" to "service_role";
grant MAINTAIN on table "public"."xp_ledger" to "service_role";
grant SELECT on table "public"."xp_ledger" to "authenticated";
revoke all on function "private"."enforce_wing_jury_vote_immutability"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."is_public_wing_jury_photo"(p_submission_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "private"."is_public_wing_jury_photo"(p_submission_id uuid) to "authenticated";
revoke all on function "private"."lock_rating_collection_identities"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."lock_user_destination"(p_user_id uuid, p_destination_id uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."refresh_wing_jury_photo_vote_counts"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."refresh_wing_media_photo_vote_counts"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."remove_favorite_after_rating_delete"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."remove_want_to_try_after_rating"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."require_authenticated_user"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."validate_favorite_insert"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."validate_want_to_try_insert"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."validate_wing_jury_vote_insert"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."validate_wing_media_photo_vote"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "public"."Badge_Add_Crawl_Milestones"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."Badge_Add_Crawl_Milestones"() to PUBLIC;
grant EXECUTE on function "public"."Badge_Add_Crawl_Milestones"() to "anon";
grant EXECUTE on function "public"."Badge_Add_Crawl_Milestones"() to "authenticated";
grant EXECUTE on function "public"."Badge_Add_Crawl_Milestones"() to "service_role";
revoke all on function "public"."Badge_Add_Rating_Milestones"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."Badge_Add_Rating_Milestones"() to PUBLIC;
grant EXECUTE on function "public"."Badge_Add_Rating_Milestones"() to "anon";
grant EXECUTE on function "public"."Badge_Add_Rating_Milestones"() to "authenticated";
grant EXECUTE on function "public"."Badge_Add_Rating_Milestones"() to "service_role";
revoke all on function "public"."android_qa_welcome_coins"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."android_qa_welcome_coins"() to "service_role";
revoke all on function "public"."award_xp"(p_user uuid, p_amount integer, p_reason text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."award_xp"(p_user uuid, p_amount integer, p_reason text) to PUBLIC;
grant EXECUTE on function "public"."award_xp"(p_user uuid, p_amount integer, p_reason text) to "anon";
grant EXECUTE on function "public"."award_xp"(p_user uuid, p_amount integer, p_reason text) to "authenticated";
grant EXECUTE on function "public"."award_xp"(p_user uuid, p_amount integer, p_reason text) to "service_role";
revoke all on function "public"."award_xp"(p_amount integer, p_source text, p_reason text, p_user_id uuid, p_idempotency_key text, p_destination_id uuid, p_crawl_id uuid, p_route_id uuid, p_badge_id bigint, p_battle_id bigint, p_challenge_id uuid, p_referral_id uuid, p_metadata jsonb) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."award_xp"(p_amount integer, p_source text, p_reason text, p_user_id uuid, p_idempotency_key text, p_destination_id uuid, p_crawl_id uuid, p_route_id uuid, p_badge_id bigint, p_battle_id bigint, p_challenge_id uuid, p_referral_id uuid, p_metadata jsonb) to "service_role";
revoke all on function "public"."begin_wing_processing_job"(p_job_id uuid, p_claim_token uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."begin_wing_processing_job"(p_job_id uuid, p_claim_token uuid) to "service_role";
revoke all on function "public"."buffacoin_apply_ledger_delta"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."buffacoin_apply_ledger_delta"() to PUBLIC;
grant EXECUTE on function "public"."buffacoin_apply_ledger_delta"() to "anon";
grant EXECUTE on function "public"."buffacoin_apply_ledger_delta"() to "authenticated";
grant EXECUTE on function "public"."buffacoin_apply_ledger_delta"() to "service_role";
revoke all on function "public"."buffacoin_wallets_touch_updated_at"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."buffacoin_wallets_touch_updated_at"() to PUBLIC;
grant EXECUTE on function "public"."buffacoin_wallets_touch_updated_at"() to "anon";
grant EXECUTE on function "public"."buffacoin_wallets_touch_updated_at"() to "authenticated";
grant EXECUTE on function "public"."buffacoin_wallets_touch_updated_at"() to "service_role";
revoke all on function "public"."can_user_appear_socially"(user_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."can_user_appear_socially"(user_id uuid) to PUBLIC;
grant EXECUTE on function "public"."can_user_appear_socially"(user_id uuid) to "anon";
grant EXECUTE on function "public"."can_user_appear_socially"(user_id uuid) to "authenticated";
grant EXECUTE on function "public"."can_user_appear_socially"(user_id uuid) to "service_role";
revoke all on function "public"."claim_wing_media_cleanup_job"(p_worker text, p_lease_seconds integer) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."claim_wing_media_cleanup_job"(p_worker text, p_lease_seconds integer) to "service_role";
revoke all on function "public"."claim_wing_processing_job"(p_worker text, p_lease_seconds integer) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."claim_wing_processing_job"(p_worker text, p_lease_seconds integer) to "service_role";
revoke all on function "public"."enqueue_friend_rating_notification"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."enqueue_friend_rating_notification"() to PUBLIC;
grant EXECUTE on function "public"."enqueue_friend_rating_notification"() to "anon";
grant EXECUTE on function "public"."enqueue_friend_rating_notification"() to "authenticated";
grant EXECUTE on function "public"."enqueue_friend_rating_notification"() to "service_role";
revoke all on function "public"."enqueue_wing_creator_badge_notification"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."enqueue_wing_creator_badge_notification"() to "service_role";
revoke all on function "public"."enqueue_wing_media_cleanup"(p_limit integer) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."enqueue_wing_media_cleanup"(p_limit integer) to "service_role";
revoke all on function "public"."enqueue_wing_photo_upload_derivatives"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."enqueue_wing_photo_upload_derivatives"() to "service_role";
revoke all on function "public"."enqueue_wing_processing_backlog"(p_limit integer) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."enqueue_wing_processing_backlog"(p_limit integer) to "service_role";
revoke all on function "public"."enqueue_wing_submission_notification"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."enqueue_wing_submission_notification"() to "service_role";
revoke all on function "public"."ensure_new_user_referral_code"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."ensure_new_user_referral_code"() to "service_role";
revoke all on function "public"."finalize_wing_submission_upload"(p_submission_id uuid, p_idempotency_key text, p_correlation_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."finalize_wing_submission_upload"(p_submission_id uuid, p_idempotency_key text, p_correlation_id uuid) to "service_role";
grant EXECUTE on function "public"."finalize_wing_submission_upload"(p_submission_id uuid, p_idempotency_key text, p_correlation_id uuid) to "authenticated";
revoke all on function "public"."finish_wing_media_cleanup_job"(p_job_id uuid, p_claim_token uuid, p_object_outcome text, p_retryable boolean, p_error_code text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."finish_wing_media_cleanup_job"(p_job_id uuid, p_claim_token uuid, p_object_outcome text, p_retryable boolean, p_error_code text) to "service_role";
revoke all on function "public"."finish_wing_processing_job"(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_error_code text, p_error_reason text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."finish_wing_processing_job"(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_error_code text, p_error_reason text) to "service_role";
revoke all on function "public"."flag_referral_account_deletion"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."flag_referral_account_deletion"() to "service_role";
revoke all on function "public"."friend_pair_is_blocked"(p_user_a uuid, p_user_b uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."friend_pair_is_blocked"(p_user_a uuid, p_user_b uuid) to "authenticated";
grant EXECUTE on function "public"."friend_pair_is_blocked"(p_user_a uuid, p_user_b uuid) to "service_role";
revoke all on function "public"."generate_referral_code"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."generate_referral_code"() to "service_role";
revoke all on function "public"."get_wing_fingerprint_candidates"(p_submission_id uuid, p_media_type text, p_algorithm text, p_algorithm_version text, p_limit integer) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."get_wing_fingerprint_candidates"(p_submission_id uuid, p_media_type text, p_algorithm text, p_algorithm_version text, p_limit integer) to "service_role";
revoke all on function "public"."get_wing_shots_feature_flags"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."get_wing_shots_feature_flags"() to "authenticated";
grant EXECUTE on function "public"."get_wing_shots_feature_flags"() to "service_role";
revoke all on function "public"."give_new_user_starting_coins"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."give_new_user_starting_coins"() to "service_role";
revoke all on function "public"."grant_badge"(p_user uuid, p_code text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."grant_badge"(p_user uuid, p_code text) to PUBLIC;
grant EXECUTE on function "public"."grant_badge"(p_user uuid, p_code text) to "anon";
grant EXECUTE on function "public"."grant_badge"(p_user uuid, p_code text) to "authenticated";
grant EXECUTE on function "public"."grant_badge"(p_user uuid, p_code text) to "service_role";
revoke all on function "public"."guard_android_qa_coin_bonus"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."guard_android_qa_coin_bonus"() to "service_role";
revoke all on function "public"."guard_buffacoin_rating_writes"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."guard_buffacoin_rating_writes"() to PUBLIC;
grant EXECUTE on function "public"."guard_buffacoin_rating_writes"() to "anon";
grant EXECUTE on function "public"."guard_buffacoin_rating_writes"() to "authenticated";
grant EXECUTE on function "public"."guard_buffacoin_rating_writes"() to "service_role";
revoke all on function "public"."guard_legacy_wing_photo_job"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."guard_legacy_wing_photo_job"() to "service_role";
revoke all on function "public"."guard_wing_photo_approval"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."guard_wing_photo_approval"() to "service_role";
revoke all on function "public"."handle_new_auth_user"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."handle_new_auth_user"() to PUBLIC;
grant EXECUTE on function "public"."handle_new_auth_user"() to "anon";
grant EXECUTE on function "public"."handle_new_auth_user"() to "authenticated";
grant EXECUTE on function "public"."handle_new_auth_user"() to "service_role";
revoke all on function "public"."is_public_wing_jury_photo"(p_submission_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."is_public_wing_jury_photo"(p_submission_id uuid) to "service_role";
revoke all on function "public"."mango_clear_ineligible_priority"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."mango_clear_ineligible_priority"() to PUBLIC;
grant EXECUTE on function "public"."mango_clear_ineligible_priority"() to "anon";
grant EXECUTE on function "public"."mango_clear_ineligible_priority"() to "authenticated";
grant EXECUTE on function "public"."mango_clear_ineligible_priority"() to "service_role";
revoke all on function "public"."on_crawl_after_update"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."on_crawl_after_update"() to PUBLIC;
grant EXECUTE on function "public"."on_crawl_after_update"() to "anon";
grant EXECUTE on function "public"."on_crawl_after_update"() to "authenticated";
grant EXECUTE on function "public"."on_crawl_after_update"() to "service_role";
revoke all on function "public"."provision_referral_code_internal"(p_user_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."provision_referral_code_internal"(p_user_id uuid) to "service_role";
revoke all on function "public"."record_wing_ai_moderation"(p_submission_id uuid, p_result jsonb, p_idempotency_key text, p_correlation_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."record_wing_ai_moderation"(p_submission_id uuid, p_result jsonb, p_idempotency_key text, p_correlation_id uuid) to "service_role";
revoke all on function "public"."record_wing_fingerprint"(p_submission_id uuid, p_media_type text, p_algorithm text, p_algorithm_version text, p_fingerprint text, p_nearest_submission_id uuid, p_similarity numeric, p_idempotency_key text, p_correlation_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."record_wing_fingerprint"(p_submission_id uuid, p_media_type text, p_algorithm text, p_algorithm_version text, p_fingerprint text, p_nearest_submission_id uuid, p_similarity numeric, p_idempotency_key text, p_correlation_id uuid) to "service_role";
revoke all on function "public"."referral_profile_eligibility"(p_user_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."referral_profile_eligibility"(p_user_id uuid) to "service_role";
revoke all on function "public"."refresh_referral_code_after_auth_change"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."refresh_referral_code_after_auth_change"() to "service_role";
revoke all on function "public"."refresh_referral_code_after_profile_delete"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."refresh_referral_code_after_profile_delete"() to "service_role";
revoke all on function "public"."refresh_referral_code_profile_eligibility"(p_user_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."refresh_referral_code_profile_eligibility"(p_user_id uuid) to "service_role";
revoke all on function "public"."register_wing_exact_media"(p_submission_id uuid, p_media_type text, p_sha256 text, p_size_bytes bigint) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."register_wing_exact_media"(p_submission_id uuid, p_media_type text, p_sha256 text, p_size_bytes bigint) to "service_role";
revoke all on function "public"."reject_new_wing_video_upload_intent"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."reject_new_wing_video_upload_intent"() to "anon";
grant EXECUTE on function "public"."reject_new_wing_video_upload_intent"() to "authenticated";
grant EXECUTE on function "public"."reject_new_wing_video_upload_intent"() to "service_role";
revoke all on function "public"."reserve_wing_submission_upload"(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."reserve_wing_submission_upload"(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text) to "authenticated";
grant EXECUTE on function "public"."reserve_wing_submission_upload"(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text) to "service_role";
revoke all on function "public"."reserve_wing_submission_upload_legacy"(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."reserve_wing_submission_upload_legacy"(p_rating_id uuid, p_media_type text, p_expected_mime_type text, p_expected_size_bytes bigint, p_consent_version text, p_attribution_preference text, p_user_caption text, p_idempotency_key text, p_correlation_id uuid, p_destination_id uuid, p_submission_source text) to "service_role";
revoke all on function "public"."restore_referral_code_after_profile_insert"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."restore_referral_code_after_profile_insert"() to "service_role";
revoke all on function "public"."review_wing_submission"(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."review_wing_submission"(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid) to "service_role";
revoke all on function "public"."review_wing_submission_v2"(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."review_wing_submission_v2"(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid) to "service_role";
grant EXECUTE on function "public"."review_wing_submission_v2"(p_submission_id uuid, p_action text, p_reason_category text, p_notes text, p_idempotency_key text, p_correlation_id uuid) to "authenticated";
revoke all on function "public"."settle_wing_processing_job"(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_processed_path text, p_thumbnail_path text, p_perceptual_hash text, p_error_code text, p_error_reason text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."settle_wing_processing_job"(p_job_id uuid, p_claim_token uuid, p_succeeded boolean, p_retryable boolean, p_processed_path text, p_thumbnail_path text, p_perceptual_hash text, p_error_code text, p_error_reason text) to "service_role";
revoke all on function "public"."tf_user_badges_count_after_del"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."tf_user_badges_count_after_del"() to PUBLIC;
grant EXECUTE on function "public"."tf_user_badges_count_after_del"() to "anon";
grant EXECUTE on function "public"."tf_user_badges_count_after_del"() to "authenticated";
grant EXECUTE on function "public"."tf_user_badges_count_after_del"() to "service_role";
revoke all on function "public"."tf_user_badges_count_after_ins"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."tf_user_badges_count_after_ins"() to PUBLIC;
grant EXECUTE on function "public"."tf_user_badges_count_after_ins"() to "anon";
grant EXECUTE on function "public"."tf_user_badges_count_after_ins"() to "authenticated";
grant EXECUTE on function "public"."tf_user_badges_count_after_ins"() to "service_role";
revoke all on function "public"."tf_user_badges_count_after_upd"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."tf_user_badges_count_after_upd"() to PUBLIC;
grant EXECUTE on function "public"."tf_user_badges_count_after_upd"() to "anon";
grant EXECUTE on function "public"."tf_user_badges_count_after_upd"() to "authenticated";
grant EXECUTE on function "public"."tf_user_badges_count_after_upd"() to "service_role";
revoke all on function "public"."wing_apply_owner_pseudonymization"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_apply_owner_pseudonymization"() to "service_role";
revoke all on function "public"."wing_award_creator_reward_internal"(p_submission_id uuid, p_reward_kind text, p_transition_id uuid, p_idempotency_key text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_award_creator_reward_internal"(p_submission_id uuid, p_reward_kind text, p_transition_id uuid, p_idempotency_key text) to "service_role";
revoke all on function "public"."wing_can_upload_reserved_original"(p_object_name text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_can_upload_reserved_original"(p_object_name text) to "service_role";
grant EXECUTE on function "public"."wing_can_upload_reserved_original"(p_object_name text) to "authenticated";
revoke all on function "public"."wing_creator_audit_append_only"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_creator_audit_append_only"() to "service_role";
revoke all on function "public"."wing_creator_reward_on_transition"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_creator_reward_on_transition"() to "service_role";
revoke all on function "public"."wing_feature_enabled_for_user"(p_flag_key text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_feature_enabled_for_user"(p_flag_key text) to "service_role";
revoke all on function "public"."wing_guard_upload_intent_status"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_guard_upload_intent_status"() to PUBLIC;
grant EXECUTE on function "public"."wing_guard_upload_intent_status"() to "anon";
grant EXECUTE on function "public"."wing_guard_upload_intent_status"() to "authenticated";
grant EXECUTE on function "public"."wing_guard_upload_intent_status"() to "service_role";
revoke all on function "public"."wing_has_app_role"(p_role text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_has_app_role"(p_role text) to "service_role";
grant EXECUTE on function "public"."wing_has_app_role"(p_role text) to "authenticated";
revoke all on function "public"."wing_media_is_public_status"(p_status text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_media_is_public_status"(p_status text) to "service_role";
revoke all on function "public"."wing_moderation_queue_enabled_for_user"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_moderation_queue_enabled_for_user"() to "service_role";
grant EXECUTE on function "public"."wing_moderation_queue_enabled_for_user"() to "authenticated";
revoke all on function "public"."wing_notification_receipt_append_only"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_notification_receipt_append_only"() to "service_role";
revoke all on function "public"."wing_photo_processing_blocker"(p_submission_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_photo_processing_blocker"(p_submission_id uuid) to "service_role";
revoke all on function "public"."wing_photo_receipt_append_only"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_photo_receipt_append_only"() to "service_role";
revoke all on function "public"."wing_reject_cleanup_receipt_mutation"() from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_reject_cleanup_receipt_mutation"() to PUBLIC;
grant EXECUTE on function "public"."wing_reject_cleanup_receipt_mutation"() to "anon";
grant EXECUTE on function "public"."wing_reject_cleanup_receipt_mutation"() to "authenticated";
grant EXECUTE on function "public"."wing_reject_cleanup_receipt_mutation"() to "service_role";
revoke all on function "public"."wing_reverse_creator_rewards_internal"(p_submission_id uuid, p_reason text, p_idempotency_key text, p_transition_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_reverse_creator_rewards_internal"(p_submission_id uuid, p_reason text, p_idempotency_key text, p_transition_id uuid) to "service_role";
revoke all on function "public"."wing_shot_rating_eligibility_reason"(p_rating_id uuid, p_user_id uuid, p_destination_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_shot_rating_eligibility_reason"(p_rating_id uuid, p_user_id uuid, p_destination_id uuid) to "service_role";
revoke all on function "public"."wing_sync_creator_badges_internal"(p_user_id uuid, p_trigger_submission_id uuid, p_correlation_id uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_sync_creator_badges_internal"(p_user_id uuid, p_trigger_submission_id uuid, p_correlation_id uuid) to "service_role";
revoke all on function "public"."wing_transition_submission"(p_submission_id uuid, p_to_status text, p_expected_from_status text, p_actor_type text, p_actor_id uuid, p_trigger_source text, p_idempotency_key text, p_correlation_id uuid, p_metadata jsonb) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_transition_submission"(p_submission_id uuid, p_to_status text, p_expected_from_status text, p_actor_type text, p_actor_id uuid, p_trigger_source text, p_idempotency_key text, p_correlation_id uuid, p_metadata jsonb) to "service_role";
revoke all on function "public"."wingman_consume_rate_limit"(p_user_id uuid, p_ip_address text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wingman_consume_rate_limit"(p_user_id uuid, p_ip_address text) to "service_role";
revoke all on function "public"."wingman_create_destination"(p_destination jsonb, p_created_by uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wingman_create_destination"(p_destination jsonb, p_created_by uuid) to "service_role";
revoke all on function "public"."xp_level_for"(p_xp integer) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."xp_level_for"(p_xp integer) to PUBLIC;
grant EXECUTE on function "public"."xp_level_for"(p_xp integer) to "anon";
grant EXECUTE on function "public"."xp_level_for"(p_xp integer) to "authenticated";
grant EXECUTE on function "public"."xp_level_for"(p_xp integer) to "service_role";
revoke all on function "public"."wing_jury_restaurant_rating_summary"(uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."wing_jury_restaurant_rating_summary"(uuid) to "service_role";
revoke all on function "public"."begin_wing_photo_derivative_job"(uuid, uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."begin_wing_photo_derivative_job"(uuid, uuid) to "service_role";
revoke all on function "public"."claim_wing_photo_derivative_job"(text, integer, uuid) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."claim_wing_photo_derivative_job"(text, integer, uuid) to "service_role";
revoke all on function "public"."settle_wing_photo_derivative_job"(uuid, uuid, boolean, boolean, text, text, text, text, text) from PUBLIC,anon,authenticated,service_role;
grant EXECUTE on function "public"."settle_wing_photo_derivative_job"(uuid, uuid, boolean, boolean, text, text, text, text, text) to "service_role";
revoke all on sequence "public"."states_state_id_seq" from PUBLIC,anon,authenticated,service_role;
grant SELECT on sequence "public"."states_state_id_seq" to "anon";
grant UPDATE on sequence "public"."states_state_id_seq" to "anon";
grant USAGE on sequence "public"."states_state_id_seq" to "anon";
grant SELECT on sequence "public"."states_state_id_seq" to "authenticated";
grant UPDATE on sequence "public"."states_state_id_seq" to "authenticated";
grant USAGE on sequence "public"."states_state_id_seq" to "authenticated";
grant SELECT on sequence "public"."states_state_id_seq" to "service_role";
grant UPDATE on sequence "public"."states_state_id_seq" to "service_role";
grant USAGE on sequence "public"."states_state_id_seq" to "service_role";
revoke all on sequence "public"."badge_catalog_id_seq" from PUBLIC,anon,authenticated,service_role;
grant SELECT on sequence "public"."badge_catalog_id_seq" to "anon";
grant UPDATE on sequence "public"."badge_catalog_id_seq" to "anon";
grant USAGE on sequence "public"."badge_catalog_id_seq" to "anon";
grant SELECT on sequence "public"."badge_catalog_id_seq" to "authenticated";
grant UPDATE on sequence "public"."badge_catalog_id_seq" to "authenticated";
grant USAGE on sequence "public"."badge_catalog_id_seq" to "authenticated";
grant SELECT on sequence "public"."badge_catalog_id_seq" to "service_role";
grant UPDATE on sequence "public"."badge_catalog_id_seq" to "service_role";
grant USAGE on sequence "public"."badge_catalog_id_seq" to "service_role";
notify pgrst, 'reload schema';
commit;
