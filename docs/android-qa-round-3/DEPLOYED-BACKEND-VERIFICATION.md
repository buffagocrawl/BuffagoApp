# Deployed backend source verification

Read-only inspection during final Git cleanup (2026-10-11). The owner reports approved manual deployment through SQL Editor. No SQL was applied and no Edge Function was redeployed during cleanup. SQL Editor execution does not automatically record migration-history entries; none were repaired or replayed.

wing-jury-feed: ACTIVE, version 2, verify_jwt=false. Auth identity is validated by the shared boundary using Auth getUser(token); allocation and snapshot RPCs are service-only.

| Definition | Local/deployed comparison |
|---|---|
| crawl/supabase/functions/wing-jury-feed/index.ts | MATCH |
| crawl/supabase/functions/_shared/wingJury.ts | MATCH |
| crawl/supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql :: get_my_buffacoin_rating_costs | MATCH |
| crawl/docs/android-qa-round-3-owner-vote-counts-proposal.sql :: get_my_wing_shot_jury_counts | MATCH |
| crawl/supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql :: submit_buffacoin_rating_v1 | MATCH |
| crawl/supabase/proposals/android-qa-round-3-randomized-jury-feed.sql :: wing_jury_randomized_feed_candidates | MATCH |
| crawl/supabase/proposals/android-qa-round-3-randomized-jury-feed.sql :: wing_jury_randomized_session_snapshot | MATCH |

Edge comparisons normalize CRLF/LF and terminal whitespace; SQL comparisons use exact normalized function bodies from pg_get_functiondef. No business rows, balances, credentials or customer transactions were queried.

Edge SHA-256 hashes (normalized text):

- crawl/supabase/functions/wing-jury-feed/index.ts: ccdb32bebd0d45e0b8a1fded656b90183bc93464600f036a78ea2808ef111f91
- crawl/supabase/functions/_shared/wingJury.ts: 5e340953bf1ca37e08aefdd0b65e808c043f47a7eeb22971904138318b4aacd1

Permissions: quote/count RPCs deny anon and permit authenticated; Jury allocation/snapshot deny anon/authenticated and permit service_role. Private session, manifest, page and creation-log tables have RLS enabled and no anon/authenticated table access (checked separately).

This establishes source/permission correspondence, not physical-device behavior, production purchases, concurrent production mutations or load capacity. Live native payment recovery with optional photo continuation and final visual approval remain unverified.
