# Isolated BuffaGo acceptance environment

Running local project: `buffago-polish-acceptance`; API http://127.0.0.1:55321,
PostgreSQL 55322. Existing crawl containers and Mango reviewers were preserved.
No hosted project, production deployment or production write. Automatic
migration/seed replay stays disabled. Added Supabase cloud cost: $0.

## Validated baseline

Supplied DDL: baseline/provided-media-voting.sql. Alone it omits parent tables,
function bodies, RLS, permissions and Storage contracts. Read-only production
schema metadata supplied the dependency closure, without rows/secrets: 56 app
tables, 92 functions, 76 policies, 46 triggers and one enum. Original 56-table
columns/defaults/constraints/RLS and 88 function bodies passed before fixtures.
The rating-summary and three photo-job RPCs were added from actual definitions.
Post-bridge read-only audit passes 89 unchanged function bodies, 76 policies,
56 table ACLs and Storage columns. Three private voting bodies intentionally
change in the proposal.

build_schema.py regenerates schema-baseline.sql only. It includes all 92
functions and normalized policy roles. Apply only to a NEW EMPTY acceptance DB
using UTF-8 bytes and psql -v ON_ERROR_STOP=1; Windows default text piping can
corrupt Unicode partial-index predicates. platform-storage-prerequisites.sql
is local-only, applied as supabase_admin: archived_at and is_delete_marker are
already deployed production Storage columns absent in this local version.
Neither is production SQL. Never replay the migrations folder.

Do NOT rerun validate_schema.py after installing the bridge: that historical
setup validator restores original pre-bridge bodies. Use the nonmutating
scripts/qa/app-polish-staging-catalog-audit.py. Synthetic fixtures progressed
through account/media deletion and cleanup; do not reseed this advanced state.
Resume scripts skip passed receipts; refresh surviving GoTrue sessions with
app-polish-staging-refresh-auth.mjs without resetting fixtures.

## Source and routing boundary

Fresh actual Edge source capture: baseline/edge/fresh-deployed-source-capture.json.
Seven baseline functions match deployed content allowing only CRLF/LF and
added final-newline differences; exact hashes are recorded. Wingman is now v18,
externally changed since the earlier inspection: handler and all three helpers
exactly match candidate bytes. v17 remains historical rollback evidence.
Generated supabase/functions copies are ignored; source handlers are retained.

Local-only runtime routing: app-polish-runtime-routing.py overrides just native
main's SUPABASE_URL environment to http://127.0.0.1:55321. Transparent proxy
app-polish-local-api-proxy.ts forwards to real Kong8000; own Kong function
upstream uses native main8082. Native JWT gateway code is unchanged. Existing
Jury URL guards reject internal HTTP kong:8000 signed URLs; this local routing
makes them actual reachable loopback URLs. Initial gallery receipt mapped only
the internal host to the published port, preserving token; later old-Jury and
all candidate phases use native routing. No backend mocks or auth bypass.
Adapters/loaders/platform columns/baseline are EXCLUDED from production.
Restore routing after CLI watcher recreates only its acceptance container.

## Real acceptance

Evidence: artifacts/app-polish/release-qa/deployment/{staging-voting-acceptance,
staging-edge-phase-acceptance,staging-upload-acceptance,
staging-storage-cascade-acceptance,staging-cleanup-acceptance,
staging-derivative-agreement,staging-catalog-completeness,
baseline-edge-source-verification}.json. Tokens and generated local service
keys stay ignored in crawl/.expo; local-start evidence is redacted.

Real GoTrue issued synthetic user JWTs. PostgREST exercised old/new voting,
reconciliation/audit, auth/duplicates/concurrency/withdrawals/counts/cascades.
Deployed upload handlers exercised Storage signing/upload/expiry, validation,
reservation/promotion/finalization retries and SHA equality to confirmed crop.
Worker used actual manual-review mode (NOT manual-review-test or a fake model),
scoped photo-once/review-only against only the synthetic submission. Expired
lease retry succeeded on attempt2. Primary/thumbnail match framing; no live
moderation or approval. Cleanup exposed/fixed inherited JSON Content-Type on
bodyless Storage DELETE: failed receipt retained, synthetic job reopened,
original deleted, derivatives preserved and retry idle. This worker header
fix IS a proposed production source update; local adapters are not.

Wingman invalid JWT/missing-config and real atomic limiter passed. Successful
provider-backed verification/insertion and score calibration remain BLOCKED;
no dedicated test OpenAI/Places keys available and no mocked provider pass.
See release plan for remaining gates, safe connection and device instructions.

Inspect current stack: supabase status --workdir crawl/supabase/local/app-polish-acceptance.
Serve only this namespace: supabase functions serve --workdir crawl/supabase/local/app-polish-acceptance.
Physical Android can use USB adb reverse55321; native iPhone needs isolated
reachable HTTPS origin and matching signed URLs. No physical checks passed.
