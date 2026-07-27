# Weekly challenge leaderboard source

`public.mission_assignments` is the server-authoritative assignment and progress
record. `public.record_engagement_action` verifies the canonical action belongs
to the authenticated user, writes an idempotent action receipt, and only then
advances an open assignment. When a weekly assignment first receives a verified,
in-window `completed_at`, the `mission_assignment_weekly_challenge_completion`
trigger writes exactly one immutable row to
`public.weekly_challenge_completions` (unique by mission assignment).

`public.get_challenge_leaderboard` and
`public.get_public_challenge_stats` both aggregate only that immutable table.
They never derive a completion from progress, client totals, ratings, XP, an
assignment alone, or an expired mission. The leaderboard ranks by completion
count descending, most recent qualifying completion ascending, then stable user
ID ascending. XP is presentation-only.

The completion table has RLS enabled and no client table grants. The two
security-definer RPCs expose only the fields required by the leaderboard/profile
surfaces and preserve the existing social-visibility checks.
