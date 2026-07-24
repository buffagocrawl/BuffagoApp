# Serrano decision ledger

Current-cycle Serrano discovery was attempted with `.agents/skills/serrano/scripts/run_serrano.py discover` using the repository's configured Python environment. It timed out after 120 seconds with exit code 124 and produced no current run ID or approval artifact. Per Serrano instructions, no approval, build, security, or release command was run.

| Recommendation | Discovery panel | PM synthesis | CEO | CFO | CAIO | Final PM decision | Acceptance / validation | Status |
|---|---|---|---|---|---|---|---|---|
| Repair referral deep-link attribution | Code evidence showed storage/schema mismatch | Small centralized-service fix | Needs evidence | Low effort; avoids attribution loss | Add route regression test | Approve with changes | Route uses recognizer; tests pass | Implemented/validated locally |
| Reconcile migration manifest | Integrity gate failed on concrete hashes/files | Update docs/test only; do not deploy DB | Needs evidence | Low cost; prevents unsafe deploy | Require checksum gate | Approve with changes | Integrity command passes | Implemented/validated locally |
| Release current candidate | Discovery incomplete; device/live evidence absent | Separate code pass from release decision | Block | Block until migration ledger/cost risk checked | Block until evidence pipeline completes | Release blocker / needs more evidence | Real devices, live Supabase, Serrano run | Blocked |

Approval, implementation, deployment, validation, and archive states remain separate. There is no current approved Serrano plan.
