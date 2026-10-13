# Mango approval diagnosis — 2026-10-12

Confirmed cause: valid Buffacoin Wing Shots enter the standard moderation flow,
but the unconditional creator-reward transition trigger invokes an XP function
that requires `destination_ratings.is_buffacoin = false`. Its
`creator_reward_rating_ineligible` exception aborts the entire moderation RPC.
Media preparation is a separate transaction and remains available for reuse.

## Production evidence (read-only)

Project: `vhfxnizaxdanmvmouuaf`, matching Mango's configured Supabase URL.

| Submission | Restaurant | Current state | Rating | Approval audit receipts |
| --- | --- | --- | --- | --- |
| ec8de9bf-5313-4daa-a1bf-a016fc733c1c | Adolf's Old First Ward Tavern | in_review | Buffacoin | 0 |
| f9838c1e-736a-4efa-bf83-c37f3b273318 | Fire Mission Smokehouse & Taproom | in_review | Buffacoin | 0 |
| c0f9a948-05c8-4a8b-9272-8a4768b92bc3 | J Timothy's Tavern | approved | ordinary | 1 |

Both affected submissions have null `approved_at` and `reviewed_at`, matching
rating owner/destination, `manual_review` moderation and `uncertain` wing
verification. Each dedicated derivative job succeeded on attempt 1 with no
error or lease remaining. Their original, processed and thumbnail objects
exist; all have image/jpeg metadata and positive sizes. Paths are canonical.
`wing_photo_processing_blocker` returns null for each. This independently
verifies the readiness metadata; original/derivative bytes were not downloaded.

Adolf derivative sizes: 326959 / 47889 bytes (primary / thumbnail).
Fire Mission derivative sizes: 314394 / 42253 bytes.
J Timothy's derivatives also succeeded without legacy processing jobs, followed
by approval at 2026-10-12 16:54:04.667677 UTC.

Between 16:45 and 19:10 UTC, edge logs contain nine HTTP 400 moderation requests
and one HTTP 200. Each HTTP 400 has a corresponding PostgreSQL
`creator_reward_rating_ineligible` message. In particular, the request at
18:51:14.779 UTC failed with that database message at 18:51:14.964 UTC, immediately
before the supplied list event at 18:51:15.975 UTC. Logs do not expose request
bodies, so individual historical attempts cannot be attributed to a submission
solely from these log entries. The two named rows independently match the exact
failing predicate. Over the three-day inspection window, 11 Buffacoin submissions
remain in_review (4 prepared), while 19 ordinary submissions are approved
(all prepared), and one ordinary submission is failed after earlier approval.

Configured credentials passed an actual read-only REST lookup: service_role,
HTTP 200, active wing_admin reviewer. No key, token, or user record was printed.
Moderation and blocker RPC EXECUTE ACLs allow only postgres/service_role.
Relevant tables have RLS enabled, service_role SELECT privileges and BYPASSRLS;
they have no applicable client policies. Storage policies do not make the private
wing-submissions bucket publicly readable. Inspected approval shape checks,
foreign keys, status constraints, photo approval guard, priority trigger,
owner trigger, reward trigger, and notification trigger.

Deployed `mango_review_wing_submission`, `wing_transition_submission`, and
`wing_creator_reward_on_transition` bodies match the repository's
20260730233913 migration after whitespace normalization. The reward function's
deployed ordinary-rating predicate matches the 20260729122000 migration at
lines 517–525. Its reward display wording has changed to XP, which does not
change this predicate. Older July creator/Mango/lifecycle migration versions
are absent from migration history even though their definitions are deployed;
do not blindly replay those migrations to repair history. No relevant response
shape drift was found: moderation returns a JSON object with `status`.

## Flow and precise error conditions

1. `src/main.jsx` sends a relative `/api/submissions/<id>/review` POST, holds a
   synchronous action lock, disables card actions and polls progress. Vite's
   proxy preserves Host; `server/approval.mjs` enforces localhost and matching
   Origin. The review route in `server/index.mjs` returns 409 on service failure.
2. The service validates ID/reason/note, locks the selected submission before
   asynchronous work, computes a deterministic idempotency key, checks reviewer
   authorization, reads current state and reconciles an existing exact receipt.
3. For photos it checks blockers, dedicated/legacy jobs, canonical paths,
   storage JPEG metadata and positive sizes. A ready photo skips the worker.
   Otherwise the selected-only, review-only worker runs with manual-review
   mode, then authorization, row state and readiness are checked again.
4. Jalapeno's CLI uses `PhotoDerivativeRepository`: claim/begin validates the
   selected job/lease, existing derivatives are byte-compared against the fresh
   transform and reused, missing objects are inserted, and success settles the
   dedicated job. Existing objects are never overwritten. Mango discards raw
   child output, limits execution to 120 seconds and verifies database/storage
   readiness even after a worker error. Active leases/retry delays block work.
5. Moderation has a 20-second request timeout. The deployed RPC checks role,
   locks the row, verifies in_review/original/safety, calls the state-transition
   function, updates review fields and writes decision/admin receipts. The
   transition updates status and inserts a transition row. Its AFTER INSERT
   reward trigger raises for Buffacoin, rolling all moderation writes back.
6. A returned database error, thrown transport/timeout error, or unexpected
   `data.status` enters reconciliation. Mango checks authorization, current row
   and an exact audit receipt. Matching completed decisions return success.
   Successful RPC responses are accepted directly; no separate confirmation
   read is performed in that case. The UI then reloads the list.

The original quoted generic approval error requires failed/ambiguous RPC or
unexpected response, successful fallback verification, current status
in_review, no matching completion receipt, and (for a photo) readiness still
true. Preparation failure, active leases, authorization failure, unavailable
confirmation, changed readiness and changed status have different messages.
Thus the wording alone never proves preparation succeeded. The list event only
shows the UI's refresh after failure; approval bypassed the old shared RPC logger.

Production logs confirm a failing RPC, rather than successful approval with
failed confirmation, for this incident. Timeouts, concurrent requests, stale
UI state, lease expiry and credential/RLS errors do not explain the matched
400/database-error sequence. An already-approved row cannot be moderated again
through this service; retries require current-state/receipt verification first.

## Local change and verification

Branch: `fix/mango-approval-diagnostics`, based on inspected main. No applicable
AGENTS.md exists at repository root, ancestor directories, Agents root or Mango;
the tracked Chipotle/Serrano AGENTS.md files govern other agent directories.
The pre-existing crawl/app.config.js version edit is preserved.

The service now logs submission ID, stage, HTTP status, database error code and
allowlisted contract error details. Arbitrary messages/details, URLs, tokens,
credentials, review text and user records are excluded. Verification failure,
worker stage, RPC failure, response-shape mismatch and reconciliation are
distinguishable. A demonstrated reward failure with a still-pending row now
explains the database rollback and required operator fix. It still rechecks
readiness before reporting derivative reuse. No automatic production retries.

56 tests passed across 5 files. Regression coverage includes reward RPC failure,
derivative reuse/stable key, unexpected successful response shape, and successful
approval followed by unavailable confirmation, then retry without another
moderation effect. Mango build, lint and git diff --check passed. Existing origin,
worker, role, readiness, duplicate-click and UI tests remain passing.

## Production proposal — review required, not applied

`buffacoin-approval.proposal.sql` changes only two function bodies. For a
Buffacoin rating with matching submission owner and destination, the transition
trigger skips both approval and featured creator XP. It retains ordinary XP,
reversal behavior, moderation authorization/guards and reward idempotency.
The notification function stops claiming that a Buffacoin approval earned XP.
CREATE OR REPLACE preserves existing function signatures, ownership and ACLs.
This preserves the current XP exclusion; a product decision to award Buffacoin
creator XP instead would require a different economy proposal.

Validation before any authorized application:

- Export fresh pg_get_functiondef/ACL snapshots of both changed functions and
  compare with the captured rollback file; stop if either has changed.
- Confirm the affected rows are still pending, derivative objects/jobs remain
  ready, and the rating owner/destination match. Do not invoke moderation as a
  read-only validation step.
- Run `reward-trigger.fixture.sql` against a new isolated PostgreSQL 17 database.
  It requires the proposal and rollback files at `/tmp/` and uses stub XP/badge
  integrations plus the captured deployed reward/trigger/notification functions.
  It reproduces the original exception and atomic rollback, validates Buffacoin
  approval/feature without XP, ordinary approval with XP, repeat-approval behavior
  and notification wording, then restores captured definitions. It passed on
  PostgreSQL 17.6 in a container with `--network none`, no production credentials,
  no exposed ports. The test container was removed afterward.
- Review/apply the proposal only in a separate authorized database-change task.
  It contains no photo approvals or data backfill. Recheck function definitions,
  unchanged ACLs and enabled triggers afterward with catalog SELECT queries.
- A user-initiated approval after that change should leave exactly one approval
  transition/decision/admin receipt and zero Buffacoin creator XP events; ordinary
  approvals should retain their existing reward behavior. Publishing is a
  separate action and was not exercised against production.

Example isolated reproduction (PowerShell, disposable container):

```powershell
docker run --detach --name mango-approval-diagnosis --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17.6
docker cp reward-trigger.fixture.sql mango-approval-diagnosis:/tmp/reward-trigger.fixture.sql
docker cp buffacoin-approval.proposal.sql mango-approval-diagnosis:/tmp/buffacoin-approval.proposal.sql
docker cp buffacoin-approval.rollback.sql mango-approval-diagnosis:/tmp/buffacoin-approval.rollback.sql
# Wait until pg_isready succeeds before the fixture command.
docker exec mango-approval-diagnosis pg_isready -U postgres
docker exec mango-approval-diagnosis psql -U postgres -f /tmp/reward-trigger.fixture.sql
docker stop mango-approval-diagnosis
docker rm mango-approval-diagnosis
```

Rollback: apply `buffacoin-approval.rollback.sql` only in an authorized change
task, after verifying no intervening definition changes. It restores captured
function bodies transactionally. It does not undo approvals, notifications or
ledger history. Returning to the old trigger makes subsequent Buffacoin approval
and featuring fail again. If no COMMIT occurred, roll back that transaction instead.

## Restart and retry

1. Close both existing Mango API and Vite terminal windows.
2. From the repository, run `Agents/Mango Habanero/Start Mango Habanero.bat`.
3. Wait for startup_succeeded and open http://127.0.0.1:4317; refresh the queue.
4. These Buffacoin approvals require the separately reviewed database fix first;
   a local restart alone cannot repair them. After the authorized database fix,
   refresh, review the original and click Approve once. Verified derivatives
   are reused; no worker reset, object deletion or re-upload is needed.
5. If another failure occurs, capture the new review_rpc_failed and confirmation
   events (submission_id, stage, HTTP status and safe database error code/detail).
   Do not share .env or signed preview URLs. No further evidence is needed to
   establish this cause; request bodies would be needed only to map every
   historical attempt to its submission.

No production approval/rejection, worker, storage mutation, migration or deploy
was performed. No commit or push was made. The running processes' in-memory
version was not independently attested; restarting is required to load logging.
