-- Engagement sharing/privacy controls. Additive and backward compatible.
alter table public.users
  add column if not exists share_username boolean not null default true,
  add column if not exists share_location boolean not null default true,
  add column if not exists hide_visit_date boolean not null default false,
  add column if not exists public_profile boolean not null default true;

comment on column public.users.share_location is
  'Permits town/state labels in share artifacts; exact position is never shared.';
comment on column public.users.hide_visit_date is
  'When true, public/share surfaces should use relative or omitted visit dates.';

create or replace function public.update_engagement_privacy(
  p_share_username boolean,
  p_share_location boolean,
  p_hide_visit_date boolean,
  p_social_feed_visible boolean,
  p_public_profile boolean
) returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.users
  set share_username = coalesce(p_share_username, share_username),
      share_location = coalesce(p_share_location, share_location),
      hide_visit_date = coalesce(p_hide_visit_date, hide_visit_date),
      social_opt_out = not coalesce(p_social_feed_visible, not social_opt_out),
      public_profile = coalesce(p_public_profile, public_profile)
  where user_id = auth.uid()
  returning * into v_user;
  if v_user.user_id is null then raise exception 'User profile not found'; end if;
  return v_user;
end;
$$;

revoke all on function public.update_engagement_privacy(boolean, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.update_engagement_privacy(boolean, boolean, boolean, boolean, boolean)
  to authenticated;

comment on function public.update_engagement_privacy(boolean, boolean, boolean, boolean, boolean) is
  'Updates the authenticated user sharing, feed, and public-profile preferences.';

-- Rollback: revoke/drop update_engagement_privacy first. Keep columns during rollback
-- so previously selected privacy preferences are not silently lost.
