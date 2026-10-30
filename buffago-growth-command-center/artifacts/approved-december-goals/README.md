# Approved December 31, 2026 total goals

Explicit owner approval received October 30, 2026. `data/state-goals.approved-20261231.json` records these approved total targets and their deadline; deployment merges them into Pi's existing cache-adjacent `data/state-goals.json`, preserving other local configuration and backing up the previous file. The earlier proposal file remains separate and inactive.

| Geography | Restaurants | Rating records | Approved photo contributions |
|---|---:|---:|---:|
| Nation | 1400 | 800 | 250 |
| Connecticut | 250 | 450 | 90 |
| Ohio | 150 | 50 | 25 |
| New York | 100 | 60 | 35 |
| Massachusetts | 65 | 80 | 25 |

The wall retains exactly this geographic order. Nation counts all 50 states and includes the featured states. Each entity is counted through the existing independent aggregates; state rows are disjoint, and any existing national row is discarded before national aggregation. A missing/duplicate state or unavailable metric yields unavailable national progress, not a partial total.

Each cell shows current / approved total and the existing goal calculation: completion=min(1,current/target), remaining=max(0,target-current). Completion is capped at 100%, with no negative gap. Unknown currents remain unavailable. The read-only cloud feed is unchanged; each refresh re-applies Pi-owned approvals to live counts, including the dashboard-derived Nation. Root approval metadata, per-metric approved status and matching units remain required.

Restaurants are destination records by state. Ratings are contribution records, not unique people. Approved photos are lifecycle photo-contribution records, not withdrawn, in approved, generation_pending, ready_to_post, scheduled, posting or posted status. No unit definition or source predicate changes.

The 1920x1080 developer preview is `preview-1920x1080.png`; its business data is explicitly demo. Focused tests cover exact approved values/order/deadlines, total-vs-additional arithmetic, repeated application without double-counting, live count changes, missing/duplicate states, missing currents, approval/unit guards, zero remaining at or above target, and rendered bounds. All 131 Python dashboard tests passed locally.

Only dashboard-owned configuration/model presentation and preview/tests are changed. No production app data, schema, function, photo, vote, status, analytics history, social publication schedule or recovery trigger changes are included. No social post is triggered.