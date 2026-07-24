# Buffaverse analytics contract

All events use the existing `trackEvent` client and `sanitizeAnalyticsMetadata`. Values are low-cardinality scalars only.

| Event | Screen | Allowed metadata |
| --- | --- | --- |
| `buffaverse_card_viewed` | `home` | `surface` |
| `buffaverse_opened` | `buffaverse` | none |
| `buffaverse_objective_viewed` | `buffaverse` | `objective_id` |
| `buffaverse_objective_selected` | `buffaverse` | `objective_id` |
| `buffaverse_milestone_viewed` | `buffaverse` | `milestone_id`, `complete` |
| `buffaverse_level_progress_viewed` | `buffaverse` | `level` |
| `buffaverse_achievement_share_started` | `buffaverse` | `share_type` |
| `buffaverse_achievement_share_completed` | `buffaverse` | `share_type` |
| `buffaverse_celebration_shown` | `buffaverse` | `milestone_id`, `reduced_motion` |
| `buffaverse_load_failed` | `buffaverse` | `failure_code` |

No exact coordinates, full location history, email, username, free-form text, tokens, raw errors, or referral identifiers are sent. Server-side RLS and existing user event policies remain authoritative.
