# Buffago production — approved read-only evidence (2026-10-10)

**Scope:** Supabase project `vhfxnizaxdanmvmouuaf`. Four queries were executed with `BEGIN READ ONLY`, `lock_timeout=5s`, `statement_timeout=60s`, and `ROLLBACK`; no DDL, DML, application rows, function bodies or Edge deployments. These are the account-contract's two queries and behavior request R1/R2 **only**. Behavior R3 was **not** authorized or executed.

**Project control-plane:** ACTIVE_HEALTHY, us-east-2, host `db.vhfxnizaxdanmvmouuaf.supabase.co`, PG `17.6.1.011`. This proves connected-project metadata, not the separate custom deployment adapter's end-to-end authenticated TLS identity.

## Behavior R1: 14 named helpers (all returned)

`source_md5 = md5(pg_proc.prosrc)`; `config_md5 = md5(coalesce(pg_proc.proconfig::text,''))`.

| Schema | Name | Production signature | Source MD5 | SECURITY DEFINER | Search path | Config MD5 |
|---|---|---|---|---|---|---|
| public | award_referral_xp_internal | `award_referral_xp_internal(uuid,integer,uuid,text)` | `ee57684e110b9b013e947ffcd1979b0f` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | Badge_Add_Rating_Milestones | `"Badge_Add_Rating_Milestones"()` | `298aa31f809efe43252005021f089fc1` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | can_user_appear_socially | `can_user_appear_socially(uuid)` | `f4519e4112e7497b0acc5207054f2e3c` | no | unspecified | `d41d8cd98f00b204e9800998ecf8427e` |
| public | enqueue_referral_push_internal | `enqueue_referral_push_internal(uuid,uuid,text,text,text)` | `79f580d07ab242be795e3bf0965a6f59` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | flag_referral_account_deletion | `flag_referral_account_deletion()` | `65b376c54d2fdf603650f063d1f14df6` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | friend_pair_is_blocked | `friend_pair_is_blocked(uuid,uuid)` | `dbb0188e6e65df3e38d401d995812e50` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | mango_clear_ineligible_priority | `mango_clear_ineligible_priority()` | `e6afd97295efcd4fd14542212290b7f0` | no | pg_catalog, public | `77a607835d4d56bfe514d9272db9300d` |
| public | referral_profile_eligibility | `referral_profile_eligibility(uuid)` | `3e430d004bfebc4c183545257015f45d` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | settle_referral_for_rating_internal | `settle_referral_for_rating_internal(uuid,uuid)` | `582d64ecad7b96c027de2c7384ece5be` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | sync_verified_referral_badges_internal | `sync_verified_referral_badges_internal(uuid)` | `990b49ddc24b22b12a913858b1b04320` | yes | public | `dcd2abd514173991611a622e71d06e6f` |
| public | wing_photo_processing_blocker | `wing_photo_processing_blocker(uuid)` | `77e5eb7a71360ecea76985ac278ce8a2` | yes | pg_catalog, public, storage | `047a8d61c365228c81e80926d3284293` |
| public | wing_transition_submission | `wing_transition_submission(uuid,text,text,text,uuid,text,text,uuid,jsonb)` | `ed3cd6c94145df3a63a364e2cef69fcc` | yes | pg_catalog, public | `77a607835d4d56bfe514d9272db9300d` |
| storage | protect_delete | `storage.protect_delete()` | `998d324ea2b1abc49351e8c2367b5796` | no | unspecified | `d41d8cd98f00b204e9800998ecf8427e` |
| storage | update_updated_at_column | `storage.update_updated_at_column()` | `7596e66a7698d5a6b5129c5ce9b24c5f` | no | unspecified | `d41d8cd98f00b204e9800998ecf8427e` |

R1 ownership: all 12 public functions belong to `postgres`; the 2 storage functions to `supabase_storage_admin`. Noteworthy baseline ACL: `Badge_Add_Rating_Milestones`, `mango_clear_ineligible_priority`, and `can_user_appear_socially` have PUBLIC EXECUTE; validate this as an existing contract rather than silently broadening grants. Other service/internal helpers have varying service-role/authenticated grants captured by the production query.

## Behavior R2: applicable DDL event triggers (both returned and enabled)

| Event trigger | Event | Tags | Production handler | Source MD5 | Config MD5 | Owner |
|---|---|---|---|---|---|---|
| `issue_pg_graphql_access` | `ddl_command_end` | `CREATE FUNCTION` | `grant_pg_graphql_access()` | `dd3f3e2bb94cff45ef24b9cecb6af1c8` | `af3be9c3d4c2d891da1a7618c49685d3` | supabase_admin |
| `pgrst_ddl_watch` | `ddl_command_end` | NULL (not tag-restricted) | `pgrst_ddl_watch()` | `7f27b8118fea5c88b0164331292859e3` | `af3be9c3d4c2d891da1a7618c49685d3` | supabase_admin |

Both are enabled (`evtenabled='O'`), PL/pgSQL, VOLATILE, SECURITY INVOKER (`prosecdef=false`), with `search_path=""`; handler return type `event_trigger`. Fingerprint/config data alone does **not** prove their business effects or parity under actual migration DDL; R3 source retrieval and behavior acceptance were not performed.

## Account contract — columns and service access

Both tables are in `public`, owned by `postgres`, and have row-level security enabled. `has_table_privilege('service_role', table, 'SELECT')` returned `true` for every requested column's table.

| Table | Column | Type | NOT NULL |
|---|---|---|---|
| wing_account_deletion_manifests | id | uuid | yes |
| wing_account_deletion_manifests | user_id | uuid | no |
| wing_account_deletion_manifests | status | text | yes |
| wing_account_deletion_manifests | correlation_id | uuid | yes |
| wing_account_deletion_manifests | prepared_at | timestamptz | yes |
| wing_submission_upload_intents | id | uuid | yes |
| wing_submission_upload_intents | user_id | uuid | yes |
| wing_submission_upload_intents | expected_storage_path | text | yes |
| wing_submission_upload_intents | status | text | yes |

No user/media/path rows were read. Having SELECT privilege is not proof of an atomic deletion/upload write fence or deployed Edge runtime behavior.

## Account contract — production function fingerprints

`body_md5 = md5(pg_proc.prosrc)`; `config_md5 = md5(pg_proc.proconfig::text)`.

| Production signature | Body MD5 | Config MD5 | Owner | SECURITY DEFINER |
|---|---|---|---|---|
| `public.complete_wing_account_media_cleanup(uuid,boolean,text)` | `bb59e829e4cf848befa9e9c90fb93801` | `77a607835d4d56bfe514d9272db9300d` | postgres | yes |
| `public.finalize_wing_submission_upload(uuid,text,uuid)` | `d7c7c9a5f47e72f04450197be6f76b53` | `047a8d61c365228c81e80926d3284293` | postgres | yes |
| `public.prepare_wing_account_media_cleanup(uuid,uuid)` | `7fb25452bff5a1911d85e41bd3b7dbed` | `77a607835d4d56bfe514d9272db9300d` | postgres | yes |
| `public.reserve_wing_submission_upload(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text)` | `b743ef604059e9ffa454dc8085caad9b` | `047a8d61c365228c81e80926d3284293` | postgres | yes |

The request also looked for `reserve_wing_photo_upload` and `finalize_wing_photo_upload`: **no such functions were returned**. Do not assume these are required; verify the actual deployed name/call chains using the four returned functions.

## Next action for Codex

1. Compare every above production `md5(prosrc)` against the exact local implementation's raw/LF-normalized *PostgreSQL prosrc-equivalent* text; check signatures, owners, config, grants. Record MATCH / MISMATCH / SOURCE NOT AVAILABLE.
2. For missing matches, propose the minimal specifically identified R3 read-only body retrieval **for separate authorization**; do not fetch or dump functions broadly.
3. Test the actual matched transitive behavior of rating/referral/Mango/Storage handlers in disposable PG 17.6. Both event-trigger bodies and full parity still require additional evidence.
4. Decide whether an **atomic** upload reservation/finalization/account-deletion fence exists. The metadata obtained today alone cannot establish it. Propose separate, versioned corrective SQL if needed; never alter the frozen original migration.
5. Preserve NO-GO until controlled Storage/Auth/gateway acceptance, predecessor Edge inventories, trust/window/history/ledger/rollback approvals and explicit production-write permission.
