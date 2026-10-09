-- Match the public gallery's eligibility boundary before accepting a vote.
-- Keep the existing trigger and grants; DELETE must remain possible after a
-- photo is withdrawn so a user can remove an old vote.
create or replace function private.validate_wing_media_photo_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

-- Serialize recomputes before reading vote rows. Without this lock, two
-- concurrent voters can both count before the other's transaction commits,
-- then the later submission UPDATE can persist an older aggregate.
create or replace function private.refresh_wing_media_photo_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;
