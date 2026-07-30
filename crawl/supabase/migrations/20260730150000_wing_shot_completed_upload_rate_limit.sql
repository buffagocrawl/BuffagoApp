-- Wing Shot quota is for completed uploads, not reservation attempts.
-- The previous trigger counted every upload intent and therefore charged
-- abandoned, failed, and rate-limited attempts.

begin;

alter table public.wing_moderation_config
  add column if not exists rolling_upload_limit integer not null default 5
    check (rolling_upload_limit between 1 and 20),
  add column if not exists rolling_upload_window_seconds integer not null default 900
    check (rolling_upload_window_seconds between 60 and 86400);

drop trigger if exists wing_upload_intent_rate_limit
  on public.wing_submission_upload_intents;

create or replace function public.reserve_wing_submission_upload(
  p_rating_id uuid,
  p_media_type text,
  p_expected_mime_type text,
  p_expected_size_bytes bigint,
  p_consent_version text,
  p_attribution_preference text,
  p_user_caption text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_destination_id uuid,
  p_submission_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
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
      update public.wing_submission_upload_intents
         set media_type = p_media_type, expected_mime_type = p_expected_mime_type,
             expected_size_bytes = p_expected_size_bytes, consent_version = p_consent_version,
             consented_at = now(), attribution_preference = p_attribution_preference,
             user_caption = nullif(trim(p_user_caption), ''), expires_at = now() + interval '15 minutes',
             updated_at = now(), correlation_id = coalesce(p_correlation_id, correlation_id)
       where id = v_intent.id;
      return jsonb_build_object('submission_id', v_intent.submission_id,
        'bucket', 'wing-submissions', 'upload_path', v_intent.expected_storage_path,
        'expires_at', now() + interval '15 minutes', 'resumed', true,
        'existing_record_found', true, 'existing_record_id', v_intent.submission_id,
        'existing_record_status', v_intent.status);
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
$$;

revoke all on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) from public, anon;
grant execute on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) to authenticated, service_role;

commit;
