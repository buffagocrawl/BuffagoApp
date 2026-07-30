-- Service-role promotion writes the destination object, so storage.objects.owner_id
-- is not a reliable representation of the mobile caller. Validate the object by
-- the authenticated caller's immutable reservation and its fixed user directory.
-- This keeps the nonexistent-object protection without weakening Storage RLS.

begin;

create or replace function public.wing_uploaded_object_exists(
  p_bucket text,
  p_path text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return false;
  end if;
  if p_bucket <> 'wing-submissions'
     or p_path !~ ('^originals/' || p_user_id::text || '/[0-9a-f-]{36}/source$') then
    return false;
  end if;

  return exists (
    select 1
      from storage.objects object
     where object.bucket_id = p_bucket
       and object.name = p_path
  );
end;
$$;

revoke all on function public.wing_uploaded_object_exists(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.wing_uploaded_object_exists(text, text, uuid)
  to authenticated;

-- Keep the previous RPC unavailable to clients so every production client
-- supplies the canonical Storage response it is attempting to finalize.
revoke all on function public.finalize_wing_submission_upload(uuid, text, uuid)
  from public, anon, authenticated;

create or replace function public.finalize_wing_submission_upload(
  p_submission_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_bucket text,
  p_storage_path text
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
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid_idempotency_key'; end if;
  if p_correlation_id is null then raise exception 'correlation_id_required'; end if;
  if p_bucket is null or p_storage_path is null then raise exception 'uploaded_object_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|', p_submission_id::text, 'finalize', p_bucket, p_storage_path));
  select * into v_existing from public.wing_submission_mutation_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id or v_existing.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_existing.result;
  end if;

  select * into v_intent from public.wing_submission_upload_intents
   where submission_id = p_submission_id and user_id = v_user_id for update;
  if not found or v_intent.status <> 'reserved' or v_intent.expires_at <= now() then raise exception 'upload_intent_unavailable'; end if;
  if p_bucket <> 'wing-submissions' or p_storage_path <> v_intent.expected_storage_path then raise exception 'uploaded_object_invalid'; end if;
  if not public.wing_uploaded_object_exists(p_bucket, p_storage_path, v_user_id) then raise exception 'uploaded_object_not_found'; end if;

  insert into public.wing_media_submissions (
    id,user_id,rating_id,destination_id,submission_source,media_type,original_storage_path,
    consent_version,consented_at,attribution_preference,user_caption,status,correlation_id
  ) values (
    v_intent.submission_id,v_intent.user_id,v_intent.rating_id,v_intent.destination_id,v_intent.submission_source,
    v_intent.media_type,p_storage_path,v_intent.consent_version,v_intent.consented_at,
    v_intent.attribution_preference,v_intent.user_caption,'uploaded',p_correlation_id
  );
  update public.wing_submission_upload_intents set status='finalized',finalized_at=now(),updated_at=now() where id=v_intent.id;
  insert into public.wing_submission_state_transitions (submission_id,from_status,to_status,actor_type,actor_id,trigger_source,idempotency_key,request_fingerprint,correlation_id)
  values (v_intent.submission_id,null,'uploaded','user',v_user_id,'upload_finalized','initial:'||md5(p_idempotency_key),md5('initial|'||v_intent.submission_id::text),p_correlation_id);
  v_result := jsonb_build_object('submission_id',v_intent.submission_id,'status','uploaded');
  insert into public.wing_submission_mutation_receipts (user_id,submission_id,mutation_kind,idempotency_key,request_fingerprint,result,correlation_id)
  values (v_user_id,v_intent.submission_id,'finalize_upload',p_idempotency_key,v_fingerprint,v_result,p_correlation_id);
  return v_result;
end;
$$;

revoke all on function public.finalize_wing_submission_upload(uuid, text, uuid, text, text)
  from public, anon;
grant execute on function public.finalize_wing_submission_upload(uuid, text, uuid, text, text)
  to authenticated, service_role;

commit;
