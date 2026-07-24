# Daily-engagement release-candidate dependency audit

Run date: 2026-07-24 (America/New_York)

## Reconstruction

- Release base: `0cdfc7f` (`Launch plan`).
- Candidate chain: `d0acabe`, `67a4567`, `b7bf8db`, `1044861`, `bbe8031`, `7192ddc`, `ad0cd0b`, `2b11f11`, `fc926df`, `d3c56cc`, `6fb5cde`, `2926bf5`, `b39be75`.
- Closure candidate: `7937e76c6e9bab3f28c9e3d2479e029c458ee7fa`.
- Documentation follow-up: `bd0e6b6176bdaa9c7f2c43b22cf8440df92e504c`.
- Final SHA: `b39be7580a80637f64471e1407e52a4139f069c2`.
- Original work was preserved in branch `backup/daily-engagement-reconstruction-20260723` and stash `daily-engagement reconstruction preflight 20260723`.

## Clean-candidate TypeScript failures and exact resolutions

The exact closure candidate failed from a clean checkout with these failure groups:

| Failure group | Missing source change | Why required | Classification |
|---|---|---|---|
| `App.tsx` / `src/screens/HomeScreen.tsx` casing conflict | Import `./src/screens/Homescreen` | The repository file is named `Homescreen.tsx`; TypeScript rejects both spellings on a case-sensitive clean resolver. | Required compile dependency |
| `app/_layout.tsx` `user` inferred as `never` | Auth context/session JSDoc in `providers/AuthProvider.jsx` | The JSX provider had no typed context value, so consumers lost the Supabase user type. | Required compile dependency |
| `DestinationPickerWizard.tsx` nullable pool rows | `PoolRow` nullable fields and a typed non-null filter | The mapper legitimately returns null for incomplete destinations; the prior cast did not narrow the array. | Required compile dependency |
| `OnboardingFlow.tsx` Expo metadata and unknown-catch errors | Remove deprecated manifest fallback, use nullish defaults, and narrow caught errors with `instanceof Error`. | Expo 54 types do not expose the old manifest shape and TypeScript catch variables are unknown. | Required compile dependency |
| `OnboardingFlow.tsx` prop/state errors | JSDoc prop contracts in `WingmanAddDialog.jsx` and `RatingWizardDialog.jsx`; typed `flavorVibe` state. | `checkJs` inferred null-only and `never[]` props from unannotated JSX components. | Required compile dependency |
| `lib/Wingman` casing/import and `content.length` errors | Canonicalize Wingman imports and order `Array.isArray` before the generic content branch. | Clean TypeScript includes both casing paths and otherwise narrows the record to `never`. | Required compile dependency |
| `polyfills/clipboard.ts` global API error | Typed `globalThis.Clipboard` compatibility shim. | React Native's DOM `Clipboard` type does not contain the legacy methods. | Required compile dependency |
| `lib/onboardingStepSix.js` platform metadata errors | JSDoc parameter contracts for the exported metadata helpers. | JSX callers passed Expo platform values into untyped JS, which became null-only under `checkJs`. | Required compile dependency |
| Supabase Edge functions `Deno`/remote-module errors | Committed `crawl/types/deno-runtime.d.ts`. | The clean checkout had no local declarations for Deno or the remote imports. | Required compile dependency |
| Mascot runtime imports | Committed mascot, delight, and celebration runtime modules used by the daily-engagement mission surface. | The daily-engagement UI/test source otherwise resolves imports outside the candidate. | Required daily-engagement implementation |

No unrelated Buffaverse, referral, social-feed, generated export, Serrano, or local configuration files were imported.

## Imported dirty-worktree files

Imported in scoped commits: daily-engagement domain/config/constants, mission/home view models, notification/deep-link/proximity helpers, privacy preferences, mascot/delight runtime, their contract tests, validation harness, and daily-engagement artifacts. The imported source is necessary for the daily-engagement tests and release surface. Generated bundles, provider credentials, local Supabase state, and unrelated feature migrations were excluded.

## Remaining environment dependency

The available local database is not the declared Strategy B baseline. The committed preflight reported 34 missing baseline objects and exited before engagement SQL. This is expected failure evidence, not a migration pass. A correctly provisioned, disposable Strategy B baseline is required to complete apply, partial-recovery, schema, RLS, RPC, concurrent reward, and outbox runtime validation.
