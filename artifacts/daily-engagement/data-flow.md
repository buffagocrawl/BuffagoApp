# Data Flow

## Daily engagement

`AppShell session-ready/foreground` → `checkDailyEngagement` → `check_daily_engagement` RPC → pinned `engagement_timezone_state` → unique `daily_engagement_checks(user_id, local_date)` → confirmed dashboard state.

An app open records status only. It grants no XP, coins, badge, or streak credit.

`rating/battle/crawl canonical commit` → `recordQualifyingAction` → `record_engagement_action` → canonical source ownership check → unique `engagement_action_receipts` → mission progress + one daily streak transition → completed mission → `claim_engagement_reward` → locked assignment → `award_xp` → unique XP ledger key + mission receipt.

## Push

Contextual settings action → OS permission API → Expo push token → `register_push_installation` RPC → one installation row per user/installation. Tokens are never sent to analytics.

Business trigger/scheduler/geofence receipt → unique `notification_outbox` event → scheduled `notification-dispatch` Edge Function → delivery-time preference, quiet-hour, relationship, block, visibility, content, streak, and crawl recheck → active installations → Expo Push API → `notification_delivery_attempts` → sent/retry/failed/suppressed. Permanent invalid-token errors invalidate the installation.

## Friend rating

Committed `destination_ratings` insert → trigger → actor social visibility + accepted friendship + block check + recipient preference + feature flag → outbox key `rating:<rating-id>`. Delivery repeats authorization checks. Open → `buffago://rating/<id>` → `/profile/history/<id>` or authenticated home fallback.

## Crawl proximity

Active crawl state → select only next incomplete stop → OS region radius 200 m. Background region entry is recorded as unknown accuracy and suppressed from notification until a precise eligible check is available. Foreground evaluation uses a 161 m target, ≤75 m reported accuracy, and 250 m exit hysteresis. Server validates crawl ownership/state, 24-hour stop cooldown, four-hour global cooldown, preference, flag, and quiet hours. No coordinates are persisted.
