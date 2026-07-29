-- Durable rating provenance for Wing Shot eligibility.
--
-- This migration preserves every existing rating entry point. Only ratings
-- accepted by submit_validated_crawl_rating after its ownership, route, score,
-- destination, and proximity checks receive eligible in-person provenance.
-- Legacy, direct, onboarding, imported, failed, and BuffaCoin ratings are not
-- backfilled and therefore remain ineligible.

begin;

create table if not exists public.rating_verification_receipts (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null
    references public.destination_ratings(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  destination_id uuid not null
    references public.destinations(id) on delete restrict,
  crawl_id uuid not null
    references public.crawls(crawl_id) on delete restrict,
  verification_type text not null check (
    verification_type in (
      'in_person_proximity',
      'administrative',
      'imported',
      'onboarding_seed',
      'unverified'
    )
  ),
  wing_shot_eligible boolean not null default false,
  eligibility_reason text not null check (
    eligibility_reason in (
      'verified_in_person',
      'administrative_rating',
      'imported_rating',
      'onboarding_seed',
      'unverified_rating'
    )
  ),
  validator_version text not null
    check (char_length(validator_version) between 1 and 80),
  accuracy_class text check (
    accuracy_class is null
    or accuracy_class in ('precise', 'approximate', 'unknown')
  ),
  distance_bucket text check (
    distance_bucket is null
    or distance_bucket = 'within_acceptance_radius'
  ),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  constraint rating_verification_receipts_rating_unique unique (rating_id),
  constraint rating_verification_receipts_identity_unique unique (
    rating_id, user_id, destination_id, crawl_id
  ),
  constraint rating_verification_receipts_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  ),
  constraint rating_verification_receipts_eligibility_shape check (
    (
      wing_shot_eligible
      and verification_type = 'in_person_proximity'
      and eligibility_reason = 'verified_in_person'
      and accuracy_class is not null
      and distance_bucket = 'within_acceptance_radius'
    )
    or (
      not wing_shot_eligible
      and verification_type <> 'in_person_proximity'
      and eligibility_reason <> 'verified_in_person'
    )
  )
);

create index if not exists rating_verification_receipts_owner_time_idx
  on public.rating_verification_receipts (user_id, verified_at desc, rating_id);

create or replace function public.reject_rating_verification_receipt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and old.user_id is not null
     and new.user_id is null
     and new.owner_deleted_at is not null
     and new.owner_pseudonym_id is not null
     and (
       to_jsonb(new) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) = (
       to_jsonb(old) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) then
    -- The sole permitted mutation is one-way identity pseudonymization during
    -- service-authoritative account deletion. Evidence itself remains intact.
    return new;
  end if;
  raise exception 'rating_verification_receipts_are_append_only'
    using errcode = '55000';
end;
$$;

drop trigger if exists rating_verification_receipts_append_only
  on public.rating_verification_receipts;
create trigger rating_verification_receipts_append_only
before update or delete on public.rating_verification_receipts
for each row execute function public.reject_rating_verification_receipt_mutation();

alter table public.rating_verification_receipts enable row level security;
revoke all on public.rating_verification_receipts from public, anon, authenticated;
grant select, insert on public.rating_verification_receipts to service_role;

create or replace function public.wing_shot_rating_is_eligible(
  p_rating_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.destination_ratings rating
    join public.rating_verification_receipts receipt
      on receipt.rating_id = rating.id
     and receipt.user_id = rating.user_id
     and receipt.destination_id = rating.destination_id
     and receipt.crawl_id = rating.crawl_id
    join public.destinations destination
      on destination.id = rating.destination_id
    join public.crawls crawl
      on crawl.crawl_id = rating.crawl_id
     and crawl.user_id = rating.user_id
    where rating.id = p_rating_id
      and rating.user_id = p_user_id
      and rating.user_id is not null
      and not coalesce(rating.is_buffacoin, false)
      and rating.crispiness between 1 and 10
      and rating.sauce between 1 and 10
      and rating.meat between 1 and 10
      and rating.overall between 1 and 10
      and nullif(btrim(destination.name), '') is not null
      and destination.lat is not null
      and destination.lng is not null
      and receipt.verification_type = 'in_person_proximity'
      and receipt.wing_shot_eligible
      and receipt.eligibility_reason = 'verified_in_person'
  );
$$;

create or replace function public.get_wing_shot_rating_eligibility(
  p_rating_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rating public.destination_ratings%rowtype;
  v_receipt public.rating_verification_receipts%rowtype;
  v_eligible boolean := false;
  v_reason text := 'unverified_rating';
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
    into v_rating
    from public.destination_ratings
   where id = p_rating_id
     and user_id = v_user_id;
  if not found then
    raise exception 'rating_not_found' using errcode = '42501';
  end if;

  select *
    into v_receipt
    from public.rating_verification_receipts
   where rating_id = p_rating_id
     and user_id = v_user_id;

  if coalesce(v_rating.is_buffacoin, false) then
    v_reason := 'buffacoin_rating';
  elsif v_rating.crispiness is null or v_rating.crispiness not between 1 and 10
     or v_rating.sauce is null or v_rating.sauce not between 1 and 10
     or v_rating.meat is null or v_rating.meat not between 1 and 10
     or v_rating.overall is null or v_rating.overall not between 1 and 10 then
    v_reason := 'incomplete_rating';
  elsif v_receipt.id is null then
    -- Includes onboarding_seed, imported, direct, legacy, and other
    -- unverified rating paths. Absence of trusted provenance is a denial.
    v_reason := 'unverified_rating';
  elsif v_receipt.verification_type <> 'in_person_proximity'
     or not v_receipt.wing_shot_eligible then
    v_reason := v_receipt.eligibility_reason;
  else
    v_eligible := public.wing_shot_rating_is_eligible(p_rating_id, v_user_id);
    v_reason := case
      when v_eligible then 'verified_in_person'
      else 'incomplete_rating'
    end;
  end if;

  return jsonb_build_object(
    'rating_id', p_rating_id,
    'eligible', v_eligible,
    'reason', v_reason,
    'verified_at', case when v_eligible then v_receipt.verified_at else null end
  );
end;
$$;

-- Replace the canonical in-person rating RPC without changing its signature.
-- Provenance is written only after the destination rating has been persisted,
-- and remains in the same transaction as referral settlement.
create or replace function public.submit_validated_crawl_rating(
  p_crawl_id uuid,p_destination_id uuid,p_latitude double precision,
  p_longitude double precision,p_accuracy_m double precision,
  p_crispiness smallint,p_sauce smallint,p_meat smallint,p_overall smallint,
  p_wings_eaten smallint default 0,p_tag_id bigint default null,
  p_sauce_style smallint default null,p_spice_level smallint default null,
  p_would_order_again boolean default null,p_flavor_vibe smallint[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_crawl public.crawls%rowtype; v_dest public.destinations%rowtype;
  v_rating_id uuid; v_distance_m double precision; v_referral jsonb;
  v_stop_order integer; v_wing_shot_eligible boolean:=false;
  v_wing_shot_reason text:='unverified_rating'; v_accuracy_class text;
  v_is_admin boolean:=auth.uid()='23898359-306a-4dd3-91f0-da66da19ccfc'::uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_crispiness is null or p_crispiness not between 1 and 10
    or p_sauce is null or p_sauce not between 1 and 10
    or p_meat is null or p_meat not between 1 and 10
    or p_overall is null or p_overall not between 1 and 10 then
    raise exception 'invalid_rating_scores';
  end if;
  select * into v_crawl from public.crawls where crawl_id=p_crawl_id and user_id=v_user;
  if not found then raise exception 'crawl_not_owned'; end if;
  if not exists(
    select 1 from public.routes r where r.id=v_crawl.route_id and p_destination_id in
      (r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id)
  ) and not exists(
    select 1 from public.route_ordered_destinations rod
      where rod.route_id=v_crawl.route_id and rod.destination_id=p_destination_id
  ) then raise exception 'destination_not_in_crawl'; end if;
  select coalesce(
    (select rod.stop_order from public.route_ordered_destinations rod
      where rod.route_id=v_crawl.route_id and rod.destination_id=p_destination_id limit 1),
    (select array_position(
      array[r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id],
      p_destination_id
    ) from public.routes r where r.id=v_crawl.route_id)
  ) into v_stop_order;
  if exists(
    with route_stops as (
      select rod.destination_id,rod.stop_order
      from public.route_ordered_destinations rod where rod.route_id=v_crawl.route_id
      union all
      select x.destination_id,x.stop_order
      from public.routes r
      cross join lateral unnest(array[
        r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id
      ]) with ordinality x(destination_id,stop_order)
      where r.id=v_crawl.route_id
        and not exists(select 1 from public.route_ordered_destinations
          where route_id=v_crawl.route_id)
    )
    select 1 from route_stops s
    where s.destination_id is not null and s.stop_order<v_stop_order
      and not exists(
        select 1 from public.destination_ratings dr
        where dr.crawl_id=p_crawl_id and dr.user_id=v_user
          and dr.destination_id=s.destination_id
      )
  ) then raise exception 'crawl_stop_order_failed'; end if;
  select * into v_dest from public.destinations where id=p_destination_id;
  if not found or nullif(btrim(v_dest.name), '') is null
    or v_dest.lat is null or v_dest.lng is null then
    raise exception 'destination_location_missing';
  end if;
  if not v_is_admin then
    if p_latitude is null or p_longitude is null
      or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'location_required';
    end if;
    if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>10000) then
      raise exception 'location_accuracy_invalid';
    end if;
    v_distance_m:=6371000*2*asin(sqrt(
      power(sin(radians((v_dest.lat::double precision-p_latitude)/2)),2)+
      cos(radians(p_latitude))*cos(radians(v_dest.lat::double precision))*
      power(sin(radians((v_dest.lng::double precision-p_longitude)/2)),2)
    ));
    -- Hidden operational acceptance tolerance. Public copy remains 100 yards.
    if v_distance_m is null or v_distance_m>804.67 then
      raise exception 'rating_proximity_failed';
    end if;
    v_wing_shot_eligible:=true;
    v_wing_shot_reason:='verified_in_person';
    v_accuracy_class:=case
      when p_accuracy_m is null then 'unknown'
      when p_accuracy_m<=100 then 'precise'
      else 'approximate'
    end;
  else
    -- Preserve the legacy administrative rating path, but it can never mint
    -- Wing Shot eligibility or Creator progression.
    v_wing_shot_reason:='administrative_rating';
  end if;
  insert into public.destination_ratings(
    destination_id,crawl_id,user_id,crispiness,sauce,meat,overall,wings_eaten,
    tag_id,sauce_style,spice_level,would_order_again,flavor_vibe,is_buffacoin
  ) values(
    p_destination_id,p_crawl_id,v_user,p_crispiness,p_sauce,p_meat,p_overall,
    coalesce(p_wings_eaten,0),p_tag_id,p_sauce_style,p_spice_level,
    p_would_order_again,p_flavor_vibe,false
  )
  on conflict(destination_id,crawl_id,user_id) do update set
    crispiness=excluded.crispiness,sauce=excluded.sauce,meat=excluded.meat,
    overall=excluded.overall,wings_eaten=excluded.wings_eaten,tag_id=excluded.tag_id,
    sauce_style=excluded.sauce_style,spice_level=excluded.spice_level,
    would_order_again=excluded.would_order_again,flavor_vibe=excluded.flavor_vibe
  returning id into v_rating_id;

  insert into public.rating_verification_receipts(
    rating_id,user_id,destination_id,crawl_id,verification_type,
    wing_shot_eligible,eligibility_reason,validator_version,
    accuracy_class,distance_bucket,metadata
  ) values(
    v_rating_id,v_user,p_destination_id,p_crawl_id,
    case when v_is_admin then 'administrative' else 'in_person_proximity' end,
    v_wing_shot_eligible,v_wing_shot_reason,'crawl_proximity_v2',
    v_accuracy_class,
    case when v_wing_shot_eligible then 'within_acceptance_radius' else null end,
    jsonb_build_object('route_membership_verified',true,'scores_complete',true)
  )
  on conflict (rating_id) do nothing;

  select receipt.wing_shot_eligible,receipt.eligibility_reason
    into v_wing_shot_eligible,v_wing_shot_reason
    from public.rating_verification_receipts receipt
   where receipt.rating_id=v_rating_id;

  -- Rating acceptance, trusted provenance, and referral settlement are one
  -- transaction. Any failure rolls all three back.
  v_referral:=public.settle_referral_for_rating_internal(v_user,v_rating_id);
  return jsonb_build_object(
    'rating_id',v_rating_id,
    'accepted',true,
    'wing_shot_eligible',coalesce(v_wing_shot_eligible,false),
    'wing_shot_eligibility_reason',coalesce(v_wing_shot_reason,'unverified_rating'),
    'referral',v_referral
  );
end;
$$;

revoke all on function public.reject_rating_verification_receipt_mutation()
  from public, anon, authenticated;
revoke all on function public.wing_shot_rating_is_eligible(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_wing_shot_rating_eligibility(uuid)
  from public, anon;
revoke all on function public.submit_validated_crawl_rating(
  uuid,uuid,double precision,double precision,double precision,
  smallint,smallint,smallint,smallint,smallint,bigint,smallint,smallint,
  boolean,smallint[]
) from public, anon;

grant execute on function public.wing_shot_rating_is_eligible(uuid, uuid)
  to service_role;
grant execute on function public.get_wing_shot_rating_eligibility(uuid)
  to authenticated, service_role;
grant execute on function public.submit_validated_crawl_rating(
  uuid,uuid,double precision,double precision,double precision,
  smallint,smallint,smallint,smallint,smallint,bigint,smallint,smallint,
  boolean,smallint[]
) to authenticated;

comment on table public.rating_verification_receipts is
  'Append-only server evidence for rating provenance. Only one-way owner pseudonymization is permitted during account deletion. No receipt or any non-in-person receipt means no Wing Shot eligibility.';
comment on function public.wing_shot_rating_is_eligible(uuid, uuid) is
  'Internal fail-closed Wing Shot eligibility predicate for upload reservation and reward boundaries.';
comment on function public.get_wing_shot_rating_eligibility(uuid) is
  'Owner-only sanitized Wing Shot eligibility result; does not expose coordinates or verification internals.';

commit;

-- Rollback: disable the Wing Shot prompt and upload reservation first. Restore
-- the prior submit_validated_crawl_rating definition before dropping these
-- functions. Preserve receipts for audit unless retention/legal review approves
-- deletion; the append-only trigger must be removed before an approved purge.
