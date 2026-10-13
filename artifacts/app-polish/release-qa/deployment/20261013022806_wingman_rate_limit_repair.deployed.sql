-- READ-ONLY CAPTURE OF ALREADY DEPLOYED MIGRATION 20261013022806
-- Evidence/rollback reference only. DO NOT REPLAY AS PART OF APP POLISH.
begin;
-- Forward repair of the missing 20260511173000 dependency. Preserve any
-- existing usage rows; never truncate or reset counters during deployment.
create table if not exists public.api_rate_limits (
 id uuid primary key default gen_random_uuid(), user_id uuid null,
 ip_address text null, feature text not null, created_at timestamptz not null default now()
);
create index if not exists api_rate_limits_feature_user_time_idx on public.api_rate_limits(feature,user_id,created_at);
create index if not exists api_rate_limits_feature_ip_time_idx on public.api_rate_limits(feature,ip_address,created_at);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
grant select,insert on public.api_rate_limits to service_role;

-- Atomic replacement for Edge's separate count/count/insert requests. Only
-- the server can choose an actor; app clients cannot consume or reset quota.
create function public.wingman_consume_rate_limit(p_user_id uuid,p_ip_address text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
 ip text := coalesce(nullif(btrim(p_ip_address),''),'unknown'); ts timestamptz;
 hourly integer := case when p_user_id is null then 3 else 10 end;
 daily integer := case when p_user_id is null then 10 else 30 end;
 hour_count bigint; day_count bigint;
begin
 if length(ip)>200 then raise exception 'invalid_rate_limit_actor'; end if;
 -- Preserve existing anonymous semantics: it counts all calls from the IP,
 -- including signed-in calls. Acquire IP first, then user, in a fixed order.
 perform pg_advisory_xact_lock(hashtextextended('wingman-rate-ip:'||ip,0));
 if p_user_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('wingman-rate-user:'||p_user_id::text,0));
 end if;
 ts := clock_timestamp();
 select count(*) filter(where created_at >= ts-interval '1 hour'),count(*)
 into hour_count,day_count from public.api_rate_limits
 where feature='wingman' and created_at >= ts-interval '24 hours'
 and ((p_user_id is not null and user_id=p_user_id) or (p_user_id is null and ip_address=ip));
 if hour_count>=hourly or day_count>=daily then return false; end if;
 insert into public.api_rate_limits(user_id,ip_address,feature,created_at)
 values(p_user_id,ip,'wingman',ts);
 return true;
end;
$$;
revoke all on function public.wingman_consume_rate_limit(uuid,text) from public,anon,authenticated;
grant execute on function public.wingman_consume_rate_limit(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;

