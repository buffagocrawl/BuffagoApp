# Final adapter security and acceptance evidence

Date: 2026-10-10. Target policy: `vhfxnizaxdanmvmouuaf`, direct `db.vhfxnizaxdanmvmouuaf.supabase.co:5432`, database/user `postgres`. No production connection was opened. This is local engineering evidence, not production permission.

| Artifact | SHA-256 |
| --- | --- |
| Production adapter | `cddbf54051b66e84cc5bf9e8cc88ee02051e330d14afd528957071a393652118` |
| Feature executor (unchanged by final B) | `c46bd8b15db8e3fa8dd38cce5facb03ed475ced700b8a6899cf93340e50021fe` |
| Common attempt state machine | `a75b0474b9737556d300e03455a27c2765b20948c8d751232336eba81ec45b4f` |
| Frozen migration | `f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3` |
| Frozen production preflight | `66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b` |

## Reviewed execution path

`crawl/scripts/phase7b3d-production-adapter.mjs` remains the only production entry, `runApproved`. It accepts no injected connection, test selector, host override, arbitrary SQL or fallback. `phase-final-adapter-attempt.mjs` holds its common state machine; the separate native fixture supplies loopback-only transport for tests. Changing fixture environment selectors cannot change `runApproved` routing or strict fingerprint policy.

The signed approval binds the exact target, action, frozen hashes/version, adapter/executor/common-state-machine hashes, historical exception, singleton-ledger disposition, behavior acceptance, actor, incident owner **and backup**, maintenance/DDL-role freeze/smoke evidence, pre/post snapshot digests, CA/executable hashes, protected-file attestation, dates and deadline. Trusted keys must be **Ed25519 public keys**. RSA keys and private keys are rejected. Signed payload bytes are verified directly; a generated local test key does not establish human trust.

Transport uses absolute canonical pinned PostgreSQL17.6 psql, `-X`, no shell, a minimal environment, `verify-full`, explicit CA, required SCRAM, disabled GSS encryption and minimum TLS1.2. Ambient PG overrides and any additional config keys fail before transport. Same-session proof requires authenticated `session_user=current_user=postgres`, nonsuper/BYPASSRLS, PG17.6, READ COMMITTED and verified SSL. No SET ROLE is sent. Application, inspection and confirmation retain 5-second lock/60-second statement bounds; the signed whole-attempt bound is at most15minutes.

Credentials and production evidence must be outside the repository. Path containment uses complete `..` path components; a directory named `..secret` inside the repository is refused. Existing credential/CA/executable paths must equal canonical realpaths. Evidence parent must be canonical, refusing symlink/junction redirection. A new exclusive evidence file is fsynced before migration SQL can be sent. Protected OS ACLs and binary dependencies remain operator-provisioned prerequisites.

The kernel locks the existing six-column ledger, rating/media relations, repeats full approved catalog/ledger drift checks and strict frozen production fingerprints, executes the exact feature, verifies effective ACL/RLS/function permissions, and inserts exactly one original-SQL ledger row before COMMIT. History is untouched. The frozen package verifier reads historical **filenames only** to check version ordering; there is no historical SQL read/replay/application.

COMMIT acknowledgment is insufficient: an independent verified read-only backend confirms the approved post snapshot and exact singleton SQL/six-column row in one common MVCC snapshot. Any uncertain connection/evidence outcome stops without replay. Recovery requires a separate signed `recover` decision. Only approved pre/post states classify rollback/commit; mixed/drifted evidence stops for review.

## Defects corrected

- A psql `\echo` marker could acknowledge an unterminated SQL buffer before execution. Each command is now explicitly terminated before framing; tests execute real queries without caller semicolons.
- Marker validation/extraction could consume a marker substring embedded in an earlier output line. Matching now requires a complete marker line and extracts that exact occurrence.
- Transport errors now remain terminal; output is bounded to16MiB and the child locale is fixed for SQLSTATE parsing.
- Audit failure could mask the original SQLSTATE/unknown outcome. Error objects preserve step, write-started/acknowledged state, primary cause and secondary evidence/cleanup failures; transport cleanup runs before evidence cleanup.
- Inspection/post-COMMIT statements previously lacked server timeouts. Both are explicitly bounded.
- Approval interval checks, distinct approved snapshots, named backup and Ed25519 public-key enforcement are explicit.
- Prefix-based external-path checking accepted `..secret` directories inside the repository; complete-component and canonical-parent checks close this.

## Local evidence and limitations

Native fixture uses retained unique PG17.6 clusters on randomly chosen `127.0.0.1` ports; it installs no service and contacts no production endpoint. The final adapter fixture bootstraps an unrelated `fixture_bootstrap` role, creates postgres separately, then demotes postgres before real TLS/SCRAM authentication. PG17 refuses demotion of its bootstrap superuser; this fixture arrangement reproduces the production role without role substitution. Local certificates/credentials are explicitly synthetic.

The full common execution path uses actual verified TLS/SCRAM, nonsuper postgres, production-shaped owners/permissions, broad defaults, frozen feature SQL, six-column ledger and real independent confirmation. Its prerequisite dependencies remain screened-body matches plus clearly labeled reduced/synthetic definitions. Production endpoint policy/approval validation are tested separately. The production entry never omits strict fingerprints. A separate real test runs the exact frozen preflight and verifies that it refuses unmatched prerequisite bodies before writes.

Representative additional scale fixture:100,000ratings,50,001media/Storage rows and25,000historical ledger rows. Snapshot1561ms, exact feature application2226ms, candidate index2,981,888bytes. All historical metadata remains unchanged. Existing-ledger EXCLUSIVE locking blocks another backend's history mutation until rollback. Full metrics are `crawl/.expo/final-B-scale-metrics.json`;2/2 tests pass in `final-B-scale-final.log`. These measurements do not establish production workload capacity.

Adapter policy/protocol/real-ledger/TLS suite:12/12 PASS in `crawl/.expo/final-B-adapter-verified.log`; the reviewed Ed25519/cleanup changes also pass the focused10/10 suite in `final-B-adapter-unit-reviewed.log`. Common orchestration8/8 PASS in `final-B-e2e-3.log`; expanded9-case acceptance and targeted actual recovery/permission evidence are recorded in the final closeout below. All earlier failures and retained fixtures remain available.

## External prerequisites: exact actionable request

1. Provision and independently review the real target's Dashboard CA certificate; record fingerprint, validity, issuer/chain and trusted download provenance. The official [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) specifies Dashboard certificate download plus explicit verify-full/root-certificate configuration. Local self-signed test roots are not production anchors.
2. Provision a trusted human approval key/public-key fingerprint and protected executable distribution (psql **and loaded libpq/OpenSSL/runtime dependencies**), credential provider and external durable evidence directory. Record OS ACL review and evidence attachment hash. No generated fixture key/certificate/credential is reusable as production approval.
3. Obtain separately authorized exact-route READ-ONLY identity/TLS inspection and screened actual prerequisite/event-handler behavior parity. No proxy, localhost mapping, alternate host or pooler substitutes for the approved production endpoint.
4. Supply independently reviewed approved pre/post catalog digests, history/custom-ledger decision, accepted maintenance/DDL-role freeze, named owner/backup, smoke budget and recovery scope. The fixture pre/post digests are established **before** the attempted deployment and never adopted from a production recovery response.

The production adapter is implemented and locally exercised. It is not operationally provisioned or authorized for production until these external prerequisites close. Strict full production parity and live certificate/route proof are not claimed.
