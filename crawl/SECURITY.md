# Security Notes

Values prefixed with `EXPO_PUBLIC_` are bundled into the mobile app and must be treated as public. Do not put private API keys, admin tokens, Stripe secrets, OpenAI keys, or unrestricted server keys in `EXPO_PUBLIC_` variables or frontend code.

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` may be used by the app. The anon key is safe only when Supabase Row Level Security policies protect the underlying data.

`OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must live only in backend environments such as Supabase Edge Function secrets. Mobile app code must call Edge Functions for privileged work instead of calling OpenAI or using service role credentials directly.

`EXPO_PUBLIC_GOOGLE_API_KEY` must be a mobile/client Google key restricted in Google Cloud to the intended APIs, app package names, bundle IDs, and signing fingerprints.

## RLS And Abuse-Prevention Review

- Treat every mobile client write as untrusted. `destination_ratings`, `user_events`, friend-system RPCs, and onboarding persistence must continue to rely on Supabase RLS and RPC-side auth checks.
- Social visibility remains opt-out aware. Do not bypass `social_opt_out`, friend-block, or visibility filters when adding leaderboards, feed rows, or profile navigation.
- OAuth recovery changes must not persist raw provider secrets in logs. BuffaGo only stores redacted summaries and uses callback fallbacks that return the user to a safe screen.
- Share artifacts and owner claim packets must contain only public restaurant information plus the current user's own actions. They must not include private profile data, internal IDs beyond the destination already visible in-app, or any secret environment values.
- New growth loops are rollout-gated. If abuse, churn, or privacy regressions appear, disable the relevant `EXPO_PUBLIC_ENABLE_*` flag before considering broader rollback.

The additive `20260717123000_add_verified_growth_foundation.sql` migration keeps
mission rewards server-owned and idempotent, allows authenticated users to insert
only their own pending restaurant claims, reserves review/approval for privileged
server or administrative workflows, and gates aggregate owner metrics on an
approved claim. Promotions use a separate table and cannot update organic
destination ranking data.

Verification before production rollout: apply the migration to a disposable
Supabase project, exercise policies as anonymous, two unrelated authenticated
users, an approved owner, and an administrator, then confirm claim approval and
mission reward writes are unavailable to mobile roles. Static policy tests run via
`npm run test:rls`; they do not replace live database tests.

Rollback is additive and data-preserving: first disable the owner/mission feature
flags, revoke execute/select grants for the new surfaces, then drop the new policies,
function, and tables in reverse dependency order only after exporting any pilot
records. Do not roll back by weakening RLS on existing tables.
