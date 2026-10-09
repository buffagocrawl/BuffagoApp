# Historical consolidation harness copies

Preserved byte-for-byte during artifact cleanup on 2026-10-09. These are historical source, not generated QA outputs. Current focused harnesses remain `scripts/qa/native-consolidation-flows.mjs` and `scripts/native-wingdex-gallery-qa.mjs`; the current matrix remains `scripts/native-v2-closure.mjs`.

The three copies retain their original output paths and behavior for recovery/reference. They are not acceptance evidence and should not be run merely to recreate deleted screenshots. They recreate output directories when needed. Fixture security and release guards still apply.

Native fixture launchers were preserved under `scripts/qa/metro-native-fixture.ps1` and `scripts/qa/metro-image-fault-fixture.ps1`. Launch them hidden only when an authorized focused QA task requires them; cleanup did not restart or stop Metro.
