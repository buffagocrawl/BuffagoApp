-- PROPOSAL ONLY: requires approval before production application.
-- Ledger trigger alone changes balance; correct deployed crawl ordering.
-- Preserves payment signature/grants/receipts; adds an owner-scoped exact quote RPC.
begin;
create or replace function public.submit_buffacoin_rating_v1(
  p_operation_id uuid,
  p_destination_id uuid,
  p_state_code text,
  p_coin_cost integer,
  p_rating jsonb
) returns table(
  operation_id uuid,
  rating_id uuid,
  crawl_id uuid,
  debit_ledger_id uuid,
  new_balance integer
) language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_existing public.buffacoin_rating_operations%rowtype;
  v_wallet public.buffacoin_wallets%rowtype;
  v_state_id integer;
  v_coin_cost integer;
  v_route_id uuid;
  v_crawl_id uuid;
  v_rating_id uuid := gen_random_uuid();
  v_ledger_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_operation_id is null then raise exception 'operation_id_required'; end if;
  if p_destination_id is null or p_coin_cost is null or p_coin_cost < 1 then
    raise exception 'invalid_input';
  end if;
  if p_state_code !~ '^[A-Z]{2}$' then raise exception 'invalid_state_code'; end if;
  if not (p_rating ?& array['sauce','crispiness','meat','overall']) then
    raise exception 'invalid_rating';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into v_existing from public.buffacoin_rating_operations
    where buffacoin_rating_operations.operation_id=p_operation_id;
  if found then
    if v_existing.user_id<>v_user or v_existing.destination_id<>p_destination_id then
      raise exception 'operation_ownership_mismatch';
    end if;
    return query select v_existing.operation_id,v_existing.rating_id,
      v_existing.crawl_id,v_existing.debit_ledger_id,v_existing.new_balance;
    return;
  end if;

  select state_id into v_state_id from public.states
    where upper(state_code)=p_state_code limit 1;
  if v_state_id is null or not exists(
    select 1 from public.destinations d
    where d.id=p_destination_id and d.state_id=v_state_id
  ) then raise exception 'destination_ownership_invalid'; end if;

  select * into v_wallet from public.buffacoin_wallets
    where user_id=v_user for update;
  if not found then raise exception 'insufficient_balance'; end if;
  -- Authoritative repeat-rating cost, serialized by wallet lock.
  select 1 + count(*)::integer into v_coin_cost from public.destination_ratings
    where user_id=v_user and destination_id=p_destination_id and is_buffacoin;
  if p_coin_cost<>v_coin_cost then raise exception 'coin_cost_mismatch'; end if;
  if v_wallet.balance<v_coin_cost then
    raise exception 'insufficient_balance';
  end if;

  select c.crawl_id into v_crawl_id from public.crawls c
    join public.routes r on r.id=c.route_id
    where c.user_id=v_user and c.crawl_type='token' and r.title='Buffacoin '||p_state_code
    order by c.start_time nulls last, c.crawl_id limit 1 for update of c;
  if v_crawl_id is null then
    insert into public.routes(title,city,created_by,is_public,is_token_route)
      values('Buffacoin '||p_state_code,p_state_code,v_user,false,true)
      returning id into v_route_id;
    insert into public.crawls(route_id,user_id,status,crawl_type,is_solo)
      values(v_route_id,v_user,'in_progress','token',true)
      returning crawls.crawl_id into v_crawl_id;
  end if;

  insert into public.buffacoin_ledger(
    id,user_id,delta,reason,crawl_id,state_id,destination_id
  ) values(
    v_ledger_id,v_user,-v_coin_cost,'wingdex_rating_atomic',
    v_crawl_id,v_state_id,p_destination_id
  );

  -- Read actual balance after the AFTER INSERT ledger trigger.
  select balance into new_balance from public.buffacoin_wallets where user_id=v_user;
  if new_balance is distinct from v_wallet.balance-v_coin_cost then
    raise exception 'ledger_balance_mismatch';
  end if;
  perform set_config('buffago.atomic_buffacoin_write','on',true);
  insert into public.destination_ratings(
    id,crawl_id,destination_id,user_id,sauce,crispiness,meat,overall,
    would_order_again,tag_id,wings_eaten,sauce_style,flavor_vibe,spice_level,
    is_buffacoin,buffacoin_operation_id
  ) values(
    v_rating_id,v_crawl_id,p_destination_id,v_user,
    (p_rating->>'sauce')::smallint,(p_rating->>'crispiness')::smallint,
    (p_rating->>'meat')::smallint,(p_rating->>'overall')::smallint,
    nullif(p_rating->>'would_order_again','')::boolean,
    nullif(p_rating->>'tag_id','')::bigint,
    nullif(p_rating->>'wings_eaten','')::smallint,
    nullif(p_rating->>'sauce_style','')::smallint,
    case when jsonb_typeof(p_rating->'flavor_vibe')='array'
      then array(select jsonb_array_elements_text(p_rating->'flavor_vibe')::smallint)
      else null end,
    nullif(p_rating->>'spice_level','')::smallint,true,p_operation_id
  );

  insert into public.buffacoin_rating_operations(
    operation_id,user_id,destination_id,crawl_id,rating_id,debit_ledger_id,
    coin_cost,new_balance
  ) values(
    p_operation_id,v_user,p_destination_id,v_crawl_id,v_rating_id,v_ledger_id,
    v_coin_cost,new_balance
  );
  operation_id:=p_operation_id; rating_id:=v_rating_id; crawl_id:=v_crawl_id;
  debit_ledger_id:=v_ledger_id;
  return next;
end;
$$;
-- Same predicate as payment pricing; aggregate results cannot be row-limit truncated.
CREATE INDEX IF NOT EXISTS buffacoin_rating_price_lookup ON public.destination_ratings(user_id,destination_id) WHERE is_buffacoin;
CREATE OR REPLACE FUNCTION public.get_my_buffacoin_rating_costs(p_destination_ids uuid[])
RETURNS TABLE(destination_id uuid,coin_cost integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $quote$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_destination_ids IS NULL OR cardinality(p_destination_ids)>100
    OR array_position(p_destination_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_quote_destinations'; END IF;
  RETURN QUERY SELECT requested.id,1+count(r.id)::integer
    FROM (SELECT DISTINCT unnest(p_destination_ids) AS id) requested
    LEFT JOIN public.destination_ratings r ON r.destination_id=requested.id AND r.user_id=v_user AND r.is_buffacoin
    GROUP BY requested.id;
END;
$quote$;
REVOKE ALL ON FUNCTION public.get_my_buffacoin_rating_costs(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_buffacoin_rating_costs(uuid[]) TO authenticated;
commit;
