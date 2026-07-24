-- Read-only prerequisite check for the delta migrations in migrations/deployed.
-- This must run before any engagement migration is applied.
begin;

create temp table _buffago_baseline_missing(kind text not null, object_name text not null, detail text not null);

insert into _buffago_baseline_missing
select 'extension', x.name, 'required by repository migrations'
from (values ('pgcrypto')) x(name)
where not exists (select 1 from pg_extension e where e.extname = x.name);

insert into _buffago_baseline_missing
select 'table', x.name, 'required relation is absent'
from (values
  ('auth.users'), ('public.users'), ('public.crawls'), ('public.routes'), ('public.destinations'),
  ('public.destination_ratings'), ('public.user_events'), ('public.user_wing_battle_votes'),
  ('public.xp_ledger'), ('public.badge_catalog'), ('public.user_badges'),
  ('public.level_thresholds'), ('public.limited_time_events')
) x(name)
where to_regclass(x.name) is null;

insert into _buffago_baseline_missing
select 'column', format('%s.%s', x.table_name, x.column_name), 'required column is absent'
from (values
  ('public.users','user_id'), ('public.users','xp'),
  ('public.users','share_location'), ('public.users','hide_visit_date'),
  ('public.crawls','crawl_id'), ('public.crawls','route_id'), ('public.crawls','user_id'),
  ('public.routes','id'), ('public.destinations','id'), ('public.destinations','lat'),
  ('public.destinations','lng'), ('public.destination_ratings','id'),
  ('public.destination_ratings','user_id'), ('public.destination_ratings','destination_id'),
  ('public.destination_ratings','crawl_id'), ('public.user_events','user_id'),
  ('public.xp_ledger','id')
) x(table_name, column_name)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = split_part(x.table_name, '.', 1)
    and c.table_name = split_part(x.table_name, '.', 2)
    and c.column_name = x.column_name
);

insert into _buffago_baseline_missing
select 'function', x.signature, 'required function is absent'
from (values
  ('public.award_xp(integer,text,text,uuid,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid,jsonb)'),
  ('public.xp_level_for(integer)'),
  ('public.can_user_appear_socially(uuid)'),
  ('public.friend_pair_is_blocked(uuid,uuid)')
) x(signature)
where to_regprocedure(x.signature) is null;

insert into _buffago_baseline_missing
select 'constraint', 'destination_ratings(user_id,destination_id,crawl_id)',
  'required uniqueness for rating identity is absent'
where not exists (
  select 1
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname = 'destination_ratings'
    and c.contype in ('u','p')
    and pg_get_constraintdef(c.oid) ilike '%user_id%'
    and pg_get_constraintdef(c.oid) ilike '%destination_id%'
    and pg_get_constraintdef(c.oid) ilike '%crawl_id%'
);

do $$
declare r record; total integer;
begin
  select count(*) into total from _buffago_baseline_missing;
  for r in select * from _buffago_baseline_missing order by kind, object_name loop
    raise notice 'baseline_missing kind=% object=% detail=%', r.kind, r.object_name, r.detail;
  end loop;
  if total > 0 then
    raise exception 'buffago_baseline_preflight_failed missing_count=%', total;
  end if;
  raise notice 'buffago_baseline_preflight=PASS';
end $$;

rollback;
