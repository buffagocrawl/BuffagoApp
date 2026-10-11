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
