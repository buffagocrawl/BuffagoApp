# December 31, 2026 targets - proposal only

Read-only production baselines observed October 30, 2026 at 08:09 EDT. Each cell below is **baseline -> proposed total**. No target has been approved or activated.

| Geography | Restaurants | Rating records | Approved photo contributions |
|---|---:|---:|---:|
| Nation (all 50 states) | 1,120 -> 1,300 | 472 -> 700 | 145 -> 230 |
| Connecticut | 228 -> 250 | 326 -> 425 | 58 -> 83 |
| Ohio | 103 -> 125 | 7 -> 40 | 5 -> 20 |
| New York | 68 -> 100 | 24 -> 53 | 20 -> 30 |
| Massachusetts | 40 -> 60 | 39 -> 69 | 11 -> 21 |

Connecticut deepens the contribution anchor. Ohio prioritizes participation in its existing catalog. New York and Massachusetts remain contained expansion pilots. National targets include these states; they are not added to them. The four states account for proposed increases of 96 restaurants, 191 ratings and 57 photos; the national proposal leaves increases of 84, 37 and 28 respectively across the other 46 states. These are planning recommendations, not a forecast from measured acquisition rates.

Restaurants count destination records by state. Ratings count contribution records joined to their destination, not unique people. Photos count photo-contribution records with withdrawn_at null and lifecycle status approved, generation_pending, ready_to_post, scheduled, posting or posted. They are not unique restaurants or contributors. No population denominator is used.

The national baseline independently matched a direct read-only database count using separate queries per entity (no ratings/photos join fan-out). Each destination belongs to one state; the wall sums exactly one aggregate per each of the 50 state codes. A missing/duplicate state or unavailable metric produces an unavailable national metric, never a partial total. A pre-existing national row is ignored rather than summed again.

Inactive configuration: `data/state-goals.proposed-20261231.json`. It has approved=false, no approval metadata, and every target has status=proposed. It is a separate proposal file, not the Pi-owned active configuration path. The prior Pi configuration and proposals are preserved. The wall displays all targets as Not set and calculates no progress toward these proposals.
