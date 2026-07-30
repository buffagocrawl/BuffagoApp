-- Resume an interrupted reservation for the same saved rating.
-- The previous authoritative RPC checked rating eligibility before looking for
-- an active intent. Since active intents are intentionally excluded from the
-- eligibility predicate, a retry after a lost response was misclassified as a
-- generic validation/conflict error.

begin;

alter function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) rename to reserve_wing_submission_upload_legacy;

create function public.reserve_wing_submission_upload(
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
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_rating_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0)
    );

    if exists (
      select 1 from public.wing_media_submissions submission
       where submission.rating_id = p_rating_id
    ) then
      raise exception 'wing_submission_already_finalized';
    end if;

    select * into v_intent
      from public.wing_submission_upload_intents intent
     where intent.rating_id = p_rating_id
       and intent.user_id = v_user_id
       and intent.status in ('reserved', 'finalized')
     order by intent.created_at desc
     limit 1
     for update;

    if found then
      -- A new retry may select a replacement clip. Reuse the same intent,
      -- storage path, and submission identity; never create another rating or
      -- another Wing Shot row.
      update public.wing_submission_upload_intents
         set media_type = p_media_type,
             expected_mime_type = p_expected_mime_type,
             expected_size_bytes = p_expected_size_bytes,
             consent_version = p_consent_version,
             consented_at = now(),
             attribution_preference = p_attribution_preference,
             user_caption = nullif(trim(p_user_caption), ''),
             expires_at = now() + interval '15 minutes',
             updated_at = now(),
             correlation_id = coalesce(p_correlation_id, correlation_id)
       where id = v_intent.id;

      v_result := jsonb_build_object(
        'submission_id', v_intent.submission_id,
        'bucket', 'wing-submissions',
        'upload_path', v_intent.expected_storage_path,
        'expires_at', now() + interval '15 minutes',
        'resumed', true,
        'existing_record_found', true,
        'existing_record_id', v_intent.submission_id,
        'existing_record_status', v_intent.status
      );
      return v_result;
    end if;
  end if;

  return public.reserve_wing_submission_upload_legacy(
    p_rating_id, p_media_type, p_expected_mime_type, p_expected_size_bytes,
    p_consent_version, p_attribution_preference, p_user_caption,
    p_idempotency_key, p_correlation_id, p_destination_id, p_submission_source
  );
end;
$$;

revoke all on function public.reserve_wing_submission_upload_legacy(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) from public, anon;
grant execute on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) to authenticated, service_role;

commit;
