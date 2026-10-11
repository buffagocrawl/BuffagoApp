# BuffaGo four-issue Android QA hotfix

Branch: `fix/android-qa-four-issues`, based on clean, freshly fetched main `53241c7`.
Release authorized after visual approval. Backend deployment and credits were completed independently by the owner; this release does not run SQL or Supabase deployment.

## 1. Wing Jury — fixed

The latest EAS Android AAB, build `59c0a574-f3b4-418c-8cd2-250de4c98201`, version code 124, was built with the production profile from `c5e7bc429827860393978d74e146c029088d8063`. Its actual Hermes bundle contains Wing Jury and the Home entry, but the feature module initializes the flag with `undefined` and the default `false`. Production EAS environment inspection found no Wing Jury flag. Only the separate internal-testing profile explicitly enabled it. Supabase deployment cannot enable an already compiled client flag.

Production now explicitly sets `EXPO_PUBLIC_ENABLE_WING_JURY=true`. The existing Home entry remains, and Wingdex has a labeled Wing Jury button for signed-in users and guests. Expo Router already registers the route from `app/wing-jury/index.jsx`; it is outside the five-tab group, with no guest redirect. No navigation redesign or sixth tab.

Guest verdicts remain session-local and never invoke the permanent vote endpoint. Permanent voting requires a verified non-anonymous identity. Existing save actions prompt guests to sign in. No Edge Function changes.

Evidence: [build provenance](eas-build-provenance.json), [actual AAB bytecode evidence](binary-feature-evidence.json).

## 2. Wingdex discovery layout ? visual review pending

The original clipping came from opaque chevron overlays on horizontal filter rails. The first wrapping-controls fix was rejected because it consumed the initial viewport. The revised layout replaces permanent filter rows with a single compact Filters / current sort / Wing Jury toolbar. All distance, current-state, chosen-state, all-location, sort, My ratings and tag controls remain in a scrollable modal with wrapping 48-dp targets. Redundant introduction text is removed. Approved community wing imagery leads restaurant cards; missing-photo cards have a compact Add a photo action and no substitute image. Existing rating, distance, photo-count and saved-place behaviors remain.

The old screenshots in screenshots/ are superseded for Wingdex. See [the current Wingdex visual review](wingdex-ux-correction/README.md). The other three issue implementations and SQL are unchanged by this correction.

## 3. New-user welcome bonus — implemented, SQL approval pending

Production currently grants three starter coins through the profile INSERT trigger; email and OAuth onboarding also attempted a separate one-coin client ledger INSERT. The new forward-only migration retires the profile starter grant and uses an auth.users INSERT trigger for exactly one 100-coin ledger entry across email, Google, Facebook and other providers. It is synchronous with account creation, so the wallet is initialized before the signup transaction commits. Existing users are not backfilled or reset. The change takes effect for accounts created after the migration is installed.

The exact ledger reason/description is `Welcome Bonus — 100 BuffaCoins`. A unique partial index prevents duplicate awards. A bonus-specific guard rejects client writes and suppresses retired starter/seed awards. Client seed-award code was removed. Rating costs and reward rules were not changed.

The app displays only committed bonus ledger entries and the current server wallet balance. Dismissal is persisted in an account-owned RLS table, with a local cache, so it can survive logout and reinstall. No client balance or award amount is submitted.

## 4. Early Bird bonus — prepared, production credit approval pending

Cutoff: **2026-10-11 14:14:10 UTC** (10:14:10 AM America/New_York).
Eligibility: auth accounts registered strictly before the cutoff, excluding anonymous and deleted accounts. Ordinary QA/test identities cannot be inferred safely; owner review of any test-account exclusions is pending.

Read-only production preview: **48 accounts**, **12,000 proposed additional coins**, **0 missing wallets**, current combined balance **249**, proposed combined balance **12,249**. The timestamped preview includes user IDs and individual before/after balances, without emails.

The migration snapshots eligible IDs and registration times in an inaccessible-to-client table. The separate approval SQL inserts `Early Bird Bonus — 250 BuffaCoins` into the existing ledger. The existing ledger trigger creates missing wallets at zero and adds the delta; no balances or transaction history are replaced. The unique index makes credit retries and concurrent executions idempotent. Verification inside the credit transaction raises and rolls back if any eligible account lacks its correct ledger entry or wallet.

Accounts registered after the cutoff are excluded from Early Bird. Existing accounts keep their balances until the explicitly approved additive credit. Welcome awards apply to future registrations after migration deployment.

Review files:
- [Forward-only migration](../../crawl/supabase/migrations/20261011141411_android_qa_coin_bonuses.sql)
- [Read-only preview SQL](../android-qa-early-bird-preview.sql)
- [Recorded account preview](early-bird-eligibility-preview.json)
- [Separate production credit SQL — explicit approval required](../android-qa-early-bird-credit-approval.sql)

## Verification

- 59 focused UI, coin, Wing Jury client and Edge boundary tests passed.
- One additional real PostgreSQL 17.6 concurrency regression passed using an isolated local cluster. Concurrent signup retries produced one 100-coin entry. Concurrent credit executions produced one +250 entry for each eligible fixture user.
- Coin tests cover all signup providers, unchanged existing balances, profile/signup retries, missing wallets, cutoff/anonymous/deleted exclusions, legacy seed suppression, rejection of client bonus inserts, private durable notice acknowledgements and immediate wallet spending through the ledger.
- Typecheck passed. Lint passed with zero errors and 98 existing warnings. No unrelated lint fixes.
- Production/internal-testing release configuration assertions passed using the existing local environment files.
- No live accounts were created or rated for testing. Screenshots use the real Android development client with isolated synthetic backend responses. Physical Samsung/Google Play release verification remains a post-build step. Immediate spending was verified at ledger level; no production rating write was performed.

## Screenshots for visual review

- [Signed-in Wing Jury access and fixed filters at 390 dp](screenshots/signed-in-wingdex-390dp-font1.png)
- [Signed-in Home navigation with Wing Jury access](screenshots/signed-in-home-wing-jury-390dp.png)
- [Guest Wing Jury access at 390 dp](screenshots/guest-wingdex-390dp-font1.png)
- [Fixed filters at 360 dp](screenshots/signed-in-wingdex-360dp-font1.png)
- [360 dp with 1.3× fonts](screenshots/signed-in-wingdex-360dp-font1.3.png)
- [Signed-in Wing Jury screen](screenshots/signed-in-jury-390dp-font1.png)
- [Guest Wing Jury screen](screenshots/guest-jury-390dp-font1.png)
- [100-coin welcome notice](screenshots/welcome-notice-390dp.png)
- [New-user 100-coin wallet and rating action](screenshots/welcome-balance-390dp.png)
- [250-coin Early Bird notice](screenshots/early-bird-notice-390dp.png)
- [Existing balance plus Early Bird coins](screenshots/early-bird-balance-390dp.png)
- [All signed-in width checks](screenshots/verification-signed-in.json)
- [Guest checks](screenshots/verification-guest.json)

## Files changed

App: `crawl/eas.json`, `crawl/app/(tabs)/ratings/index.jsx`, `crawl/app/_layout.tsx`, `crawl/app/auth/login.jsx`, `crawl/app/auth/callback.jsx`, `crawl/components/CoinBonusNotice.jsx`.

SQL: the new migration, `docs/android-qa-early-bird-preview.sql`, `docs/android-qa-early-bird-credit-approval.sql`.

Verification: `crawl/scripts/verify-internal-release-config.mjs`, `crawl/scripts/android-qa-four-issues-capture.mjs`, `crawl/tests/android-qa-ui.test.mjs`, `crawl/tests/database/android-qa-coins.test.mjs`, `crawl/tests/database/android-qa-coins-concurrency.test.mjs`, `crawl/tests/database/fixtures/android-qa-coins.sql`, `crawl/tests/fixtures/native-visual/supabase.js`, and this report/evidence/screenshot directory. The fixture changes resolve Android asset URLs and supply synthetic bonus data only; release bundles cannot resolve them.

Historical migrations, Edge Functions and the delete-account implementation were not changed. No unrelated local files were removed.

## Out-of-scope observation

The existing production general ledger INSERT policy permits own-user client writes for other reasons. This branch guards the requested bonus reasons only; broad reward-system hardening was not undertaken. Read-only source inspection also suggests the existing rating RPC directly debits the wallet and inserts a negative ledger delta; its ledger trigger applies that delta again. This existing behavior was not changed or investigated further in this hotfix.

## Approved release status

Wingdex visual review approved. Final polish uses 1 photo / plural photos. Fixture restaurants and the 12,345 balance are isolated in opt-in development-only modules; Metro explicitly refuses fixture resolution in release bundles. Production EAS enables Wing Jury, uses signed Android app bundles and remote version auto-increment. Submission must explicitly use internal-testing, whose track is internal.

Owner-confirmed production backend: welcome 100 installed; 48 eligible users received 250 each, totaling 12,000; zero duplicate or invalid credits. Coin SQL was applied manually and has no Supabase migration-history entries. Preserve that state: do not run db push, migration repair, coin credits or Edge deployment for this release. The checked-in SQL is a record and local regression fixture, not a deployment instruction.

Final focused regression suite, isolated PostgreSQL 17.6 concurrent signup/credit tests, typecheck and release assertions passed. Optional Deno runtime tests skipped in the default suite. Full lint: zero errors, 98 existing warnings. No production account creation, balance writes or ratings performed by the release agent.
