# Buffaverse recovery audit

## Evidence labels

- **Confirmed from code:** present on `main` and directly inspected.
- **Confirmed from Git history:** present in an earlier commit/branch.
- **Inferred:** product meaning derived from the request and surrounding code.
- **Unknown:** not safely established from the repository.

## Original product intent

**Confirmed from the product brief and current documentation:** Buffaverse is intended to be Buffago's progression world: a readable layer connecting ratings, crawls, geography, battles, streaks, badges, referrals, mascot identity, and XP to a long-term journey. It must create a next action and preserve the “more game, less Yelp” principle.

**Confirmed from Git history:** the first implemented slice was a server-gated event foundation, followed by Legendary Restaurants and a Restaurant Boss Battle showcase. The historical branch was deliberately reconciled into `main` rather than restored wholesale.

## Recovered components

| Component | Evidence | Current status | Decision |
| --- | --- | --- | --- |
| `buffaverse_feature_flags`, event types/instances/lifecycle | `20260724020000_buffaverse_phase1_foundation.sql` | Present on `main`; production defaults disabled | Retain as server-side kill-switch foundation |
| Legendary Restaurant events and idempotent participation | Phase 2 migrations and `legendaryFeed.js` | Present, gated, reward reference only | Retain; do not add a second reward ledger |
| Legendary home/detail/map surfaces | `LegendarySurfaces.jsx`, home and ratings imports | Present and disabled by default | Retain as an independent event surface; not the progression overview |
| Boss Battle showcase/domain | `BossBattleExperience.jsx`, `bossBattles.js`, phase 3 migration | Present and disabled by default | Retain as experimental content; do not make it the default entry |
| Personalization/next-action helper | `personalization.js` | Present but only supports Legendary candidates | Reuse the idea; redesign for bounded progression objectives |
| Existing Journey tab | `app/(tabs)/journey/index.jsx` | Signed-in users see profile history | Use as the dedicated destination by replacing the dead-end history entry with a Buffaverse overview and linking history from it |
| XP, level, title, badges, mascot, celebrations | `utils/xp.js`, `user_with_level`, `level_thresholds`, `user_badges`, mascot/delight components | Existing canonical systems | Integrate read-only; no duplicate reward path |
| Generated Android/iOS/web outputs | historical commit artifacts | Build evidence, not source | Do not restore or regenerate into source scope |

## Relevant commits and branches

- `7f1efc7` (`workstream/buffaverse-phase2-approval-reconciliation`): phase 2/3 UI, domain helpers, migrations, tests, and generated outputs; merged into current `main`.
- `8ec42e3` / `a29b083`: Legendary Restaurant integration and notification boundary hardening.
- `c9b9ba4` / `bdeee9d`: local geography constraint correction.
- `975b614`: reconciliation merge from the Buffaverse workstream into `main`.
- `b991684`: release-isolation commit that explicitly excluded unrelated Buffaverse candidate files.
- `main` at `b0d52b2`: clean baseline used for this completion branch.

No older `LegendaryHero` implementation was found in reachable history. Current `LegendaryHomeHero` is the successor concept, not a general progression card.

## Retain, redesign, reject

### Retain

- Server-owned, default-off flags and parent-child kill switches.
- Bounded event feeds, RLS, idempotency constraints, and reward references.
- Existing XP ledger, level thresholds, titles, badges, mascot registry, celebration, analytics sanitizer, social opt-out, auth, and daily-engagement systems.
- Legendary/Boss Battle concepts as future or independently gated world content.

### Redesign

- Turn the Journey destination into an overview that answers identity, progress, and next objective.
- Use existing activity counts as derived read metrics: rated restaurants, completed crawls, visited states/towns where safe to derive, streak/badges, and referrals only when the existing flag is enabled.
- Keep home integration compact and below the existing immediate-action priority surface.
- Share only aggregate, user-selected achievements; never include coordinates or full location history.

### Reject

- Restoring an old branch wholesale.
- A second XP/reward ledger or client-side reward grants.
- Automatic social publishing, exact location history, free-form analytics payloads, or enabling referrals.
- Treating generated bundles/screenshots as implementation source.
- Making Legendary event participation the default Buffaverse identity or requiring phase 4 data that the roadmap marks deferred.

## Current conflicts and implications

- The Journey tab currently delegates directly to history, so a progression overview requires a route-level UX change.
- `ENABLE_BUFFAVERSE` and independent experimental flags already exist, but no overview/home flags or canonical event names exist.
- The current phase migrations are event-oriented and do not provide a user progression summary. A derived client read model is safer than new stored state for this scope.
- Referral tables and flags exist but the referral system is explicitly disabled pending approval; Buffaverse must show no referral objective when disabled.
- User/location data is distributed across ratings, destinations, states, crawls, and users. Exact location history must not be exposed by the overview or share flow.

## Database, analytics, privacy, and flow implications

- **Database:** use existing views/tables with bounded count queries and RLS. No migration is required for the initial overview unless validation proves a missing canonical view.
- **Analytics:** add allowlisted low-cardinality Buffaverse overview/card/objective/milestone/share/celebration/error events to the existing catalog and sanitizer.
- **Security/privacy:** require an authenticated session for personal progress, fail closed for signed-out users, respect `social_opt_out`, and share aggregate milestones only.
- **User flow:** Home compact card → Journey/Buffaverse overview → identity, progress, objective, milestones, optional share. Existing profile history remains reachable from the overview.

## Proposed final scope

1. Add a pure progression domain model with defensive normalization, level boundaries, objective selection, feature-flag filtering, and once-only celebration keys.
2. Add a feature-flagged Buffaverse overview to the existing Journey destination.
3. Add a compact, non-blocking home progress card linking to Journey.
4. Add bounded read queries for canonical existing data only.
5. Add analytics contract, tests, design/recovery/validation artifacts, and no production migration.
6. Leave Legendary Restaurants, Boss Battles, and referrals independently gated and unchanged except for safe navigation/flag integration.
