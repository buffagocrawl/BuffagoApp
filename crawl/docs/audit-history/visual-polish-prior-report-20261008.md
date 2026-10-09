# BuffaGo Visual Polish V2 report

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](../branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

**Overall assessment: FAIL (partial implementation; native visual acceptance criteria remain unmet).** The configured Android emulator launched the existing development client and real React Native tabs were inspected. The review found clipped labels and truncated copy at the emulator's default font setting. This pass does not claim visual completion.

## Summary by tab

- **Home:** Removed the separate “Open map” and “Find wings” shortcuts. The nearby spot action now reads **Find Wings** and retains the existing destination picker. The Nearby Spot photo area uses the existing approved gallery loader and distinguishes empty/loading/unavailable states; empty CTA routes into the existing rating or historical attachment path. On the available unauthenticated/no-location emulator state, Nearby Spot showed the no-spot state, so the new empty-photo and approved-photo states were not directly verified on Home.
- **Crawls:** Added a featured recommendation composition, clearer create/map actions, and a horizontal filter rail with a fade/chevron cue. The native empty state is functional, but filter labels, header action text, and empty-state copy visibly truncate in the inspected emulator screenshot.
- **Wingdex:** Fixed the absolute header's status-bar overlap by anchoring it to the native top inset. Added horizontal filter affordances and compact sort names with descriptive accessibility labels. The 5/25/50 mile selections were exercised on the native screen. Photo and no-photo restaurant cards render as distinct variants, but action/count text clips at the current emulator typography, so card legibility does not pass.
- **Social:** Existing activity rendered on the emulator. The feed still shows large image placeholders for text-only items and tightly packed navigation/filter labels; the requested compact text-first presentation is not verified as complete.
- **Journey:** The native tab reached the sign-in gate. Profile, statistics, creator, and history layouts could not be inspected without an authenticated test account.

## Design system changes

The existing five-tab redesign and shared `src/theme/operationTokens.js` direction were retained. This pass applies the shared tab bar style with bottom safe-area insets on Home and adjusts compact filter and action sizing in the touched screens. There is no complete cross-tab token audit in this pass; the remaining typography and clipping seen in native screenshots means the visual consistency acceptance criterion is **FAIL**.

## Image and empty-state behavior

Home and Wingdex use `loadWingdexRestaurantGallery`, retaining the existing approval/visibility boundary. A successful empty gallery is presented as an invitation; gallery errors are presented as unavailable. The Home CTA selects the existing rating flow for a new rating, or Journey for an existing rating's photo attachment. Wingdex selects the restaurant through its existing Home rating flow or routes an existing rating to Journey. No upload endpoint, moderation rule, or backend contract was added or changed. These actions were reviewed in code, not tapped on-device because doing so can initiate rating/upload flows.

## Android smoke test

The existing `Medium_Phone_API_36.1` emulator was started and the local development client was used; no EAS build was submitted. Device configuration reported 1080×2400 physical pixels, 420 dpi, and Android font scale 1.0. Native screenshots are saved under `artifacts/visual-polish-v2/`:

- Home top: android-native-home.png (historical evidence removed during cleanup)
- Home scrolled: **BLOCKED**; content fit in the available Home view and no separate scrolled capture was produced.
- Crawls: android-native-crawls.png (historical evidence removed during cleanup)
- Wingdex 5 mi: android-wingdex-5mi.png (historical evidence removed during cleanup)
- Wingdex 25 mi: android-wingdex-25mi.png (historical evidence removed during cleanup)
- Wingdex 50 mi: android-wingdex-50mi.png (historical evidence removed during cleanup)
- Social: android-native-social.png (historical evidence removed during cleanup)
- Journey: android-native-journey-sign-in.png (historical evidence removed during cleanup)
- Small viewport / increased text evidence from the earlier 320dp, 130% emulator configuration: android-small-font130-home.png (historical evidence removed during cleanup), android-small-font130-wingdex.png (historical evidence removed during cleanup). These are real-device captures, but were taken before the latest edits and are not a final acceptance pass.

The Wingdex title/header now sits below the status bar and the bottom tabs sit above the gesture bar in the captured device images. **FAIL:** several controls and labels are ellipsized or clipped, including Crawls filters/actions, Wingdex map/action/count labels, Social filters, and Journey sign-in CTA. No authenticated test session was available to capture Journey's protected content or verify Home's real photo gallery state. Approved-photo state was visible in the Wingdex list; image presentation and associated action text still need a typography pass.

## Tests

- `npm run typecheck`: **PASS**.
- `npx expo lint`: **PASS with 95 existing warnings, 0 errors**.
- Full discovered Node test suite: **FAIL, 590 passed, 2 failed, 2 skipped (594 total)**. Both failures are the existing migration integrity reconciliation checks: 24 checksum differences and one duplicate migration timestamp. The same baseline failures are documented in `docs/operation-ui-overhaul-native-readiness.md`.
- `git diff --check`: **PASS** (line-ending warnings only).
- No production Supabase records were intentionally modified. No commit, push, merge, deployment, or EAS build was performed.

## Before and after evidence

The repository's prior screenshots are browser/fixture references rather than a matched native baseline. For example, wingdex-390-fixture.png (historical evidence removed during cleanup) is a fixture, not an Android capture. The links above are actual native screenshots after the changes. A directly comparable native before/after pair is **unavailable**.

## Remaining issues and assessment

- **FAIL:** Native screenshots still show clipped labels and truncated copy at default device text settings. Fix and recapture before claiming acceptance.
- **BLOCKED:** Journey profile and history screenshots require an authenticated test account; only the sign-in gate was captured.
- **BLOCKED:** Home empty-photo and approved-photo variants were not both reproducible in the current emulator session.
- **BLOCKED:** Home scrolled, increased-font final screenshots, and a true matched native before/after set were not captured.
- **FAIL:** Full test suite retains two migration integrity failures; 2 tests remain skipped.
- **PASS:** Wingdex header safe-area correction; no observed status-bar or gesture-navigation overlap in captured screens.
- **PASS:** Home shortcut removal and “Swap Spot” → “Find Wings” copy change.

## Files changed in this pass

- `app/(tabs)/home/index.jsx`
- `app/(tabs)/ratings/index.jsx`
- `app/(tabs)/routes/index.jsx`
- `tests/home/quick-actions-home.test.js`
- `tests/operation-ui-overhaul.test.mjs`
- `docs/visual-polish-v2-report.md`
- `artifacts/visual-polish-v2/` (native screenshots and test log)

Other pre-existing working-tree changes were left untouched.
