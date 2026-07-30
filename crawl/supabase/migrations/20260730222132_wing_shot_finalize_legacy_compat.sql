-- Keep already-released mobile clients working during the client rollout.
-- The wrapper never accepts a caller supplied path; it obtains the immutable
-- path from the caller-owned reservation and delegates to the canonical
-- finalizer, which still verifies the exact Storage object.

begin;

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
  v_storage_path text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select expected_storage_path into v_storage_path
    from public.wing_submission_upload_intents
   where submission_id = p_submission_id and user_id = v_user_id;
  if not found then raise exception 'upload_intent_not_found'; end if;
  return public.finalize_wing_submission_upload(
    p_submission_id, p_idempotency_key, p_correlation_id,
    'wing-submissions', v_storage_path
  );
end;
$$;

revoke all on function public.finalize_wing_submission_upload(uuid, text, uuid)
  from public, anon;
grant execute on function public.finalize_wing_submission_upload(uuid, text, uuid)
  to authenticated, service_role;

commit;
