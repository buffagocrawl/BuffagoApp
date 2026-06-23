# Buffago XP System Review and Recommendations

Prepared for: CEO  
Perspective: Product Management and Gamification Systems Design  
Date: 2026-06-22  
Scope: Product, UX, economy, abuse prevention, analytics, and database recommendations only. No implementation changes.

## Executive Summary

Buffago has the right gamification foundation: ratings, crawls, Wingdex discovery, leaderboards, badges, daily claims, Buffacoins, and social feed mechanics all point toward a differentiated "game layer for wing discovery." The current XP system, however, is only partially formed. XP exists, levels exist, level titles exist, and some reward moments exist, but the system is not yet coherent enough for users to consistently understand what they earned, why they earned it, what it unlocks, or what to do next.

The biggest product issue is not that XP values are wildly wrong. The bigger issue is that XP is awarded from several disconnected paths, some rewards are client-side and abusable, some constants are defined but not used, and the app lacks a durable XP ledger. This makes the economy hard to audit, hard to explain, and hard to tune.

Recommended direction:

1. Keep XP as the universal long-term progression currency.
2. Make the primary XP loop: rate wings, explore new places, complete crawls, return weekly, and contribute useful data.
3. Move all XP grants to server-side, ledger-backed award logic.
4. Show every earned XP moment clearly with reason, amount, level progress, and next action.
5. Prefer weekly habit loops over daily eating pressure.
6. Use bonuses for new restaurants, towns, states, crawl completions, and useful contributions.
7. Add practical anti-abuse rules before increasing rewards.

The MVP should be simple: XP ledger, clear award table, visible XP toasts, level-up modal, profile progress view, weekly challenge, and server-enforced caps. Phase 2 can add seasons, state ranks, restaurant mastery, social reactions, friend challenges, and richer quests.

## Sources Reviewed

This review is based on the current repository and schema exports, especially:

- `crawl/utils/xp.js`
- `crawl/providers/XpToastProvider.jsx`
- `crawl/components/GamificationHeader.jsx`
- `crawl/app/crawl/[id].jsx`
- `crawl/app/home/index.jsx`
- `crawl/app/(tabs)/home/index.jsx`
- `crawl/app/(tabs)/ratings/index.jsx`
- `crawl/app/(tabs)/leaderboards/index.jsx`
- `crawl/app/profile/history/BadgesScreen.tsx`
- `crawl/lib/socialAccounts.js`
- `crawl/lib/analytics.js`
- `crawl/supabase/schema/Tables.csv`
- `crawl/supabase/schema/Columns.csv`
- `crawl/supabase/docs/database_map.md`
- `crawl/supabase/docs/dead_or_risky_tables.md`
- `crawl/supabase/docs/user_logging_plan.md`
- `docs/product/buffago_product_gamification_recommendations.md`

## Current State

### Current XP Sources Found

| Source | Current XP | Where observed | Notes |
|---|---:|---|---|
| Rate a destination during crawl flow | 25 | `XP.RATE_DEST`, `grantXp` in crawl detail | Repeatable. Client-side award after rating save. |
| Add tag during crawl rating | 5 | `XP.ADD_TAGS`, `grantXp` in crawl detail | Small detail bonus. Good idea, but easy to farm if repeat ratings are not constrained. |
| First rating of the day | 15 | `XP.DAILY_FIRST`, local `AsyncStorage` gate in crawl detail | Uses device-local storage, not durable server-side enforcement. |
| Complete crawl | 100 | `XP.COMPLETE_CRAWL`, `grantXp` in crawl detail | Strong core action reward. Currently awarded after completion. |
| First time this route | 50 | `XP.FIRST_TIME_ROUTE`, local `AsyncStorage` gate in crawl detail | Good exploration bonus, but device-local gate is abusable and may not survive reinstall/device change. |
| Daily gift claim | Unknown in schema export, app fallback implies 10 | `claim_daily_xp` RPC, `daily_xp_claims`, `user_meta` | Server-side RPC exists, but exact amount is not visible in the exported schema. |
| Link Facebook | 50 | `xp_add` RPC in `grantFacebookLinkRewardOnce` | Also grants `link_facebook` badge. Need verify whether `earn_badge` also awards badge XP to avoid double grant. |
| Badge earned | `badge_catalog.xp_reward` exists | `badge_catalog`, `v_badges_for_user`, `earn_badge` RPC referenced | The catalog has reward values, but actual award behavior is not visible from schema export. |
| Wing Battle | None observed | Events and vote table exist | Voting is logged and stored, but XP award was not found. |
| Buffacoin rating in Wingdex | None observed | Ratings tab inserts `is_buffacoin` ratings | Useful but should have lower XP or no base XP until abuse rules are clear. |
| Preferences/onboarding | None observed | `user_preferences`, onboarding flow | Strong candidate for one-time onboarding XP. |
| Restaurant suggestions/Wingman | None observed | `destination_suggestions`, `wingman_intake_logs` | Strong candidate for quality-controlled contribution XP. |

### XP Constants Defined But Not Clearly Used

`crawl/utils/xp.js` defines:

| Constant | Value | Status |
|---|---:|---|
| `RATE_DEST` | 25 | Used |
| `ADD_TAGS` | 5 | Used |
| `COMPLETE_CRAWL` | 100 | Used |
| `FIRST_TIME_ROUTE` | 50 | Used |
| `FIRST_CITY` | 25 | Not found in active award path |
| `DAILY_FIRST` | 15 | Used in crawl detail with local storage |
| `STREAK_3D` | 50 | Not found in active award path |
| `STREAK_7D` | 100 | Not found in active award path |

This is a signal that the intended XP model is broader than the implemented one.

### Current Progression Surfaces

Buffago currently has:

- `users.xp` as the main XP counter.
- `level_thresholds` with `level`, `xp_required`, and `level_title`.
- `user_with_level` view exposing computed user level.
- Home HUD reading level, XP, level title, and progress to next threshold.
- `GamificationHeader` showing level and XP progress bar.
- Leaderboards using level, ratings, crawls, badges, and other activity metrics.
- Badges screen showing earned and locked badges.
- XP toast provider showing `+N XP - reason` style snackbars.

This is a solid base, but the system currently behaves more like a set of reward fragments than a fully connected progression system.

## Problems Found

### 1. XP Is Not Ledgered

The schema has `users.xp`, but no `xp_ledger` table in the export. Without a ledger, Buffago cannot reliably answer:

- Why does this user have this XP total?
- Which actions drove XP?
- Was XP duplicated?
- Was XP denied or capped?
- Which XP sources are causing abuse?
- Which rewards improve retention?

This is the highest priority database gap.

### 2. Some XP Grants Are Client-Side

`grantXp` reads the user's XP, adds an amount, and writes the new total from the client. That creates product and security risks:

- Race conditions can lose XP if two grants happen close together.
- Client-side tampering is easier than server-side award rules.
- Award rules are scattered across screens.
- Duplicate prevention is weak.
- There is no audit trail.

XP should be awarded through a server-side function that validates source, entity, cooldown, cap, and idempotency key, then writes both ledger row and updated balance atomically.

### 3. Device-Local Reward Gates Are Abusable

The daily-first-rating and first-time-route bonuses use `AsyncStorage` gates. This is useful for UI state, but not for economy enforcement. Users can reinstall, switch devices, clear storage, or trigger duplicate paths. These should become server-side unique constraints or ledger idempotency rules.

### 4. Users May Not Understand Why XP Matters

The app shows level and XP progress, and XP toasts exist. But the reward moment is not yet strong enough:

- XP appears as a snackbar, not as a meaningful post-action result.
- It is unclear what level unlocks or titles mean.
- Badge XP may not be clearly surfaced at earn time.
- Rating completion celebrates score, but XP/progression should be part of the main result.
- Users need a "what is next" goal after earning XP.

### 5. XP Rewards Are Too Narrow

Current XP rewards mostly cover crawl ratings, crawl completion, daily claim, first route, Facebook link, and possibly badges. Buffago's strategic differentiators are broader:

- New restaurant discovery.
- New town/state exploration.
- Crawl stop completion.
- Full crawl completion.
- Weekly return loops.
- Wingdex coverage.
- Social identity.
- Data contribution.

The XP model should reward those behaviors directly.

### 6. Daily Rewards Need Careful Framing

Daily XP claims can help retention, but Buffago should not pressure daily wing consumption. Daily non-food engagement is fine: open app, vote in Wing Battle, plan a crawl, check leaderboards, or review a recommendation. Food actions should be framed weekly.

### 7. Badge XP Is Potentially Confusing

`badge_catalog.xp_reward` exists, and `earn_badge` is referenced. Facebook linking separately calls `xp_add(50)` and then `earn_badge('link_facebook')`. If `earn_badge` also grants `xp_reward`, Facebook could double-award XP. If it does not grant XP, `xp_reward` may be display-only or dead. This should be clarified.

### 8. Analytics Exists But XP Events Are Missing

`trackEvent` writes to `user_events`, and there is a logging plan. However, XP-specific events such as `xp_awarded`, `xp_denied`, `xp_capped`, and `level_up` are not visible as a consistent product contract. XP should become measurable as its own economy.

### 9. Schema Export Appears Incomplete For Analytics

The app writes to `user_events`, but `user_events` is not listed in the exported `Tables.csv`. This may mean the export is stale or the table is missing in some environments. Do not rely on analytics until this is verified.

## Current XP Balance Assessment

### What Feels Fair

- 25 XP for a rating is directionally fair if a rating is meaningful and not repeat-spammable.
- 100 XP for completing a crawl feels appropriate because crawls are Buffago's highest-effort core loop.
- 50 XP for first route completion is a good exploration bonus.
- 5 XP for adding a tag is fair as a low-friction data quality bonus.
- 50 XP for linking Facebook is reasonable as a one-time trust/social graph action.

### What Feels Too Easy Or Abusable

- Daily-first rating bonus is locally gated and should not be economy-authoritative.
- First-route bonus is locally gated and should be server-gated.
- Repeat ratings can farm XP unless there are cooldowns, uniqueness rules, and diminishing returns.
- Tag XP can be farmed if users can repeatedly rate or edit.
- Facebook linking XP should be one-time per durable identity, not just per row.
- Buffacoin ratings should not automatically earn full XP unless tied to prior visit trust rules.

### What Feels Too Grindy

- If a normal rating is 25 XP and crawl completion is 100 XP, progression depends heavily on level thresholds. Without the threshold data values, balance cannot be fully judged.
- If early levels require too much XP, the first session may not produce a satisfying level-up.
- New users should earn enough XP from first rating, preferences, and first Wingdex entry to see immediate progress.

### Recommended Early Progression Feel

- First session should produce 75 to 150 XP through legitimate onboarding actions.
- A first full crawl should usually create a level-up or get close to one.
- A casual weekly user should level up every 1 to 3 weeks early on.
- A power user should advance faster through exploration variety, not through repetitive same-restaurant ratings.

## Recommended XP Model

### Design Principles

1. Reward real-world exploration more than passive app use.
2. Reward unique coverage more than repeated activity.
3. Reward completion of Buffago-specific loops: ratings, crawls, Wingdex, social, and contributions.
4. Use one-time and milestone bonuses to make progress feel generous without enabling farming.
5. Use weekly loops for food behavior; use daily loops for lightweight engagement.
6. Keep XP explainable in plain language.

### Recommended XP Table

| Action | Current XP | Recommended XP | Reasoning | Abuse Risk | Cooldown / Rate Limit | Type |
|---|---:|---:|---|---|---|---|
| Complete onboarding profile basics | 0 | 25 | Helps activation and preference quality. | Low | Once per user | One-time |
| Fill out food preferences | 0 | 25 | Improves recommendations and personalization. | Low | Once per user, update no XP | One-time |
| First rating ever | 25 base currently applies | 75 total bonus | First rating is the activation moment. Should feel important. | Medium | Once per user, server idempotent | One-time |
| Regular valid rating | 25 | 25 | Good baseline for core loop. | Medium | 1 full-XP rating per restaurant per 30 days; lower repeat XP | Repeatable |
| Detailed rating completion | 5 tag only | 10 to 20 | Reward optional detail like tag, flavor, wings eaten, comeback answer. | Medium | Once per destination per 30 days | Repeatable with limit |
| Add tag | 5 | 5 | Keep as small data bonus. | Medium | Once per rating | Repeatable |
| Upload photo | 0 | 15 | Adds high-value content if supported. | High | Max 3 photo XP awards/day; moderation/audit | Repeatable capped |
| Rate at a new restaurant | 0 | 25 bonus | Encourages Wingdex coverage and exploration. | Medium | Once per user per destination | Milestone |
| First rating at a newly added/unrated restaurant | 0 | 40 bonus | Seeds content where Buffago has no data. | High | Once per destination globally for first qualified rater | Milestone |
| Rate in a new town/city | 0 | 50 bonus | Supports travel and local conquest. | Medium | Once per user per city | Milestone |
| Rate in a new state | 0 | 150 bonus | Big travel/exploration moment. | Medium | Once per user per state | Milestone |
| Complete crawl stop | 0 | 20 | Makes crawl progress rewarding before final completion. | Medium | Once per user per crawl stop | Repeatable per crawl |
| Complete full crawl | 100 | 125 | Crawl is the signature Buffago experience. Slightly raise reward. | Medium | Once per user per crawl instance; route bonus separate | Repeatable with rules |
| First time completing a route | 50 | 75 | Strong route discovery reward. | Medium | Once per user per route, server-side | Milestone |
| Perfect crawl coverage | 0 | 50 | Rewards rating every stop on a route. | Medium | Once per crawl completion | Repeatable per crawl |
| Fast crawl completion challenge | 0 | 25 to 100 | Adds event energy, but should be challenge-specific. | High | Only official challenge windows | Challenge |
| Daily app check-in | Daily gift unknown, app implies 10 | 5 to 10 | Light retention without food pressure. | Low | Once per NY calendar day | Daily |
| Daily first meaningful action | 15 first rating | 15 | Keep, but allow Wing Battle/planning action too. | Medium | Once/day server-side | Daily |
| Start weekly streak | 0 | 25 | Weekly cadence fits food exploration better than daily eating. | Low | Once when weekly streak starts | Milestone |
| Continue weekly streak | table exists for crawl streak | 25 to 50 | Good retention loop. | Medium | Once/week | Weekly |
| 3-week streak | constant 50, not found active | 75 | Milestone should feel more notable. | Low | Once per streak milestone | Milestone |
| 7-week streak | constant 100, not found active | 150 | Bigger identity signal. | Low | Once per streak milestone | Milestone |
| Return after 14+ inactive days | 0 | 25 | Win-back nudge. | Low | Once every 30 days max | Lifecycle |
| Link Facebook | 50 | 50 | Good one-time trust/social action. | Medium | Once per user and provider identity | One-time |
| Invite friend sent | 0 | 0 to 5 | Sending invites is low-signal. Avoid spam incentive. | High | Max 5/day, preferably no XP | Capped or none |
| Friend joins from invite | 0 | 50 | Higher-signal referral reward. | High | Award after friend completes first rating | Milestone |
| Friend completes first rating | 0 | 50 | Prevents fake signup farming. | High | Once per referred user | Milestone |
| Post/social activity | 0 | 5 to 10 | Reward sharing a crawl recap or rating note if posting exists. | High | Daily cap, quality gates | Repeatable capped |
| Receive like | 0 | 1 | Social reinforcement, not core economy. | High | Max 10 XP/day from likes | Daily capped |
| Receive comment | 0 | 2 | Slightly higher value than like. | High | Max 10 XP/day from comments | Daily capped |
| Wing Battle vote | 0 | 5 | Lightweight daily engagement. | Low | Once per active battle | Repeatable |
| Complete Wing Battle set | 0 | 15 | Completing all prompts is stronger than a single vote. | Low | Once per daily/weekly battle set | Repeatable |
| Improve restaurant data | 0 | 10 pending, 40 approved | Useful contribution. Award most XP only after approval. | High | Daily pending cap; approval required | Contribution |
| Suggest missing restaurant | 0 | 10 pending, 50 approved | Helps supply growth. Needs quality control. | High | Max 3 pending/day; approval required | Contribution |
| Discover unrated restaurant nearby | 0 | 20 | Encourages exploration without requiring immediate rating. | Medium | Once per destination view/check-in | Milestone |
| View leaderboard | 0 | 0 | Do not reward passive views with XP. Log it instead. | Low | None | No XP |
| View profile progress | 0 | 0 | Do not reward passive views. Use for analytics only. | Low | None | No XP |

### Recommended Caps

| Cap | Recommendation |
|---|---|
| Daily total XP from repeatable actions | 250 to 400 XP, excluding major one-time milestones |
| Daily XP from social likes/comments | 20 XP |
| Daily XP from photo uploads | 45 XP |
| Daily XP from restaurant suggestions pending review | 30 XP pending; approved XP can post later |
| Same restaurant rating XP | Full XP once every 30 days, then 5 XP for updated rating if allowed |
| Buffacoin rating XP | 10 to 15 XP max until trust model is stronger |
| Wing Battle XP | 15 XP/day or per battle set |
| Invite/referral XP | Award only after referred user completes a meaningful action |

## Progression And Leveling Recommendations

### Should Buffago Have Levels?

Yes. Levels are already present and should remain the backbone of long-term progression. They are easy to understand and pair naturally with XP bars, titles, and leaderboards.

### Should Buffago Have Titles?

Yes. Level titles already exist in `level_thresholds.level_title`. Titles should be visible in Home, Profile, leaderboards, crawl reports, and social feed. Users should eventually be able to choose from unlocked titles, not only display the current level title.

Suggested title direction:

| Level Band | Example Title |
|---|---|
| 1 to 2 | Rookie Wing Scout |
| 3 to 5 | Sauce Seeker |
| 6 to 9 | Crispness Critic |
| 10 to 14 | Wingdex Regular |
| 15 to 19 | Crawl Captain |
| 20 to 29 | Local Wing Legend |
| 30+ | Buffalo Authority |

### Should Buffago Have XP Bars?

Yes. XP bars are already present and should become more prominent after XP moments. Every award should show:

- XP earned.
- Source/reason.
- Current level progress.
- XP remaining to next level.
- Whether a level-up happened.

### Should Buffago Have Seasonal Resets?

Not in MVP. Seasonal XP is valuable later, but premature resets can confuse early users and undermine the value of permanent XP. Keep lifetime XP first. Add seasonal leaderboards later.

### Should Buffago Have State-Specific Ranking?

Yes, but Phase 2. State ranking fits Buffago's travel and local identity. Start with lifetime XP and local coverage, then add state ranks after enough density exists.

### Should Buffago Have Restaurant-Specific Mastery?

Yes, but Phase 2. Restaurant mastery can reward repeat visits without letting users farm global XP. Example: "Regular at Gabriel's Gate" based on qualified ratings across time. Mastery should not produce large repeat XP.

### Should Buffago Have Crawl Completion Trophies?

Yes. Crawls are Buffago's strongest differentiated mechanic. Each route should have a completion trophy or badge. The trophy should show:

- Completion date.
- Stops completed.
- Average score.
- Route rank, if available.
- Shareable recap.

### Should Buffago Have Weekly Challenges?

Yes, in MVP. Weekly challenges are the best habit loop for this app. They can encourage:

- Rate one new restaurant.
- Vote in Wing Battle.
- Continue or complete a crawl.
- Discover one unrated place.
- Invite a friend to a crawl.

### Should Buffago Have Daily Quests?

Yes, but use light actions. Avoid daily quests that imply users should eat wings daily. Good daily quests:

- Vote in Wing Battle.
- Check today's nearby pick.
- Plan a crawl.
- View your next badge.
- Claim daily check-in.

## MVP Progression Model

MVP should include:

1. Lifetime XP.
2. Server-side XP ledger.
3. Level thresholds and level titles.
4. Visible Home/Profile XP bar.
5. Post-action XP toast or modal.
6. Level-up celebration.
7. First rating bonus.
8. Regular rating XP.
9. New restaurant, city, and state bonuses.
10. Crawl stop and crawl completion XP.
11. Weekly streak or weekly mission.
12. Basic daily check-in XP.
13. XP analytics events.
14. Daily and source-specific caps.

This gives Buffago a complete understandable loop without overbuilding.

## Phase 2 Progression Model

Phase 2 can add:

- Seasonal XP and seasonal leaderboards.
- State-specific ranks.
- City conquest maps.
- Restaurant mastery.
- Route trophies.
- Friend challenges.
- Group crawl rewards.
- Social reactions and comments.
- Referral campaigns.
- Challenge marketplace for sponsored restaurant events.
- Trust-weighted XP.
- Cosmetic title selection.
- Shareable Wingdex cards.

## User Experience Recommendations

### Current XP Surfacing

Current UI has:

- XP toast via `XpToastProvider`.
- Level and progress bars via Home HUD and `GamificationHeader`.
- Profile/history and badges screens.
- Crawl completion report.
- Leaderboards that include level and other metrics.

This is directionally good, but reward moments need more emotional clarity.

### UX Problems

1. XP toasts are too small for major milestones.
2. Users may not know which actions earn XP before acting.
3. Users may not understand what XP unlocks.
4. Level titles are not prominent enough as identity.
5. The rating completion moment should connect score, XP, Wingdex, and next action.
6. Badges show locked/earned state, but not enough progress toward earning.
7. Daily gift reward amount and value may be unclear.

### Recommended UX Improvements

| Surface | Recommendation |
|---|---|
| Rating completion | Show a result sheet: BuffaGo score, XP earned, Wingdex progress, nearest next restaurant, and any milestone bonus. |
| Crawl stop completion | Show small progress reward: stop complete, +XP, stops remaining. |
| Crawl completion | Show full recap: route completed, XP, Buffacoins, trophy, rank, share card, next route. |
| Home | Show level title, XP bar, weekly mission, and one next best action. |
| Profile | Add a Progress tab with XP history, current title, next title, badges, streaks, state coverage, and crawl trophies. |
| Badges | Show progress toward locked badges when possible. |
| Leaderboards | Explain ranking metric and timeframe. Add local/state scope when density supports it. |
| Daily gift | Clarify "daily check-in" versus "daily rating" to avoid food pressure. |
| Level-up | Use a modal or celebration animation, not only a toast. |

### Recommended Reward Moment Hierarchy

| Moment | UI Treatment |
|---|---|
| 1 to 10 XP | Toast |
| 15 to 50 XP | Toast plus progress bar bump |
| 75 to 150 XP | Reward sheet |
| Level-up | Celebration modal |
| Badge/trophy | Badge modal with share option |
| Crawl completion | Full recap screen |

## Economy And Anti-Abuse Recommendations

### Abuse Risks

| Risk | Current Concern | Recommendation |
|---|---|---|
| Fake ratings | Ratings can drive XP and leaderboard progress. | Server-side rating validation, cooldowns, proximity checks, anomaly detection. |
| Repeated same restaurant ratings | Repeat ratings could farm XP. | Full XP once per destination per 30 days; lower XP for updates. |
| Location spoofing | Proximity checks can be spoofed. | Add server-side location evidence fields, distance metadata, and risk scoring. |
| Multiple accounts | Referral and social rewards can be farmed. | Device fingerprint signals, provider identity checks, referral reward delayed until first rating. |
| Low-effort ratings | Users can rush through minimal data. | Award base XP for valid rating, bonus XP for detail completeness and quality. |
| Battle spam | Wing Battle could be spammed if repeat voting allowed. | Unique vote per user per battle, XP only for first completed set. |
| Friend/invite abuse | Invite-sent XP is spammy. | Award referral XP only after meaningful referred action. |
| Restaurant suggestion spam | Contributions can be low quality. | Pending XP small, approved XP larger, daily caps, moderation. |
| Photo spam | Photo uploads can be abused. | Daily cap, moderation, duplicate/media checks. |
| Client tampering | `grantXp` currently writes from client. | Server-only `award_xp` RPC with ledger and idempotency. |

### Practical Protections

1. Move XP awards server-side.
2. Add `xp_ledger` with unique idempotency keys.
3. Require source-specific entity IDs where applicable.
4. Add daily caps by source and total repeatable XP.
5. Add cooldowns for repeat restaurant ratings.
6. Keep one-time bonuses enforced by unique constraints.
7. Use proximity checks for full XP on live ratings.
8. Give lower XP for Buffacoin/prior-visit ratings.
9. Add diminishing returns for repeated same behavior.
10. Log denied and capped awards.
11. Use audit metadata: app version, platform, location distance, source screen, crawl ID, destination ID.
12. Review RLS on `users`, ratings, badges, wallets, and future XP tables.

### Suggested Award Validation Rules

| XP Source | Validation |
|---|---|
| Rating | User signed in, destination exists, rating saved, source recorded, cooldown checked. |
| Proximity rating | Distance from destination within threshold, timestamp recent, location permission granted. |
| Buffacoin rating | Coin spend succeeded, destination not already coin-rated recently, lower XP. |
| Crawl stop | Crawl belongs to user, stop belongs to route, rating saved for that stop. |
| Crawl completion | All required stops completed or route-specific completion criteria met. |
| First route | No prior completed crawl for user and route. |
| New city/state | Destination city/state not previously rated by user. |
| Social | Unique actor/action, cap by day, no self-like XP. |
| Referral | Referred user is distinct and completes first valid rating. |
| Contribution | Pending XP at submit, approved XP after moderation. |

## Logging And Analytics Recommendations

XP should be observable as an economy. The analytics layer should answer:

- Which XP sources drive retention?
- Which XP sources are abused?
- Which reward moments lead to another action?
- Which level thresholds cause drop-off?
- Which bonuses encourage exploration?
- Which users are capped or denied and why?

### Recommended XP And Progression Events

| Event name | Trigger | User ID | Related entity ID | XP amount | Source/action | Metadata | Why it matters |
|---|---|---|---|---:|---|---|---|
| `xp_awarded` | XP successfully written to ledger | Required | Destination, crawl, route, badge, battle, referral, or challenge ID | Required | `rating`, `crawl_completed`, etc. | `ledger_id`, `idempotency_key`, `level_before`, `level_after`, `daily_total_after`, `source_screen` | Core economy measurement. |
| `xp_denied` | User attempts XP action but validation fails | Required | Relevant entity | 0 | Attempted source | `deny_reason`, `distance_miles`, `cooldown_until`, `risk_score` | Shows friction, fraud, and broken rules. |
| `xp_capped` | Award reduced or blocked by cap | Required | Relevant entity | Awarded and requested amounts | Source | `cap_type`, `cap_limit`, `period`, `requested_xp`, `awarded_xp` | Tunes economy and detects grinders. |
| `level_up` | User crosses threshold | Required | None | Optional awarded XP that caused it | Source that caused level-up | `level_before`, `level_after`, `title_before`, `title_after` | Measures progression satisfaction. |
| `badge_earned` | Badge inserted for user | Required | `badge_id` | Badge XP if any | Badge source | `badge_code`, `category`, `tier`, `xp_reward` | Measures achievement system. |
| `title_unlocked` | New title becomes available | Required | Level/title ID | 0 | Level progression | `title`, `level` | Identity progression. |
| `weekly_challenge_completed` | Challenge criteria met | Required | `challenge_id` | XP reward | Challenge key | `challenge_type`, `progress_required`, `progress_final` | Measures quest retention. |

### Recommended Rating Events

| Event name | Trigger | User ID | Related entity ID | XP amount | Source/action | Metadata | Why this matters |
|---|---|---|---|---:|---|---|---|
| `rating_started` | Rating wizard opens | Optional for guest | `destination_id`, optional `crawl_id` | 0 | Rating start | `source_screen`, `is_buffacoin`, `distance_miles` | Funnel start. |
| `rating_submitted` | Rating save succeeds | Required if signed in | `destination_id`, optional `crawl_id` | Base XP eligible | Rating completion | `scores`, `detail_fields_count`, `is_buffacoin`, `city`, `state_id` | Core content loop. |
| `rating_blocked_by_cooldown` | User tries to rate too soon | Required | `destination_id` | 0 | Rating denied | `last_rating_at`, `cooldown_until` | Abuse and UX friction. |
| `rating_blocked_by_distance` | Proximity rule blocks rating | Required or anonymous | `destination_id` | 0 | Rating denied | `distance_miles`, `required_distance_miles`, `location_accuracy` | Validates location rules. |
| `rating_detail_bonus_awarded` | Optional detail XP awarded | Required | `destination_id` | Bonus XP | Rating detail | `fields_completed`, `tag_id`, `has_photo` | Measures data quality incentives. |
| `new_restaurant_bonus_awarded` | First user rating at destination | Required | `destination_id` | Bonus XP | Discovery | `city`, `state_id` | Measures supply seeding. |
| `new_city_bonus_awarded` | User rates first destination in city | Required | `destination_id`, city | Bonus XP | Exploration | `city`, `state_id` | Measures travel/local expansion. |
| `new_state_bonus_awarded` | User rates first destination in state | Required | `destination_id`, `state_id` | Bonus XP | Exploration | `state_id`, `state_code` | Measures travel expansion. |

### Recommended Crawl Events

| Event name | Trigger | User ID | Related entity ID | XP amount | Source/action | Metadata | Why this matters |
|---|---|---|---|---:|---|---|---|
| `crawl_started` | User starts crawl | Required | `crawl_id`, `route_id` | 0 | Crawl | `stop_count`, `city`, `state_id`, `is_solo` | Core crawl funnel. |
| `crawl_stop_completed` | Stop is rated/completed | Required | `crawl_id`, `route_id`, `destination_id` | Stop XP | Crawl stop | `stop_order`, `total_stops`, `distance_miles` | Mid-funnel progress and reward. |
| `crawl_completed` | Crawl status becomes complete | Required | `crawl_id`, `route_id` | Completion XP | Crawl completion | `stop_count`, `rated_count`, `duration_minutes`, `first_route_completion` | Signature loop conversion. |
| `crawl_abandoned` | Crawl becomes inactive/abandoned | Required | `crawl_id`, `route_id` | 0 | Crawl | `stops_completed`, `time_since_start` | Identifies route friction. |
| `crawl_trophy_earned` | Route trophy awarded | Required | `route_id` | XP if any | Trophy | `route_title`, `completion_count` | Measures route identity. |

### Recommended Social And Retention Events

| Event name | Trigger | User ID | Related entity ID | XP amount | Source/action | Metadata | Why this matters |
|---|---|---|---|---:|---|---|---|
| `wing_battle_completed` | User completes active battle set | Required | `battle_id` | XP if awarded | Wing Battle | `choices_count`, `battle_date` | Daily light engagement. |
| `streak_started` | User starts weekly streak | Required | None | XP if awarded | Streak | `streak_type`, `period_start` | Retention start. |
| `streak_continued` | User continues streak | Required | None | XP if awarded | Streak | `streak_count`, `period_start` | Retention habit. |
| `streak_broken` | User misses streak period | Required | None | 0 | Streak | `last_active_period`, `streak_count_before` | Churn risk. |
| `leaderboard_viewed` | User views leaderboard | Optional | None | 0 | Leaderboard | `scope`, `metric`, `state_id` | Social motivation measurement. |
| `profile_progress_viewed` | User views progression profile | Required | None | 0 | Profile | `level`, `xp_to_next`, `badges_count` | Measures whether progression matters. |
| `social_reaction_created` | User likes/reacts to activity | Required | Rating/crawl/post ID | 0 or tiny XP | Social | `reaction_type`, `target_user_id` | Social engagement. |
| `invite_sent` | User sends invite | Required | Invite ID | Usually 0 | Referral | `channel`, `target_type` | Viral loop measurement, not necessarily XP. |
| `referral_qualified` | Referred friend completes first rating | Required | Referral ID | Referral XP | Referral | `referred_user_id`, `qualifying_action` | Abuse-resistant referral attribution. |
| `return_after_inactivity` | User returns after inactive threshold | Required | None | XP if awarded | Lifecycle | `inactive_days`, `return_source` | Win-back measurement. |

## Database Recommendations

### Add `xp_ledger`

Purpose: authoritative immutable record of XP economy.

Recommended columns:

| Column | Purpose |
|---|---|
| `id uuid primary key` | Ledger row ID. |
| `user_id uuid not null` | Recipient. |
| `amount integer not null` | XP delta. Can be positive; avoid negative unless adjustment policy exists. |
| `source xp_source not null` | Normalized source enum. |
| `reason text` | Human-readable reason. |
| `idempotency_key text not null` | Prevent duplicate grants. |
| `destination_id uuid null` | Related restaurant. |
| `crawl_id uuid null` | Related crawl. |
| `route_id uuid null` | Related route. |
| `badge_id bigint null` | Related badge. |
| `battle_id bigint null` | Related battle. |
| `challenge_id uuid null` | Related challenge. |
| `referral_id uuid null` | Related referral. |
| `level_before integer null` | Progression audit. |
| `level_after integer null` | Progression audit. |
| `xp_before integer not null` | Balance audit. |
| `xp_after integer not null` | Balance audit. |
| `metadata jsonb not null default '{}'` | Distance, source screen, app version, caps, etc. |
| `created_at timestamptz not null default now()` | Award time. |

Recommended constraints:

- Unique `idempotency_key`.
- Check `amount <> 0`.
- Index `(user_id, created_at desc)`.
- Index `(source, created_at desc)`.
- Index entity columns used by analytics.

### Add `xp_source` Enum Or Reference Table

Recommended values:

- `rating`
- `rating_detail`
- `first_rating`
- `new_destination`
- `new_city`
- `new_state`
- `crawl_stop`
- `crawl_completed`
- `first_route`
- `daily_checkin`
- `weekly_streak`
- `wing_battle`
- `badge`
- `facebook_link`
- `referral`
- `photo`
- `restaurant_suggestion`
- `restaurant_data_improvement`
- `return_after_inactivity`
- `admin_adjustment`

Use an enum if sources are tightly controlled. Use a reference table if Product wants to tune sources dynamically.

### Add Or Formalize `xp_events`

If `user_events` is the central analytics log, `xp_events` may not be needed separately. The product still needs either:

- `xp_ledger` for financial-grade economy truth, plus `user_events` for analytics; or
- `xp_ledger` plus a derived `xp_events` view.

Do not use analytics events as the source of truth for XP balances.

### Add `daily_xp_caps`

Purpose: server-side caps by source and user.

Recommended columns:

- `user_id`
- `cap_date`
- `source`
- `xp_awarded`
- `actions_count`
- `updated_at`

Alternative: compute caps from `xp_ledger` at award time. That is simpler early but can get expensive at scale.

### Add Streak Tracking

Current schema has `user_meta.daily_claim_streak`, `last_daily_claim_at`, and `crawl_weekly_streak` view. That is a start, but weekly engagement should be explicit.

Recommended table: `user_streaks`

- `user_id`
- `streak_type` such as `weekly_activity`, `weekly_rating`, `weekly_crawl`
- `current_count`
- `best_count`
- `current_period_start`
- `last_qualified_at`
- `broken_at`
- `updated_at`

### Add Challenge Progress

Recommended tables:

- `challenge_catalog`
- `user_challenge_progress`

Track challenge type, required count, current count, period, reward XP, reward status, and completion timestamp.

### Add Seasonal XP Later

Recommended tables for Phase 2:

- `seasons`
- `season_xp_ledger` or `xp_ledger.season_id`
- `season_leaderboard_snapshots`

Do not reset lifetime XP. Add seasonal XP as a parallel competitive layer.

### Add Audit Columns

For XP-relevant tables, add or verify:

- `created_at`
- `updated_at`
- `created_by`
- `source`
- `source_screen`
- `app_version`
- `platform`
- `metadata`

Key tables:

- `destination_ratings`
- `crawls`
- `user_badges`
- `user_wing_battle_votes`
- `destination_suggestions`
- `wingman_intake_logs`
- future social tables

### Database Items That Look Confusing Or Risky

| Item | Concern | Recommendation |
|---|---|---|
| `users.xp` only | No audit trail. | Keep as cached balance, but back with `xp_ledger`. |
| `grantXp` client flow | Race and tamper risk. | Replace with server-side award RPC when implementation begins. |
| `daily_xp_claims` | Good concept, but amount and behavior not visible in schema export. | Document RPC contract and log awards to ledger. |
| `badge_catalog.xp_reward` | Unclear whether it is display-only or awarded by `earn_badge`. | Define single badge reward authority. |
| `user_events` | App writes to it, but schema export does not list it. | Regenerate schema export and verify table/RLS. |
| `FIRST_CITY`, `STREAK_3D`, `STREAK_7D` constants | Defined but not found in active award paths. | Either implement intentionally or remove during cleanup. |
| `AsyncStorage` XP gates | Not authoritative. | Use only for UI hints, never economy truth. |
| RLS posture | Existing docs note RLS unknown for many tables. | Review before server-side XP expansion. |

## Recommended MVP Plan

### MVP Product Scope

1. Define official XP source table and award amounts.
2. Add server-side `award_xp` logic with ledger and idempotency.
3. Keep `users.xp` as cached balance updated by server-side award logic.
4. Replace client-side direct XP mutation with server-side source-specific awards.
5. Add XP events: `xp_awarded`, `xp_denied`, `xp_capped`, `level_up`.
6. Add first rating, new restaurant, new city, new state, crawl stop, and weekly streak rewards.
7. Add daily caps and same-restaurant cooldown rules.
8. Improve reward UI around rating completion and crawl completion.
9. Add Profile Progress view.
10. Add one weekly mission.

### MVP Recommended XP Values

| Action | XP |
|---|---:|
| Daily check-in | 5 to 10 |
| Wing Battle completed | 15 |
| Regular rating | 25 |
| First rating bonus | +50 |
| Detailed rating bonus | +10 |
| New restaurant bonus | +25 |
| New city bonus | +50 |
| New state bonus | +150 |
| Crawl stop completed | 20 |
| Full crawl completed | 125 |
| First route completion | +75 |
| Weekly streak continued | 25 to 50 |
| Link Facebook | 50 |
| Approved restaurant suggestion | 50 |

### MVP Success Metrics

| Metric | Target Direction |
|---|---|
| First rating completion rate | Increase |
| Rating-to-second-action rate | Increase |
| Crawl start-to-completion rate | Increase |
| Week 1 retention | Increase |
| Week 4 retention | Increase |
| Ratings per active user | Increase, with unique restaurant ratio monitored |
| Unique restaurants rated per active user | Increase |
| XP source distribution | No single repeatable low-value source dominates |
| XP denied/capped rate | Low but visible |
| Level-up rate in first session | Healthy, not universal |
| Badge earn rate | Steady and understandable |

## Phase 2 Ideas

1. State leaderboards and state-specific titles.
2. Seasonal leagues with non-resetting lifetime XP.
3. Restaurant mastery levels.
4. City conquest maps.
5. Group crawl invites and shared rewards.
6. Friend-versus-friend Wing Battle brackets.
7. Sponsored restaurant challenges.
8. Shareable crawl recap cards.
9. Photo quality rewards after moderation.
10. Trust score that weights XP and leaderboard eligibility.
11. Streak freeze or comeback mechanic.
12. Personalized quests based on user taste profile.
13. Route-specific trophies and ranked completion times.

## Open Questions

1. What are the actual `level_thresholds` values in production?
2. Does `earn_badge` currently award `badge_catalog.xp_reward`, or only insert `user_badges`?
3. What exact XP amount does `claim_daily_xp` award?
4. Does `user_events` exist in production, and is the schema export stale?
5. What RLS policies currently protect `users.xp`, ratings, badges, wallets, and votes?
6. Can users edit or resubmit ratings for the same destination, and how should XP treat edits?
7. Should Buffacoin ratings earn XP, or should full XP require proximity-validated visits?
8. What is the intended relationship between Buffacoins and XP?
9. Should daily rewards be pure XP, Buffacoins, or a rotating reward?
10. Are photos planned soon enough to include in the MVP XP economy?
11. Will social likes/comments be built soon, or should social XP wait?
12. Should restaurant suggestions be manually moderated, Wingman-validated, or both?

## Final Recommendation

Buffago should keep XP, levels, badges, and leaderboards, but the XP system needs a formal economy before rewards are expanded. The immediate priority is not adding dozens of new reward types. The immediate priority is making XP trustworthy, explainable, measurable, and satisfying.

The best MVP is:

- Server-side XP ledger.
- Clear award table.
- Strong rating and crawl rewards.
- Exploration bonuses for new restaurants, cities, and states.
- Weekly streak/challenge loop.
- Better reward UI.
- XP analytics and abuse controls.

Once that foundation is in place, Buffago can safely grow into a richer progression system with seasons, state ranks, restaurant mastery, social rewards, and sponsored challenges.
