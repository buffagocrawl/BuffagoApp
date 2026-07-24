# Buffaverse run template

- Run ID:
- Parent run:
- Phase identifier: `0 | 1 | 2 | 3 | 5 | 6` (Phase 4 requires explicit re-entry review)
- Phase status: `active | approved | data_deferred | rejected`
- Dependency identifiers:
- Scope hash:
- Production flags: disabled until release authorization
- Evidence packet:
- Authorization text:
- Migration provenance:
- Rollback boundary:

Do not infer phase identity from ordering. A Phase 3 completion record must
authorize Phase 5 and must explicitly state that Phase 4 remains data-deferred.
