# Buffaverse phase authorization logic

```js
const activeSequence = [0, 1, 2, 3, 5, 6];
const phase4 = { id: 4, status: 'data_deferred', autoAuthorize: false };

function nextAuthorizedPhase(completedPhase) {
  if (completedPhase === 3) return {
    phase: 5,
    text: 'PHASE 5 AUTHORIZED FOR DEVELOPMENT — PHASE 4 REMAINS DATA-DEFERRED',
  };
  return activeSequence[activeSequence.indexOf(completedPhase) + 1] ?? null;
}
```

Any implementation of this rule must preserve phase identifiers and reject
automatic authorization of Phase 4. Phase 4 can only be activated by a
separate evidence-backed authorization record satisfying the future-entry
criteria.
