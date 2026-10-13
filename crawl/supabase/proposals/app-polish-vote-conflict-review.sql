-- READ ONLY release preflight. Run immediately before the separately reviewed
-- bridge proposal, and compare with acceptance/conflicts-readonly.json.
-- Any drift (including media eligibility) requires a fresh review.
begin transaction read only;
select l.submission_id,l.user_id,l.vote as legacy_vote,
       l.created_at as legacy_created_at,l.updated_at as legacy_updated_at,
       j.vote as jury_vote,j.created_at as jury_created_at,
       s.status,private.is_public_wing_jury_photo(s.id) as currently_eligible,
       case when not private.is_public_wing_jury_photo(s.id)
            then 'preserve both historical records; no reconciliation'
            when l.updated_at is null or l.created_at is null or j.created_at is null
              or not isfinite(l.updated_at) or not isfinite(l.created_at) or not isfinite(j.created_at)
              or l.updated_at<l.created_at or l.updated_at>now() or j.created_at>now()
            then 'STOP: invalid or missing chronology'
            when l.updated_at=j.created_at then 'STOP: contradictory timestamp tie'
            when l.updated_at>j.created_at then 'snapshot both; use later Gallery verdict'
            else 'snapshot both; use later Jury verdict'
       end as proposed_action
from public.wing_media_photo_votes l
join public.wing_jury_votes j using(submission_id,user_id)
join public.wing_media_submissions s on s.id=l.submission_id
where l.vote<>j.vote
order by l.submission_id,l.user_id;
-- Owner decision, 2026-10-13: existing eligible Jury-only verdicts become
-- shared active votes. Absence is NOT proof of a Gallery withdrawal or of
-- never voting there. Compare the cohort with withdrawal-review.json; review
-- unexpected drift before the separately authorized installation.
select count(*)::integer as eligible_jury_only_pairs,
       count(distinct j.user_id)::integer as distinct_voters,
       count(*) filter(where j.vote=1)::integer as likes,
       count(*) filter(where j.vote=0)::integer as neutral,
       count(*) filter(where j.vote=-1)::integer as dislikes
from public.wing_jury_votes j
join auth.users a on a.id=j.user_id and not a.is_anonymous
left join public.wing_media_photo_votes l using(submission_id,user_id)
where l.submission_id is null and private.is_public_wing_jury_photo(j.submission_id);
rollback;
