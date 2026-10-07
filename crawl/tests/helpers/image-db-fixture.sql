-- Focused fixture for executing real Wing Shot functions, not a full Supabase baseline.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.objects(bucket_id text, name text, owner_id text, metadata jsonb, unique(bucket_id,name));
create table public.destination_ratings(id uuid primary key, user_id uuid, destination_id uuid);
create table public.wing_media_submissions(
 id uuid primary key, user_id uuid, rating_id uuid unique references destination_ratings(id), destination_id uuid,
 submission_source text, media_type text, original_storage_path text unique, processed_storage_path text,
 thumbnail_storage_path text, approved_at timestamptz, approved_by uuid, withdrawn_at timestamptz,
 rejected_at timestamptz, reviewed_at timestamptz, reviewed_by uuid, reviewer_notes text,
 moderation_status text default 'pending', wing_verification_status text default 'pending',
 featured_at timestamptz, rejection_reason text, consent_version text, consented_at timestamptz, attribution_preference text,
 user_caption text, status text, correlation_id uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table wing_media_submissions enable row level security;
create table public.wing_submission_upload_intents(
 id uuid default gen_random_uuid() primary key, submission_id uuid unique, user_id uuid, rating_id uuid,
 destination_id uuid, media_type text, expected_storage_path text, expected_mime_type text, expected_size_bytes bigint,
 consent_version text, consented_at timestamptz, attribution_preference text, user_caption text,
 submission_source text, status text default 'reserved', correlation_id uuid, expires_at timestamptz,
 finalized_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.wing_submission_mutation_receipts(
 user_id uuid, submission_id uuid, mutation_kind text, idempotency_key text unique, request_fingerprint text,
 result jsonb, correlation_id uuid
);
create table public.wing_submission_state_transitions(
 id uuid default gen_random_uuid() primary key, submission_id uuid, from_status text, to_status text, actor_type text, actor_id uuid, trigger_source text,
 idempotency_key text unique, request_fingerprint text, correlation_id uuid, metadata jsonb
);
create table public.wing_moderation_config(singleton boolean, rolling_upload_window_seconds integer, rolling_upload_limit integer);
insert into wing_moderation_config values(true,900,5);
create table public.wing_user_moderation_state(user_id uuid,status text,expires_at timestamptz,limit_multiplier numeric);
create table public.engagement_feature_flags(flag_key text primary key, enabled boolean, rollout_percent integer);
insert into engagement_feature_flags values ('wing_shot_prompt',true,100),('wing_shot_photo_upload',true,100);
create function public.wing_shot_rating_eligibility_reason(uuid,uuid,uuid) returns text language sql as $$ select 'eligible'::text $$;
create function public.wing_has_app_role(text) returns boolean language sql as $$ select false $$;
create table public.social_content_jobs(id uuid,submission_id uuid,generated_media_path text,status text,created_at timestamptz,platform text,external_permalink text,dry_run boolean,external_post_id text,posted_at timestamptz);
create table public.destinations(id uuid primary key,name text,city text);
create function public.wing_safe_rejection_category(text) returns text language sql as $$ select $1 $$;
create table public.wing_media_access_requests(
 id uuid default gen_random_uuid() primary key,submission_id uuid,requester_id uuid,variant text,requested_path text,
 purpose text,expires_at timestamptz,correlation_id uuid
);
create function public.reserve_wing_submission_upload_legacy(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text)
returns jsonb language sql as $$ select '{"delegated":true}'::jsonb $$;
create function public.reject_new_wing_video_upload_intent() returns trigger language plpgsql as $$
begin if new.media_type <> 'photo' then raise exception 'unsupported_media_type'; end if; return new; end $$;
grant usage on schema public,auth to authenticated,anon,service_role;
create table app_user_roles(user_id uuid,role text,active boolean,revoked_at timestamptz);
create table wing_processing_jobs(id uuid,submission_id uuid,job_kind text,status text,completed_at timestamptz,
 claimed_at timestamptz,lease_expires_at timestamptz,claim_token uuid,claimed_by text,updated_at timestamptz);
create table wing_moderation_decisions(submission_id uuid,decision_source text,recommendation text,explanation text,
 reviewer_id uuid,override_reason text,raw_result jsonb,idempotency_key text unique,correlation_id uuid);
create table wing_admin_actions(submission_id uuid,actor_id uuid,action text,reason_category text,notes text,
 before_state jsonb,after_state jsonb,idempotency_key text unique,request_fingerprint text,correlation_id uuid);
