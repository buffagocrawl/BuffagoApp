# Buffaverse final design

## Purpose and user story

Buffaverse is the player's readable progress layer across Buffago. A signed-in player can see who they are in the world, what activity has counted, and the single best next move. As a player, I can open Buffaverse after a rating, crawl, streak, or badge moment and understand how that action moves my journey forward.

## Entry points and navigation

The existing Journey tab becomes the dedicated destination. Home gets a compact, optional progress card only when the client and server flags permit it. Existing profile history, badges, routes, ratings, and daily actions remain reachable from the overview.

```text
Home
  -> Buffaverse progress card
  -> Buffaverse overview (existing Journey destination)
      -> Current identity
      -> World progress
      -> Next objective
      -> Milestones
      -> Share achievement
```

The overview also links to history and the immediate action selected by the objective model. No new primary tab is added.

## States and behavior

- **Loading:** bounded skeleton/placeholder; home actions render independently and never wait for Buffaverse.
- **Error/partial data:** show a calm retryable message and any safe metrics already loaded; never fabricate values.
- **Signed out:** show sign-in CTA and no authenticated progress.
- **New user:** identity defaults to canonical level/title, zero-safe metrics, and “Rate your first restaurant” or the first available existing action.
- **Returning user:** current level/XP/title, mascot identity if available, territory summary, progress metrics, and next incomplete objective.
- **Highly progressed user:** completed milestones remain visible, next uncompleted bounded objective is selected, and a “keep exploring” fallback avoids a dead end.
- **Offline:** retain the last safe summary only if locally cached; label it as saved and avoid reporting fresh completion.
- **Reduced motion:** no entrance animation, haptic celebration, or looping motion when preference is enabled.

## Data sources and rules

- Identity: `user_with_level`, `level_thresholds`, `users`, and existing mascot/title preference paths.
- Ratings: authenticated user-owned rating rows, counted with bounded head/count queries.
- Crawls: authenticated completed `crawls` rows.
- Badges: existing `user_badges` joined to `badge_catalog`.
- Geography: derived counts from existing rating/destination/state relationships only; no raw history in UI or analytics.
- Referrals: omitted when referral flags are disabled; never enable the referral system from this feature.

All reads are derived. Buffaverse does not award XP, badges, titles, or coins. Existing action flows remain the only writers.

## Objective and milestone rules

Objectives are deterministic, bounded, and ordered: daily action/streak when available; first rating; next restaurant; next crawl; next badge; new territory; referral only when explicitly enabled. Completed objectives are excluded by explicit completion evidence, and locked objectives remain explanatory rather than actionable. XP boundaries are computed from canonical level thresholds with the final level represented as capped progress.

Milestone rendering is idempotent because it is derived from source facts. Celebration is keyed by milestone identity and session/local storage; it does not grant a reward and does not block navigation.

## Sharing

Sharing is an explicit user action behind `buffaverse.sharing`. The payload contains only a selected aggregate milestone (for example “Level 4 Wing Scout” or “10 restaurants rated”), a generic Buffago link, and no exact location, email, username unless already intentionally public, or full history. Start/completed events are allowlisted.

## Flags and rollback

Client flags default false: `ENABLE_BUFFAVERSE`, `ENABLE_BUFFAVERSE_HOME`, `ENABLE_BUFFAVERSE_SHARING`, and `ENABLE_BUFFAVERSE_CELEBRATIONS`. The existing server root flag remains the authoritative second gate. Experimental Legendary, Boss Battle, personalization, and referral flags stay independent. Disabling the root or home flag removes only the surface and preserves existing navigation. Rollback is a release rollback or flag-off; no destructive data change is needed.

## Accessibility and performance

Use semantic headers, explicit button labels, live-region updates only for meaningful changes, minimum touch targets, text that wraps/scales, contrast independent of color, and logical order. Queries are parallel, bounded, and count-only where possible. The home card uses cached/local state and never blocks core discovery, ratings, crawls, or daily engagement.

## Screens/components

- New pure model: `lib/buffaverse/progression.js`.
- New bounded loader/hook: `hooks/useBuffaverseProgress.js`.
- New overview components: `components/buffaverse/BuffaverseOverview.jsx` and `BuffaverseHomeCard.jsx`.
- Modify Journey route to host overview and link history.
- Modify Home to add the compact card behind the home flag.
- Extend feature flags and analytics catalog.
- Add unit/component contract tests and artifact documentation.

No migration is planned for this scope. If schema validation discovers a missing safe read surface, stop and document it before adding a forward-only migration.
