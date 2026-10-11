-- NOT YET DEPLOYED. Standalone ACL-only correction; no migration-ledger edits.
-- Operator must verify project vhfxnizaxdanmvmouuaf and freeze concurrent
-- changes to this function and API-role memberships for this short transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;
DO $hotfix$
DECLARE
  target oid := to_regprocedure('public.delete_account_data(uuid)');
  before_metadata jsonb;
  after_metadata jsonb;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Hotfix refused: exact function missing';
  END IF;
  SELECT to_jsonb(p) - 'proacl' INTO before_metadata FROM pg_proc p WHERE p.oid = target;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.oid = target AND md5(p.prosrc) = '4f108f4b39ec1d613fd5b1ba6be97c82'
      AND p.prosecdef AND p.prokind = 'f' AND r.rolname = 'postgres' AND r.rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Hotfix refused: source/owner/SECURITY DEFINER drift';
  END IF;
  REVOKE EXECUTE ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
  IF has_function_privilege('anon', target, 'EXECUTE')
     OR has_function_privilege('authenticated', target, 'EXECUTE')
     OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
    RAISE EXCEPTION 'Hotfix refused: effective EXECUTE boundary failed (including inherited grants)';
  END IF;
  -- Also reject NOINHERIT memberships that permit SET ROLE into an executor.
  IF EXISTS (
    SELECT 1 FROM pg_roles untrusted CROSS JOIN pg_roles executor
    WHERE untrusted.rolname IN ('anon', 'authenticated')
      AND pg_has_role(untrusted.oid, executor.oid, 'SET')
      AND has_function_privilege(executor.oid, target, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Hotfix refused: untrusted role can SET ROLE into an executor';
  END IF;
  SELECT to_jsonb(p) - 'proacl' INTO after_metadata FROM pg_proc p WHERE p.oid = target;
  IF before_metadata IS DISTINCT FROM after_metadata THEN
    RAISE EXCEPTION 'Hotfix refused: non-ACL function metadata changed';
  END IF;
END
$hotfix$;
COMMIT;
