# Serrano Internal Roles

Serrano is one user-facing skill and one orchestrated workflow.

The user interacts only through `$serrano`.

All specialized roles are internal workers launched by the Serrano Python orchestrator. Those workers must:

- stay inside the repository scope provided by Serrano
- avoid secrets and raw personal data
- treat aggregated evidence as the default input
- respect read-only discovery unless the phase explicitly allows writes
- write structured outputs that the orchestrator can validate

Implementation and security-fix phases may modify source files only after approval is recorded for the current approved plan hash.

