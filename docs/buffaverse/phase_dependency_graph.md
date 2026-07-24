# Buffaverse phase dependency graph

```text
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 6
                         └────────────── Phase 4 (data_deferred; no edge)
```

Phase 4 is retained as an identifier and scope record, but it is not an
active prerequisite for Phase 5 or Phase 6. Re-entry requires an explicit
review and a new authorization record; no automatic sequence walker may infer
Phase 4 from completion of Phase 3.
