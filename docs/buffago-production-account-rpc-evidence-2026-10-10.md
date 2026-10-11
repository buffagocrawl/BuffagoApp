# Buffago production RPC source and security evidence

**Observation date:** 2026-10-10  
**Supabase project:** `vhfxnizaxdanmvmouuaf`  
**Scope:** Explicitly authorized read-only source retrieval for two named functions and a read-only ACL/role confirmation. **No production data mutations or deployments.**

## 1. `public.delete_account_data(uuid)`

Source MD5 (`pg_proc.prosrc`): `4f108f4b39ec1d613fd5b1ba6be97c82`  
Config MD5: `dcd2abd514173991611a622e71d06e6f`  
Owner: `postgres` (`BYPASSRLS=true`)  
`SECURITY DEFINER=true`  
Config: `{search_path=public}`  
Function ACL: `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`

Source returned by `pg_get_functiondef()` (line endings normalized for this evidence file):

```sql
CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  -- Delete user-owned data first (order matters if FKs exist)
  delete from public.destination_ratings where user_id = p_user_id;
  delete from public.crawls where user_id = p_user_id;
  delete from public.user_preferences where user_id = p_user_id;

  -- Add any other tables that store user_id:
  -- delete from public.buffacoin_ledger where user_id = p_user_id;
  -- delete from public.user_badges where user_id = p_user_id;
end;
$function$
```

**Read-only permission confirmation:**

| Check | Result |
|---|---|
| `has_schema_privilege('anon','public','USAGE')` | true |
| `has_schema_privilege('authenticated','public','USAGE')` | true |
| `has_function_privilege('anon', ...,'EXECUTE')` | true |
| `has_function_privilege('authenticated', ...,'EXECUTE')` | true |
| `has_function_privilege('service_role', ...,'EXECUTE')` | true |
| Function owner RLS bypass | true |

**Security finding — high priority:** The function accepts an arbitrary user ID and contains no `auth.uid()`/caller authorization check. When executed it runs as `postgres`, bypassing RLS. The database permissions allow `anon` and `authenticated` to execute it. Exposure through the project's Data API still requires gateway verification, but it should be treated as potentially exploitable **without invoking it on production**. Do not attempt destructive proof-of-exploit tests against customer records.

**Existing deployed Edge relationship:** `delete-account` version 15 first verifies the provided JWT via `auth.getUser`, then invokes `delete_account_data` using a service-role client, then calls `auth.admin.deleteUser`. This Edge-level authentication does not restrict other direct RPC callers when the SQL function itself grants `anon`/`authenticated` execution.

**Recommended urgent mitigation proposal (NOT EXECUTED):** Independently review and test removal of `EXECUTE` from `anon`, `authenticated` and `PUBLIC` while preserving `service_role` and `postgres` access. Verify Data API exposure and all call sites, and plan a separately authorized, documented production hotfix. Subsequently replace the vulnerable function with a least-privilege, properly authenticated contract as part of reviewed account-deletion remediation. Do not rely on UI flags or only Edge authentication to secure a publicly callable `SECURITY DEFINER` function.

## 2. `public.xp_level_for(integer)`

Source MD5 (`pg_proc.prosrc`): `5fba55f09b21a6b0824b9abd87fadf59`  
Config MD5: `d41d8cd98f00b204e9800998ecf8427e`  
Owner: `postgres`  
`SECURITY DEFINER=false`  
Volatility: `STABLE`  
ACL: `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`

```sql
CREATE OR REPLACE FUNCTION public.xp_level_for(p_xp integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (
      select max(level)
      from public.level_thresholds
      where xp_required <= greatest(coalesce(p_xp, 0), 0)
    ),
    1
  );
$function$
```

This XP helper is a read-only stable SQL function; the code's behavior can now be evaluated against the matching local definition and test fixtures.

## What still blocks the new Wing Jury/Saved Destinations release

- Production upload reservation/finalization bodies (previously authorized R3 inspection) need to be compared in Codex's disposable test harness; account cleanup currently lacks a proven fence for already-issued signed upload URLs, active Storage writes and workers.
- The live deletion function is not the new staged-delete implementation. Decide and test whether to retain or replace it, independently of the urgent RPC privilege issue.
- Actual Storage/Auth/gateway tests, migration/history/ledger approvals, incident owner/backup and full controlled deployment acceptance remain pending.

**No migration, Edge Function or SQL write occurred during this inspection.**
