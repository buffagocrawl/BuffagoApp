-- Buffaverse Phase 3: Restaurant Boss Battles.
-- Additive, default-off, server-authoritative, and reward-reference-only.
begin;

insert into public.buffaverse_feature_flags(flag_key, description, enabled, environment, parent_flag_key)
values
 ('buffaverse.restaurant_boss_battles','Restaurant Boss Battles kill switch',false,'production','buffaverse.enabled'),
 ('buffaverse.restaurant_boss_battles.home_hero','Boss Battle home surface',false,'production','buffaverse.restaurant_boss_battles'),
 ('buffaverse.restaurant_boss_battles.map_marker','Boss Battle map marker',false,'production','buffaverse.restaurant_boss_battles'),
 ('buffaverse.restaurant_boss_battles.detail','Boss Battle detail',false,'production','buffaverse.restaurant_boss_battles'),
 ('buffaverse.restaurant_boss_battles.participation','Boss Battle participation',false,'production','buffaverse.restaurant_boss_battles'),
 ('buffaverse.restaurant_boss_battles.notifications','Boss Battle notifications',false,'production','buffaverse.restaurant_boss_battles')
on conflict (flag_key) do update set enabled=false;

insert into public.buffaverse_event_types(event_type_id,version,display_name,description,supported_lifecycle_states,supported_geographies,supported_progress_models,supported_reward_models,display_capabilities,analytics_mapping,feature_flag_key,enabled,environment)
values ('restaurant_boss_battle',1,'Restaurant Boss Battle','A time-bounded community mission at one restaurant.',array['draft','scheduled','active','paused','completed','expired','cancelled'],array['local','state','global'],array['counter','community_counter'],array['external'], '{"marker":true,"countdown":true,"share":true,"community_progress":true}'::jsonb,'{"created":"boss_battle_created","joined":"boss_battle_joined","completed":"boss_battle_completed"}'::jsonb,'buffaverse.restaurant_boss_battles',false,'production')
on conflict (event_type_id,version) do update set enabled=false,feature_flag_key=excluded.feature_flag_key;

create table if not exists public.buffaverse_restaurant_boss_battles(
 event_instance_id uuid primary key references public.buffaverse_event_instances(id) on delete restrict,
 restaurant_id uuid not null references public.destinations(id) on delete restrict,
 mission_key text not null check (char_length(mission_key) between 8 and 120),
 mission_label text not null check (char_length(mission_label) between 3 and 160),
 target_count integer not null check (target_count between 1 and 100000),
 low_density_target_count integer not null check (low_density_target_count between 1 and 100000),
 community_count integer not null default 0 check (community_count between 0 and 100000),
 unique(event_instance_id,mission_key)
);
create table if not exists public.buffaverse_boss_battle_participations(
 id uuid primary key default gen_random_uuid(), event_instance_id uuid not null references public.buffaverse_event_instances(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade, status text not null default 'started' check(status in ('started','completed','expired','rejected')),
 progress_count integer not null default 0 check(progress_count between 0 and 100000), started_at timestamptz not null default now(), completed_at timestamptz,
 last_request_key text not null, updated_at timestamptz not null default now(), unique(event_instance_id,user_id)
);
create table if not exists public.buffaverse_boss_battle_reward_references(
 id uuid primary key default gen_random_uuid(), event_instance_id uuid not null references public.buffaverse_event_instances(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade, participation_id uuid not null references public.buffaverse_boss_battle_participations(id) on delete restrict,
 reward_key text not null unique, settlement_status text not null default 'pending' check(settlement_status in ('pending','ready','settled','failed')), created_at timestamptz not null default now(), unique(event_instance_id,user_id)
);
alter table public.buffaverse_restaurant_boss_battles enable row level security;
alter table public.buffaverse_boss_battle_participations enable row level security;
alter table public.buffaverse_boss_battle_reward_references enable row level security;
revoke all on public.buffaverse_restaurant_boss_battles,public.buffaverse_boss_battle_participations,public.buffaverse_boss_battle_reward_references from anon,authenticated;
grant select on public.buffaverse_boss_battle_participations,public.buffaverse_boss_battle_reward_references to authenticated;
grant all on public.buffaverse_restaurant_boss_battles,public.buffaverse_boss_battle_participations,public.buffaverse_boss_battle_reward_references to service_role;
create policy boss_battle_participation_own_read on public.buffaverse_boss_battle_participations for select to authenticated using(user_id=auth.uid());
create policy boss_battle_reward_own_read on public.buffaverse_boss_battle_reward_references for select to authenticated using(user_id=auth.uid());

create or replace function public.buffaverse_record_boss_progress(p_event_instance_id uuid,p_action_ref uuid,p_request_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); e public.buffaverse_event_instances%rowtype; b public.buffaverse_restaurant_boss_battles%rowtype; p public.buffaverse_boss_battle_participations%rowtype; n integer;
begin
 if u is null then raise exception 'authentication_required'; end if;
 if p_request_key is null or char_length(p_request_key) not between 8 and 200 then raise exception 'invalid_idempotency_key'; end if;
 select * into e from public.buffaverse_event_instances where id=p_event_instance_id for share;
 if not found or e.event_type_id<>'restaurant_boss_battle' or e.lifecycle_status<>'active' or now()<e.starts_at or now()>=e.ends_at then raise exception 'boss_battle_not_active'; end if;
 select * into b from public.buffaverse_restaurant_boss_battles where event_instance_id=p_event_instance_id; if not found then raise exception 'boss_battle_not_found'; end if;
 if p_action_ref is null or not exists(select 1 from public.destination_ratings r where r.id=p_action_ref and r.user_id=u and r.destination_id=b.restaurant_id and r.created_at between e.starts_at and e.ends_at) then raise exception 'qualifying_rating_not_verified'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_instance_id::text||':'||u::text,0));
 select * into p from public.buffaverse_boss_battle_participations where event_instance_id=p_event_instance_id and user_id=u for update;
 if p.id is null then insert into public.buffaverse_boss_battle_participations(event_instance_id,user_id,progress_count,last_request_key) values(p_event_instance_id,u,1,p_request_key) returning * into p;
 elsif p.last_request_key=p_request_key then return jsonb_build_object('status',p.status,'progress',p.progress_count,'duplicate',true);
 else update public.buffaverse_boss_battle_participations set progress_count=least(progress_count+1,b.target_count),last_request_key=p_request_key,updated_at=now() where id=p.id returning * into p; end if;
 update public.buffaverse_restaurant_boss_battles set community_count=least(community_count+1,target_count) where event_instance_id=p_event_instance_id returning community_count into n;
 return jsonb_build_object('status',p.status,'progress',p.progress_count,'community_progress',n,'target',b.target_count,'duplicate',false);
end; $$;
revoke all on function public.buffaverse_record_boss_progress(uuid,uuid,text) from public,anon; grant execute on function public.buffaverse_record_boss_progress(uuid,uuid,text) to authenticated;

create or replace function public.buffaverse_complete_boss_battle(p_event_instance_id uuid,p_request_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); p public.buffaverse_boss_battle_participations%rowtype; b public.buffaverse_restaurant_boss_battles%rowtype; r uuid;
begin
 if u is null then raise exception 'authentication_required'; end if;
 if p_request_key is null or char_length(p_request_key) not between 8 and 200 then raise exception 'invalid_idempotency_key'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_instance_id::text||':'||u::text,0));
 select * into b from public.buffaverse_restaurant_boss_battles where event_instance_id=p_event_instance_id; if not found then raise exception 'boss_battle_not_found'; end if;
 select * into p from public.buffaverse_boss_battle_participations where event_instance_id=p_event_instance_id and user_id=u for update;
 if p.id is null or p.progress_count<b.target_count then raise exception 'boss_battle_target_not_reached'; end if;
 if p.status='completed' then select id into r from public.buffaverse_boss_battle_reward_references where event_instance_id=p_event_instance_id and user_id=u; return jsonb_build_object('status','completed','duplicate',true,'reward_reference_id',r); end if;
 update public.buffaverse_boss_battle_participations set status='completed',completed_at=now(),last_request_key=p_request_key,updated_at=now() where id=p.id;
 insert into public.buffaverse_boss_battle_reward_references(event_instance_id,user_id,participation_id,reward_key) values(p_event_instance_id,u,p.id,'restaurant_boss_battle:'||p_event_instance_id::text||':'||u::text) on conflict(event_instance_id,user_id) do nothing returning id into r;
 if r is null then select id into r from public.buffaverse_boss_battle_reward_references where event_instance_id=p_event_instance_id and user_id=u; end if;
 return jsonb_build_object('status','completed','duplicate',false,'reward_reference_id',r);
end; $$;
revoke all on function public.buffaverse_complete_boss_battle(uuid,text) from public,anon; grant execute on function public.buffaverse_complete_boss_battle(uuid,text) to authenticated;

create or replace function public.buffaverse_create_boss_battle(p_restaurant_id uuid,p_mission_key text,p_mission_label text,p_target_count integer,p_starts_at timestamptz,p_ends_at timestamptz,p_scope text default 'local',p_state_id integer default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare eid uuid; name text; geo text;
begin
 if p_starts_at is null or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '7 days' then raise exception 'invalid_boss_window'; end if;
 if p_target_count not between 1 and 100000 or char_length(coalesce(p_mission_key,'')) not between 8 and 120 then raise exception 'invalid_boss_mission'; end if;
 if p_scope not in('local','state','global') or (p_scope='state' and p_state_id is null) then raise exception 'invalid_boss_scope'; end if;
 perform pg_advisory_xact_lock(hashtextextended('boss-restaurant:'||p_restaurant_id::text,0));
 select d.name into name from public.destinations d where d.id=p_restaurant_id and d.lat is not null and d.lng is not null;
 if name is null then raise exception 'restaurant_not_eligible'; end if;
 if exists(select 1 from public.buffaverse_restaurant_boss_battles b join public.buffaverse_event_instances e on e.id=b.event_instance_id where b.restaurant_id=p_restaurant_id and e.lifecycle_status in('scheduled','active','paused') and e.ends_at>now()) then raise exception 'boss_battle_conflict'; end if;
 geo=case when p_scope='local' then 'boss:'||p_restaurant_id::text else null end;
 insert into public.buffaverse_event_instances(event_type_id,event_type_version,lifecycle_status,geographic_scope,state_id,geography_key,starts_at,ends_at,eligibility,participation_rules,progress_model,progress_target,reward_reference_kind,reward_reference_key,title,summary,display_metadata,feature_flag_key,visibility,source)
 values('restaurant_boss_battle',1,'scheduled',p_scope,p_state_id,geo,p_starts_at,p_ends_at,jsonb_build_object('restaurant_id',p_restaurant_id),jsonb_build_object('qualifying_action','rating_completed','max_completions_per_user',1),'community_counter',p_target_count,'external','restaurant_boss_battle_pending','Boss Battle: '||left(name,80),p_mission_label,jsonb_build_object('restaurant_id',p_restaurant_id,'restaurant_name',name,'mission_key',p_mission_key,'anything_must_not_claim','No participant or popularity count is shown without verified rows'),'buffaverse.restaurant_boss_battles','private','system') returning id into eid;
 insert into public.buffaverse_restaurant_boss_battles(event_instance_id,restaurant_id,mission_key,mission_label,target_count,low_density_target_count) values(eid,p_restaurant_id,p_mission_key,p_mission_label,p_target_count,least(p_target_count,1));
 return eid;
end; $$;
revoke all on function public.buffaverse_create_boss_battle(uuid,text,text,integer,timestamptz,timestamptz,text,integer) from public,anon,authenticated; grant execute on function public.buffaverse_create_boss_battle(uuid,text,text,integer,timestamptz,timestamptz,text,integer) to service_role;

create or replace function public.buffaverse_run_boss_battle_scheduler(p_window_key text,p_starts_at timestamptz,p_ends_at timestamptz,p_limit integer default 3)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d record; made integer:=0; lim integer:=greatest(1,least(coalesce(p_limit,3),10));
begin
 if coalesce(btrim(p_window_key),'')='' or p_ends_at<=p_starts_at then raise exception 'invalid_scheduler_window'; end if;
 perform pg_advisory_xact_lock(hashtextextended('boss-scheduler:'||p_window_key,0));
 for d in select id from public.destinations where lat is not null and lng is not null and not exists(select 1 from public.buffaverse_restaurant_boss_battles b join public.buffaverse_event_instances e on e.id=b.event_instance_id where b.restaurant_id=destinations.id and e.lifecycle_status in('scheduled','active','paused') and e.ends_at>now()) order by md5(id::text||':'||p_window_key) limit lim loop
  begin perform public.buffaverse_create_boss_battle(d.id,'rating_rally_'||p_window_key,'Complete a verified rating at this restaurant.',10,p_starts_at,p_ends_at); made:=made+1; exception when others then null; end;
 end loop;
 return jsonb_build_object('window_key',p_window_key,'created',made,'limit',lim,'idempotent',true);
end; $$;
revoke all on function public.buffaverse_run_boss_battle_scheduler(text,timestamptz,timestamptz,integer) from public,anon,authenticated; grant execute on function public.buffaverse_run_boss_battle_scheduler(text,timestamptz,timestamptz,integer) to service_role;

create or replace function public.buffaverse_expire_boss_battles() returns integer language plpgsql security definer set search_path=pg_catalog,public as $$ declare n integer; begin update public.buffaverse_event_instances set lifecycle_status='expired',updated_at=now() where event_type_id='restaurant_boss_battle' and lifecycle_status in('scheduled','active','paused') and ends_at<=now(); get diagnostics n=row_count; update public.buffaverse_boss_battle_participations p set status='expired',updated_at=now() from public.buffaverse_event_instances e where e.id=p.event_instance_id and e.lifecycle_status='expired' and p.status='started'; return n; end; $$;
revoke all on function public.buffaverse_expire_boss_battles() from public,anon,authenticated; grant execute on function public.buffaverse_expire_boss_battles() to service_role;

comment on table public.buffaverse_boss_battle_reward_references is 'Opaque pending references only; Phase 3 never mints or settles rewards.';
commit;
-- Forward-disable: keep the parent and every child flag false. No destructive rollback is required.
