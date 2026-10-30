# State-goal proposal — review only

Baseline observed 2026-10-29 20:05 EDT, from read-only production aggregates. No user-established state targets, priority order, or trusted population denominator were found in installed Pi configuration, the repository's goal/coverage documentation, or the inspected state schema. Every target below is newly proposed and remains inactive.

| Proposed priority | Rationale | Metric / exact unit | Current baseline | Proposed target | Gap | Suggested deadline |
|---|---|---|---:|---:|---:|---|
| 1. Connecticut | Anchor the market with the strongest observed rating/photo contribution base; deepen an existing usable catalog before expanding. | Restaurant coverage / restaurants | 228 | 250 | 22 | 2026-12-31 ET |
| Connecticut | Build repeat participation in that anchor market. | Ratings / contribution records | 325 | 425 | 100 | 2026-12-31 ET |
| Connecticut | Improve the approved contribution base. | Photos / approved lifecycle photo-contribution records, not withdrawn | 58 | 83 | 25 | 2026-12-31 ET |
| 2. New York | Neighboring expansion with Buffalo's relevance to the product category; a focused hypothesis, not a measured demand claim. | Restaurant coverage / restaurants | 67 | 100 | 33 | 2026-12-31 ET |
| New York | Test participation alongside catalog expansion. | Ratings / contribution records | 23 | 53 | 30 | 2026-12-31 ET |
| New York | Supply more approved contributions. | Photos / approved lifecycle photo-contribution records, not withdrawn | 20 | 30 | 10 | 2026-12-31 ET |
| 3. Massachusetts | A neighboring, geographically coherent pilot with an existing contribution base; not selected simply by restaurant count. | Restaurant coverage / restaurants | 40 | 60 | 20 | 2026-12-31 ET |
| Massachusetts | Test activity before broader acquisition effort. | Ratings / contribution records | 39 | 69 | 30 | 2026-12-31 ET |
| Massachusetts | Improve contribution coverage. | Photos / approved lifecycle photo-contribution records, not withdrawn | 11 | 21 | 10 | 2026-12-31 ET |

The restaurant unit is a catalog count, **not restaurants per million residents**. No population source/year is used because these proposals do not use density. A later density target requires an explicit population source/year, a matching current density measurement and separate approval. No density target has been reinterpreted as a count.

Sources: `public.states`; `public.destinations.state_id`; ratings joined through `destination_ratings.destination_id`; photo contributions joined through `wing_media_submissions.destination_id`, media_type photo, withdrawn_at null and the deployed approved lifecycle states (approved, generation_pending, ready_to_post, scheduled, posting, posted). Counts include existing contribution records; they are not unique contributors or unique restaurants with photos. No app/source records were changed.

Pi-owned future configuration: `data/state-goals.json`, initially copied from `data/state-goals.example.json` only when absent. The root approval flag, approved_at/by and each target's approved status must be explicit before activation; units must match. The dashboard can show review candidates but leaves targets Not set and draws no progress bars until approved. All 50 states remain available in details. These proposed priorities are a recommendation for the user's review, not an activated goal program.
