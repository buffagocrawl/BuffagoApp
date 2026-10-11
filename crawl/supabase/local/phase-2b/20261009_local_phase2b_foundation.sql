-- BUFFAGO PHASE 2B LOCAL-ONLY FOUNDATION
--
-- This file is deliberately outside supabase/migrations/. It is a staged
-- development artifact and must not be treated as deployed or as a repair to
-- historical migration metadata.

begin;

create schema if not exists private;

create table if not exists public.user_destination_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, destination_id)
);

create index if not exists user_destination_favorites_destination_idx
  on public.user_destination_favorites (destination_id, created_at desc);

create table if not exists public.user_want_to_try (
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, destination_id)
);

create index if not exists user_want_to_try_destination_idx
  on public.user_want_to_try (destination_id, created_at desc);

create table if not exists public.wing_jury_votes (
  submission_id uuid not null references public.wing_media_submissions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 0, 1)),
  created_at timestamptz not null default now(),
  primary key (submission_id, user_id)
);

create index if not exists wing_jury_votes_user_idx
  on public.wing_jury_votes (user_id, created_at desc);

create table if not exists public.wing_jury_photo_vote_counts (
  submission_id uuid primary key references public.wing_media_submissions(id) on delete cascade,
  like_count integer not null default 0 check (like_count >= 0),
  neutral_count integer not null default 0 check (neutral_count >= 0),
  dislike_count integer not null default 0 check (dislike_count >= 0),
  updated_at timestamptz not null default now(),
  constraint wing_jury_photo_vote_counts_total_nonnegative check (
    like_count + neutral_count + dislike_count >= 0
  )
);

create index if not exists wing_jury_photo_vote_counts_like_idx
  on public.wing_jury_photo_vote_counts (like_count desc, submission_id);

-- Wing Jury discovery is served by the trusted Edge Function. Keep candidate
-- selection bounded and make the approved-photo path indexable without
-- changing the historical migration chain.
create index if not exists wing_media_submissions_wing_jury_candidate_idx
  on public.wing_media_submissions (destination_id, created_at, id)
  where media_type = 'photo'
    and status = 'approved'
    and processed_storage_path is not null
    and owner_deleted_at is null
    and withdrawn_at is null;

create index if not exists wing_jury_votes_submission_vote_idx
  on public.wing_jury_votes (submission_id, vote);

create or replace function private.lock_user_destination(
  p_user_id uuid,
  p_destination_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
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
$function$;

create or replace function private.require_authenticated_user()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
begin
  if v_user_id is null or v_anonymous then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  return v_user_id;
end;
$function$;

create or replace function private.validate_favorite_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
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
$function$;

create or replace function private.validate_want_to_try_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
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
$function$;

create or replace function private.remove_want_to_try_after_rating()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.lock_user_destination(new.user_id, new.destination_id);
  delete from public.user_want_to_try
   where user_id = new.user_id and destination_id = new.destination_id;
  return new;
end;
$function$;

-- Lock both identities before any rating mutation, in the same order for
-- reassignment in either direction. Collection inserts use these same locks.
create or replace function private.lock_rating_collection_identities()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
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
$function$;

create or replace function private.remove_favorite_after_rating_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
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
$function$;

create or replace function private.is_public_wing_jury_photo(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select exists (
    select 1
      from public.wing_media_submissions photo
     where photo.id = p_submission_id
       and photo.media_type = 'photo'
       and photo.status = 'approved'
       and photo.user_id is not null
       and photo.owner_deleted_at is null
       and photo.withdrawn_at is null
       and nullif(btrim(photo.consent_version), '') is not null
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
$function$;

-- The Edge service can revalidate a public photo without exposing the private
-- schema or storage catalog to clients. This endpoint is service-role-only.
create or replace function public.is_public_wing_jury_photo(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.is_public_wing_jury_photo(p_submission_id);
$function$;

create or replace function public.wing_jury_restaurant_rating_summary(p_destination_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'average_weight_score', avg(rating.weight_score),
    'rating_count', count(rating.weight_score)
  )
  from public.destination_ratings rating
  where rating.destination_id = p_destination_id;
$function$;

-- Catalog-wide ordering is computed by PostgreSQL before the bounded result.
-- Distance ordering scans/sorts eligible rows; this is not an index-nearest or
-- constant-time query. No radius, destination cap, or photo cap truncates it.
create or replace function public.wing_jury_feed_candidates(
  p_latitude double precision,
  p_longitude double precision,
  p_user_id uuid,
  p_judged_submission_ids uuid[],
  p_after_distance double precision,
  p_after_destination_id uuid,
  p_after_created_at timestamptz,
  p_after_submission_id uuid,
  p_limit integer
)
returns table (
  id uuid, destination_id uuid, user_id uuid, media_type text, status text,
  processed_storage_path text, owner_deleted_at timestamptz,
  withdrawn_at timestamptz, consent_version text, consented_at timestamptz,
  attribution_preference text, created_at text, distance double precision
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 120 then
    raise exception 'invalid_feed_limit' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and not (p_latitude between -90 and 90
       and p_longitude between -180 and 180)) then
    raise exception 'invalid_feed_location' using errcode = '22023';
  end if;
  if cardinality(p_judged_submission_ids) > 500
     or array_position(p_judged_submission_ids, null) is not null then
    raise exception 'invalid_feed_exclusions' using errcode = '22023';
  end if;
  if (p_after_destination_id is null and (p_after_created_at is not null
       or p_after_submission_id is not null or p_after_distance is not null))
     or (p_after_destination_id is not null and (p_after_created_at is null
       or p_after_submission_id is null))
     or (p_after_distance is not null and not (p_after_distance >= 0
       and p_after_distance <= pi() * 6371000))
     or (p_latitude is null and p_after_distance is not null)
     or (p_after_created_at is not null and not isfinite(p_after_created_at)) then
    raise exception 'invalid_feed_position' using errcode = '22023';
  end if;
  return query
    with candidates as (
      select photo.*,
        case when p_latitude is not null
          and destination.lat between -90 and 90
          and destination.lng between -180 and 180
        then 2 * 6371000 * asin(sqrt(least(1::double precision, greatest(0::double precision,
          power(sin(radians(destination.lat::double precision - p_latitude) / 2), 2)
          + cos(radians(p_latitude)) * cos(radians(destination.lat::double precision))
          * power(sin(radians(destination.lng::double precision - p_longitude) / 2), 2)
        )))) else null::double precision end as feed_distance
      from public.wing_media_submissions photo
      join public.destinations destination on destination.id = photo.destination_id
      where photo.media_type = 'photo' and photo.status = 'approved'
        and photo.processed_storage_path is not null
        and photo.owner_deleted_at is null and photo.withdrawn_at is null
        and photo.created_at is not null and isfinite(photo.created_at)
        and private.is_public_wing_jury_photo(photo.id)
        and (p_user_id is null or not exists (
          select 1 from public.wing_jury_votes verdict
          where verdict.submission_id = photo.id and verdict.user_id = p_user_id
        ))
        and (p_user_id is not null or not (photo.id = any(coalesce(p_judged_submission_ids, '{}'::uuid[]))))
    )
    select candidate.id, candidate.destination_id, candidate.user_id,
      candidate.media_type::text, candidate.status::text,
      candidate.processed_storage_path::text, candidate.owner_deleted_at,
      candidate.withdrawn_at, candidate.consent_version::text, candidate.consented_at,
      candidate.attribution_preference::text,
      to_char(candidate.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      candidate.feed_distance
    from candidates candidate
    where p_after_destination_id is null or
      (coalesce(candidate.feed_distance, 'Infinity'::double precision),
        candidate.destination_id, candidate.created_at, candidate.id) >
      (coalesce(p_after_distance, 'Infinity'::double precision),
        p_after_destination_id, p_after_created_at, p_after_submission_id)
    order by candidate.feed_distance nulls last,
      candidate.destination_id, candidate.created_at, candidate.id
    limit p_limit;
end;
$function$;

create or replace function private.validate_wing_jury_vote_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
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
$function$;

create or replace function private.enforce_wing_jury_vote_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  -- Parent removal is the only supported deletion: FK cascades run after the
  -- auth-user row disappears. Even privileged direct verdict edits are denied.
  if tg_op = 'DELETE' and not exists (
    select 1 from auth.users account where account.id = old.user_id
  ) then
    return old;
  end if;
  raise exception 'wing_jury_vote_is_immutable' using errcode = '42501';
end;
$function$;

create or replace function private.refresh_wing_jury_photo_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_submission_id uuid := new.submission_id;
begin
  -- Atomic row arithmetic serializes concurrent changes without recounting a
  -- potentially stale statement snapshot. DELETE is limited to auth cascades.
  if tg_op = 'DELETE' then
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
$function$;

drop trigger if exists user_destination_favorites_validate_insert
  on public.user_destination_favorites;
create trigger user_destination_favorites_validate_insert
before insert on public.user_destination_favorites
for each row execute function private.validate_favorite_insert();

drop trigger if exists user_want_to_try_validate_insert
  on public.user_want_to_try;
create trigger user_want_to_try_validate_insert
before insert on public.user_want_to_try
for each row execute function private.validate_want_to_try_insert();

drop trigger if exists destination_ratings_lock_collection_identities
  on public.destination_ratings;
create trigger destination_ratings_lock_collection_identities
before insert or update or delete on public.destination_ratings
for each row execute function private.lock_rating_collection_identities();

drop trigger if exists destination_ratings_remove_want_to_try
  on public.destination_ratings;
create trigger destination_ratings_remove_want_to_try
after insert on public.destination_ratings
for each row execute function private.remove_want_to_try_after_rating();

drop trigger if exists destination_ratings_update_want_to_try
  on public.destination_ratings;
create trigger destination_ratings_update_want_to_try
after update on public.destination_ratings
for each row execute function private.remove_want_to_try_after_rating();

drop trigger if exists destination_ratings_remove_invalid_favorite
  on public.destination_ratings;
create trigger destination_ratings_remove_invalid_favorite
after delete or update on public.destination_ratings
for each row execute function private.remove_favorite_after_rating_delete();

drop trigger if exists wing_jury_votes_validate_insert
  on public.wing_jury_votes;
create trigger wing_jury_votes_validate_insert
before insert on public.wing_jury_votes
for each row execute function private.validate_wing_jury_vote_insert();

drop trigger if exists wing_jury_votes_enforce_immutability
  on public.wing_jury_votes;
create trigger wing_jury_votes_enforce_immutability
before update or delete on public.wing_jury_votes
for each row execute function private.enforce_wing_jury_vote_immutability();

drop trigger if exists wing_jury_votes_refresh_counts
  on public.wing_jury_votes;
create trigger wing_jury_votes_refresh_counts
after insert or delete on public.wing_jury_votes
for each row execute function private.refresh_wing_jury_photo_vote_counts();

alter table public.user_destination_favorites enable row level security;
alter table public.user_want_to_try enable row level security;
alter table public.wing_jury_votes enable row level security;
alter table public.wing_jury_photo_vote_counts enable row level security;

revoke all on public.user_destination_favorites from public, anon, authenticated, service_role;
grant select on public.user_destination_favorites to service_role;
grant select, insert, delete on public.user_destination_favorites to authenticated;
drop policy if exists user_destination_favorites_own_select on public.user_destination_favorites;
drop policy if exists user_destination_favorites_own_insert on public.user_destination_favorites;
drop policy if exists user_destination_favorites_own_delete on public.user_destination_favorites;
create policy user_destination_favorites_own_select
  on public.user_destination_favorites for select to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_destination_favorites_own_insert
  on public.user_destination_favorites for insert to authenticated
  with check (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_destination_favorites_own_delete
  on public.user_destination_favorites for delete to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on public.user_want_to_try from public, anon, authenticated, service_role;
grant select on public.user_want_to_try to service_role;
grant select, insert, delete on public.user_want_to_try to authenticated;
drop policy if exists user_want_to_try_own_select on public.user_want_to_try;
drop policy if exists user_want_to_try_own_insert on public.user_want_to_try;
drop policy if exists user_want_to_try_own_delete on public.user_want_to_try;
create policy user_want_to_try_own_select
  on public.user_want_to_try for select to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_want_to_try_own_insert
  on public.user_want_to_try for insert to authenticated
  with check (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy user_want_to_try_own_delete
  on public.user_want_to_try for delete to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on public.wing_jury_votes from public, anon, authenticated, service_role;
grant select on public.wing_jury_votes to service_role;
grant select, insert on public.wing_jury_votes to authenticated;
drop policy if exists wing_jury_votes_own_select on public.wing_jury_votes;
drop policy if exists wing_jury_votes_own_insert on public.wing_jury_votes;
create policy wing_jury_votes_own_select
  on public.wing_jury_votes for select to authenticated
  using (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy wing_jury_votes_own_insert
  on public.wing_jury_votes for insert to authenticated
  with check (user_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on public.wing_jury_photo_vote_counts from public, anon, authenticated, service_role;
grant select on public.wing_jury_photo_vote_counts to service_role;
grant select on public.wing_jury_photo_vote_counts to authenticated;
drop policy if exists wing_jury_photo_vote_counts_public_select on public.wing_jury_photo_vote_counts;
create policy wing_jury_photo_vote_counts_public_select
  on public.wing_jury_photo_vote_counts for select to authenticated
  using ((select auth.uid()) is not null
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
    and private.is_public_wing_jury_photo(submission_id));

revoke all on function private.lock_user_destination(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.require_authenticated_user()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_favorite_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_want_to_try_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.remove_want_to_try_after_rating()
  from public, anon, authenticated, service_role;
revoke all on function private.remove_favorite_after_rating_delete()
  from public, anon, authenticated, service_role;
revoke all on function private.is_public_wing_jury_photo(uuid)
  from public, anon, authenticated, service_role;
-- RLS needs to evaluate the trusted eligibility predicate. The private schema
-- remains non-exposed; this grant is not a public API grant.
grant execute on function private.is_public_wing_jury_photo(uuid)
  to authenticated;
revoke all on function private.validate_wing_jury_vote_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.refresh_wing_jury_photo_vote_counts()
  from public, anon, authenticated, service_role;
revoke all on function private.lock_rating_collection_identities()
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_wing_jury_vote_immutability()
  from public, anon, authenticated, service_role;
revoke all on function public.is_public_wing_jury_photo(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_public_wing_jury_photo(uuid) to service_role;
revoke all on function public.wing_jury_restaurant_rating_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.wing_jury_restaurant_rating_summary(uuid) to service_role;
revoke all on function public.wing_jury_feed_candidates(double precision, double precision, uuid, uuid[], double precision, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wing_jury_feed_candidates(double precision, double precision, uuid, uuid[], double precision, uuid, timestamptz, uuid, integer)
  to service_role;

comment on table public.user_destination_favorites is
  'Local Phase 2B foundation: one authenticated user favorite per destination, requiring an existing user rating.';
comment on table public.user_want_to_try is
  'Local Phase 2B foundation: one authenticated unrated destination save per user; successful rating insertion or update removes it.';
comment on table public.wing_jury_votes is
  'Local Phase 2B foundation: immutable authenticated blind-jury votes, separate from mutable gallery votes.';

commit;
