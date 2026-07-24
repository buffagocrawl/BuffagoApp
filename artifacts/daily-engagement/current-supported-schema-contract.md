# Buffago Current Supported Schema Contract v1

Version: `1.0.0`  
Machine-readable source: [`current-supported-schema-v1.json`](../../crawl/supabase/contracts/current-supported-schema-v1.json)  
Generated preflight: [`current-supported-schema-preflight.sql`](../../crawl/supabase/validation/current-supported-schema-preflight.sql)  
Checksum: `fe2af053e41c78ed27919292d4168a87d990a3f4637ca5dcb30703bac0a1d891`

This is the minimum schema shape supported by the daily-engagement and notification release. It is a compatibility contract, not a provisioning baseline and not a recovered historical state. The contract was generated from the preserved current-production metadata and the release-owned migrations. It intentionally excludes unrelated Buffago objects.

The generated preflight currently contains **29 contract checks**. It is read-only, runs before release SQL, reports missing and incompatible definitions separately, and fails before mutation. The count is derived from the JSON contract; no historical prerequisite count is used.

## Required shape

The contract covers:

- Supabase-managed `pgcrypto` and Auth identity support.
- Current platform tables needed for action ownership, social privacy, friendships, and server-side XP.
- Daily mission assignments, reward receipts, action receipts, streak state, preferences, and the in-app readiness model.
- Push installations, notification preferences, notification outbox, delivery attempts, proximity receipts, and disabled-by-default feature flags.
- `limited_time_events` as a current compatible read object or a compatibility creation path in supported non-production environments.
- Required server RPC signatures, the social/privacy functions, and the friend-rating enqueue trigger capability.

For each table, the JSON contract specifies required columns and types, named constraints, RLS state, required policy capabilities, owning subsystem, and whether the release reads, creates, or alters release-owned state. Existing shared tables are never dropped or recreated by reconciliation.

## Operational rule

Run `npm run database:current-contract` when the JSON changes. Run the generated SQL preflight against the target database before any release SQL. A failure must be resolved by a reviewed forward migration or by stopping the rollout. The contract does not authorize production mutation, historical reconstruction, placeholder objects, or migration-ledger changes.
