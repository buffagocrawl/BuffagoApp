-- Wing Shot upload contract: validate, promote the trusted object, and enter
-- review immediately. Media-processing jobs are not part of finalization.
begin;

drop trigger if exists enqueue_wing_processing_after_submission
  on public.wing_media_submissions;

create or replace function public.finalize_wing_submission_upload(
  p_submission_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
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
$$;

revoke all on function public.finalize_wing_submission_upload(uuid, text, uuid)
  from public, anon;
grant execute on function public.finalize_wing_submission_upload(uuid, text, uuid)
  to authenticated, service_role;

commit;
