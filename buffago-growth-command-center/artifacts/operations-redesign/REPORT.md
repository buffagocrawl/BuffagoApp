# Growth Command Center operational redesign

Implemented locally on October 8, 2026. Nothing deployed. No mobile app files changed by this task. Existing unrelated edits remain intact.

## Files changed in this task

- `models.py`: bounded, display-field-only activity parsing; weekly plan and catalog health; production nested score factors; users-created compatibility alias.
- `activity.py` (new): Eastern relative time and defensive email suppression.
- `ui/dashboard.py`: compact alerts, activity feeds, five catalog cards, weekly goal, exact chart values, sauce decoration, Canvas-based text measurement and resize callback cleanup.
- `data/demo_snapshot.json`: synthetic activity, catalog health and weekly-plan examples; not production measurements.
- `tests/test_screenshots.py`: assertions updated for the replacement layout and screenshot output.
- `tests/test_wall_operations.py` (new): relative dates, safe fields, chart zeros/missing labels/bounds, feed counts, deterministic unobstructed sauce.
- `tests/wall_followup.test.mjs` (new): actual PostgreSQL execution through the repository's pinned PGlite development dependency.
- Four new read-only production-definition fixtures: `tests/fixtures/live_get_buffago_growth_snapshot.sql`, `live_get_buffago_growth_os_state.sql`, `live_buffago_growth_command_center_redesign.sql`, `live_wing_media_is_public_status.sql`.
- New migration: `supabase/migrations/20261008165529_growth_wall_activity_weekly_catalog.sql`.
- This report, three screenshots, and the README deployment note.

The older migrations and mobile project were not edited. Python/Tkinter and standard-library runtime, branding assets, authentication transport, kiosk behavior and deployed Marketing Score v1 formula remain in place.

## Founder exclusions and metric definitions

The two requested accounts are configured exactly once in the new migration, in `buffago_growth_internal.excluded_accounts`. Add future accounts to that table. `excluded_users` joins lowercased `auth.users.email` to this private configuration and returns IDs only. `excluded_devices` resolves every non-null anonymous ID historically associated with those IDs across **all** event types and platforms. Association discovered later also excludes earlier anonymous activity.

`external_mobile_opens` retains only `app_opened` events on case-normalized iOS/Android and rejects an event when either its user ID or anonymous device ID matches an exclusion. Raw events are untouched. Private helpers have no anon/authenticated permissions and are outside the exposed public schema. No email/auth metadata is selected into snapshot fields.

- **Calendar MAU:** `COUNT(DISTINCT COALESCE(user_id::text, anonymous_id))` over filtered mobile opens. Current month is America/New_York calendar month to date. Previous month is the full previous Eastern calendar month. Monthly graph uses the same actor definition and exclusions.
- **Unique Device Opens:** `COUNT(DISTINCT anonymous_id)` over the same filtered events, ignoring null device IDs. All-time, last 24 hours and the preceding 24 hours use the same exclusions. A device seen on both platforms is assigned its most recent observed platform within each window, so platform subtotals sum to the distinct total.
- Legacy 24-hour/7-day active-user fields, 14-day active-user history, and Growth OS rolling-30-day MAU now use the same filtered mobile source. Rolling MAU remains explicitly named and separate from calendar MAU; experiment progress for `mau_30d` follows this corrected source.
- Marketing Score preserves **the inspected deployed formula**, including its per-half recency weights, smoothing, 40/25/20/15 factor weights, confidence and trailing-year window. MAU/acquisition inputs are recalculated after exclusions. Ratings/account totals and their score inputs retain their existing definitions.
- Telemetry availability uses raw mobile app-open history, so removing founder activity does not misrepresent a tracked month containing zero external opens as unavailable. Chart history retains June 2026 onward independently of the score's trailing-year window.

## Recent Activity

- **Logins:** all platforms, signed-in `app_opened` only; exclude founder user IDs; group by user ID, take latest timestamp, sort newest first with user-ID tie break, limit 10. Left join `public.users.user_id`; prefer nonblank display name, then username, then `User ` plus eight ID characters. Email-like display text is replaced with the ID fallback. Output contains only user ID, display name and timestamp.
- **Ratings:** newest 10 `destination_ratings`, joined through destination ID to `destinations`; founder creators excluded. Timestamp and rating ID establish deterministic newest-first ordering. Output contains destination name, city and creation time, never rating-user identity.
- Display uses Eastern calendar dates: Now, minutes, hours, Yesterday, weekday within seven days, or abbreviated month/day. Yesterday takes calendar priority over hour counts across midnight. Empty feeds show a calm empty state.
- Ten rows per feed at 1280x720 and 1600x900; six at 800x480. Names are measured and ellipsized rather than overlapping timestamps. City remains available in the snapshot but is omitted visually to preserve readability.

## Catalog health

Five secondary cards: Total Wing Ratings, Total Restaurants, Restaurants Without Ratings, Restaurants Without Photos, Total Users Created. User count is from `public.users`; `accounts` remains as a compatibility alias alongside `users_created`.

Missing ratings uses `NOT EXISTS` against **any** destination rating. Missing photos uses `wing_media_submissions.destination_id`, photo media type, the deployed `wing_media_is_public_status` helper, no withdrawal timestamp, and an existing object in `storage.objects` in `wing-submissions` matching a processed or thumbnail path. The inspected production helper recognizes approved, generation_pending, ready_to_post, scheduled, posting and posted: these are post-approval publication states. Pending/in-review/rejected/withdrawn/failed do not qualify. Approved rows with no display asset do not qualify; original-only assets do not qualify. This follows the canonical publication lifecycle while requiring a usable display photo.

Both percentages divide by **all destinations**, round to one decimal and return zero for an empty catalog. Cards remain neutral. At 800x480 the percentage suffix is compacted to `%`; normal wall sizes show `% of restaurants`.

## Weekly algorithm and persistence

`buffago_growth_week_start` derives Monday midnight in America/New_York. The first snapshot request after the Monday boundary lazily selects and stores a plan in `public.buffago_growth_weekly_plans`, keyed by Monday's date. The table uses RLS and service-role-only privileges. Subsequent requests return that stored plan unchanged, including after process restart and input changes. A conflict-safe insert gives one plan per week. An explicit administrator database edit can change the saved plan; no new edit UI is added.

The deterministic selector chooses the lowest available Marketing Score factor (alphabetical tie break). Its four tactical templates focus on acquisition, return usage, rating engagement or account conversion. Each has a measurable target, one next action, execution instructions, Monday/Wednesday/Sunday timeline and rationale. With no factor data, it selects tracking/baseline verification. Active experiment context aligns the tactic without automatically abandoning the weakest constraint. A current insight is incorporated into WHY. Pending photos/open work add a blocking-work reminder without taking over the growth goal.

There is no randomness, LLM call, Pi cron, or external runtime dependency. The snapshot RPC becomes VOLATILE because the first request of a week inserts a plan; its existing owner, security-definer mode and grants are retained. Growth OS controls and the existing independent mission-detail module remain intact; the old lower dashboard cards are removed.

## Drawing and screenshots

Alerts shrink from 190 to 95 logical pixels in height. Adjacent activity occupies approximately 65% of the bottom-row width. Weekly copy wraps using actual Canvas text measurements, with bounded sections and ellipsis for unusually long copy/small screens.

Each available monthly chart point gets a small numeric label. Zero is labeled; unavailable data is not. Labels normally sit above points, switch below at the top plot edge and keep endpoints inside the cards.

Sauce uses `random.Random('buffago-command-center')` recreated deterministically on every render: eight muted organic dots and two short round-ended drips. All stay in the outside gutters behind content. Coordinates and fills do not change on refresh; no images or animation are involved.

Generated and visually inspected:

- `buffago-growth-800x480.png`
- `buffago-growth-1280x720.png`
- `buffago-growth-1600x900.png`

No scrolling, clipping or out-of-window content was observed in these synthetic-data screenshots. The 800x480 view uses fewer feed rows and may ellipsize long weekly text. No monitor photos were attached to this request, and the physical Pi was not accessed; physical-monitor validation remains outstanding.

## Validation

- Python: `python -m unittest discover -s tests` — **97 tests passed**.
- SQL: `node --test tests/wall_followup.test.mjs tests/product_pulse.test.mjs` — **2 suites passed**, executing SQL rather than merely checking migration strings.
- SQL fixtures exercise both account emails, founder signed-in opens, anonymous opens on excluded devices, associations on non-open/web events, a founder-only tracked June, unrelated users/devices, calendar MAU, device windows, Growth OS MAU, activity deduplication/order/fallback/limits, destination joins, catalog denominator/photo states/assets, timezone/DST/Monday boundaries, weekly persistence after data changes, missing factors, grants, RLS, owner/security-mode preservation and repeat migration execution.
- Screenshot checks cover all three resolutions and verify every Canvas item's bounds. Additional rendering tests assert exact point-label counts including zero/missing values, feed rows and deterministic sauce outside content zones.
- Backend changes were tested in local PGlite only. Production inspection was read-only. No production migration, Edge Function deployment, or Pi copy/restart occurred.

## Exact later deployment requirements

1. Review and apply **only** `20261008165529_growth_wall_activity_weekly_catalog.sql` as a new follow-up migration. It is transaction-wrapped and targets the inspected live `buffago_growth_command_center_redesign` helper and existing snapshot/Growth OS RPCs. Do not reapply either earlier migration or blindly push the whole directory: the deployed predecessor differs from the local earlier migration copy. Confirm new migration history is recorded using the project's established migration procedure.
2. **No Edge Function deployment is required.** Inspected `buffago-growth-snapshot` v4 spreads all snapshot RPC fields and appends Growth OS state, so the new keys flow through unchanged. Device authentication and secrets remain unchanged.
3. Exact Pi runtime files changed by this task: `models.py`, new `activity.py`, and `ui/dashboard.py`, preserving their relative paths in the existing installation. Restart the display service when deployment is explicitly authorized. Existing assets, `ui/components.py`, `ui/theme.py`, authentication/client files, kiosk launcher and mission modules remain runtime prerequisites but were not changed by this task.
4. `data/demo_snapshot.json` is optional for demo mode. Tests, SQL fixtures, migration, screenshots and report are development/review artifacts, not Pi runtime files. Control service does not require a code update.
