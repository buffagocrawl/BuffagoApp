# BuffaGo verified quality implementation report — 2026-07-17

## Executive summary

This pass preserved the existing uncommitted auth/onboarding/growth work and added
canonical safe analytics, auth lifecycle/recovery instrumentation, an additive
RLS-backed mission/restaurant-claim/promotion foundation, policy tests, and build
reliability fixes. It intentionally did not add payments, approve claims from the
client, deploy migrations, invent production metrics, or claim that a client-side
mission card is a fully verified reward engine.

- Verified score before: **85.82** (provided SWAT result)
- Verified score after: **not recomputed; remains 85.82 for decision purposes**
- Uncertainty-adjusted score: **81.42** (provided result; not recomputed)
- Projected score: **99.29** (provided projection only; not achieved)
- Target/result: **98 / FAIL**

Evidence gaps: live OAuth/device tests, live Supabase policy tests, deployed mission
reward execution, production funnel/retention/share data, referral conversion, owner
interviews, owner-dashboard runtime, and native release builds.

## Inventory

Created: `lib/analyticsSchema.js`, analytics tests, database-policy tests, this
report, and migration `20260717123000_add_verified_growth_foundation.sql`.

Modified in this pass: `lib/analytics.js`, auth callback/login/provider files,
`providers/XpToastProvider.jsx`, `src/lib/crawl.ts`, `app/routes/index.jsx`,
`package.json`, `README.md`, and `SECURITY.md`. Other listed working-tree changes
predated this pass and remain user-owned.

Feature flags already present and preserved: `ENABLE_GROWTH_MISSIONS`,
`ENABLE_SHARE_INVITE_LOOP`, `ENABLE_RESTAURANT_OWNER_LOOP`, and Google auth.

## Validation

| Command | Baseline | Final | Notes |
|---|---|---|---|
| `python run_swat.py BuffagoApp --validate` | FAIL | NOT RUN | Runner absent from repository root; no alternate runner found. |
| `npm run lint` | FAIL: 3 errors, 104 warnings | PASS with 103 warnings | Fixed JSX TypeScript syntax, unresolved Supabase import, and apostrophe. |
| `npm run typecheck` | FAIL: JSX TypeScript syntax | FAIL | Initial blocker fixed; broader case conflicts, Deno/mobile scope, and existing TS inference errors remain. |
| `npm run test:quick-rating` | PASS | PASS | Script reports quick-rating tests passed. |
| `npm run test:auth` | PASS, 14/14 | PASS, 14/14 | Helper-level auth/growth tests; not device OAuth E2E. |
| `npm run test:analytics` | N/A | PASS, 3/3 | Event stability and sensitive-property filtering. |
| `npm run test:growth` | N/A | PASS, 4/4 | Mission summary, share packet, owner empty metrics. |
| `npm run test:rls` | N/A | PASS, 3/3 | Static migration assertions only. |
| `npx expo export --platform web` | N/A | FAIL | Existing native `react-native-maps` import is not web-compatible. |

No failure was hidden. A native production build and live database policy suite were
not available in this environment.

## Analytics specification

Canonical auth events: `auth_started`, `auth_provider_selected`,
`auth_callback_started`, `auth_callback_completed`, `auth_callback_failed`,
`auth_session_restored`, `auth_recovery_shown`, `auth_recovery_selected`.

Catalogued activation/mission/owner events include `activation_started`,
`activation_rating_completed`, `activation_completed`, `mission_viewed`,
`mission_started`, `mission_completed`, `claim_started`, `claim_submitted`, and
`owner_dashboard_viewed`. Existing sharing, rating, recommendation, crawl, profile,
and restaurant-profile events remain compatible.

Safe properties are bounded scalar operational fields such as screen, provider,
source, elapsed milliseconds, retry count, and boolean cohort markers. Keys
resembling tokens, secrets, passwords, authorization, cookies, contact data, raw
error messages, or refresh credentials are removed; nested provider payloads are
not accepted.

Activation is first valid rating plus confirmation/next action. D1/D7 and WAU are
derived from later app opens after activation. Mission completion, crawl resumption,
and recommendation adoption are event ratios. Restaurant ROI uses aggregate profile
views, ratings, shares, directions/site actions, promotion impressions/actions, and
claim/dashboard events. Organic and promoted placement remain separate.

## Security report

Reviewed existing XP ledger, social visibility, friend RPCs, analytics writes, and
new mission/claim/promotion surfaces. The new migration enables RLS, denies mobile
mission reward writes, restricts claims to the authenticated claimant in pending
state, prevents client review updates, gates owner aggregates on approved ownership,
and separates promotions from destinations. Remaining risks are live-policy drift,
legacy RPC breadth, analytics-table policy verification, server-side mission award
implementation, and referral fraud controls. Safe rollback steps are in `SECURITY.md`.

## Product evidence

- Implemented and verified locally: lint error remediation, quick-rating/auth helper
  tests, safe analytics schema tests, static RLS assertions, share-text generation.
- Implemented but not production-validated: canonical auth instrumentation, mission
  UI summary, share/invite UI, additive claim/owner/promotion database foundation.
- Proposed only: approved-owner dashboard UI, server mission regeneration/award RPC,
  referral conversion enforcement, promotion pilot operations.
- Requires real data: activation time, D1/D7, mission engagement, share/conversion,
  restaurant ROI.
- Requires owner feedback: claim evidence burden, useful metric thresholds, pilot
  promotion demand, and value messaging.

## Review and next experiment

Serrano run `2026-07-17T111710` reached discovery wave 3 with 10 workers complete
and one model-capacity failure at report time. Its evidence emphasized rating trust,
durable first-rating persistence, recoverable failures, and no unsupported growth
claims. A complete independent 12-person scored review was therefore not available;
no synthetic scores were substituted and suspicious convergence cannot be assessed.

Run one focused production experiment: feature-flag the collapsed guest activation
flow for 50% of new installs and measure `activation_completed` within 10 minutes,
median time-to-activation, failure step, and D1 return. Guardrails: rating failure
rate, duplicate submission rate, auth recovery rate, and support contacts. This
produces the highest-value missing evidence before expanding missions or promotions.
