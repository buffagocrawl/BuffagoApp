# Delete-account RPC permission hotfix — NOT YET DEPLOYED

Security hotfix **PASS for the ACL mitigation**. Production remains unchanged. This correction can be deployed independently of Wing Jury and does not resolve or alter the separate account-deletion/upload race.

## Vulnerability and root cause

Operator-confirmed production project `vhfxnizaxdanmvmouuaf` exposes `public.delete_account_data(uuid)` as SECURITY DEFINER, owned by postgres with BYPASSRLS. It accepts a user ID without caller ownership validation. anon and authenticated have effective EXECUTE, allowing untrusted callers to invoke privileged deletion for another account. service_role also has EXECUTE. Supplied source MD5: `4f108f4b39ec1d613fd5b1ba6be97c82`. This session accepted the supplied production evidence; it did not connect to production or exploit the vulnerability.

## Exact artifact

SQL: [security-hotfix-delete-account-rpc.sql](security-hotfix-delete-account-rpc.sql).

Repository path: `docs/security-hotfix-delete-account-rpc.sql`

SHA-256: `d12bdf0270300bbd828464f4b626cd3a783abfcfb24aa214f01df011ef61326c`

One transaction revokes EXECUTE from PUBLIC, anon and authenticated and grants EXECUTE to service_role on this exact signature. It changes no function body, owner, signature, configuration, security mode, existing table, unrelated function, role membership or default privilege. Before COMMIT it validates effective permissions, rejects reachable SET ROLE executors (including NOINHERIT paths), and compares the entire pg_proc record except proacl. Source MD5/owner/BYPASSRLS/SECURITY DEFINER drift causes refusal before changes. Any verification error aborts the transaction and rolls back ACL changes; it is not a successful partial mitigation. Concurrent function/role grant changes must be frozen during application and postflight. Five-second lock and 60-second statement limits apply.

## Compatibility and tests

The reported deployed delete-account v15 uses service-role credentials for `delete_account_data({p_user_id: userId})`, then Auth deletion. Preserving that role's EXECUTE and all non-ACL function metadata preserves this permission boundary and RPC argument contract. No Edge deployment is needed. Full v15 source and actual RPC body are not local, so this is **permission compatibility**, not a new end-to-end Storage/Auth or v15 runtime parity claim. Existing upload-race and cleanup risks remain tracked in [separate release blockers](buffago-final-engineering-blockers.md).

Local dependency search across app/lib/components/hooks/providers found the deletion UI in `crawl/app/user/index.jsx` calling `/functions/v1/delete-account` with the signed-in bearer token. No direct client-side `delete_account_data` dependency was found. Untrusted direct RPC callers will intentionally receive permission denial. Any unknown external caller must use an authenticated authorized service boundary; never restore public execution to accommodate it.

- Disposable PostgreSQL **17.6: 8 tests pass, zero fail/skip** in `crawl/tests/database/delete-account-rpc-hotfix.test.mjs`.
- Actual anon SQL invocation denied; actual authenticated SQL invocation denied.
- service_role named-argument invocation succeeds; applying twice produces identical ACL.
- Inherited executor grant and NOINHERIT/SET ROLE executor path each cause explicit failure and full ACL rollback.
- Source drift is rejected before mutation; every non-ACL target metadata field is unchanged.
- Complete unrelated pg_proc rows, public pg_class rows/ACLs and pg_default_acl snapshots are identical before/after, including explicit rating/Crawl/Buffacoin/photo/account fixture objects.
- Local application account-boundary regressions: **30/30 pass**, zero failures/skips (`tests/client-account-privacy.test.mjs`).
- Scoped ESLint for the new database test exits zero with no warnings. `git diff --check` passes. Frozen Wing Jury migration/preflight hashes remain the previously approved bytes.

The production body is unavailable: the database fixture is an explicitly **synthetic inert UUID-returning SECURITY DEFINER body**. The test substitutes only the expected MD5 in an in-memory copy to exercise ACL operations; the deployable file always enforces the supplied production MD5. Executing the unchanged deployable file against that fixture is separately tested to fail. No deletion of real users or production data occurred. The completed 409 suite and historical investigations were not reopened.

Reproduce from repository root in PowerShell:

```powershell
$env:BUFFAGO_PHASE7B3D_NATIVE17='1'
node --test crawl/tests/database/delete-account-rpc-hotfix.test.mjs
```

Application check from `crawl/`: `node --test tests/client-account-privacy.test.mjs`.

## Production read-only verification queries

After separately authorized execution by the operator, run these without invoking the function or deleting users. Expected: MD5 as above, owner postgres, security_definer=true, bypassrls=true; anon/authenticated false, service_role true; no reachable-executor rows and no PUBLIC EXECUTE ACL entry.

```sql
BEGIN READ ONLY;
SELECT current_database(), session_user, current_user, version();
SELECT p.oid::regprocedure AS signature, md5(p.prosrc) AS source_md5,
       r.rolname AS owner, r.rolbypassrls, p.prosecdef, p.proconfig, p.proacl
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
WHERE p.oid='public.delete_account_data(uuid)'::regprocedure;
SELECT role_name,
       pg_catalog.has_function_privilege(role_name,
         'public.delete_account_data(uuid)', 'EXECUTE') AS can_execute
FROM (VALUES ('anon'),('authenticated'),('service_role')) AS roles(role_name);
SELECT untrusted.rolname AS untrusted_role, executor.rolname AS reachable_executor
FROM pg_catalog.pg_roles untrusted CROSS JOIN pg_catalog.pg_roles executor
WHERE untrusted.rolname IN ('anon','authenticated')
  AND pg_catalog.pg_has_role(untrusted.oid,executor.oid,'SET')
  AND pg_catalog.has_function_privilege(executor.oid,
    'public.delete_account_data(uuid)'::regprocedure,'EXECUTE');
ROLLBACK;
```

Store a pre/post metadata and ACL comparison; only target proacl may differ. A production RPC denial smoke is unnecessary because the exact PostgreSQL permission checks are read-only and local denial tests already invoke the function. Do not attempt to exploit the vulnerable endpoint in production.

## ChatGPT independent review and authorized deployment

1. Review this document, exact SQL and tests; independently hash the file and confirm the SHA-256 above. Confirm frozen Wing Jury hashes unchanged. This is a standalone SQL operation, not a migration-history repair or deployment-adapter expansion.
2. Obtain explicit user authorization for this **ACL-only** production correction. Confirm the dashboard/verified TLS connection belongs to project `vhfxnizaxdanmvmouuaf` and database postgres; database SQL alone does not identify the Supabase project. Use the authorized trusted postgres administrative session, preserve evidence and freeze concurrent target-function grants/definitions and API-role membership changes.
3. Record the read-only pre-state without invoking deletion. If source/owner/security drift is found, stop for review. Capture unrelated ACL/default-privilege baseline if needed for independent comparison.
4. Execute the entire exact SQL file as one transaction, using an error-stopping client (`psql -X --set=ON_ERROR_STOP=1 --file=<verified-file>` or equivalent whole-script execution). Do not split or omit its verification block. Do not invoke broad migration push/repair or modify any ledger. On verification failure, close/ROLLBACK the failed transaction; inspect the reported grant path without weakening the check or changing unrelated memberships automatically.
5. Confirm COMMIT acknowledgement, run the read-only postflight above, compare non-ACL metadata and retain evidence. If COMMIT acknowledgement is lost, inspect permissions/metadata read-only before deciding whether to reapply the identical idempotent file. No Edge/feature-flag changes are required.

## Recovery and remaining risk

Do **not** roll back by granting EXECUTE to PUBLIC/anon/authenticated: that restores the vulnerability. Failure before COMMIT leaves the original state and requires urgent authorized follow-up; the rollback test proves atomicity, not that the original vulnerable state is safe. If an inherited executor blocks the hotfix, prepare a separately reviewed correction of that exact access path. If service-role deletion unexpectedly fails, keep the restricted boundary, inspect actual role/credentials and RPC error, and use a reviewed forward correction rather than public grants. No table/schema or migration rollback is needed.

This hotfix does not cancel already-running deletion calls, establish a Storage/upload fence, revoke issued JWT/upload capabilities, or alter Auth cleanup. Those are separate concerns. Exposure remains live until the owner authorizes and an operator confirms application. Future recreation of the function or default-privilege changes could reintroduce execution; retain this exact-signature permission regression in future reviews. No blanket default-privilege alteration is part of this fix.

References: [PostgreSQL privilege and role inquiries](https://www.postgresql.org/docs/17/functions-info.html), [Supabase function permissions](https://supabase.com/docs/guides/database/functions).
