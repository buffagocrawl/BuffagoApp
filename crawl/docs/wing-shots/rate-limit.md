# Wing Shot upload rate limit

Before this change, the authoritative limit was the `wing_upload_intent_rate_limit`
`BEFORE INSERT` trigger on `public.wing_submission_upload_intents`: 3 reservations
per rolling hour and 5 per calendar day. It counted reservation attempts, so
abandoned uploads, processing failures, and rate-limited attempts could consume
the quota.

The new authoritative limit is 5 completed Wing Shot submissions per user per
rolling 15 minutes. It is configured in `public.wing_moderation_config` as
`rolling_upload_limit` and `rolling_upload_window_seconds`, with the existing
per-user moderation multiplier and suspension state retained. The reservation
RPC checks `wing_media_submissions` under a per-user advisory lock and counts
only non-failed, non-withdrawn submissions. A rate-limited reservation returns
`WING_SHOT_RATE_LIMITED` and `retry_after_seconds` without inserting an intent.

Validation, storage staging, processing failures, authentication, RLS,
ownership, and exact-path media protections remain separate controls.
