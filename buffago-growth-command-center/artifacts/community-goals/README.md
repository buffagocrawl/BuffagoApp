# Community goal counts

Both requested account emails matched authoritative auth.users records. Their two distinct user IDs were deduplicated and stored only in a private dashboard configuration object in the existing private analytics bucket. No account email or ID is included here, in Pi configuration, feed payloads, screenshots, public assets or logs. The Pi feed capability cannot retrieve this separate private configuration object.

Ratings are filtered using destination_ratings.user_id. Photos use wing_media_submissions.user_id, independently of their linked rating author, approver, attribution, restaurant owner or display name. Nullable authors remain included unless their actual ID is excluded; missing author fields fail the refresh rather than silently treating ownership as unknown. Duplicate entity IDs count once, and conflicting duplicates fail closed.

The approved photo definition is unchanged: media_type=photo, withdrawn_at null, lifecycle status approved, generation_pending, ready_to_post, scheduled, posting or posted. These are contribution records, not unique contributors or photographed restaurants. Restaurant counts receive no founder filter. Source data, business snapshot metrics and target values are unchanged.

The producer reads the private configuration and source rows, exports only aggregates, and replaces only its existing sanitized current feed object. Old unfiltered cached contribution totals become unavailable rather than masquerading as community totals. Nation still requires exactly one aggregate per each of all 50 states and includes featured states. Percentage complete and remaining gap use the filtered current counts. No separate goal pace series currently exists in this dashboard.

Read-only baseline observed October 30, 2026 at 09:20 EDT; independently matched by the server adapter. Each metric below is current / approved total (remaining). Deadline remains December 31, 2026.

| Geography | Restaurants | Community ratings | Community photos |
|---|---:|---:|---:|
| Nation | 1134 / 1400 (266) | 101 / 800 (699) | 1 / 250 (249) |
| Connecticut | 228 / 250 (22) | 82 / 450 (368) | 1 / 90 (89) |
| Ohio | 103 / 150 (47) | 0 / 50 (50) | 0 / 25 (25) |
| New York | 68 / 100 (32) | 1 / 60 (59) | 0 / 35 (35) |
| Massachusetts | 40 / 65 (25) | 6 / 80 (74) | 0 / 25 (25) |

The existing analytics workflow has a dashboard-only dispatch mode for deploying fresh aggregates without calling Meta or creating any analytics observations/history. Its collector step is explicitly skipped in that mode. Both cron expressions, existing scheduled modes, publisher workflows and recovery controls remain unchanged. Ordinary future analytics runs still produce the sanitized feed, and Pi retains its autonomous ten-minute authenticated pull timer.

Checks include actual-author selection, linked-rating/approver/attribution independence, all approved photo lifecycle states, withdrawn/rejected/video exclusion, nullable authors, duplicate source rows, protected configuration deduplication/failure behavior, source-ID privacy, old cache gating, national aggregation and derived arithmetic. The developer preview is explicitly labeled demo business data.