begin;

create table if not exists public.buffacoin_rating_operations (
  operation_id uuid primary key,
  user_id uuid not null,
  destination_id uuid not null,
  crawl_id uuid not null,
  rating_id uuid not null,
  debit_ledger_id uuid not null,
  coin_cost integer not null check (coin_cost > 0),
  new_balance integer not null check (new_balance >= 0),
  created_at timestamptz not null default now(),
  unique (rating_id),
  unique (debit_ledger_id)
);
alter table public.buffacoin_rating_operations enable row level security;
revoke all on public.buffacoin_rating_operations from public, anon, authenticated;

alter table public.destination_ratings
  add column if not exists buffacoin_operation_id uuid;
create unique index if not exists destination_ratings_buffacoin_operation_unique
  on public.destination_ratings(buffacoin_operation_id)
  where buffacoin_operation_id is not null;

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
drop trigger if exists guard_buffacoin_rating_writes on public.destination_ratings;
create trigger guard_buffacoin_rating_writes
  before insert or update of is_buffacoin on public.destination_ratings
  for each row execute function public.guard_buffacoin_rating_writes();

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
  if not found or v_wallet.balance<p_coin_cost then
    raise exception 'insufficient_balance';
  end if;

  select c.crawl_id into v_crawl_id from public.crawls c
    join public.routes r on r.id=c.route_id
    where c.user_id=v_user and c.crawl_type='token' and r.title='Buffacoin '||p_state_code
    order by c.created_at limit 1 for update of c;
  if v_crawl_id is null then
    insert into public.routes(title,city,created_by,is_public,is_token_route)
      values('Buffacoin '||p_state_code,p_state_code,v_user,false,true)
      returning id into v_route_id;
    insert into public.crawls(route_id,user_id,status,crawl_type,is_solo)
      values(v_route_id,v_user,'in_progress','token',true)
      returning crawls.crawl_id into v_crawl_id;
  end if;

  update public.buffacoin_wallets
    set balance=balance-p_coin_cost,updated_at=now()
    where user_id=v_user returning balance into new_balance;
  insert into public.buffacoin_ledger(
    id,user_id,delta,reason,crawl_id,state_id,destination_id
  ) values(
    v_ledger_id,v_user,-p_coin_cost,'wingdex_rating_atomic',
    v_crawl_id,v_state_id,p_destination_id
  );

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
    p_coin_cost,new_balance
  );
  operation_id:=p_operation_id; rating_id:=v_rating_id; crawl_id:=v_crawl_id;
  debit_ledger_id:=v_ledger_id;
  return next;
end;
$$;

revoke all on function public.submit_buffacoin_rating_v1(uuid,uuid,text,integer,jsonb)
  from public,anon;
grant execute on function public.submit_buffacoin_rating_v1(uuid,uuid,text,integer,jsonb)
  to authenticated;
revoke execute on function public.buffacoins_spend_for_wingdex(uuid,text)
  from authenticated;
revoke execute on function public.buffacoins_get_or_create_token_crawl(text)
  from authenticated;

create or replace view public.buffacoin_rating_reconciliation as
select
  o.operation_id,
  (l.id is not null and l.delta=-o.coin_cost) as debit_matches,
  (r.id is not null and r.user_id=o.user_id and r.crawl_id=o.crawl_id) as rating_matches,
  (c.crawl_id is not null and c.user_id=o.user_id) as crawl_matches
from public.buffacoin_rating_operations o
left join public.buffacoin_ledger l on l.id=o.debit_ledger_id
left join public.destination_ratings r on r.id=o.rating_id
left join public.crawls c on c.crawl_id=o.crawl_id;
revoke all on public.buffacoin_rating_reconciliation from public,anon,authenticated;
grant select on public.buffacoin_rating_reconciliation to service_role;

commit;
