# Buffaverse authoritative implementation roadmap

The active implementation sequence is intentionally noncontiguous:

`0 → 1 → 2 → 3 → 5 → 6`

| Phase | Name | Status | Authorization rule |
|---:|---|---|---|
| 0 | Architecture and product foundation | foundation | prerequisite for Phase 1 |
| 1 | Buffaverse event-engine foundation | approved baseline | prerequisite for Phase 2 |
| 2 | Legendary Restaurants | approval reconciliation | approval authorizes Phase 3 |
| 3 | Restaurant Boss Battles | gated development | approval authorizes Phase 5 |
| 4 | Wing Master | `data_deferred` | cannot be automatically authorized |
| 5 | Existing approved Phase 5 scope | preserved identifier | follows Phase 3 while Phase 4 is deferred |
| 6 | Existing approved Phase 6 scope | preserved identifier | retains existing prerequisites, excluding Phase 4 |

## Phase 4 status

`PHASE 4 DEFERRED — INSUFFICIENT REAL-WORLD USAGE DATA`

Phase 4 is the personalized Wing Master recommendation/ranking scope. It is
deferred until production data can distinguish useful repeat behavior from
novelty, sparse-location artifacts, and one-off exploration. Phases 5 and 6
are not renumbered.

After Phase 3 approval the authorization text is:

`PHASE 5 AUTHORIZED FOR DEVELOPMENT — PHASE 4 REMAINS DATA-DEFERRED`

Phase 4 may be reconsidered only through a new evidence-backed authorization
review using `phase4_future_entry_criteria.md`.
