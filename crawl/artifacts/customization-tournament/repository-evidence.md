# Repository Evidence

- **Baseline:** main at `56992973e1efab58072a2ba9758f913587a62e51`, captured 2026-07-28T18:31:39-04:00. Pre-existing dirty files: `M ../Agents/Chipotle/artifacts/last-run-result.json
 M app.config.js
 M eas.json
?? artifacts/`. Working tree was not clean; changes are outside the approved artifacts location.
- **Areas reviewed:** routes/navigation; home; profiles/history/badges; mascot; leaderboards; missions; XP; ratings; Wingdex/passport; restaurants/crawls/geography; social/referrals/sharing; Wing Duel/Facts; onboarding/auth; flags; analytics; states; tests; Serrano/Cayenne references; roadmap/docs; loading/error/empty/accessibility; app metadata.
- **CODE-CONFIRMED:** `assets/wing-user.png` is 1024x1024. `components/mascot/registry.ts` has only `hero`; unknown poses fall back. `BuffagoMascot.tsx` has contain sizing, optional animation, a failure fallback, accessibility labeling, analytics impressions and reduced-motion respect.
- **CODE-CONFIRMED:** `components/mascot/config.ts` enables mascot moments for onboarding, completion, badges, passports, missions, share cards, errors and empty states, but not navigation/rating/map headers.
- **CODE-CONFIRMED:** `lib/buffaverse/progression.js` projects level, title, mascot, territory, restaurant/crawl/state/badge metrics and milestones. Weekly mission/leaderboard docs describe verified, immutable completions.
- **CODE-CONFIRMED:** `lib/analyticsSchema.js`, `config/engagementFlags.js`, privacy code, reduced motion and test files offer rollout foundations.
- **ARTIFACT-CONFIRMED:** README defines a gamified wing-crawl discovery/rating app; analytics are a foundation, not proof of production retention.
- **UNKNOWN:** Adult mascot demand, production retention lift, catalog/entitlement implementation, partner appetite, and live store metadata.

## Mascot assessment

The current asset is a suitable default base but not proof of demand for broad avatar creation. Recommend a curated static layered-2D system: fixed safe bounds, transparent PNG/SVG layers, explicit z-order, server-authoritative grants, and visual regression tests. Static poses are preferable first; avoid universal mascot placement. Use provenance such as “Earned by rating 10 restaurants” rather than a generic rarity ladder.
