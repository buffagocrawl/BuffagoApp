# Buffago Product Review: Gamification, UX, Growth, and Monetization Recommendations

Prepared for: CEO  
Prepared by: Product Management  
Date: 2026-06-20  
Scope: Product strategy, UX, gamification, analytics, and monetization recommendations only. No app, code, database, or production behavior changes are included in this document.

## 1. Executive Summary

Buffago has the right foundation for a differentiated consumer product: it is not a generic restaurant directory. The current implementation already combines restaurant discovery, wing-specific ratings, crawl routes, XP, levels, Buffacoins, badges, leaderboards, a social feed, profile history, Wing Battle, route submission, and AI-assisted restaurant intake through Wingman. The strongest product idea is clear: Buffago can become the game layer for local wing culture.

The biggest current risk is that Buffago has several strong mechanics, but the primary loop is not yet simple enough for a new user to understand instantly: "find wings, rate them, earn progress, compare with others, come back." The app has many valuable parts, but the user's next best action can be unclear across Home, Crawls, Wingdex, Social, and Journey. The 10-step rating wizard is rich, but it may be too long for activation and repeat behavior unless the product distinguishes a fast rating from a full expert review.

The biggest opportunity is to turn crawls and ratings into repeatable game moments. Buffago should make every rating feel like progress, every crawl feel like an event, every city/state feel conquerable, and every user profile feel like a wing identity. This is the path to making Buffago feel more like Duolingo, Strava, Untappd, Letterboxd, and Pokemon GO than Yelp.

Top 5 recommended priorities:

| Priority | Recommendation | Why It Matters |
|---|---|---|
| 1 | Simplify the core loop around "Rate wings, earn progress, unlock local status." | New users need one obvious reason to act immediately. |
| 2 | Split rating into Quick Rating and Full Review. | The current 10-step flow is high-friction for frequent ratings. |
| 3 | Make crawls feel like live events with start, progress, rewards, recap, and share moments. | Crawls are Buffago's most differentiated mechanic. |
| 4 | Instrument the full behavioral funnel using a clean `user_events` taxonomy. | Current data shows completions better than attempts, abandonment, and confusion. |
| 5 | Build local conquest and social identity before aggressive monetization. | Monetization works best once restaurants and users see real local engagement. |

## 2. Lessons From Successful Gamified Apps

| App | What Works | Buffago Lesson |
|---|---|---|
| Duolingo | Daily streaks, small lessons, clear XP, leagues, immediate reward after each action. | Make one wing action per day feel valuable. Reward completion instantly and visibly. |
| Strava | Activity identity, segment competition, social proof, personal records, local leaderboards. | Make users feel like local wing athletes: route completions, personal best crawls, city ranks. |
| Untappd | Check-ins, badges, venue discovery, social feed, collection behavior. | Buffago should own "wing check-ins" with richer taste data and badges by style, city, and crawl. |
| Pokemon GO | Location-based collection, map discovery, limited-time events, local scarcity. | Turn restaurants, towns, and states into collectible territory. Seasonal wing hunts can drive outings. |
| Waze | Community contribution, lightweight points, status, local utility. | Reward users for improving the restaurant graph, confirming data, adding routes, and reporting changes. |
| Yelp | Review corpus, restaurant discovery, credibility, local SEO. | Buffago should not compete as a generic review site; it should be wing-specific, playful, and community-first. |
| Letterboxd | Identity through logs, lists, ratings, diary, followers, taste comparison. | Build a Wingdex that feels like a personal taste diary, not just a list of restaurants. |
| Reddit | Communities, reputation, comments, lightweight voting, niche identity. | Local wing communities can create retention if comments, reactions, and rivalry stay constructive. |
| Fitness/social apps | Challenges, friend accountability, streak repair, weekly goals, progress history. | Create friend challenges and weekly wing goals without encouraging unhealthy overconsumption. |

Key patterns Buffago should adopt:

- Habit loops: prompt a small action, reward it, show progress, suggest the next action.
- Streaks: use daily or weekly loops carefully; weekly may fit restaurant discovery better than daily eating.
- Rewards: make XP, coins, badges, and titles appear at the moment of effort.
- Progression: level, title, city coverage, state coverage, and restaurant mastery should all reinforce one another.
- Status and identity: users need visible wing personas, titles, favorite styles, and local rank.
- Social proof: "3 friends rated this", "trending in Connecticut", "top local crispiness score" can motivate action.
- Competition: leaderboards should be local and scoped, not only global.
- Collection mechanics: collect restaurants, towns, styles, sauces, badges, crawls, and state stamps.
- Location-based engagement: recommend nearby unrated restaurants and crawls with clear payoff.
- User-generated content: route submissions, restaurant suggestions, ratings, and photos can become the content engine.
- Viral loops: crawl recaps, Wingdex cards, challenge invites, and city ranks should be shareable.

## 3. Current Buffago Product Analysis

### Core Product Loop

Current loop:

1. User enters Home, sees level/XP, daily gift, nearest restaurant/crawl, Wing Battle, and stats.
2. User chooses a crawl or restaurant.
3. User rates wings through a multi-step rating wizard.
4. User earns XP/coins and builds Wingdex/history.
5. User can compare via Social feed, leaderboards, badges, and Journey.

The loop is strategically strong, but it has too many competing entry points. Home, Crawls, Wingdex, Social, and Journey all contain valuable actions, but the app should more aggressively guide the user to one next best action: rate nearby, continue crawl, claim reward, or challenge a friend.

### Rating Flow

The shared `RatingWizardDialog` captures sauce style, sauce/rub score, crispiness, chicken quality, overall, flavor vibe, spice level, wings eaten, tag, and would-order-again. This is excellent data quality for a wing-specific product. It also makes Buffago meaningfully different from Yelp.

Risk: the 10-step flow is too heavy for repeat usage and too much work for onboarding. A user should be able to submit a quick rating in under 20 seconds, then optionally add detail for bonus XP.

### Crawl Flow

The crawl screen is one of Buffago's strongest product surfaces. It uses a board-like progression, stop tiles, locked/unlocked states, proximity checks, directions, completion rewards, crawl reports, coins, and route finish leaderboards. This is the clearest "game" experience in the app.

Weakness: the crawl experience should feel more like an event from the moment it starts. Today it has strong mechanics, but it could do more with pre-crawl briefing, group invite, progress recap, completion card, and shareable results.

### Onboarding

Current onboarding has eight steps: welcome, wing preferences, state/restaurant selection, first rating, first Wingdex entry, Crawl 101, sample crawl, and account/guest choice. This is strategically correct because it gets to a first rating and explains the game.

Risk: it asks for preferences, state, restaurant selection, and a full rating before the user has fully felt the value. The account prompt is deferred, which is good. The first reward moment should be more explicit and more exciting.

### Profile/Account/Journey

Journey shows crawl history, ratings, yearly stats, best/worst/frequent restaurants, average taste dimensions, closest/farthest alignment with community ratings, badges, and active crawls. This is a strong personal-history base.

Weakness: profile identity is not yet strong enough. The user should see an earned title, local rank, favorite wing style, top town, most trusted rating dimension, badges, and next achievable goal at a glance.

### Badges

Badges exist through `badge_catalog`, `user_badges`, and `v_badges_for_user`, with earned/locked display. This is a good start.

Weakness: badge earning appears disconnected from the most important moments. Badges should be teased before earning, celebrated when earned, and tied to routes, cities, styles, social actions, and restaurant mastery.

### Leaderboards and Social Feed

The Social tab includes a feed and leaderboards. Existing leaderboard categories include highest level, badges earned, weekly streak, destination coverage percentage, crawls in 24 hours, and restaurants rated in 24 hours. Social feed uses `v_social_feed` with latest ratings and supports state/all scopes; friends is planned but disabled.

This is directionally right. The main weakness is that social interaction is mostly passive. Users can view activity, but not yet react, comment, challenge, follow, form rivalries, or coordinate crawls.

### Wingdex/Discovery

Wingdex is a strong concept. It combines public ratings, maps, filters, "rated by you", Buffacoin rating, restaurant detail, and nearby/state/all discovery. Buffacoins create a useful rule: earn coins through crawls, spend them to rate prior visits without proximity.

Risk: Wingdex could be perceived as a restaurant list rather than a collection book. The UI and copy should make it feel like a personal/local completion system.

### Data Structure

The schema supports the product well: `destinations`, `routes`, `route_ordered_destinations`, `crawls`, `destination_ratings`, `users`, `buffacoin_wallets`, `buffacoin_ledger`, `badge_catalog`, `user_badges`, `daily_xp_claims`, `user_meta`, `level_thresholds`, `user_wing_battle_votes`, `wing_battle_options`, `v_social_feed`, and leaderboard read models.

Risks visible from the repo:

- Route stops exist in both legacy `routes.stop1_id` through `stop5_id` and normalized `route_ordered_destinations`.
- The schema export appears incomplete for referenced objects such as `crawl_members` and `destination_tag_map`.
- `onboarding_analytics` exists but code appears to rely more on `trackEvent` than that table.
- Analytics events are partially instrumented but not yet comprehensive or standardized enough for product decision-making.

## 4. UI Recommendations

| Area | Recommendation |
|---|---|
| Visual hierarchy | Make Home prioritize one primary action: "Rate nearby", "Continue crawl", or "Start a crawl." Secondary modules should support that action. |
| Empty states | Make every empty state actionable: find nearby wings, add with Wingman, submit a route, invite friends, or switch state. |
| Calls to action | Use consistent verbs: Rate, Start Crawl, Continue Crawl, Claim, Challenge, Share. Avoid too many equivalent CTAs. |
| Game polish | Add lightweight animated reward moments for XP, coins, badges, level-ups, crawl completion, and first city/town conquest. |
| Celebration | Every rating should end with a score, XP/coin impact, one comparison, and a next action. |
| Button consistency | Standardize contained primary actions, outlined secondary actions, and icon-only utility actions. |
| Navigation clarity | "Social" should clearly distinguish Feed, Leaderboards, Friends, and Challenges as the product matures. |
| Crawl clarity | Show current stop, distance rule, why a stop is locked, and what reward is available on completion. |
| Rating clarity | Offer Quick Rating first, then "Add details for bonus XP." |
| Fun factor | Use the wing mascot and game language for moments of progress, but keep restaurant information clear and trustworthy. |

Specific UI opportunities in the current app:

- Home already has XP/level, Wing Battle, daily gift, stats, and nearest restaurant. It should reduce visual competition and make "what should I do now?" unmistakable.
- Crawl board is the strongest game UI. Use similar progression language in Wingdex and Journey.
- Wingdex maps and filters are useful, but completion framing should be stronger: "You have rated 8 of 42 nearby wing spots."
- Badges should show locked progress when possible, not only locked/earned.
- Social feed empty states should invite a first local action, not only refresh.

## 5. Flow Recommendations: Crawls and Regular Ratings

### Crawls

Where users may get confused:

- Why a stop is locked.
- Whether they must finish a crawl in one session.
- Whether proximity is required for every stop.
- What rewards they get for finishing fast versus later.
- Whether a crawl is solo, group, or public.

Recommended crawl flow:

1. Pre-crawl card: stops, distance, estimated time, reward, local leaderboard, friends who tried it.
2. Start moment: "Crawl started" with clear first stop and directions.
3. Stop flow: arrive, rate, celebrate, unlock next stop.
4. Mid-crawl loop: progress bar, remaining stops, bonus target, "invite a friend to join."
5. Completion: crawl report, XP, Buffacoins, badge progress, rank, share card.

How to make crawls feel like events:

- Add time-boxed crawl challenges: "Finish this weekend", "Best 3-stop score", "Local derby."
- Add group crawl invites and shared progress.
- Add route-specific leaderboards and completion badges.
- Add recap cards with best stop, average score, wings eaten, duration, and rank.

### Regular Ratings

Where users may get confused:

- Difference between proximity-based rating and Buffacoin rating.
- Why Buffacoins are needed.
- Why the rating flow is long for a simple rating.
- Whether ratings are public and how they affect Wingdex.

Recommended rating flow:

1. Quick Rating: overall, sauce/rub, crispiness, chicken, would return.
2. Submit and reward immediately.
3. Optional detail expansion: flavor vibe, heat, wings eaten, tag, photos, notes for bonus XP.
4. Post-rating: show BuffaGo Score, XP, local comparison, and "Rate another nearby spot."

How to prevent repetition:

- Rotate optional prompts: "Was it crispy?", "Best sauce note?", "Would you bring a friend?"
- Add collection progress after each rating: town, state, style, restaurant mastery.
- Suggest one next nearby unrated restaurant.
- Reward first rating of the day/week, first city, first style, and first friend challenge.

## 6. Onboarding Recommendations

Current onboarding is well-intentioned because it gets users to a first rating and explains crawls. The main improvement is speed to first satisfying action.

Recommendations:

| Goal | Recommendation |
|---|---|
| First-time activation | Get the user to a first rating or first crawl preview within 60-90 seconds. |
| First rating | Use a shortened onboarding rating, then unlock full rating later. |
| Explain the game | Use one simple promise: "Rate wings, build your Wingdex, conquer local crawls." |
| Explain ratings matter | Show how a rating affects the restaurant score, user's Wingdex, and local feed. |
| Show value first | Let users browse nearby Wingdex or sample crawl before deeper preference collection. |
| State/location setup | Prefer location detection with manual state fallback. Explain why state matters for local ranks. |
| First reward | Award visible XP, first Wingdex entry, and "Rookie Wing Scout" style title/badge after first rating. |
| Reduce drop-off | Defer full profile preferences and account creation until after the first reward. |

Suggested onboarding structure:

1. Welcome: "Build your Wingdex."
2. Location/state: "Find local wing spots and rankings."
3. Pick/rate one restaurant using Quick Rating.
4. Immediate celebration: score, XP, first badge/title progress.
5. Show next action: start a nearby crawl or explore Wingdex.
6. Account prompt: "Save your Wingdex and rank."

## 7. Addiction / Gamification Recommendations

Buffago should be habit-forming, but not manipulative. The product should encourage exploration, community, and memorable outings, not unhealthy eating frequency. Weekly loops are more ethically aligned than daily eating pressure.

| Mechanic | Recommendation |
|---|---|
| Daily loop | Daily app open can offer Wing Battle, claimable XP, trivia, or browse prompt. Do not require daily eating. |
| Weekly loop | Weekly wing mission: rate one place, continue one crawl, or vote in Wing Battle. |
| Streaks | Prefer weekly streaks for ratings/crawls. Allow non-food actions to maintain light engagement. |
| XP | Keep XP as the universal progression currency. Award for ratings, crawls, details, suggestions, shares, and useful contributions. |
| Coins | Keep Buffacoins scarce and useful. They should unlock remote/prior-visit ratings, special challenges, or cosmetic items. |
| Levels | Tie levels to titles and visible identity. Example: Rookie Wing Scout, Sauce Seeker, Local Legend. |
| Titles | Let users choose unlocked titles from `level_thresholds` and badge achievements. |
| Badges | Expand badges into collection sets: city, style, crawl, consistency, social, discovery, and mastery. |
| Collections | Track restaurants, towns, cities, states, sauce styles, crawl routes, and seasonal badges. |
| State/city/town conquest | Show percentage completion and rank by geography. Local conquest should become a primary retention loop. |
| Wing Battle | Move from simple preference voting to daily/weekly matchups with community results and shareable outcomes. |
| Crawl achievements | Add route-specific achievements: first finisher, weekend finisher, all stops rated, group crawl, comeback crawl. |
| Restaurant mastery | Reward repeat visits and detailed ratings, but avoid encouraging excessive frequency. |
| Friend challenges | "Rate 3 local spots this month", "Best crispiness score", "Complete this crawl." |
| Seasonal events | March Madness-style wing brackets, football season crawls, summer patio wings, state challenges. |
| Limited-time challenges | Sponsored or editorial challenges with clear start/end dates and rewards. |
| One more action loops | After each action, suggest exactly one next step: rate nearby, invite friend, view rank, continue crawl. |

## 8. Social Interaction Recommendations

Buffago's social layer should drive retention by making users feel known locally. The current feed and leaderboards are useful, but mostly read-only.

Recommendations:

| Area | Recommendation |
|---|---|
| Friend system | Add follow/friend relationships, friend feed, friend leaderboard, and invite by contacts/link. |
| Activity feed | Show ratings, crawl starts/completions, badges, level-ups, restaurant additions, and challenge wins. |
| Reactions/comments | Add lightweight reactions first: fire, agree, want to try, great pick. Add comments later. |
| Rivalries | Let users compare Wingdex coverage, local rank, favorite style, and crawl completions. |
| Challenges | Create one-to-one, group, and local challenges with simple progress tracking. |
| Local leaderboards | Prioritize state/city/town leaderboards over global. Global is less motivating early. |
| Sharing | Generate share cards for rating, crawl completion, badge, title, city rank, and Wingdex milestone. |
| Restaurant shoutouts | Let users tag/shout out a restaurant after rating or completing a crawl. |
| Group crawls | Support planned group crawls, shared route progress, and completion recap. |
| Identity/status | Make username, avatar, title, level, top badge, local rank, and favorite wing style visible. |

Retention thesis: users return when Buffago becomes a local identity system. A user who has friends, rivalries, a public Wingdex, and local rank has a reason to come back even when they are not actively eating wings.

## 9. Logging / Understanding Users

This section is critical. Buffago needs to measure attempts, friction, abandonment, reward response, and retention, not only completed database records. The current repo already includes `lib/analytics.js` with anonymous ID, session ID, lifecycle events, and `trackEvent`, plus a `user_logging_plan.md`. The direction is correct. The gap is full, consistent instrumentation and product dashboards.

### Recommended Event Taxonomy

Use lowercase snake case. Keep event names stable. Put details in properties, not event names.

| Event | Key Properties |
|---|---|
| `app_opened` | `source`, `entry_screen`, `is_authenticated`, `app_version`, `platform` |
| `signup_started` | `source_screen`, `auth_provider`, `anonymous_id` |
| `signup_completed` | `source_screen`, `auth_provider`, `had_guest_activity`, `ratings_migrated`, `suggestions_migrated` |
| `onboarding_step_viewed` | `step`, `step_index`, `total_steps`, `state_id`, `destination_id` |
| `onboarding_step_completed` | `step`, `step_index`, `duration_ms` |
| `onboarding_step_skipped` | `step`, `step_index`, `reason` |
| `onboarding_completed` | `duration_ms`, `picked_state`, `picked_destination`, `created_account`, `completed_first_rating` |
| `location_state_selected` | `state_id`, `state_code`, `source` |
| `restaurant_search_submitted` | `source_screen`, `query_length`, `state_id`, `location_mode`, `radius_miles` |
| `restaurant_search_results_viewed` | `result_count`, `duration_ms`, `source_screen` |
| `restaurant_selected` | `destination_id`, `source_screen`, `rank`, `distance_bucket`, `already_rated` |
| `restaurant_created` | `source`, `state_id`, `wingman_decision`, `confidence_bucket`, `manual_review` |
| `rating_started` | `source`, `destination_id`, `crawl_id`, `route_id`, `is_buffacoin`, `coin_cost` |
| `rating_step_completed` | `source`, `step`, `step_index`, `duration_ms` |
| `rating_submitted` | `source`, `destination_id`, `crawl_id`, `is_buffacoin`, `coin_cost`, `score_bucket`, `has_tag`, `has_flavor_vibe`, `would_order_again` |
| `rating_abandoned` | `source`, `destination_id`, `crawl_id`, `step`, `duration_ms`, `reason` |
| `crawl_viewed` | `route_id`, `source_screen`, `status`, `stop_count`, `distance_bucket` |
| `crawl_started` | `route_id`, `crawl_id`, `source_screen`, `is_solo`, `stop_count` |
| `crawl_restaurant_rated` | `route_id`, `crawl_id`, `destination_id`, `stop_order`, `rated_count`, `stop_count` |
| `crawl_completed` | `route_id`, `crawl_id`, `duration_hours_bucket`, `stop_count`, `rated_count`, `coin_reward`, `xp_reward` |
| `crawl_abandoned` | `route_id`, `crawl_id`, `rated_count`, `stop_count`, `age_hours_bucket` |
| `wing_battle_viewed` | `source_screen`, `active_battle_count`, `answered_count` |
| `wing_battle_completed` | `battle_count`, `coin_reward`, `already_rewarded_today` |
| `badge_earned` | `badge_id`, `badge_code`, `category`, `tier`, `xp_reward`, `source_action` |
| `reward_claimed` | `reward_type`, `amount`, `reason`, `streak_count`, `source_screen` |
| `leaderboard_viewed` | `scope`, `metric`, `state_id`, `source_screen` |
| `feed_viewed` | `scope`, `state_id`, `rows_loaded`, `source_screen` |
| `profile_viewed` | `viewed_user_id`, `viewing_self`, `source_screen` |
| `profile_updated` | `fields_changed`, `source_screen` |
| `friend_action_started` | `action`, `target_user_id`, `source_screen` |
| `friend_action_completed` | `action`, `target_user_id`, `result` |
| `share_sheet_opened` | `content_type`, `content_id`, `source_screen` |
| `share_completed` | `content_type`, `share_target`, `content_id` |
| `error_shown` | `screen`, `error_code`, `error_message_safe`, `api_name`, `http_status` |
| `empty_state_viewed` | `screen`, `state_name`, `filters`, `source_screen` |
| `paywall_viewed` | `source_screen`, `offer_id`, `feature`, `price_bucket` |
| `purchase_started` | `offer_id`, `feature`, `price_bucket` |
| `purchase_completed` | `offer_id`, `feature`, `revenue_cents`, `currency` |
| `purchase_failed` | `offer_id`, `feature`, `error_code` |

### Recommended Funnels

| Funnel | Steps |
|---|---|
| New user activation | `app_opened` -> `onboarding_step_viewed` -> `location_state_selected` -> `restaurant_selected` -> `rating_started` -> `rating_submitted` -> `onboarding_completed` |
| First crawl | `crawl_viewed` -> `crawl_started` -> `crawl_restaurant_rated` -> `crawl_completed` |
| Repeat rating | `app_opened` -> `restaurant_search_submitted` or nearby recommendation viewed -> `restaurant_selected` -> `rating_started` -> `rating_submitted` |
| Wingdex discovery | `feed_viewed` or Wingdex viewed -> `restaurant_selected` -> directions/rating/share |
| Social retention | `feed_viewed` -> profile viewed -> friend action/share/challenge |
| Monetization | sponsored challenge viewed -> challenge joined -> restaurant visited/rated -> reward claimed |

### Key Activation Metrics

- Percent of new users who complete onboarding.
- Percent of new users who submit first rating.
- Time to first rating.
- Percent of new users who view or start a crawl.
- Percent of users who return within 7 days after first rating.
- Percent of users who save account after guest activity.

### Retention Metrics

- D1, D7, D30 retention by signup cohort.
- Weekly active raters.
- Weekly active crawlers.
- Ratings per active user per week.
- Crawls started and completed per active user.
- Social feed viewers who return within 7 days.
- Users with at least one friend or challenge who return within 7/30 days.

### North Star Metric

Recommended North Star: weekly completed wing actions.

Definition: count of meaningful weekly actions including submitted ratings, crawl restaurant ratings, crawl completions, accepted restaurant additions, and completed Wing Battle sets. This is better than app opens because it measures real product value, and better than ratings alone because Buffago's differentiated value includes crawls and community.

Supporting metric: weekly active rated restaurants, deduplicated by user and destination.

### Product Health Dashboard

Minimum dashboard:

- DAU, WAU, MAU.
- New users, activated users, returning users.
- Onboarding completion and first rating conversion.
- Rating started/submitted/abandoned by source.
- Crawl viewed/started/completed by route.
- Wingdex search volume, empty states, selected restaurants.
- Top restaurants by views, ratings, directions, and score.
- Top crawls by views, starts, completions, abandonment.
- Reward events: XP earned, coins earned/spent, badges earned.
- Social: feed views, leaderboard views, profile views, shares, friend actions.
- Errors and slow screens by app version/platform.

### Data Quality Concerns

- Do not store raw search text by default. Store `query_length`, normalized category, and result count unless there is explicit need.
- Do not store precise location in event metadata unless necessary. Use state, city, and distance buckets.
- Keep `user_id` and `anonymous_id` linkage clear when guests create accounts.
- Standardize event names: the repo currently uses examples such as `wingdex_opened`, `profile_opened`, `badge_viewed`, `rating_completed`, and `rating_submitted`. Pick one canonical naming pattern.
- Ensure event inserts cannot expose raw events to clients.
- Confirm production schema for missing referenced tables/views before relying on dashboards.

### Privacy Considerations

- Clients should insert events but not read raw `user_events`.
- Avoid PII in metadata: no email, phone, raw address input, full search text, auth tokens, or raw AI/Places payloads.
- Use aggregated dashboards with minimum thresholds for restaurant/user insights.
- Keep Wingman raw logs operationally restricted.
- Make sharing user-initiated and explicit.

### Logging Gaps Currently Visible

- App lifecycle tracking exists, but full funnel coverage appears incomplete.
- Onboarding has several events, but step completion/skips and duration should be standardized.
- Rating starts/completions are tracked in places, but abandonment and per-step timing need stronger coverage.
- Crawl starts/completions are tracked in places, but crawl viewed, step viewed, step completed, and abandonment should be consistent.
- Social actions beyond viewing are mostly not available yet.
- Paywall/monetization events are not relevant until monetization ships, but event names should be reserved now.

How this helps Buffago understand users better: it will show where users intend to act, where they stop, which rewards work, which routes have demand but poor completion, which restaurants attract discovery but not ratings, which states/cities are growing, and which social mechanics improve retention.

## 10. Monetization Recommendations

Buffago should not rush monetization before proving local engagement. The best early monetization is restaurant and local-event monetization that reinforces the core product instead of interrupting it.

| Idea | What It Is | Who Pays | Why They Pay | Required Maturity | Risks | Recommendation |
|---|---|---|---|---|---|---|
| Restaurant-sponsored challenges | A restaurant sponsors a limited-time challenge or reward. | Restaurants | Drives visits, ratings, and social buzz. | Local active user base and challenge tracking. | Pay-to-win perception, low ROI if user base small. | Later pilot |
| Featured restaurant placements | Sponsored discovery slot in Wingdex or Home. | Restaurants | Visibility to wing-focused users. | Enough search/discovery volume. | Can damage trust if not labeled clearly. | Later |
| Local wing crawl sponsorships | Sponsored crawl route or event. | Restaurants, bars, local groups | Drives multi-stop traffic and event energy. | Strong crawl UX, share cards, group flow. | Operational complexity, fairness concerns. | Later, high potential |
| Premium user features | Advanced stats, custom lists, profile cosmetics, extra history. | Power users | Identity, analytics, and collection value. | Strong user retention and profile usage. | Too early may limit growth. | Later |
| Cosmetic/game upgrades | Profile frames, titles, badges, themes. | Users or sponsors | Status and self-expression. | Strong identity system. | Must avoid making progress feel purchasable. | Later |
| Restaurant analytics dashboards | Aggregated rating, discovery, and competitor insights. | Restaurants | Understand wing customers and local demand. | Reliable event/rating data and privacy thresholds. | Privacy, small sample sizes, sales overhead. | Later |
| Restaurant claim/profile pages | Restaurants manage info, photos, specials, official badge. | Restaurants | Accuracy, promotion, reputation. | Meaningful restaurant traffic. | Moderation and support burden. | Later |
| Sponsored badges | Branded achievement for event/challenge. | Restaurants/brands | Engagement and repeat visits. | Badge system and challenge infrastructure. | Brand clutter, trust risk. | Later with strict rules |
| Limited-time events | Seasonal city/state wing events. | Sponsors, restaurants, users | Local excitement and repeat engagement. | Event mechanics and shareability. | Requires supply coordination. | Later, strategic |
| Local ads | Clearly labeled local placements. | Restaurants/local businesses | Targeted local reach. | DAU/WAU density. | Yelp-like feel if overdone. | Avoid now |
| Affiliate/promotional partnerships | Offers from delivery, sports bars, hot sauce brands. | Partners | Qualified food audience. | User scale and attribution. | Can distract from core. | Later |
| City/state expansion sponsorships | Sponsor launch of a new city/state challenge. | Local tourism, restaurant groups, brands | Own local wing conversation. | Repeatable launch playbook. | Sales complexity. | Bigger bet |

Monetization order:

1. Build engagement and analytics.
2. Pilot sponsored local challenges manually in one strong market.
3. Add restaurant claim/profile only after organic restaurant traffic is visible.
4. Add user premium only after identity/profile value is strong.

## 11. Priority Roadmap

### Quick Wins

| Priority | Recommendation | Notes |
|---|---|---|
| High | Clarify Home's primary next action. | Continue crawl, rate nearby, or start crawl should dominate. |
| High | Add Quick Rating concept to product spec. | Keep full rating as optional detail for bonus XP. |
| High | Standardize event taxonomy and dashboard definitions. | Current helper exists; product needs consistent coverage. |
| High | Improve post-rating celebration. | Show score, XP/coin, collection progress, and next action. |
| Medium | Improve empty states with direct actions. | Especially Social, Wingdex, Crawls, Journey. |
| Medium | Make badge progress visible. | Locked badge should show path to unlock where possible. |

### Medium Effort

| Priority | Recommendation | Notes |
|---|---|---|
| High | Build crawl recap/share card spec. | Core viral loop for crawls. |
| High | Add local conquest model to product design. | Town/city/state progress and ranks. |
| High | Add friend/follow MVP. | Unlock friend feed and friend leaderboards. |
| Medium | Redesign onboarding around first quick rating. | Reduce preference and full-review friction. |
| Medium | Expand Wing Battle into weekly community result loop. | Add results, rewards, and sharing. |
| Medium | Define restaurant mastery. | Repeat ratings, photos, detailed reviews, style expertise. |

### Bigger Bets

| Recommendation | Why |
|---|---|
| Group crawls | Makes Buffago social in the real world. |
| Seasonal city/state events | Strong retention and sponsorship potential. |
| Sponsored crawl marketplace | Best monetization fit if local density exists. |
| Restaurant analytics dashboard | Valuable after data volume and privacy foundations are strong. |
| AI-powered personalized crawl suggestions | Useful once enough ratings/preferences exist. |

### Do Not Do Yet

| Recommendation | Reason |
|---|---|
| Heavy paid ads | Retention and activation need clearer baselines first. |
| Broad local ads in the app | Risks making Buffago feel like Yelp too early. |
| Complex premium subscription | Value proposition is not mature enough yet. |
| Overbuilt BI stack | Start with clean events and simple dashboards. |
| Large schema cleanup | Verify production schema and references first. |
| Full comment system before reactions/friends | Moderation burden is higher than the near-term value. |

## 12. Final CEO Recommendation

Buffago should focus next on making the core game loop unmistakable: rate wings, build your Wingdex, complete crawls, earn local status, and compare with friends. The product already has the raw ingredients. The next phase should simplify, sequence, and measure them.

What should happen next:

1. Define the canonical activation loop and redesign onboarding around first quick rating.
2. Productize crawls as events, with stronger start, progress, completion, reward, and share moments.
3. Instrument the full funnel through `user_events` and build a lightweight founder dashboard.
4. Strengthen local identity: titles, city/state conquest, badge progress, and local ranks.
5. Add social interaction in stages: reactions, friends, challenges, group crawls.

What should wait:

- Aggressive monetization.
- Broad restaurant ads.
- Complex subscriptions.
- Full comment/community moderation.
- Major data model refactors until production schema is validated.

Biggest opportunity: Buffago can own a niche that Yelp cannot: wings as a local game, collection, and community identity.

Biggest risk: the product becomes a collection of separate features rather than one clear loop. If users do not quickly understand why to rate, crawl, return, and share, the mechanics will not compound.

Metrics that should determine success:

- First rating completion rate.
- Time to first rating.
- D7 retention after first rating.
- Weekly completed wing actions.
- Crawl start-to-completion rate.
- Ratings per active user per week.
- Social feed/leaderboard viewers who return.
- Share and invite conversion.
- Restaurant/crawl demand by city/state.

## Assumptions / Areas to Validate

- The analysis is based on repository files and schema exports, not live production analytics.
- Actual user volume, retention, and funnel conversion were not available in the codebase.
- Production schema should be verified for referenced-but-missing objects such as `crawl_members` and `destination_tag_map`.
- The current `user_events` table and RLS status should be confirmed in Supabase before depending on dashboards.
- Current badge earning rules and all RPC definitions were not fully visible from the scanned files.
- Monetization recommendations assume Buffago is still pre-scale or early-scale and should prioritize engagement before revenue extraction.
