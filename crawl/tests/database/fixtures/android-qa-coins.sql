
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create table auth.users(id uuid primary key, created_at timestamptz default now(), deleted_at timestamptz, is_anonymous boolean default false);
      create table public.users(user_id uuid primary key references auth.users(id));
      create table public.buffacoin_wallets(user_id uuid primary key references auth.users(id), balance integer default 0);
      create table public.buffacoin_ledger(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), delta integer, reason text, created_at timestamptz default now());
      create function public.buffacoin_apply_ledger_delta() returns trigger language plpgsql security definer as $$begin
        insert into public.buffacoin_wallets(user_id,balance) values(new.user_id,0) on conflict do nothing;
        update public.buffacoin_wallets set balance=balance+new.delta where user_id=new.user_id; return new; end$$;
      create trigger apply_delta after insert on public.buffacoin_ledger for each row execute function public.buffacoin_apply_ledger_delta();
      create function public.give_new_user_starting_coins() returns trigger language plpgsql security definer as $$begin
        insert into public.buffacoin_ledger(user_id,delta,reason) values(new.user_id,3,'new_user_starter_coins'); return new; end$$;
      create trigger starter after insert on public.users for each row execute function public.give_new_user_starting_coins();
      create function public.handle_new_auth_user() returns trigger language plpgsql security definer as $$begin
        insert into public.users values(new.id) on conflict do nothing; return new; end$$;
      create trigger profile after insert on auth.users for each row execute function public.handle_new_auth_user();
      insert into auth.users(id,created_at) values('00000000-0000-4000-8000-000000000001','2026-10-01'),('00000000-0000-4000-8000-000000000002','2026-10-01'),('00000000-0000-4000-8000-000000000003','2026-10-12');
      update public.buffacoin_wallets set balance=17 where user_id='00000000-0000-4000-8000-000000000001';
      delete from public.buffacoin_wallets where user_id='00000000-0000-4000-8000-000000000002';
      insert into auth.users(id,created_at,is_anonymous) values('00000000-0000-4000-8000-000000000004','2026-10-01',true);
      insert into auth.users(id,created_at,deleted_at) values('00000000-0000-4000-8000-000000000005','2026-10-01','2026-10-02');