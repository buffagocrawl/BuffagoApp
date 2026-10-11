-- Buffago: proposed narrow production account-deletion source review.
-- NOT EXECUTED. Requires new explicit authorization for project vhfxnizaxdanmvmouuaf.
-- No application data, passwords, credentials, Storage objects or user rows are requested.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT
  n.nspname AS schema_name,
  p.oid::regprocedure::text AS signature,
  p.proowner::regrole::text AS owner,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proacl::text AS function_acl,
  md5(p.prosrc) AS source_md5,
  md5(coalesce(p.proconfig::text, '')) AS config_md5,
  p.prosrc AS body_for_operator_screening
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname = 'delete_account_data'
ORDER BY p.oid::regprocedure::text;
ROLLBACK;
