-- Replace the formerly forgeable generic client XP call with evidence-backed
-- progression claims. Amounts and idempotency keys are derived on the server.

begin;

create or replace function public.claim_verified_progression_xp(
  p_source text,
  p_destination_id uuid default null,
  p_crawl_id uuid default null,
  p_route_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  awarded boolean,
  amount integer,
  xp_before integer,
  xp_after integer,
  level_before integer,
  level_after integer,
  ledger_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rating public.destination_ratings%rowtype;
  v_destination public.destinations%rowtype;
  v_crawl public.crawls%rowtype;
  v_amount integer;
  v_reason text;
  v_key text;
  v_stop_count integer := 0;
  v_rated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_source not in (
    'rating', 'rating_detail', 'first_rating', 'new_destination',
    'new_city', 'new_state', 'daily_first_rating',
    'crawl_completed', 'first_route', 'welcome_bonus'
  ) then
    raise exception 'progression_source_not_allowed' using errcode = '42501';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_progression_metadata';
  end if;

  if p_source in (
    'rating', 'rating_detail', 'first_rating', 'new_destination',
    'new_city', 'new_state', 'daily_first_rating'
  ) then
    select rating.*
      into v_rating
      from public.destination_ratings rating
      join public.rating_verification_receipts receipt
        on receipt.rating_id = rating.id
       and receipt.user_id = v_user_id
       and receipt.verification_type = 'in_person_proximity'
       and receipt.wing_shot_eligible
     where rating.user_id = v_user_id
       and rating.destination_id = p_destination_id
       and rating.crawl_id = p_crawl_id
       and not coalesce(rating.is_buffacoin, false)
     limit 1;
    if not found then
      raise exception 'verified_rating_required' using errcode = '42501';
    end if;
    select * into v_destination
      from public.destinations where id = v_rating.destination_id;
  end if;

  case p_source
    when 'rating' then
      v_amount := 25;
      v_reason := 'Rated a destination';
      v_key := 'rating:' || v_user_id || ':' || v_rating.id;
    when 'rating_detail' then
      if v_rating.tag_id is null then
        raise exception 'rating_detail_evidence_required' using errcode = '42501';
      end if;
      v_amount := 5;
      v_reason := 'Added tag';
      v_key := 'rating-detail:tag:' || v_user_id || ':' || v_rating.id;
    when 'first_rating' then
      v_amount := 50;
      v_reason := 'First rating';
      v_key := 'first-rating:' || v_user_id;
    when 'new_destination' then
      v_amount := 25;
      v_reason := 'New restaurant';
      v_key := 'new-destination:' || v_user_id || ':' || v_rating.destination_id;
    when 'new_city' then
      if nullif(trim(v_destination.city), '') is null then
        raise exception 'rating_city_required';
      end if;
      v_amount := 50;
      v_reason := 'New city';
      v_key := 'new-city:' || v_user_id || ':' ||
        md5(lower(trim(v_destination.city)) || ':' || coalesce(v_destination.state_id::text, ''));
    when 'new_state' then
      if v_destination.state_id is null then
        raise exception 'rating_state_required';
      end if;
      v_amount := 150;
      v_reason := 'New state';
      v_key := 'new-state:' || v_user_id || ':' || v_destination.state_id;
    when 'daily_first_rating' then
      v_amount := 15;
      v_reason := 'Daily first rating';
      v_key := 'daily-first-rating:' || v_user_id || ':' || current_date;
    when 'welcome_bonus' then
      v_amount := 5;
      v_reason := 'Welcome bonus';
      v_key := 'welcome-bonus:' || v_user_id;
    when 'crawl_completed' then
      select * into v_crawl
        from public.crawls
       where crawl_id = p_crawl_id
         and user_id = v_user_id
         and status = 'completed';
      if not found then
        raise exception 'completed_owned_crawl_required' using errcode = '42501';
      end if;

      select count(distinct stop.destination_id)
        into v_stop_count
        from (
          select ordered.destination_id
          from public.route_ordered_destinations ordered
          where ordered.route_id = v_crawl.route_id
          union all
          select unnest(array[
            route.stop1_id, route.stop2_id, route.stop3_id,
            route.stop4_id, route.stop5_id
          ])
          from public.routes route
          where route.id = v_crawl.route_id
            and not exists (
              select 1 from public.route_ordered_destinations
              where route_id = v_crawl.route_id
            )
        ) stop
       where stop.destination_id is not null;
      select count(distinct rating.destination_id)
        into v_rated_count
        from public.destination_ratings rating
       where rating.crawl_id = v_crawl.crawl_id
         and rating.user_id = v_user_id
         and not coalesce(rating.is_buffacoin, false);
      if v_stop_count = 0 or v_rated_count < v_stop_count then
        raise exception 'complete_crawl_evidence_required' using errcode = '42501';
      end if;
      v_amount := 100;
      v_reason := 'Completed a crawl';
      v_key := 'crawl-completed:' || v_user_id || ':' || v_crawl.crawl_id;
    when 'first_route' then
      select * into v_crawl
        from public.crawls
       where crawl_id = p_crawl_id
         and route_id = p_route_id
         and user_id = v_user_id
         and status = 'completed';
      if not found then
        raise exception 'completed_owned_route_required' using errcode = '42501';
      end if;
      if not exists (
        select 1
          from public.xp_ledger ledger
         where ledger.user_id = v_user_id
           and ledger.idempotency_key =
             'crawl-completed:' || v_user_id || ':' || v_crawl.crawl_id
      ) then
        raise exception 'verified_crawl_completion_award_required' using errcode = '42501';
      end if;
      v_amount := 50;
      v_reason := 'First time this route';
      v_key := 'first-route:' || v_user_id || ':' || p_route_id;
  end case;

  return query
  select *
    from public.award_xp(
      p_amount := v_amount,
      p_source := p_source,
      p_reason := v_reason,
      p_user_id := v_user_id,
      p_idempotency_key := v_key,
      p_destination_id := p_destination_id,
      p_crawl_id := p_crawl_id,
      p_route_id := p_route_id,
      p_metadata := jsonb_build_object(
        'verified_progression_claim', true,
        'source_screen', left(coalesce(p_metadata->>'source_screen', ''), 40)
      )
    );
end;
$$;

revoke all on function public.claim_verified_progression_xp(
  text, uuid, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.claim_verified_progression_xp(
  text, uuid, uuid, uuid, jsonb
) to authenticated, service_role;

comment on function public.claim_verified_progression_xp(
  text, uuid, uuid, uuid, jsonb
) is
  'Evidence-backed client progression boundary; XP amounts and idempotency are server-derived.';

commit;

-- Rollback: keep generic award_xp revoked. Restore client progression only
-- through another evidence-backed RPC; never re-grant arbitrary award_xp.
