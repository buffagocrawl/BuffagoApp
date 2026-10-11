# Historical migration and custom ledger decision

**DRAFT_NOT_APPROVED.** The feature-only approach is a reasonable bounded deployment lane if the owner explicitly accepts the remaining provenance uncertainty and consumer restrictions. It does not make the historical chain reproducible or authorize production writes.

The preserved [hash-bound exception draft](phase-7b3c-history-exception-draft.json) enumerates both files sharing `20260729200000`, five checksum mismatches (not line-ending-only differences), seventeen unmanifested roots, the two unchanged failing assertions, and unresolved remote/local mappings plus missing legacy baseline/runtime evidence. A fresh integrity-check log and assertion run remain red at `crawl/.expo/final-release/history-integrity.log` and `history-assertions.log` (3 passing, 2 failing). No test, root migration, manifest or historical ledger row was changed to obtain a pass.

## Independent disposition of the custom lane

Supplied B02 establishes a six-column postgres-owned ledger with version PK, nullable statements/name/created_by/idempotency_key/rollback, unique idempotency key and no extra handlers. Named-column insertion of one new version/name/original-SQL singleton array leaves the other three fields NULL; null uniqueness and original statement representation are compatible. The feature transaction locks the existing ledger, rejects a current/higher version and full ledger/schema drift, applies only hash-pinned SQL, and commits DDL plus exactly one new row atomically. Old rows are preserved, including all metadata. Failed DDL or failed ledger insertion rolls back the whole transaction.

This release never scans old SQL for application. The preserved frozen package verifier **does read root filenames for forward-version ordering**; earlier wording claiming no directory scan at all was inaccurate. It does not read historical SQL into an execution stream. No root chain push/repair/reset/replay is allowed.

The installed CLI is **2.107.0**. Its tagged primary source lives under `apps/cli-go/` and its current TypeScript migration-list wrapper delegates to that Go implementation. Retained downloaded source and hashes are under `crawl/.expo/final-release/cli-source/`, inventoried in the final package manifest. `ListRemoteMigrations` reads only versions; `ReadMigrationTable` selects version/name/statements and ignores the extra columns. An actual installed-CLI `migration list` against a disposable PG17.6 six-column ledger succeeds through TLS with a database-enforced read-only, SELECT-only role; original stored bytes and all columns remain unchanged. Evidence: `history-consumers-final.log`, `history-consumer-evidence.jsonl`, and `crawl/tests/database/phase-final-history-consumers.test.mjs`.

Tagged `migration fetch` source reconstructs files by joining statement-array elements with semicolon/newline and appending another terminator. A singleton containing the full original file is therefore not byte-identical when fetched. The offline test explicitly proves the changed SHA-256; no fetch overwrote the candidate. Future generic replay/reset/repair is unsupported by this disposition, and may encounter embedded BEGIN/COMMIT boundaries or historical ambiguities. No vendor certification, Dashboard consumer compatibility or byte-stable fetch claim is made. Sources: [CLI history](https://github.com/supabase/cli/blob/v2.107.0/apps/cli-go/pkg/migration/history.go), [version reader](https://github.com/supabase/cli/blob/v2.107.0/apps/cli-go/pkg/migration/list.go), [fetch reconstruction](https://github.com/supabase/cli/blob/v2.107.0/apps/cli-go/internal/migration/fetch/fetch.go).

## Alternatives, risks and required approval

| Choice | Benefit / risk |
| --- | --- |
| Approve exact custom one-row exception with replay/fetch restrictions | Smallest feature-only write; tested atomic application and history preservation. Provenance remains unresolved and later history consumers must honor the restrictions |
| Reconcile history before release | Can recover a canonical baseline/identity map and supported chain, but requires original remote/archive evidence and a separately reviewed operational scope; no blind checksum replacement or repair |
| Separately validate a supported isolated deployment tool | Requires proof it does not replay/mark historical versions, stores compatible statements and preserves atomicity/permissions; no tool approval inferred from a dry run |
| Apply DDL without recording history | Creates untracked drift and complicates unknown-COMMIT recovery; not recommended or authorized |

Owner must sign the exact target/migration/preflight/history-draft/adapter-core-executor hashes, accountable human/date/expiry, residual provenance and singleton-fetch/replay risk, restricted consumer policy, remediation owner/ticket and custom ledger choice. Exception approval is distinct from write, maintenance, smoke and containment approval.

Later remediation must recover original migration provenance and mappings; resolve duplicate identity without rewriting executed history; reconcile five mismatches and seventeen omissions using evidence; restore legacy baseline/harness; and define canonical export/replay semantics, keeping existing red assertions until an evidence-backed replacement contract is independently approved. Neither this mission nor a production feature deployment silently performs that work.
