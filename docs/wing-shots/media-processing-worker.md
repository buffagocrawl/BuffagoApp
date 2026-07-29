# Wing Shot media-processing worker

The worker is a service-role process that claims one leased database job at a
time. It downloads the original through a 120-second signed URL, validates file
contents, creates metadata-free protected derivatives, removes video audio,
computes a non-biometric media fingerprint, calls an advisory moderation
provider, and atomically moves successful work to `in_review`. It never approves
or publishes a submission.

## Production configuration

Configure these values only in the worker's server-side secret store:

- `SUPABASE_URL`: production Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key. Never expose it through Expo,
  client environment variables, logs, or screenshots.
- `WING_MODERATION_PROVIDER_MODE=http`
- `WING_MODERATION_PROVIDER_URL`: HTTPS endpoint that implements the version 1
  multipart moderation contract.
- `WING_MODERATION_API_KEY`: bearer credential for that endpoint.
- `WING_MODERATION_MODEL`: provider model identifier.
- `WING_MODERATION_MODEL_VERSION`: immutable deployed model/prompt version.
- `WING_MODERATION_TIMEOUT_SECONDS`: 3–60 seconds; defaults to 30.
- `WING_PROCESSING_ENVIRONMENT=production`
- `WING_PROCESSING_WORKER_ID`: stable opaque worker identity, 3–120 characters.

The provider receives a field named `media`, an opaque filename, the selected
model/version, `schema_version=1`, and an explicit prohibition on facial
identification. It must return exactly the structured fields validated in
`wing_processing_worker/moderation.py`. Extra identity fields, missing safety
fields, invalid bounds, oversized JSON, non-JSON responses, and unversioned
results fail closed. No caption, user identity, restaurant, rating, storage
path, signed URL, or biometric template is sent.

Production startup fails with `MODERATION_PROVIDER_UNCONFIGURED` when the
HTTP provider URL, key, model, or version is absent. A deployment may instead
set `WING_MODERATION_PROVIDER_MODE=manual-review` to skip automated content
verdicts and route every successfully processed upload to human review. Do not
substitute the test adapter in production.

## Manual-review intake mode

For a human-reviewed launch, configure only:

```text
WING_MODERATION_PROVIDER_MODE=manual-review
WING_PROCESSING_ENVIRONMENT=production
WING_PROCESSING_WORKER_ID=<stable-worker-id>
```

This mode does not send media to an external moderation service and never
recommends acceptance. It still validates supported media, strips metadata,
creates protected derivatives, removes video audio, records duplicate signals,
and moves successfully processed uploads to `in_review`. Reviewers remain
responsible for rejecting unsafe, off-topic, duplicate, or otherwise unsuitable
submissions before approval.

## Non-production adapter

Local contract tests can use:

```text
WING_MODERATION_PROVIDER_MODE=manual-review-test
WING_PROCESSING_ENVIRONMENT=test
WING_PROCESSING_ALLOW_TEST_PROVIDER=true
```

That adapter has no key and always returns an uncertain/manual-review result.
It cannot recommend acceptance. The CLI rejects it when the environment is
`production` or the explicit allow flag is missing.

## Validation and execution

From `Agents/Jalapeno`:

```powershell
python wing_processing_worker_main.py --validate-config
python wing_processing_worker_main.py --once
python wing_processing_worker_main.py --drain 25
python wing_processing_worker_main.py --cleanup-once
python wing_processing_worker_main.py --cleanup-drain 25
```

`--validate-config` makes no claim and mutates no database state. `--once`
processes at most one leased job. `--drain` is capped at 100 and stops when the
queue is empty.

Cleanup-only commands do not require the external moderation provider, so an AI
provider outage cannot block privacy retention. They still require the
service-role Supabase configuration.

The migration automatically enqueues future finalized submissions and
backfills at most 100 older eligible rows during deployment. Operators can
repeat the bounded, idempotent backfill until it returns zero:

```sql
select public.enqueue_wing_processing_backlog(100);
```

## Failure and retry behavior

- Malformed, unsupported, oversized, or otherwise unsafe media is permanent
  and dead-lettered.
- Timeouts, rate limits, provider 5xx responses, Storage interruptions, and
  unavailable media binaries are retryable.
- Database-owned attempt counts and exponential availability delays bound
  retries. Exhausted jobs become `dead`, and the submission becomes `failed`.
- A missing live moderation provider fails closed and cannot leave content
  approved or publishable.
- Uploaded derivatives use deterministic protected paths. Retries may replace
  those derivatives, but originals remain immutable.
- Success is accepted only after the database verifies both primary and
  thumbnail objects exist at the exact expected paths.

## Retention and cleanup

Original media defaults to 30 days of retention from finalization. The
server-owned `wing_moderation_config.original_retention_days` setting can be
changed from 1 to 90 days after privacy/legal review. It is not client writable.
The cleanup enqueuer operates in bounded batches and covers:

- expired originals after a protected derivative exists, or after the
  submission is failed, rejected, or withdrawn; and
- objects attached to upload intents that have remained unfinalized for at
  least one hour after their reservation expired.

Only exact `originals/{user UUID}/{submission UUID}/source` paths can enter the
cleanup queue. Processed, thumbnail, and publication assets are not cleanup
targets. A missing object is a successful idempotent outcome. Each deletion,
missing-object result, retry, and dead letter creates an append-only receipt
containing an MD5 path correlation hash rather than the private path itself.

## Provider validation checklist

1. Deploy migration `20260729133000_wing_processing_worker_contract.sql`.
2. Put all secrets in the server-side worker secret store.
3. Run `python wing_processing_worker_main.py --validate-config`; require
   `{"status":"CONFIGURATION_VALID"}`.
4. Submit a synthetic non-private photo and run `--once`.
5. Confirm the job is `succeeded`, the submission is `in_review`, the original
   bucket remains private, and no moderation automatically approved it.
6. Submit a synthetic clip with a known audio track, run the worker in an
   FFmpeg-equipped environment, and verify `ffprobe` reports no audio stream in
   the protected processed output.
7. Revoke the test credential and rotate it immediately if it appears in any
   terminal capture or log.

Production AI moderation remains
`CODE_COMPLETE_EXTERNAL_VALIDATION_REQUIRED` until the real endpoint, key, and
model/version are configured and a non-private canary is reviewed by a human.
