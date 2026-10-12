create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table states(state_id integer primary key,state_code char(2));
create table destinations(id uuid primary key,state_id integer);
create table buffacoin_wallets(user_id uuid primary key,balance integer check(balance >= 0),updated_at timestamptz default now());
create table routes(id uuid primary key default gen_random_uuid(),title text,city text,created_by uuid,is_public boolean,is_token_route boolean);
create table crawls(crawl_id uuid primary key default gen_random_uuid(),route_id uuid references routes(id),user_id uuid,status text,start_time timestamptz default now(),end_time timestamptz,crawl_type text,is_solo boolean);
create table buffacoin_ledger(id uuid primary key,user_id uuid,delta integer,reason text,crawl_id uuid references crawls(crawl_id),state_id integer,destination_id uuid);
create table destination_ratings(id uuid primary key,crawl_id uuid references crawls(crawl_id),destination_id uuid,user_id uuid,sauce smallint,crispiness smallint,meat smallint,overall smallint check(overall between 1 and 10),would_order_again boolean,tag_id bigint,wings_eaten smallint,sauce_style smallint,flavor_vibe smallint[],spice_level smallint,is_buffacoin boolean,buffacoin_operation_id uuid unique);
create table buffacoin_rating_operations(operation_id uuid primary key,user_id uuid,destination_id uuid,crawl_id uuid,rating_id uuid unique,debit_ledger_id uuid unique,coin_cost integer,new_balance integer,created_at timestamptz default now());

-- Production-equivalent ledger trigger.
      create function public.buffacoin_apply_ledger_delta() returns trigger language plpgsql security definer as $$begin
        insert into public.buffacoin_wallets(user_id,balance) values(new.user_id,0) on conflict do nothing;
        update public.buffacoin_wallets set balance=balance+new.delta where user_id=new.user_id; return new; end$$;
      create trigger apply_delta after insert on public.buffacoin_ledger for each row execute function public.buffacoin_apply_ledger_delta();
