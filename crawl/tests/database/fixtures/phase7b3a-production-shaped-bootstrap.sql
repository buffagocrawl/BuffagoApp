-- PG17.6 PRODUCTION-SHAPED METADATA FIXTURE; NOT RECOVERED PRODUCTION SQL.
-- Reduced synthetic prerequisites, not recovered production baseline/history.
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant usage on schema auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);
create table public.destinations(id uuid primary key,name text default 'Synthetic Wings',lat double precision,lng double precision);
grant select on public.destinations to authenticated;
create table public.crawls(crawl_id uuid primary key);
create table public.destination_ratings(
  id uuid primary key,user_id uuid references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  crawl_id uuid not null default '88888888-8888-4888-8888-888888888888' references public.crawls(crawl_id),
  created_at timestamptz not null default now(),weight_score numeric,
  unique(destination_id,crawl_id,user_id)
);
grant select,insert,update,delete on public.destination_ratings to authenticated;
alter table public.destination_ratings enable row level security;
create policy synthetic_rating_owner on public.destination_ratings to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create table public.wing_media_submissions(
  id uuid primary key,user_id uuid,media_type text,status text,destination_id uuid,
  owner_deleted_at timestamptz,withdrawn_at timestamptz,created_at timestamptz not null default now(),
  consent_version text,consented_at timestamptz,attribution_preference text,processed_storage_path text,
  like_count integer not null default 9
);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,archived_at timestamptz,is_delete_marker boolean default false);
-- Reduced counterpart of the verified baseline's bucket/name lookup indexes.
create index synthetic_storage_bucket_name_idx on storage.objects(bucket_id,name);
create table public.wing_media_photo_votes(submission_id uuid,user_id uuid,vote smallint,primary key(submission_id,user_id));
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('77777777-7777-4777-8777-777777777777'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.destinations(id,lat,lng) values('22222222-2222-4222-8222-222222222222',42,-78),('33333333-3333-4333-8333-333333333333',null,null);
insert into public.crawls values('88888888-8888-4888-8888-888888888888'),('99999999-9999-4999-8999-999999999999');
insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,processed_storage_path)
values('44444444-4444-4444-8444-444444444444','77777777-7777-4777-8777-777777777777','photo','approved','22222222-2222-4222-8222-222222222222','v1',now(),'anonymous','processed/44444444-4444-4444-8444-444444444444/primary');
insert into storage.objects(bucket_id,name) values('wing-submissions','processed/44444444-4444-4444-8444-444444444444/primary');
insert into public.wing_media_photo_votes values('44444444-4444-4444-8444-444444444444','77777777-7777-4777-8777-777777777777',1);
-- Emulate the inherited broad defaults discovered in the production catalog.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges grant execute on functions to anon,authenticated,service_role;

create schema private;
-- Trusted baseline owners need schema resolution for PostgreSQL RI triggers.
grant usage on schema auth to supabase_auth_admin;
grant usage on schema storage to supabase_storage_admin;
alter table public.destinations alter column name set not null;
alter table public.destinations alter column lat type numeric;
alter table public.destinations alter column lng type numeric;
alter table public.destinations add column address text, add column city text;
create table public.routes(id uuid primary key);
insert into public.routes values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
alter table public.crawls add column route_id uuid default 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
alter table public.destination_ratings drop constraint destination_ratings_crawl_id_fkey;
alter table public.destination_ratings drop constraint destination_ratings_destination_id_crawl_id_user_id_key;
alter table public.destination_ratings add column is_buffacoin boolean not null default false;
alter table public.wing_media_submissions add column rating_id uuid, add column original_storage_path text,
  add column approved_at timestamptz, add column approved_by uuid,
  add column rejected_at timestamptz, add column rejection_reason text, add column featured_at timestamptz,
  add column is_publish_priority boolean not null default false, add column priority_set_at timestamptz, add column priority_set_by uuid;
alter table public.wing_media_submissions add column dislike_count integer not null default 0;
alter table public.wing_media_photo_votes add column updated_at timestamptz;
update public.wing_media_submissions set original_storage_path='original/'||user_id||'/'||id||'/upload';
alter table public.wing_media_submissions alter column media_type set not null, alter column status set not null,
  alter column destination_id set not null, alter column consent_version set not null,
  alter column consented_at set not null, alter column attribution_preference set not null;
alter table storage.objects alter column is_delete_marker set not null;
alter table auth.users add column deleted_at timestamptz, add column banned_until timestamptz;
create table public.users(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.fixture_trigger_events(name text,op text,want_count bigint);
create policy "public read ratings" on public.destination_ratings for select to public using(true);
grant select,update,trigger on public.destination_ratings,public.destinations to anon,authenticated;
create policy destinations_public_read on public.destinations for select to public using(true);
alter table public.destinations enable row level security;
alter table public.wing_media_submissions enable row level security;
alter table auth.users enable row level security;
alter table storage.objects enable row level security;
alter table auth.users owner to supabase_auth_admin;
grant select,references on auth.users to postgres;
alter table storage.objects owner to supabase_storage_admin;
grant select,update on storage.objects to postgres;
-- Matched friend-notification body; dependency bodies/config/data are surrogates.
create function public.can_user_appear_socially(uuid) returns boolean language plpgsql as $$
begin
  insert into public.fixture_trigger_events select 'fixture_social_dependency','INSERT',count(*) from public.user_want_to_try;
  return true;
end;
$$;
create function public.friend_pair_is_blocked(uuid,uuid) returns boolean language sql as $$ select false $$;
create table public.friendships(requester_id uuid,addressee_id uuid,status text);
create table public.notification_preferences(user_id uuid,friend_activity boolean);
create table public.engagement_feature_flags(flag_key text,enabled boolean);
create table public.notification_outbox(user_id uuid,event_type text,source_entity_type text,source_entity_id text,
  deduplication_key text,deep_link text,fallback_route text,copy_data jsonb,expires_at timestamptz,
  unique(user_id,event_type,deduplication_key));
alter table public.crawls add constraint crawls_route_id_fkey FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE;
alter table public.destination_ratings add constraint destination_ratings_crawl_id_fkey FOREIGN KEY (crawl_id) REFERENCES crawls(crawl_id) ON DELETE CASCADE;
alter table public.destination_ratings add constraint destination_ratings_dest_crawl_user_uniq UNIQUE (destination_id, crawl_id, user_id);
alter table public.wing_media_submissions add constraint wing_media_submissions_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE RESTRICT;
alter table public.wing_media_submissions add constraint wing_media_submissions_rating_id_fkey FOREIGN KEY (rating_id) REFERENCES destination_ratings(id) ON DELETE RESTRICT;
alter table public.wing_media_submissions add constraint wing_media_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.wing_media_submissions add constraint wing_media_submissions_one_per_rating UNIQUE (rating_id);
alter table public.wing_media_submissions add constraint wing_media_submissions_approval_shape CHECK (approved_at IS NULL AND approved_by IS NULL OR approved_at IS NOT NULL AND approved_by IS NOT NULL);
alter table public.wing_media_submissions add constraint wing_media_submissions_owner_deletion_shape CHECK (user_id IS NOT NULL AND owner_deleted_at IS NULL OR user_id IS NULL AND owner_deleted_at IS NOT NULL);
alter table public.wing_media_submissions add constraint wing_media_submissions_path_ownership CHECK (split_part(original_storage_path, '/'::text, 3) = id::text AND (user_id IS NOT NULL AND split_part(original_storage_path, '/'::text, 2) = user_id::text OR user_id IS NULL AND owner_deleted_at IS NOT NULL));
alter table public.wing_media_submissions add constraint wing_media_submissions_media_type_check CHECK (media_type = ANY (ARRAY['photo'::text, 'video'::text]));
alter table public.wing_media_submissions add constraint wing_media_submissions_status_check CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'generation_pending'::text, 'ready_to_post'::text, 'scheduled'::text, 'posting'::text, 'posted'::text, 'failed'::text, 'withdrawn'::text]));
alter table public.wing_media_submissions add constraint wing_media_submissions_terminal_shape CHECK ((status <> 'rejected'::text OR rejected_at IS NOT NULL) AND (status <> 'posted'::text OR featured_at IS NOT NULL) AND (status <> 'withdrawn'::text OR withdrawn_at IS NOT NULL));
alter table public.wing_media_submissions add constraint wing_media_submissions_rejection_shape CHECK (rejected_at IS NULL AND rejection_reason IS NULL OR rejected_at IS NOT NULL AND rejection_reason IS NOT NULL);
create table public.social_content_jobs(fixture_id uuid primary key);
alter table public.social_content_jobs add column submission_id uuid, add constraint social_content_jobs_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_admin_actions(fixture_id uuid primary key);
alter table public.wing_admin_actions add column submission_id uuid, add constraint wing_admin_actions_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_content_review_requests(fixture_id uuid primary key);
alter table public.wing_content_review_requests add column submission_id uuid, add constraint wing_content_review_requests_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_creator_badge_events(fixture_id uuid primary key);
alter table public.wing_creator_badge_events add column trigger_submission_id uuid, add constraint wing_creator_badge_events_trigger_submission_id_fkey foreign key(trigger_submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_creator_reward_events(fixture_id uuid primary key);
alter table public.wing_creator_reward_events add column submission_id uuid, add constraint wing_creator_reward_events_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_generation_jobs(fixture_id uuid primary key);
alter table public.wing_generation_jobs add column submission_id uuid, add constraint wing_generation_jobs_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_media_cleanup_jobs(fixture_id uuid primary key);
alter table public.wing_media_cleanup_jobs add column submission_id uuid, add constraint wing_media_cleanup_jobs_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_media_fingerprints(fixture_id uuid primary key);
alter table public.wing_media_fingerprints add column submission_id uuid, add constraint wing_media_fingerprints_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_moderation_decisions(fixture_id uuid primary key);
alter table public.wing_moderation_decisions add column submission_id uuid, add constraint wing_moderation_decisions_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_nightly_run_receipts(fixture_id uuid primary key);
alter table public.wing_nightly_run_receipts add column selected_submission_id uuid, add constraint wing_nightly_run_receipts_selected_submission_id_fkey foreign key(selected_submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_notification_receipts(fixture_id uuid primary key);
alter table public.wing_notification_receipts add column submission_id uuid, add constraint wing_notification_receipts_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_photo_derivative_jobs(fixture_id uuid primary key);
alter table public.wing_photo_derivative_jobs add column submission_id uuid, add constraint wing_photo_derivative_jobs_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_processing_jobs(fixture_id uuid primary key);
alter table public.wing_processing_jobs add column submission_id uuid, add constraint wing_processing_jobs_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_submission_abuse_signals(fixture_id uuid primary key);
alter table public.wing_submission_abuse_signals add column submission_id uuid, add constraint wing_submission_abuse_signals_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_submission_state_transitions(fixture_id uuid primary key);
alter table public.wing_submission_state_transitions add column submission_id uuid, add constraint wing_submission_state_transitions_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete restrict;
create table public.wing_media_access_requests(fixture_id uuid primary key);
alter table public.wing_media_access_requests add column submission_id uuid, add constraint wing_media_access_requests_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete cascade;
create table public.wing_media_exact_fingerprints(fixture_id uuid primary key);
alter table public.wing_media_exact_fingerprints add column submission_id uuid, add constraint wing_media_exact_fingerprints_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete cascade;
alter table public.wing_media_photo_votes add constraint wing_media_photo_votes_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete cascade;
alter table public.wing_media_fingerprints add column nearest_submission_id uuid, add constraint wing_media_fingerprints_nearest_submission_id_fkey foreign key(nearest_submission_id) references public.wing_media_submissions(id) on delete set null;
alter table public.wing_submission_abuse_signals add column related_submission_id uuid, add constraint wing_submission_abuse_signals_related_submission_id_fkey foreign key(related_submission_id) references public.wing_media_submissions(id) on delete set null;
alter table public.wing_media_photo_votes add constraint wing_media_photo_votes_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
create or replace function public.enqueue_friend_rating_notification()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;
CREATE TRIGGER destination_rating_friend_notification AFTER INSERT ON destination_ratings FOR EACH ROW EXECUTE FUNCTION enqueue_friend_rating_notification();
create or replace function public.guard_buffacoin_rating_writes()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.is_buffacoin and
     current_setting('buffago.atomic_buffacoin_write', true) is distinct from 'on' then
    raise exception 'buffacoin_rating_requires_atomic_transaction';
  end if;
  return new;
end;
$$;
CREATE TRIGGER guard_buffacoin_rating_writes BEFORE INSERT OR UPDATE OF is_buffacoin ON destination_ratings FOR EACH ROW EXECUTE FUNCTION guard_buffacoin_rating_writes();
-- SURROGATE: actual public."Badge_Add_Rating_Milestones" implementation is unverified.
create function public."Badge_Add_Rating_Milestones"() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
alter function public."Badge_Add_Rating_Milestones"() set search_path=public;
CREATE TRIGGER trg_rating_after_insert AFTER INSERT ON destination_ratings FOR EACH ROW EXECUTE FUNCTION "Badge_Add_Rating_Milestones"();
create or replace function public.mango_clear_ineligible_priority()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'approved' or new.featured_at is not null then
    new.is_publish_priority := false;
    new.priority_set_at := null;
    new.priority_set_by := null;
  end if;
  return new;
end;
$$;
CREATE TRIGGER mango_clear_ineligible_priority BEFORE UPDATE OF status, featured_at, is_publish_priority ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION mango_clear_ineligible_priority();
create or replace function public.wing_apply_owner_pseudonymization()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.owner_deleted_at := coalesce(new.owner_deleted_at, now());
  elsif old.user_id is null and new.user_id is not null then
    raise exception 'wing_owner_reidentification_forbidden';
  end if;
  return new;
end;
$$;
CREATE TRIGGER wing_media_submissions_owner_pseudonymization BEFORE UPDATE OF user_id ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION wing_apply_owner_pseudonymization();
-- SURROGATE: actual public.guard_wing_photo_approval implementation is unverified.
create function public.guard_wing_photo_approval() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER wing_photo_approval_guard BEFORE UPDATE OF status ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION guard_wing_photo_approval();
-- SURROGATE: actual public.enqueue_wing_photo_upload_derivatives implementation is unverified.
create function public.enqueue_wing_photo_upload_derivatives() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER wing_photo_upload_derivatives AFTER INSERT ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION enqueue_wing_photo_upload_derivatives();
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
revoke all on function private.refresh_wing_media_photo_vote_counts() from public,anon,authenticated,service_role;
CREATE TRIGGER trg_refresh_wing_media_photo_vote_counts AFTER INSERT OR DELETE OR UPDATE ON wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.refresh_wing_media_photo_vote_counts();
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
revoke all on function private.validate_wing_media_photo_vote() from public,anon,authenticated,service_role;
CREATE TRIGGER trg_validate_wing_media_photo_vote BEFORE INSERT OR UPDATE ON wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.validate_wing_media_photo_vote();
-- SURROGATE: actual public.ensure_new_user_referral_code implementation is unverified.
create function public.ensure_new_user_referral_code() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER auth_user_referral_code AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION ensure_new_user_referral_code();
-- SURROGATE: actual public.flag_referral_account_deletion implementation is unverified.
create function public.flag_referral_account_deletion() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER auth_user_referral_deletion_signal BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION flag_referral_account_deletion();
-- SURROGATE: actual public.handle_new_auth_user implementation is unverified.
create function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
-- SURROGATE: actual public.refresh_referral_code_after_auth_change implementation is unverified.
create function public.refresh_referral_code_after_auth_change() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER referral_code_profile_eligibility_auth AFTER INSERT OR UPDATE OF deleted_at, banned_until ON auth.users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_auth_change();
-- SURROGATE: actual public.restore_referral_code_after_profile_insert implementation is unverified.
create function public.restore_referral_code_after_profile_insert() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER referral_code_profile_eligibility AFTER INSERT OR UPDATE OF user_id ON users FOR EACH ROW EXECUTE FUNCTION restore_referral_code_after_profile_insert();
-- SURROGATE: actual public.refresh_referral_code_after_profile_delete implementation is unverified.
create function public.refresh_referral_code_after_profile_delete() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER referral_code_profile_eligibility_delete AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_profile_delete();
-- SURROGATE: actual public.give_new_user_starting_coins implementation is unverified.
create function public.give_new_user_starting_coins() returns trigger language plpgsql security definer set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
CREATE TRIGGER trg_new_user_starting_coins AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION give_new_user_starting_coins();
-- SURROGATE: actual storage.protect_delete implementation is unverified.
create function storage.protect_delete() returns trigger language plpgsql  set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
alter function storage.protect_delete() owner to supabase_storage_admin;
CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
-- SURROGATE: actual storage.update_updated_at_column implementation is unverified.
create function storage.update_updated_at_column() returns trigger language plpgsql  set search_path=pg_catalog as $fixture$begin insert into public.fixture_trigger_events select tg_name,tg_op,(case when tg_name='trg_rating_after_insert' then (select count(*) from public.user_want_to_try) else null end); if current_setting('buffago.fixture_after_fail',true)='on' and tg_name='trg_rating_after_insert' then raise exception 'fixture_reward_failure'; end if; if tg_op='DELETE' then return old; end if; return new; end;$fixture$;
alter function storage.update_updated_at_column() owner to supabase_storage_admin;
CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();
