# Jalapeño Approved Queue runbook

Jalapeño now reads only Mango Habanero's `wing_media_submissions` Approved
Queue. The service-role RPC claims one consented, approved video with
`FOR UPDATE SKIP LOCKED`, consuming `is_publish_priority` (`Make Next`) at the
claim boundary. The fallback order is `priority`, `approved_at`, `created_at`,
and UUID. Expiring generation and platform leases remain recoverable through
the existing worker/publisher RPCs.

## Required GitHub configuration

Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_LONG_LIVED_ACCESS_TOKEN`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `FACEBOOK_PAGE_ID`

Repository variables:

- `META_GRAPH_API_VERSION` (explicit version such as `v23.0`)
- `WING_SHOTS_LIVE_PUBLISHING_ENABLED` (false until live validation)
- `WING_INSTAGRAM_PUBLISHING_ENABLED`
- `WING_FACEBOOK_PUBLISHING_ENABLED`
- `JALAPENO_AUTOMATION_ENABLED` (false initially)

## Manual dry run

Open Actions → **Jalapeño — Publish Approved Wing Shot** → Run workflow.
Choose `mode=dry_run` and `platform=both`. Optionally provide an approved
submission UUID. The action downloads the private processed derivative created
from the original, validates it, renders a muted vertical MP4, writes private
publication assets, and uploads a receipt artifact. No provider call, posted
transition, reward, badge, or notification is created.

## Manual publish

After reviewing a dry-run receipt, rerun the same workflow with
`mode=publish`, select `both` (or one platform), and keep the same optional
submission UUID if needed. The existing unique `(submission_id, platform)`
constraint and provider result settlement prevent reposting a platform that
already succeeded.

## Scheduled enablement

Apply and validate the migrations, configure both provider adapters, run a
manual dry run and a controlled manual publish, then set
`JALAPENO_AUTOMATION_ENABLED=true`. The scheduled event uses the identical
command and is limited by the workflow concurrency group and the database's
America/New_York daily receipt.

The repository currently has no verified Meta Place ID mapping or live
location-lookup adapter. Until one is configured, the restaurant and city/state
remain prominent in captions and the location state must be reported as
`no_match`/`caption_fallback`; no weak provider tag is sent.
