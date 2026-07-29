-- Wing Shots staged-rollout controls. All operational capabilities fail closed.
-- Informational onboarding copy may ship independently because it requests no
-- permission and performs no upload or publication action.

begin;

insert into public.engagement_feature_flags (flag_key, enabled, rollout_percent)
values
  ('wing_shot_prompt', false, 0),
  ('wing_shot_photo_upload', false, 0),
  ('wing_shot_video_upload', false, 0),
  ('wing_shot_creator_leaderboard', false, 0),
  ('wing_shot_moderation_queue', false, 0),
  ('wing_shot_generation', false, 0),
  ('wing_shot_instagram_publishing', false, 0),
  ('wing_shot_facebook_publishing', false, 0),
  ('wing_shot_automatic_nightly_selection', false, 0),
  ('wing_shot_featured_notifications', false, 0)
on conflict (flag_key) do nothing;

create or replace function public.get_wing_shots_feature_flags()
returns table (
  flag_key text,
  configured_enabled boolean,
  rollout_percent integer,
  enabled_for_user boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.flag_key,
    f.enabled as configured_enabled,
    f.rollout_percent,
    (
      f.enabled
      and (
        f.rollout_percent = 100
        or (
          auth.uid() is not null
          and mod(
            mod(
              hashtextextended(auth.uid()::text || ':' || f.flag_key, 0),
              100
            ) + 100,
            100
          ) < f.rollout_percent
        )
      )
    ) as enabled_for_user
  from public.engagement_feature_flags f
  where f.flag_key like 'wing_shot_%'
  order by f.flag_key
$$;

revoke all on function public.get_wing_shots_feature_flags()
  from public, anon;
grant execute on function public.get_wing_shots_feature_flags()
  to authenticated, service_role;

comment on function public.get_wing_shots_feature_flags() is
  'Returns fail-closed Wing Shots rollout decisions without exposing mutation access.';

commit;

-- Rollback: set all wing_shot_* flags to disabled/0. Keep rows for auditability
-- and stable client behavior; removing the function is optional after clients
-- no longer call it.
