-- Exact Wing Shot duplicate classification.  Perceptual/frame fingerprints remain
-- advisory; only a byte-for-byte SHA-256 match can produce DUPLICATE_MEDIA.
begin;

create table if not exists public.wing_media_exact_fingerprints (
  submission_id uuid primary key references public.wing_media_submissions(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  unique (media_type, sha256, size_bytes)
);

alter table public.wing_media_exact_fingerprints enable row level security;
revoke all on public.wing_media_exact_fingerprints from public, anon, authenticated;
grant all on public.wing_media_exact_fingerprints to service_role;

create or replace function public.register_wing_exact_media(
  p_submission_id uuid, p_media_type text, p_sha256 text, p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
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
$$;
revoke all on function public.register_wing_exact_media(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.register_wing_exact_media(uuid,text,text,bigint) to service_role;

-- Owner-safe surface: a failed processing row gets a sanitized display state.
create or replace function public.get_my_wing_submission_detail(p_submission_id uuid)
returns table (submission_id uuid, rating_id uuid, destination_id uuid, destination_name text,
  destination_city text, media_type text, internal_status text, display_status text,
  attribution_preference text, user_caption text, rejection_category text,
  approved_at timestamptz, featured_at timestamptz, created_at timestamptz, updated_at timestamptz,
  featured_platform text, external_permalink text, can_withdraw boolean, preview_available boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select s.id, s.rating_id, s.destination_id, d.name, d.city, s.media_type, s.status,
    case when s.status = 'posted' then 'Featured'
      when s.status = 'approved' then 'Approved'
      when s.status in ('generation_pending','ready_to_post','scheduled','posting') then 'Not Selected Yet'
      when s.status = 'in_review' then 'In Review'
      when s.status in ('uploaded','processing') then 'Processing'
      when s.status = 'failed' and latest.last_error_code = 'DUPLICATE_MEDIA' then 'Duplicate video'
      when s.status = 'failed' then 'Video couldn''t be processed'
      when s.status = 'rejected' then 'Rejected'
      when s.status = 'withdrawn' then 'Withdrawn' else 'Processing' end,
    s.attribution_preference, s.user_caption,
    case when s.status = 'failed' and latest.last_error_code = 'DUPLICATE_MEDIA'
      then 'This clip matches a previous Wing Shot and cannot be submitted again.'
      when s.status = 'failed' then 'We couldn''t prepare this video for review. Try recording or choosing a different clip.'
      when s.status = 'rejected' then public.wing_safe_rejection_category(s.rejection_reason) end,
    s.approved_at, s.featured_at, s.created_at, s.updated_at, null, null,
    s.status not in ('rejected','failed','posted','withdrawn'), s.thumbnail_storage_path is not null
  from public.wing_media_submissions s
  join public.destinations d on d.id = s.destination_id
  left join lateral (select j.last_error_code from public.wing_processing_jobs j
    where j.submission_id = s.id order by j.updated_at desc, j.id desc limit 1) latest on true
  where s.id = p_submission_id and s.user_id = auth.uid();
$$;
revoke all on function public.get_my_wing_submission_detail(uuid) from public, anon;
grant execute on function public.get_my_wing_submission_detail(uuid) to authenticated, service_role;

-- Forward-only repair for the three observed rows. It is deliberately fixed to
-- this allowlist and requires all three private storage objects to share both
-- byte size and ETag; no INVALID_MEDIA row outside this set is touched.
do $$
declare v_matches integer; v_rows integer;
begin
  with known(id) as (values
    ('2f55fb57-b8e7-4d34-8a29-db3e24ee76b2'::uuid),
    ('5dfe14e4-fd4e-495a-b69d-ceac242cd178'::uuid),
    ('d9cb8282-4947-41b6-9674-832fdf534cf3'::uuid)),
  objects as (
    select s.id, o.etag, o.metadata->>'size' as size_text
    from public.wing_media_submissions s
    join known k on k.id = s.id
    join storage.objects o on o.bucket_id = 'wing-submissions' and o.name = s.original_storage_path
    where s.status = 'failed')
  select count(*) into v_rows from objects;
  with known(id) as (values
    ('2f55fb57-b8e7-4d34-8a29-db3e24ee76b2'::uuid),
    ('5dfe14e4-fd4e-495a-b69d-ceac242cd178'::uuid),
    ('d9cb8282-4947-41b6-9674-832fdf534cf3'::uuid)),
  objects as (
    select o.etag, o.metadata->>'size' as size_text
    from public.wing_media_submissions s join known k on k.id = s.id
    join storage.objects o on o.bucket_id = 'wing-submissions' and o.name = s.original_storage_path
    where s.status = 'failed')
  select count(distinct coalesce(etag,'') || ':' || coalesce(size_text,'')) into v_matches from objects;
  if v_rows = 3 and v_matches = 1 then
    update public.wing_processing_jobs j set last_error_code = 'DUPLICATE_MEDIA',
      last_error_reason = 'Exact duplicate detected; processing stopped; no publication occurred.', updated_at = now()
    where j.submission_id in (
      '2f55fb57-b8e7-4d34-8a29-db3e24ee76b2'::uuid,
      '5dfe14e4-fd4e-495a-b69d-ceac242cd178'::uuid,
      'd9cb8282-4947-41b6-9674-832fdf534cf3'::uuid)
      and j.status = 'dead';
  end if;
end $$;

commit;
