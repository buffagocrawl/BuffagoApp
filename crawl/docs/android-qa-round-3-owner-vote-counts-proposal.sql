-- REVIEW PROPOSAL ONLY. Not a migration; do not apply without owner approval.
-- Existing aggregate SELECT is public-eligibility scoped. A missing row may
-- mean no persisted votes OR RLS-hidden counts, so the client cannot infer 0.
-- This narrowly scoped read RPC supports the uploader's private history and
-- authoritative zero votes without exposing individual voters or storage.
begin;
create or replace function public.get_my_wing_shot_jury_counts(p_submission_ids uuid[])
returns table (submission_id uuid, like_count integer, dislike_count integer, neutral_count integer)
language sql stable security definer
set search_path = ''
as $function$
  select s.id, coalesce(c.like_count, 0), coalesce(c.dislike_count, 0), coalesce(c.neutral_count, 0)
  from public.wing_media_submissions s
  left join public.wing_jury_photo_vote_counts c on c.submission_id = s.id
  where s.user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
    and s.media_type = 'photo'
    and s.status in ('approved', 'generation_pending', 'ready_to_post', 'scheduled', 'posting', 'posted')
    and s.owner_deleted_at is null and s.withdrawn_at is null
    and s.id = any(p_submission_ids)
    and cardinality(p_submission_ids) <= 100;
$function$;
revoke all on function public.get_my_wing_shot_jury_counts(uuid[]) from public, anon;
grant execute on function public.get_my_wing_shot_jury_counts(uuid[]) to authenticated;
commit;

-- The prepared loadWingShotJuryCounts integration calls this RPC with
-- p_submission_ids and falls back to the existing aggregate table when the
-- RPC is unavailable. Missing/inaccessible fallback records show unavailable.
-- Verification: uploader receives only requested owned approved photo IDs;
-- another signed-in account and guest receive no private aggregates; a
-- no-vote owned approved photo returns all zero; persisted 1/-1/0 votes map
-- to Likes/Dislikes/Passes. No rewards, votes, or moderation are mutated.
