# Wingdex photo production rollout

Target project: vhfxnizaxdanmvmouuaf. This is a historical operator procedure; do not rerun its derivative recovery steps. Run any future reviewed gate from C:\Users\Brand\repo\BuffagoApp in the same PowerShell session, inspect the result, and stop on any mismatch. Never share a service key, database password, signed URL, or original image path.

## Current status (2026-10-09)

Photo recovery is complete: 15 derivative jobs succeeded, 0 are incomplete, 45 audit receipts exist, and 15 recovered submissions have processed and thumbnail paths. The latest read-only inventory has 14 approved photos and one failed photo; the earlier 15-approved observation is historical. The `wing-submissions` bucket remains private. The gallery Edge update and `20261008232910_wing_photo_vote_gallery_eligibility` migration remain unapplied. The deployed gallery source could not be exported for equivalence review, and live vote validation does not yet enforce the prepared eligibility/concurrency rules. Gallery deployment is **NO-GO** until the prepared function and migration are reviewed, released through the authorized process, and live privacy, contract, and two-account voting checks pass. The procedural canary and batch instructions below record the earlier plan and are not a request to repeat recovery.

## Current evidence and prerequisites

Migration phase completed: `20261008171906_wing_photo_derivative_recovery` and `20261008184025_wing_photo_receipt_fixed_search_path` have been applied and verified. The earlier read-only baseline found 15 approved photos missing both derivatives, two withdrawn photos, a private wing-submissions bucket, no active legacy photo jobs, and five pending legacy **video** jobs. These are historical observations. Do not use the earlier canary procedure now that recovery is complete.

The derivative migration source hash is D07C40BF89EFECF85BFBBA8790B2B6E7DB8EED5C15A837DCB4A3CF0996BAB665. Its submission-scoped photo claim must be paired with the worker supporting --photo-submission-id. The canary operator needs: a maintenance window; a protected backup/PITR checkpoint; control of old processing, cleanup, and publishing schedules; current Node dependencies; Python with Pillow and requests; and a secure production service-role key already present in the environment. There is no separate staging project. Do not enable an unscoped photo worker schedule during the canary. Do not run repair_stranded_wing_submission.

Pre-migration local validation for this derivative source: 369 JavaScript tests (367 passed, two pre-existing skips), 53 Python tests passed, TypeScript and Deno checks passed, and the PowerShell blocks parsed without errors. The submission-scoped claim was exercised against PostgreSQL and through the Python repository/CLI. The old statement that no production DDL had been run applied only when this procedure was first prepared; both migrations are now complete.

The first command, from the repository root, is:

~~~~powershell
Get-Content -LiteralPath .\crawl\supabase\.temp\project-ref
~~~~

Expected output: exactly vhfxnizaxdanmvmouuaf. Stop if missing or different. Then run:

~~~~powershell
$projectRef = 'vhfxnizaxdanmvmouuaf'
$migration = Resolve-Path .\crawl\supabase\migrations\20261008171906_wing_photo_derivative_recovery.sql
$expectedHash = 'D07C40BF89EFECF85BFBBA8790B2B6E7DB8EED5C15A837DCB4A3CF0996BAB665'
if ((Get-Content .\crawl\supabase\.temp\project-ref -Raw).Trim() -ne $projectRef) { throw 'Wrong linked project' }
if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Migration changed' }
supabase --version
supabase db query --linked "select version,name from supabase_migrations.schema_migrations where version in ('20261008144550','20261008171906','20261008184025') order by version" --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Ledger query failed' }
~~~~

Expected: exactly one ledger row for each of the voting, derivative recovery, and receipt fixed-search-path versions. Supabase CLI 2.107.0 was used for the original procedure; check current help if your version differs. The CLI wraps rows in a JSON object with a random boundary and a warning that database output is untrusted. Confirm the receipt function has the fixed search path and expected grants, that the wing-submissions bucket is private, that 15 approved photos remain eligible, and that the derivative job queue is empty before inventory. Do not treat the old pre-migration preflight values in sections 1-2 as current expectations.

## 1. Migration-history reconciliation

**Completed migration phase; historical record only. Do not rerun the migration application or ledger insertion commands in sections 1-2.** Keep the reconciliation warnings and security checks as reference. The next operational phase is the single-photo canary in sections 3-4, after fresh read-only gates.

The remote ledger has 32 versions at inspection. This checkout has **two** root files named with version 20260729200000, 24 manifest checksum mismatches, and 17 unmanifested migrations. The applied voting migration is ledger-only in this checkout; several older source filenames map to different deployed timestamps. Do not rename or mark historical rows applied/reverted to make the lists align. Supabase [db push](https://supabase.com/docs/reference/cli/supabase-db-push) applies all pending local migrations; [migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) only inserts/deletes history rows, without applying/undoing SQL. Neither is a safe broad fix here. Use one atomic, target-only DDL plus ledger transaction below, and audit unrelated history separately.

~~~~powershell
supabase migration list --linked --workdir .\crawl
Get-ChildItem .\crawl\supabase\migrations\20260729200000*.sql | Select-Object -ExpandProperty Name
node .\crawl\scripts\check-migration-integrity.mjs
$preflight = @'
select
  (select count(*) from supabase_migrations.schema_migrations where version='20261008171906') as target_ledger_rows,
  to_regclass('public.wing_photo_derivative_jobs') as jobs_table,
  to_regclass('public.wing_photo_derivative_receipts') as receipts_table,
  (select public from storage.buckets where id='wing-submissions') as bucket_public,
  (select count(*) from public.wing_media_submissions where media_type='photo' and status='approved') as approved_photos,
  (select count(*) from public.wing_media_submissions where media_type='photo' and status='approved'
    and processed_storage_path is null and thumbnail_storage_path is null) as approved_missing_both,
  (select count(*) from public.wing_processing_jobs where job_kind='photo_process'
    and status in ('pending','claimed','retry')) as active_legacy_photo_jobs;
'@
supabase db query --linked $preflight --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed' }
~~~~

Historical pre-migration expectation: the two duplicate filenames were duplicate_media_classification.sql and duplicate_media_classification_fixed.sql; the integrity command exited 1 only for historical issues. The pre-migration values were 0, null, null, false, 15, 15, 0. These values are obsolete after application. Investigate changed counts instead of forcing them back to 15. Never use db push, migration up, db reset, or a blanket migration repair for this rollout.

Save a before-migration security-advisor baseline for comparison; this is read-only:

~~~~powershell
supabase db advisors --linked --type security --level warn --fail-on none --workdir .\crawl
~~~~

## 2. Derivative migration review and apply

The reviewed SQL creates a one-job-per-submission queue, append-only receipts, a partial claim index, and a receipt index. RLS is enabled on both new public tables. PUBLIC, anon, and authenticated grants are revoked; service_role gets limited table grants and execution on inventory, request, claim, begin, and settle RPCs. Helper function execution is revoked. Fixed search paths and explicit service-role checks protect SECURITY DEFINER functions. The insert trigger queues new in-review photos, the approval guard requires real derivatives, and a legacy-job guard prevents competing photo jobs. The existing backlog function is replaced with a video-only selector. Storage policies, bucket settings, moderation approvals, and existing photo rows are not changed. The scoped claim signature is (text,integer,uuid), with optional UUID. The live catalog had every required table/column and a postgres-owned backlog function; confirm again:

~~~~powershell
$deps = @'
select jsonb_build_object(
  'submissions',to_regclass('public.wing_media_submissions'),
  'legacy_jobs',to_regclass('public.wing_processing_jobs'),
  'generation_jobs',to_regclass('public.wing_generation_jobs'),
  'social_jobs',to_regclass('public.social_content_jobs'),
  'moderation_config',to_regclass('public.wing_moderation_config'),
  'storage_objects',to_regclass('storage.objects'),
  'uuid_generator',to_regprocedure('pg_catalog.gen_random_uuid()'),
  'auth_role',to_regprocedure('auth.role()'),
  'moderation_config_rows',(select count(*) from public.wing_moderation_config where singleton),
  'backlog_rpc',to_regprocedure('public.enqueue_wing_processing_backlog(integer)'),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object(
    'table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled)
    order by c.relname,t.tgname),'[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname in ('wing_media_submissions','wing_processing_jobs') and not t.tgisinternal),
  'legacy_job_kinds',(select coalesce(jsonb_agg(jsonb_build_object(
    'kind',x.job_kind,'status',x.status,'count',x.n)),'[]'::jsonb)
    from (select job_kind,status,count(*) n from public.wing_processing_jobs
      group by job_kind,status) x),
  'old_backlog_definition',pg_get_functiondef('public.enqueue_wing_processing_backlog(integer)'::regprocedure)
) as inspection;
'@
supabase db query --linked $deps --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Dependency query failed' }
~~~~

Expected: all listed dependencies exist, moderation_config_rows is 1, no new wing_photo trigger already exists, and no active photo_process jobs. Save the old backlog definition in a protected operator record for possible rollback. Do not proceed if its current behavior differs from the inspected photo+video backlog.

**HISTORICAL WRITE GATE; migration already applied. Do not execute this block again.** It documented an atomic target-only DDL and ledger transaction after backup and maintenance controls. It removes only the migration file's outer BEGIN/COMMIT, then wraps its body and **one** new history row in a single transaction. The history row stores the full original source as one statement, matching the observed ledger convention. The exact checksum and target were checked again:

~~~~powershell
$source = [IO.File]::ReadAllText($migration)
if (([regex]::Matches($source,'(?m)^begin;[ \t]*\r?$')).Count -ne 1 -or
    ([regex]::Matches($source,'(?m)^commit;[ \t]*\r?$')).Count -ne 1 -or
    $source -notmatch '(?s)\A-- Photo derivative jobs') { throw 'Unexpected migration wrapper' }
if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Migration changed' }
if ((Get-Content .\crawl\supabase\.temp\project-ref -Raw).Trim() -ne $projectRef) { throw 'Wrong project' }
$body = $source -replace '(?m)^begin;[ \t]*\r?\n','' -replace '(?s)\r?\ncommit;[ \t]*\s*\z',''
$literal = "'" + $source.Replace("'","''") + "'"
$prefix = @'
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL standard_conforming_strings = on;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261008144550')
    OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261008171906')
    OR to_regclass('public.wing_photo_derivative_jobs') IS NOT NULL
    OR to_regclass('public.wing_photo_derivative_receipts') IS NOT NULL
    OR (SELECT public FROM storage.buckets WHERE id='wing-submissions') IS DISTINCT FROM false
    OR EXISTS (SELECT 1 FROM public.wing_processing_jobs WHERE job_kind='photo_process'
      AND status IN ('pending','claimed','retry'))
  THEN RAISE EXCEPTION 'wing_photo_migration_preflight_failed'; END IF;
END;
$guard$;
'@
$rolloutSql = $prefix + [Environment]::NewLine + $body + [Environment]::NewLine +
  "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20261008171906','wing_photo_derivative_recovery',ARRAY[$literal]::text[]);" +
  [Environment]::NewLine + 'COMMIT;'
$rolloutFile = Join-Path $env:TEMP 'wingdex-photo-20261008171906-reviewed.sql'
[IO.File]::WriteAllText($rolloutFile,$rolloutSql,[Text.UTF8Encoding]::new($false))
supabase db query --linked --file $rolloutFile --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; inspect ledger and objects before any retry' }
~~~~

If this CLI cannot execute the transaction file, stop. Do not split DDL and ledger insertion or substitute db push. Obtain a reviewed single-transaction executor first. This procedure has not been run against production.

Verify immediately:

~~~~powershell
$verifyMigration = @'
select jsonb_build_object(
  'ledger',(select row_to_json(x) from
    (select version,name,array_length(statements,1) statement_count
     from supabase_migrations.schema_migrations where version='20261008171906') x),
  'tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,
    'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
    'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
    'service_select',has_table_privilege('service_role',c.oid,'SELECT')))
    from pg_class c where c.oid in ('public.wing_photo_derivative_jobs'::regclass,
                                   'public.wing_photo_derivative_receipts'::regclass)),
  'indexes',(select jsonb_agg(indexname order by indexname) from pg_indexes
    where schemaname='public' and indexname in
      ('wing_photo_derivative_claim_idx','wing_photo_derivative_receipts_submission_idx')),
  'triggers',(select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled)
    order by tgname) from pg_trigger
    where tgrelid in ('public.wing_media_submissions'::regclass,
      'public.wing_processing_jobs'::regclass,'public.wing_photo_derivative_receipts'::regclass)
      and tgname in ('wing_photo_upload_derivatives','wing_photo_approval_guard',
        'wing_legacy_photo_job_guard','wing_photo_receipt_append_only')),
  'anon_claim',has_function_privilege('anon',
    'public.claim_wing_photo_derivative_job(text,integer,uuid)','EXECUTE'),
  'authenticated_claim',has_function_privilege('authenticated',
    'public.claim_wing_photo_derivative_job(text,integer,uuid)','EXECUTE'),
  'service_claim',has_function_privilege('service_role',
    'public.claim_wing_photo_derivative_job(text,integer,uuid)','EXECUTE'),
  'function_grants',(select jsonb_agg(jsonb_build_object(
    'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service',has_function_privilege('service_role',p.oid,'EXECUTE'))
    order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('wing_photo_receipt_append_only','wing_photo_processing_blocker',
       'list_wing_photo_derivative_candidates','request_wing_photo_derivatives',
       'enqueue_wing_photo_upload_derivatives','guard_wing_photo_approval',
       'guard_legacy_wing_photo_job','claim_wing_photo_derivative_job',
       'begin_wing_photo_derivative_job','settle_wing_photo_derivative_job')),
  'new_table_policies',(select count(*) from pg_policies
    where schemaname='public' and tablename in
      ('wing_photo_derivative_jobs','wing_photo_derivative_receipts')),
  'bucket_public',(select public from storage.buckets where id='wing-submissions'),
  'backlog_definition',pg_get_functiondef(
    'public.enqueue_wing_processing_backlog(integer)'::regprocedure),
  'jobs',(select count(*) from public.wing_photo_derivative_jobs),
  'receipts',(select count(*) from public.wing_photo_derivative_receipts)
) as verification;
'@
supabase db query --linked $verifyMigration --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed' }
~~~~

Expected: the single verification JSON contains one ledger row with statement_count=1; two RLS-enabled tables with anon/authenticated SELECT false and service SELECT true; both indexes; four enabled triggers; function execute false/false/true. All ten named new functions have anon/authenticated EXECUTE false, the six service RPCs have service EXECUTE true, new_table_policies is 0, bucket_public false, and the backlog definition selects videos only. Queue and receipts are zero unless a new upload arrived during application; if nonzero, inspect before canary. Reconfirm existing Storage policies. Run the read-only security advisor and compare with a saved before-migration result:

~~~~powershell
supabase db advisors --linked --type security --level warn --fail-on none --workdir .\crawl
~~~~

Stop on a new issue affecting the photo tables, RPCs, or Storage boundary. The CLI returns only the **last** result set from multi-statement queries, so the inspection commands above deliberately use one SELECT each.

## 3. Production worker setup

The worker requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. For approved-photo recovery, manual-review is a production-supported provider: recovery skips re-moderation and retains the human decision. WING_PROCESSING_ENVIRONMENT=production disallows the test provider. Before enabling a future unscoped upload worker, configure the real HTTP moderation provider with WING_MODERATION_PROVIDER_URL, WING_MODERATION_API_KEY, WING_MODERATION_MODEL, and WING_MODERATION_MODEL_VERSION. Do not set WING_PROCESSING_ALLOW_TEST_PROVIDER=true.

~~~~powershell
$env:SUPABASE_URL = 'https://vhfxnizaxdanmvmouuaf.supabase.co'
if ([string]::IsNullOrEmpty($env:SUPABASE_SERVICE_ROLE_KEY)) { throw 'SUPABASE_SERVICE_ROLE_KEY unavailable; stop before inventory' }
$env:WING_PROCESSING_ENVIRONMENT = 'production'
$env:WING_MODERATION_PROVIDER_MODE = 'manual-review'
$env:WING_PROCESSING_ALLOW_TEST_PROVIDER = 'false'
$env:WING_PROCESSING_WORKER_ID = 'wing-photo-recovery-canary'
$python = 'C:\Users\Brand\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Python environment missing' }
& $python -c "import PIL, requests; print('Photo dependencies available')"
& $python Agents\Jalapeno\wing_processing_worker_main.py --validate-config
if ($LASTEXITCODE -ne 0) { throw 'Worker configuration invalid' }
~~~~

Expected: Photo dependencies available and a CONFIGURATION_VALID JSON result. This validates configuration presence, not network access or key correctness. The canary runs only --photo-once --photo-submission-id. That mode does zero legacy worker iterations; the dedicated repository does not enqueue backlog work. The scoped RPC filters both claims and expired-lease handling to the selected ID. Clear the service key from the shell after use with Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY.

## 4. One-photo canary

**Pending. Stop after one photo.** Verify the live ledger, receipt search-path fix, private bucket, approved-photo count, and empty derivative queue first. Check that `SUPABASE_SERVICE_ROLE_KEY` is present without printing it; if absent, stop before inventory. Do not process the remaining photos, deploy the gallery, commit, merge, or build as part of this canary.

**Read-only, after migration:** inventory returns approved candidate IDs with blocker codes but no original paths or keys.

~~~~powershell
node .\crawl\scripts\wing-photo-recovery.mjs --inventory
if ($LASTEXITCODE -ne 0) { throw 'Inventory failed' }
~~~~

Expected baseline: 15 candidates, each with blocker null and job_status null. Pick exactly one approved, eligible ID. Recheck consent, owner, retention, original existence, and publication history using this before-snapshot query. The original path is shown only as a fingerprint:

~~~~powershell
$canaryId = [guid]::Parse((Read-Host 'One eligible approved submission UUID').Trim())
$canarySql = @"
select s.id,s.status,s.approved_at,s.approved_by,s.attribution_preference,
       s.consent_version,s.consented_at,s.original_retain_until,
       md5(s.original_storage_path) as original_path_fingerprint,
       (o.id is not null) as original_exists,o.id as original_object_id,
       o.version as original_version,o.updated_at as original_updated_at,
       md5(o.metadata::text) as original_metadata_fingerprint,
       s.processed_storage_path is null as primary_path_missing,
       s.thumbnail_storage_path is null as thumbnail_path_missing,
       public.wing_photo_processing_blocker(s.id) as blocker,
       (select count(*) from public.wing_generation_jobs g where g.submission_id=s.id) as generation_jobs,
       (select count(*) from public.social_content_jobs c where c.submission_id=s.id) as social_jobs
from public.wing_media_submissions s
left join storage.objects o on o.bucket_id='wing-submissions' and o.name=s.original_storage_path
where s.id='$canaryId';
"@
supabase db query --linked $canarySql --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Canary baseline failed' }
~~~~

Expected exactly one approved row; reviewer/time and consent present; original_exists true; both derivative paths missing; blocker null; zero generation/social jobs. Save the output in a protected operator record and stop if any field disagrees. Build a one-ID UTF-8 manifest outside the checkout:

For byte-level confirmation, hash the **private** original immediately before the queue operation. This reads the recorded path through the service-role client, downloads bytes into worker memory, and prints only a SHA-256 digest. It does not create a signed or public original URL:

~~~~powershell
$originalHashCode = @'
import hashlib, sys
sys.path.insert(0, 'Agents/Jalapeno')
from supabase_client import SupabaseClient
client = SupabaseClient.from_env()
rows = client.fetch_rows('wing_media_submissions',
    filters={'id': 'eq.' + sys.argv[1]}, select='original_storage_path')
assert len(rows) == 1 and rows[0]['original_storage_path']
data = client.download_storage_object('wing-submissions', rows[0]['original_storage_path'])
print(hashlib.sha256(data).hexdigest())
'@
$originalHashBefore = (& $python -c $originalHashCode $canaryId).Trim()
if ($LASTEXITCODE -ne 0 -or $originalHashBefore -notmatch '^[0-9a-f]{64}$') { throw 'Original hash preflight failed' }
~~~~

Keep $originalHashBefore in this protected PowerShell session; do not paste it or the original path into chat. Stop if the download fails. Then build the manifest:

~~~~powershell
$canaryManifest = Join-Path $env:TEMP 'wingdex-photo-canary.json'
$manifestJson = @{ submission_ids = @($canaryId.ToString()) } | ConvertTo-Json -Compress
[IO.File]::WriteAllText($canaryManifest,$manifestJson,[Text.UTF8Encoding]::new($false))
node .\crawl\scripts\wing-photo-recovery.mjs --manifest $canaryManifest
if ($LASTEXITCODE -ne 0) { throw 'Canary dry run failed' }
~~~~

Expected: project_ref vhfxnizaxdanmvmouuaf, dry_run true, exactly one result for the chosen ID, outcome eligible and blocker null. Dry run writes no job, receipt, path, or object.

**WRITE GATE; not executed.** Only after reviewing the dry run and current approval/consent:

~~~~powershell
node .\crawl\scripts\wing-photo-recovery.mjs --manifest $canaryManifest --execute --expected-project-ref vhfxnizaxdanmvmouuaf
if ($LASTEXITCODE -ne 0) { throw 'Canary queue failed' }
$queuedSql = @"
select j.submission_id,j.purpose,j.status,j.attempt_count,j.max_attempts,j.last_error_code,
       (select count(*) from public.wing_photo_derivative_receipts r
         where r.job_id=j.id and r.event='request_queued') as request_receipts
from public.wing_photo_derivative_jobs j where j.submission_id='$canaryId';
"@
supabase db query --linked $queuedSql --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Canary queue verification failed' }
~~~~

Expected queue response: one queued outcome with one job ID. SQL: exactly one recovery/pending job, attempt_count 0, one request_queued receipt, null error. A pending/retry/claimed/succeeded/already_ready response instead of queued is a stop for investigation, not a reason to issue another request. The unique job constraint prevents duplicate publication, but do not rely on it in place of review.

**WRITE GATE; not executed.** Process only the selected submission:

~~~~powershell
& $python Agents\Jalapeno\wing_processing_worker_main.py --photo-once --photo-submission-id $canaryId
if ($LASTEXITCODE -ne 0) { throw 'Canary processor failed or cancelled; inspect receipts' }
~~~~

Expected log: wing_processing_completed with this submission_id and status APPROVED. A zero exit with NO_JOB is **not success**. Never run unscoped --once, --drain, --photo-once, or --photo-drain for this canary. Do not use the old stranded-approval repair.

Verify approval, attribution, original object, both private derivatives, and audit history:

~~~~powershell
$afterSql = @"
select s.id,s.status,s.approved_at,s.approved_by,s.attribution_preference,
       s.consent_version,s.consented_at,s.original_retain_until,
       md5(s.original_storage_path) as original_path_fingerprint,
       (orig.id is not null) as original_exists,orig.id as original_object_id,
       orig.version as original_version,orig.updated_at as original_updated_at,
       md5(orig.metadata::text) as original_metadata_fingerprint,
       s.processed_storage_path='processed/'||s.id::text||'/primary' as canonical_primary,
       s.thumbnail_storage_path='thumbnails/'||s.id::text||'/preview' as canonical_thumbnail,
       (p.id is not null) as primary_exists,p.metadata->>'mimetype' as primary_mime,
       (p.metadata->>'size')::bigint as primary_bytes,
       (t.id is not null) as thumbnail_exists,t.metadata->>'mimetype' as thumbnail_mime,
       (t.metadata->>'size')::bigint as thumbnail_bytes,
       j.purpose,j.status as job_status,j.attempt_count,j.last_error_code,
       public.wing_photo_processing_blocker(s.id) as blocker,
       (select count(*) from public.wing_generation_jobs g where g.submission_id=s.id) as generation_jobs,
       (select count(*) from public.social_content_jobs c where c.submission_id=s.id) as social_jobs
from public.wing_media_submissions s
left join storage.objects orig on orig.bucket_id='wing-submissions' and orig.name=s.original_storage_path
left join storage.objects p on p.bucket_id='wing-submissions' and p.name=s.processed_storage_path
left join storage.objects t on t.bucket_id='wing-submissions' and t.name=s.thumbnail_storage_path
left join public.wing_photo_derivative_jobs j on j.submission_id=s.id
where s.id='$canaryId';
"@
supabase db query --linked $afterSql --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Canary verification failed' }
$receiptSql = @"
select r.event,r.attempt_number,r.error_code,r.occurred_at
from public.wing_photo_derivative_receipts r where r.submission_id='$canaryId'
order by r.occurred_at,r.id;
"@
supabase db query --linked $receiptSql --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Canary receipt verification failed' }
~~~~

Expected: approval timestamp/reviewer, status, attribution, consent, original object ID/version/update time/metadata fingerprint/path fingerprint and original_exists match the before snapshot. Canonical paths are true; both objects exist with image/jpeg MIME and positive byte sizes; purpose recovery, job_status succeeded, null last error; request_queued, claimed, succeeded receipts; generation/social counts still zero. Attempt count is normally 1. Bucket public must still be false. Compare the original bytes again before declaring success:

~~~~powershell
$originalHashAfter = (& $python -c $originalHashCode $canaryId).Trim()
if ($LASTEXITCODE -ne 0 -or $originalHashAfter -ne $originalHashBefore) { throw 'Original bytes changed or became unreadable' }
~~~~

Storage metadata is necessary but not sufficient for validating derivative bytes: use the authorized service-role private download below and verify JPEG decoding. Never print or share a URL or bytes, and never sign the original for this check. Compare the gallery's displayable count and winner to the before state; original-only approvals must still count as approved but not displayable.

For the actual private-object read, use only the two canonical **derivative** paths after the SQL checks pass. The commands write temporary processed JPEGs, verify decoding, and remove them even on failure. They do not request the original or create a public URL:

~~~~powershell
$storageHeaders = @{ apikey = $env:SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY" }
$primaryFile = Join-Path $env:TEMP "wingdex-$canaryId-primary.jpg"
$thumbnailFile = Join-Path $env:TEMP "wingdex-$canaryId-thumbnail.jpg"
$jpegCheck = @'
import sys
from PIL import Image
for path in sys.argv[1:]:
    with Image.open(path) as image:
        image.verify()
        assert image.format == "JPEG"
print("Two private JPEG derivatives decoded")
'@
try {
  Invoke-WebRequest -Uri "$env:SUPABASE_URL/storage/v1/object/wing-submissions/processed/$canaryId/primary" -Headers $storageHeaders -OutFile $primaryFile -ErrorAction Stop
  Invoke-WebRequest -Uri "$env:SUPABASE_URL/storage/v1/object/wing-submissions/thumbnails/$canaryId/preview" -Headers $storageHeaders -OutFile $thumbnailFile -ErrorAction Stop
  & $python -c $jpegCheck $primaryFile $thumbnailFile
  if ($LASTEXITCODE -ne 0) { throw 'Private derivative bytes invalid' }
} finally {
  Remove-Item -LiteralPath $primaryFile,$thumbnailFile -ErrorAction SilentlyContinue
}
~~~~

Expected: Two private JPEG derivatives decoded. Stop on any HTTP or decoder error; do not retry by exposing the originals. Clear $storageHeaders when finished.

## 5. Remaining-photo batches

Do not start before the canary passes every comparison. Re-run inventory before **each** batch; select at most three eligible IDs, excluding withdrawn, blocked, ready, or in-flight rows. This example is for three IDs; remove unused Read-Host lines for a final one- or two-ID batch. Record each before snapshot with the canary query before queuing:

~~~~powershell
$batchIds = @(
  [guid]::Parse((Read-Host 'Eligible batch UUID 1').Trim()),
  [guid]::Parse((Read-Host 'Eligible batch UUID 2').Trim()),
  [guid]::Parse((Read-Host 'Eligible batch UUID 3').Trim())
) | Select-Object -Unique
if ($batchIds.Count -ne 3 -or $batchIds -contains $canaryId) { throw 'Invalid batch' }
$batchManifest = Join-Path $env:TEMP 'wingdex-photo-batch.json'
$batchJson = @{ submission_ids = @($batchIds | ForEach-Object { $_.ToString() }) } | ConvertTo-Json -Compress
[IO.File]::WriteAllText($batchManifest,$batchJson,[Text.UTF8Encoding]::new($false))
node .\crawl\scripts\wing-photo-recovery.mjs --inventory
node .\crawl\scripts\wing-photo-recovery.mjs --manifest $batchManifest
if ($LASTEXITCODE -ne 0) { throw 'Batch dry run failed' }
~~~~

Expected: exactly the selected IDs, all eligible with null blocker. For a shorter final batch, change the count assertion to the chosen count. **WRITE GATE; not executed**, only after reviewing that output:

~~~~powershell
node .\crawl\scripts\wing-photo-recovery.mjs --manifest $batchManifest --execute --expected-project-ref vhfxnizaxdanmvmouuaf
if ($LASTEXITCODE -ne 0) { throw 'Batch queue failed' }
foreach ($id in $batchIds) {
  & $python Agents\Jalapeno\wing_processing_worker_main.py --photo-once --photo-submission-id $id
  if ($LASTEXITCODE -ne 0) { throw "Scoped worker failed for $id; stop batch" }
}
~~~~

Run the after-query for **each** ID (set $canaryId to that ID), compare its recorded before snapshot, inspect its receipts and actual private JPEGs, then restore $canaryId for later canary references if needed. Stop on the first non-succeeded job or missing asset; worker exit alone is not proof. For retry status, wait until available_at and rerun the same scoped worker. For dead/cancelled, investigate the blocker; after a reviewed fix, use the same manifest with --retry-failed --execute --expected-project-ref vhfxnizaxdanmvmouuaf. Never fabricate paths, reset approval, or resubmit for a user. Verify all 15 individually. Resume paused schedules only after reviewing how they interact with the new queue.

## 6. Gallery-v2 contract gate and deployment

Observed v2: public POST with verify_jwt=false, counts only unless include_images=true, image fields submission_id and signed_url, newest-first order, approved **and publishing** statuses, and original fallback. Prepared handler: include_covers and submission_id viewer requests without include_images, displayable picture_count plus approved_submission_count, available-photo ranking, only thumbnail/processed signing, five-minute expiry, and exclusion of deleted/withdrawn/invalid-consent rows. Its safe image fields are submission_id, destination_id, media_type, status, signed_url, expires_at, like_count, dislike_count, and created_at. The app asks for covers with include_covers, pages with include_images, and viewer by submission_id; it consumes signed_url and expires_at. Publishing-status exclusion is a material product decision even though no current photo has that status. The existing version may expose signed originals; do not request include_images against original-only production rows for a contract probe.

Try read-only source export via Dashboard Edge Functions → wing-public-gallery → Download, saving the v2 zip outside the checkout. The connector export failed with ProtocolError and the isolated CLI download failed because it expected multipart but received application/octet-stream. Commit 74182f0 is a comparison baseline, **not proof** of deployed source. If export remains unavailable, collect v2 status/JSON/CORS/cache/error evidence from safe count-only requests and compare the prepared handler on equivalent isolated fixtures. Explicitly resolve all intended differences, including publishing eligibility. Verify errors and edge cases: anonymous POST/OPTIONS, wrong methods, invalid/duplicate IDs, 250-destination truncation, offset boundaries, empty results, unavailable assets, partial signing failures, pagination beyond 60, and latency. Verify the client accepts additive counts and safe image fields. No original URLs, paths, keys, or private metadata may appear in the new response. With no staging project, get a separately reviewed production canary/rollback decision before deploying.

This safe v2 probe requests **counts only**, without a key or image signing. Use one restaurant UUID already known to have an approved photo. Share only its status, response shape, and non-sensitive counts:

~~~~powershell
$destinationId = [guid]::Parse((Read-Host 'Known restaurant UUID for count-only probe').Trim())
$galleryUrl = 'https://vhfxnizaxdanmvmouuaf.supabase.co/functions/v1/wing-public-gallery'
$galleryBody = @{ destination_ids = @($destinationId.ToString()); include_images = $false } | ConvertTo-Json -Compress
$galleryResponse = Invoke-WebRequest -Uri $galleryUrl -Method Post -ContentType 'application/json' -Body $galleryBody -ErrorAction Stop
if ($galleryResponse.Content -match 'signed_url|originals/') { throw 'Unexpected image or original in count-only response' }
$galleryResponse.StatusCode
$galleryResponse.Headers['Content-Type']
$galleryResponse.Headers['Cache-Control']
$galleryResponse.Content
~~~~

Expected: HTTP 200, a row for that restaurant with picture_count and an empty images array, no original path or signed URL. Record CORS/cache headers separately if needed. This confirms only a narrow observed contract; it cannot resolve publishing-status behavior, error cases, or source differences by itself.

Only after v2 equivalence or documented acceptance, all intended photos recovered, Deno check and app contract tests passing, and a privacy-safe rollback agreed, run this **WRITE GATE; not executed**:

~~~~powershell
supabase functions deploy wing-public-gallery --project-ref vhfxnizaxdanmvmouuaf --workdir .\crawl --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Gallery deployment failed' }
supabase functions list --project-ref vhfxnizaxdanmvmouuaf --workdir .\crawl
~~~~

Expected: only wing-public-gallery advances beyond v2, remains active, and retains verify_jwt=false. Do not use --prune. Voting remains authenticated. Check cover, page, viewer, empty, and error responses, private-bucket denial, and 300-second URL expiry. Highest likes among **available approved** photos wins; fewer dislikes, earlier creation, then ID break ties. A missing winner must fall back to the next valid photo. Reject in-review, rejected, withdrawn, deleted-owner, consent-restricted, and video rows. Missing full processed assets must fail closed.

Run two real authenticated accounts on separate sessions/devices: like/unlike/dislike/switch, make a runner-up outrank the old cover, refresh after cache expiry, and reconcile vote rows and counts; try simultaneous votes and ensure account B cannot read or forge A's vote. Withdraw a controlled fixture through moderation and verify no new gallery/viewer URL or vote. Run Android Wingdex cover/gallery/viewer, load/expiry, pagination, empty state, Journey personal-photo visibility, upload/review, and rating regressions; iOS if available. The detailed sequence is in [the backend review](wingdex-photo-backend-review.md). Do not create a store build under this procedure.

## 7. Stop, rollback, and recovery

Stop on wrong project/hash/ledger, unexpected existing target objects, public bucket, missing dependency or grant, active legacy photo job, migration error, dry-run blocker, unexpected job ID, worker NO_JOB or nonzero result, changed approval/attribution/consent, absent original, missing/invalid derivative, missing receipt, new publishing job, or private-object access regression. After a migration error, inspect the ledger and target objects read-only before any retry.

Before **any** new photo job or receipt exists, schema rollback is possible only as a separately reviewed single transaction: confirm both new tables empty and no approval now relies on the new guard; drop four new triggers; restore the **exact saved** old enqueue_wing_processing_backlog definition; drop new RPCs/helpers and both empty tables without CASCADE; delete **only** ledger version 20261008171906; commit; then verify old function, grants, trigger set, and ledger. Do not use migration repair as if it undid SQL. If any job, receipt, or derivative exists, do **not** drop the queue or audit. Stop workers, preserve RLS and private Storage, diagnose, and deploy a reviewed forward fix. A failed or interrupted worker can leave private unattached artifacts; do not delete them while a lease or retry may still own them. Terminal retries require the explicit reviewed --retry-failed allowlist.

The following **conditional rollback template is a WRITE GATE and was not run**. It uses the backlog definition observed on 2026-10-08; compare it byte-for-byte in behavior with the definition saved immediately before application. If production has changed, replace the function body with that saved definition after review, or stop. It aborts if either audit table contains rows, or if the target ledger row is missing. Never run it after canary queueing.

~~~~powershell
$rollback = @'
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261008171906')
    OR EXISTS (SELECT 1 FROM public.wing_photo_derivative_jobs)
    OR EXISTS (SELECT 1 FROM public.wing_photo_derivative_receipts)
  THEN RAISE EXCEPTION 'wing_photo_rollback_has_history_or_jobs'; END IF;
END;
$guard$;
DROP TRIGGER wing_photo_upload_derivatives ON public.wing_media_submissions;
DROP TRIGGER wing_photo_approval_guard ON public.wing_media_submissions;
DROP TRIGGER wing_legacy_photo_job_guard ON public.wing_processing_jobs;
DROP TRIGGER wing_photo_receipt_append_only ON public.wing_photo_derivative_receipts;
CREATE OR REPLACE FUNCTION public.enqueue_wing_processing_backlog(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $old$
DECLARE v_inserted integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_backfill_limit'; END IF;
  WITH candidates AS (
    SELECT submission.id,submission.media_type,submission.correlation_id
    FROM public.wing_media_submissions submission
    WHERE submission.status IN ('uploaded','processing','in_review','approved')
      AND submission.processed_storage_path IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wing_processing_jobs job
        WHERE job.submission_id=submission.id
          AND job.job_kind=submission.media_type||'_process'
          AND job.status IN ('pending','claimed','retry','succeeded'))
    ORDER BY submission.created_at,submission.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  INSERT INTO public.wing_processing_jobs
    (submission_id,job_kind,generation,status,idempotency_key,correlation_id)
  SELECT candidate.id,candidate.media_type||'_process',
    coalesce((SELECT max(previous.generation)+1 FROM public.wing_processing_jobs previous
      WHERE previous.submission_id=candidate.id
        AND previous.job_kind=candidate.media_type||'_process'),1),
    'pending','process-review:'||candidate.id::text||':'||md5(now()::text),candidate.correlation_id
  FROM candidates candidate;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$old$;
DROP FUNCTION public.settle_wing_photo_derivative_job(uuid,uuid,boolean,boolean,text,text,text,text,text);
DROP FUNCTION public.begin_wing_photo_derivative_job(uuid,uuid);
DROP FUNCTION public.claim_wing_photo_derivative_job(text,integer,uuid);
DROP FUNCTION public.request_wing_photo_derivatives(uuid[],boolean,boolean,uuid);
DROP FUNCTION public.list_wing_photo_derivative_candidates(integer,integer);
DROP FUNCTION public.guard_wing_photo_approval();
DROP FUNCTION public.guard_legacy_wing_photo_job();
DROP FUNCTION public.enqueue_wing_photo_upload_derivatives();
DROP FUNCTION public.wing_photo_receipt_append_only();
DROP FUNCTION public.wing_photo_processing_blocker(uuid);
DROP TABLE public.wing_photo_derivative_receipts;
DROP TABLE public.wing_photo_derivative_jobs;
DELETE FROM supabase_migrations.schema_migrations WHERE version='20261008171906';
COMMIT;
'@
$rollbackFile = Join-Path $env:TEMP 'wingdex-photo-empty-queue-rollback-reviewed.sql'
[IO.File]::WriteAllText($rollbackFile,$rollback,[Text.UTF8Encoding]::new($false))
supabase db query --linked --file $rollbackFile --workdir .\crawl
if ($LASTEXITCODE -ne 0) { throw 'Rollback failed; inspect transaction state before retry' }
supabase db query --linked "select (select count(*) from supabase_migrations.schema_migrations where version='20261008171906') as ledger_rows,to_regclass('public.wing_photo_derivative_jobs') as jobs_table,to_regclass('public.wing_photo_derivative_receipts') as receipts_table,pg_get_functiondef('public.enqueue_wing_processing_backlog(integer)'::regprocedure) as backlog_definition" --workdir .\crawl
~~~~

Expected after a valid empty-queue rollback: ledger_rows 0, both table fields null, and the backlog definition again selects photo and video submissions. If any drop fails because another object depends on it, the transaction rolls back; do not add CASCADE. Review grants and the private bucket afterward.

If the new gallery fails, pause the new client surface and stop rollout. Do not blindly redeploy v2: its original fallback may violate the no-original-exposure requirement. Restore a saved v2 artifact only after a privacy decision. PITR is a coordinated last resort because it also affects unrelated writes.

## 8. Final GO / NO-GO checklist

- [ ] Correct project, live ledger, dependencies, bucket privacy, and migration hash verified.
- [ ] Backup/maintenance controls confirmed; old backlog source captured; no historical migration replay or repair.
- [ ] Candidate applied in one transaction with one ledger row; RLS, grants, indexes, triggers, RPCs, and advisors reviewed.
- [ ] Production worker configured without disclosing secrets; no unscoped photo schedule active.
- [ ] One canary dry run, explicit queue, scoped processing, private JPEG inspection, unchanged approval/original/attribution, and receipts passed.
- [ ] Remaining records reconciled individually in batches of at most three.
- [ ] V2 source obtained or contract-based equivalence accepted; publishing-status and original-fallback differences resolved.
- [ ] Prepared gallery, five-minute signing, ranking, moderation, two-account voting, private Storage, and Android regression checks passed.

An unchecked item is **NO-GO for its dependent write**. At document preparation, gallery deployment remains **NO-GO** because v2 source/equivalence and production canary evidence are outstanding.
