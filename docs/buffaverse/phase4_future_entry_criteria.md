# Phase 4 future-entry criteria

Phase 4's original purpose is Wing Master: a deterministic, explainable,
privacy-safe restaurant recommender with no-location and low-density fallback.
The thresholds below are minimum evidence gates, not launch targets. They are
chosen to cover repeat behavior, event exposure, geography, notification
behavior, and reward completion before personalization is trusted.

Phase 4 may enter a new discovery/authorization review only when all are true:

| Evidence | Minimum threshold | Why it is required |
|---|---:|---|
| Active-user history | 8 completed weekly snapshots and ≥1,000 active users | enough time and cohort size to separate novelty from habit |
| Completed Legendary events | ≥100 completed events across ≥30 restaurants | verifies the event loop is used beyond a few showcase venues |
| Boss Battle participation | ≥250 distinct participations across ≥25 battles | provides the next-loop context that recommendations may influence |
| Retention sample | ≥500 eligible users with day-7 and day-28 observations | tests whether recommendations support return behavior |
| Share-event sample | ≥250 user-initiated share events from ≥100 users | measures social usefulness without treating impressions as shares |
| Geographic diversity | ≥5 metro areas and ≥3 density bands, with no metro >60% of events | prevents a single market from defining the ranker |
| Notification-open sample | ≥500 delivered, attributable opens across ≥100 users | tests notification usefulness and frequency-cap behavior |
| Reward-completion sample | ≥250 eligible reward references with ≥80% terminal resolution | validates recommendation-adjacent completion and expiry semantics |
| Repeat-behavior separability | preregistered analysis shows repeat-vs-novelty classifier AUC ≥0.70, with ≥200 repeat and ≥200 novelty examples | proves data can distinguish the behavior Phase 4 is meant to personalize |

The review packet must include cohort definitions, missingness, opt-out and
location-denied slices, low-density results, fairness checks, feature-flag and
rollback evidence, and a non-AI fallback result. Counts must be deduplicated
by stable user/event identifiers and independently reproducible from the
analytics contract. Thresholds may be revised only by a recorded product,
data, privacy, and security review; they may not be silently lowered.
