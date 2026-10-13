begin;
-- Additive intake metadata. Existing clients can continue inserting suggestions.
alter table public.destination_suggestions add column if not exists verification_evidence jsonb;
create table public.restaurant_suggestion_reviews (
 suggestion_id uuid primary key references public.destination_suggestions(id),
 action text not null check (action in ('approve','reject')),
 reviewer_id uuid not null references auth.users(id),
 reviewer_note text not null check (length(btrim(reviewer_note)) between 8 and 2000),
 destination_id uuid references public.destinations(id),
 destination_details jsonb,
 reviewed_at timestamptz not null default now(),
 check ((action='approve') = (destination_id is not null))
);
alter table public.restaurant_suggestion_reviews enable row level security;
revoke all on public.restaurant_suggestion_reviews from public,anon,authenticated;
grant select,insert on public.restaurant_suggestion_reviews to service_role;

-- One pending predicate for both Mango and the growth snapshot. Suggestions are
-- never deleted and review history cannot be edited by an app client.
create view public.mango_pending_restaurants with (security_invoker=true) as
 select s.* from public.destination_suggestions s
 where not exists (select 1 from public.restaurant_suggestion_reviews r where r.suggestion_id=s.id);
revoke all on public.mango_pending_restaurants from public,anon,authenticated;
grant select on public.mango_pending_restaurants to service_role;

-- Shared service-only destination creation, used after automated or human
-- verification. Preserve the same destination fields and normal table triggers.
create function public.wingman_create_destination(p_destination jsonb,p_created_by uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 n text := btrim(p_destination->>'name'); a text := btrim(p_destination->>'address');
 c text := btrim(p_destination->>'city'); st integer := (p_destination->>'state_id')::integer;
 latitude numeric := nullif(p_destination->>'lat','')::numeric;
 longitude numeric := nullif(p_destination->>'lng','')::numeric;
 d public.destinations; matches integer;
begin
 if n is null or n='' or a is null or a='' or c is null or c='' or st is null
   or latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180
 then raise exception 'restaurant_location_required'; end if;
 -- Serialize with all destination writes, including old clients, while looking
 -- for an existing identity. Held only during this short database transaction.
 lock table public.destinations in share row exclusive mode;
 select count(*) into matches from public.destinations x
 where x.state_id=st and lower(btrim(x.name))=lower(n)
 and (lower(btrim(x.address))=lower(a) or lower(btrim(x.city))=lower(c));
 if matches>1 then raise exception 'restaurant_match_ambiguous'; end if;
 if matches=1 then
   select * into d from public.destinations x where x.state_id=st and lower(btrim(x.name))=lower(n)
   and (lower(btrim(x.address))=lower(a) or lower(btrim(x.city))=lower(c));
   -- Same name/city with a different address might be another branch. Do not
   -- silently merge it or create a likely duplicate; require operator resolution.
   if lower(btrim(coalesce(d.address,'')))<>lower(a) then raise exception 'restaurant_match_ambiguous'; end if;
 else
   insert into public.destinations(name,address,city,state_id,lat,lng,created_by)
   values(n,a,c,st,latitude,longitude,p_created_by) returning * into d;
 end if;
 return to_jsonb(d);
end;
$$;
revoke all on function public.wingman_create_destination(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wingman_create_destination(jsonb,uuid) to service_role;

create function public.mango_review_restaurant(p_suggestion_id uuid,p_reviewer_id uuid,p_action text,p_note text,p_destination jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.destination_suggestions; r public.restaurant_suggestion_reviews; d jsonb;
begin
 if not exists (select 1 from public.app_user_roles where user_id=p_reviewer_id and active and revoked_at is null
 and role in ('wing_reviewer','wing_admin')) then raise exception 'restaurant_reviewer_required'; end if;
 if p_action is null or p_action not in ('approve','reject') or p_note is null or length(btrim(p_note)) not between 8 and 2000
 then raise exception 'restaurant_review_invalid'; end if;
 select * into s from public.destination_suggestions where id=p_suggestion_id for update;
 if not found then raise exception 'restaurant_suggestion_not_found'; end if;
 select * into r from public.restaurant_suggestion_reviews where suggestion_id=s.id;
 if found then
   if r.action=p_action and r.reviewer_id=p_reviewer_id and r.reviewer_note=btrim(p_note)
      and r.destination_details is not distinct from (case when p_action='approve' then p_destination else null end)
   then return to_jsonb(r); end if;
   raise exception 'restaurant_already_reviewed';
 end if;
 if p_action='approve' then
   if (p_destination->>'state_id')::integer is distinct from s.state_id then raise exception 'restaurant_state_mismatch'; end if;
   d := public.wingman_create_destination(p_destination,s.user_id);
 end if;
 insert into public.restaurant_suggestion_reviews(suggestion_id,action,reviewer_id,reviewer_note,destination_id,destination_details)
 values(s.id,p_action,p_reviewer_id,btrim(p_note),(d->>'id')::uuid,case when p_action='approve' then p_destination else null end)
 returning * into r;
 return to_jsonb(r);
end;
$$;
revoke all on function public.mango_review_restaurant(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mango_review_restaurant(uuid,uuid,text,text,jsonb) to service_role;

create function public.mango_restaurant_pending_count()
returns bigint language sql stable security invoker set search_path='' as $$
 select count(*) from public.mango_pending_restaurants;
$$;
revoke all on function public.mango_restaurant_pending_count() from public,anon,authenticated;
grant execute on function public.mango_restaurant_pending_count() to service_role;
-- Preserve the deployed snapshot, its authorization and every existing metric.
do $migration$
declare definition text; marker text := '''product_pulse'', public.buffago_product_pulse_operations() ||';
begin
 definition := pg_get_functiondef('public.get_buffago_growth_snapshot()'::regprocedure);
 if strpos(definition,marker)=0 then raise exception 'Unexpected growth snapshot; inspect before deploying'; end if;
 if strpos(definition,'''pending_restaurants''')=0 then
   definition := replace(definition,marker,marker||' jsonb_build_object(''pending_restaurants'', jsonb_build_object(''total'', public.mango_restaurant_pending_count())) ||');
   execute definition;
 end if;
end;
$migration$;
commit;
