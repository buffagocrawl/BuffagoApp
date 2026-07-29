-- Server-authoritative standalone restaurant rating used by the Home surface.
-- This closes the provenance gap left by the route-bound crawl RPC while
-- keeping administrative and guest activity ineligible for Wing Shots.

begin;

create table if not exists public.rating_submission_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  rating_id uuid not null references public.destination_ratings(id) on delete restrict,
  crawl_id uuid not null references public.crawls(crawl_id) on delete restrict,
  surface text not null check (surface in ('home_restaurant')),
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

alter table public.rating_submission_operations enable row level security;
revoke all on public.rating_submission_operations from public, anon, authenticated;
grant all on public.rating_submission_operations to service_role;

create or replace function public.submit_validated_restaurant_rating(
  p_operation_id uuid,
  p_destination_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision,
  p_crispiness smallint,
  p_sauce smallint,
  p_meat smallint,
  p_overall smallint,
  p_wings_eaten smallint default 0,
  p_tag_id bigint default null,
  p_sauce_style smallint default null,
  p_spice_level smallint default null,
  p_would_order_again boolean default null,
  p_flavor_vibe smallint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_destination public.destinations%rowtype;
  v_existing public.rating_submission_operations%rowtype;
  v_crawl_id uuid := gen_random_uuid();
  v_rating_id uuid;
  v_distance_m double precision;
  v_referral jsonb;
  v_wing_shot_eligible boolean := false;
  v_reason text := 'unverified_rating';
  v_accuracy_class text;
  v_is_admin boolean := auth.uid() = '23898359-306a-4dd3-91f0-da66da19ccfc'::uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation_id_required';
  end if;

  select *
    into v_existing
    from public.rating_submission_operations
   where user_id = v_user
     and operation_id = p_operation_id;
  if found then
    select receipt.wing_shot_eligible, receipt.eligibility_reason
      into v_wing_shot_eligible, v_reason
      from public.rating_verification_receipts receipt
     where receipt.rating_id = v_existing.rating_id;
    return jsonb_build_object(
      'rating_id', v_existing.rating_id,
      'crawl_id', v_existing.crawl_id,
      'accepted', true,
      'idempotent_replay', true,
      'wing_shot_eligible', coalesce(v_wing_shot_eligible, false),
      'wing_shot_eligibility_reason', coalesce(v_reason, 'unverified_rating')
    );
  end if;

  if p_crispiness is null or p_crispiness not between 1 and 10
     or p_sauce is null or p_sauce not between 1 and 10
     or p_meat is null or p_meat not between 1 and 10
     or p_overall is null or p_overall not between 1 and 10 then
    raise exception 'invalid_rating_scores';
  end if;
  if p_wings_eaten is not null and p_wings_eaten not between 0 and 100 then
    raise exception 'invalid_wings_eaten';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 10000) then
    raise exception 'location_accuracy_invalid';
  end if;

  select *
    into v_destination
    from public.destinations
   where id = p_destination_id;
  if not found
     or nullif(btrim(v_destination.name), '') is null
     or v_destination.lat is null
     or v_destination.lng is null then
    raise exception 'destination_location_missing';
  end if;

  if v_is_admin then
    v_reason := 'administrative_rating';
  else
    if p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90
       or p_longitude not between -180 and 180 then
      raise exception 'location_required';
    end if;
    v_distance_m := 6371000 * 2 * asin(sqrt(
      power(sin(radians((v_destination.lat::double precision - p_latitude) / 2)), 2)
      + cos(radians(p_latitude))
      * cos(radians(v_destination.lat::double precision))
      * power(sin(radians((v_destination.lng::double precision - p_longitude) / 2)), 2)
    ));
    if v_distance_m is null or v_distance_m > 804.67 then
      raise exception 'rating_proximity_failed';
    end if;
    v_wing_shot_eligible := true;
    v_reason := 'verified_in_person';
    v_accuracy_class := case
      when p_accuracy_m is null then 'unknown'
      when p_accuracy_m <= 100 then 'precise'
      else 'approximate'
    end;
  end if;

  insert into public.crawls (
    crawl_id, route_id, is_solo, user_id, status, start_time, end_time
  ) values (
    v_crawl_id, null, true, v_user, 'completed', now(), now()
  );

  insert into public.destination_ratings (
    destination_id, crawl_id, user_id, crispiness, sauce, meat, overall,
    wings_eaten, tag_id, sauce_style, spice_level, would_order_again,
    flavor_vibe, is_buffacoin
  ) values (
    p_destination_id, v_crawl_id, v_user, p_crispiness, p_sauce, p_meat,
    p_overall, coalesce(p_wings_eaten, 0), p_tag_id, p_sauce_style,
    p_spice_level, p_would_order_again, p_flavor_vibe, false
  )
  returning id into v_rating_id;

  insert into public.rating_verification_receipts (
    rating_id, user_id, destination_id, crawl_id, verification_type,
    wing_shot_eligible, eligibility_reason, validator_version,
    accuracy_class, distance_bucket, metadata
  ) values (
    v_rating_id, v_user, p_destination_id, v_crawl_id,
    case when v_is_admin then 'administrative' else 'in_person_proximity' end,
    v_wing_shot_eligible, v_reason, 'home_proximity_v1', v_accuracy_class,
    case when v_wing_shot_eligible then 'within_acceptance_radius' else null end,
    jsonb_build_object(
      'surface', 'home_restaurant',
      'scores_complete', true,
      'standalone_restaurant_rating', true
    )
  );

  insert into public.rating_submission_operations (
    user_id, operation_id, rating_id, crawl_id, surface
  ) values (
    v_user, p_operation_id, v_rating_id, v_crawl_id, 'home_restaurant'
  );

  v_referral := public.settle_referral_for_rating_internal(v_user, v_rating_id);
  return jsonb_build_object(
    'rating_id', v_rating_id,
    'crawl_id', v_crawl_id,
    'accepted', true,
    'idempotent_replay', false,
    'wing_shot_eligible', v_wing_shot_eligible,
    'wing_shot_eligibility_reason', v_reason,
    'referral', v_referral
  );
end;
$$;

revoke all on function public.submit_validated_restaurant_rating(
  uuid, uuid, double precision, double precision, double precision,
  smallint, smallint, smallint, smallint, smallint, bigint, smallint,
  smallint, boolean, smallint[]
) from public, anon;
grant execute on function public.submit_validated_restaurant_rating(
  uuid, uuid, double precision, double precision, double precision,
  smallint, smallint, smallint, smallint, smallint, bigint, smallint,
  smallint, boolean, smallint[]
) to authenticated, service_role;

comment on function public.submit_validated_restaurant_rating(
  uuid, uuid, double precision, double precision, double precision,
  smallint, smallint, smallint, smallint, smallint, bigint, smallint,
  smallint, boolean, smallint[]
) is
  'Idempotently persists a proximity-verified standalone Home rating and durable Wing Shot eligibility receipt.';

commit;

-- Rollback: revoke the RPC first. Preserve operation/provenance rows for audit,
-- then restore the prior Home submission path only if Wing Shot prompting is
-- disabled. Do not delete ratings accepted through this function.
