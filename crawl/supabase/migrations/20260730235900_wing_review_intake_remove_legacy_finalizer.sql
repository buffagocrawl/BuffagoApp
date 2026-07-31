-- The legacy five-argument finalizer creates submissions as `uploaded` and
-- lets the processing worker move them to `processing`. New submissions enter
-- human review immediately through the canonical three-argument finalizer.

begin;

revoke all on function public.finalize_wing_submission_upload(
  uuid, text, uuid, text, text
) from public, anon, authenticated;

drop function if exists public.finalize_wing_submission_upload(
  uuid, text, uuid, text, text
);

commit;
