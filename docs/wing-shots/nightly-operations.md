# Wing Shots nightly operations

## Active schedule

`.github/workflows/jalapeno-schedule.yml` is the only Jalapeño content schedule.
It runs approved community Wing Shots daily at `17 5 * * *` (05:17 UTC), away
from the top-of-hour congestion window. Scheduled runs are always dry-run.

The workflow has no fabricated `buffago` or `video` content choice. It calls
only:

```text
python wing_shots_main.py --business-date YYYY-MM-DD
```

Manual live mode adds `--live`, but four independent controls must also pass:

1. The exact dispatch confirmation is
   `PUBLISH_APPROVED_COMMUNITY_WING_SHOTS`.
2. `WING_SHOTS_LIVE_PUBLISHING_ENABLED=true`.
3. At least one platform publishing variable is enabled and that platform's
   Meta configuration is present.
4. Each live platform job has a recorded human approval in the database.

The database remains authoritative for nightly/business-date locking,
selection idempotency, job leasing, publication attempts, rewards, and
notifications. A `SKIPPED_NO_APPROVED_CONTENT` result creates a receipt and
does not claim a platform job, generate fallback media, reuse a prior post, or
call Meta.

## Safe workflow receipts

The entrypoint's stdout is captured only in the ephemeral runner directory. A
guard process parses it and writes a whitelisted `nightly-receipt.json`.
Unparsed stdout, stderr, signed URLs, storage paths, captions, access tokens,
and provider request payloads are not uploaded. Receipts are retained for 14
days and include the GitHub run ID and attempt.

An entrypoint or receipt-validation failure fails the workflow after the safe
receipt upload. The workflow never converts a provider failure into success.

## Activation

Keep the nightly and publishing flags disabled until all steps are complete:

1. Deploy the Wing Shots migrations and private `wing-submissions` bucket.
2. Deploy and validate the processing and branded-generation workers.
3. Confirm generated assets remain protected and every original video produces
   a muted publication derivative.
4. Enable `wing_shot_generation` and the moderation queue for internal users.
5. Set `wing_moderation_config.nightly_enabled=true` while keeping
   `publishing_dry_run=true`.
6. Configure GitHub secrets:
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
7. Run a manual dry-run and inspect the database and artifact receipt.
8. Configure Meta, obtain per-platform human approval, then enable only each
   platform that has passed provider validation. A disabled platform remains
   independently dry-run and cannot corrupt the enabled platform's result.
9. Set GitHub variables:
   `WING_SHOTS_LIVE_PUBLISHING_ENABLED`,
   `WING_INSTAGRAM_PUBLISHING_ENABLED`, and/or
   `WING_FACEBOOK_PUBLISHING_ENABLED` to `true` only for validated platforms.
   Set
   `META_GRAPH_API_VERSION` explicitly to the currently provider-validated
   `vNN.N` version; live mode has no silent version fallback.
10. Set `META_LONG_LIVED_ACCESS_TOKEN` and the account secret for each enabled
    platform: `INSTAGRAM_BUSINESS_ACCOUNT_ID` and/or `FACEBOOK_PAGE_ID`.
11. Manually dispatch live mode with the exact confirmation phrase. Database
    platform flags and per-job human approval remain mandatory.

Validate repository-side configuration locally without printing values:

```powershell
python -m scheduling.community_schedule_guard validate --mode dry-run
```

Run this from `Agents/Jalapeno` with test-only environment values.

## External provider requirements

Production provider validation remains incomplete until BuffaGo has:

- a Meta app approved for the required Instagram Graph and Facebook Page
  publishing permissions;
- a linked Instagram professional account and Facebook Page;
- a production long-lived token with the correct asset access;
- correct account/Page IDs;
- an operational token-expiration and renewal process;
- production terms, privacy disclosures, and media takedown procedures.

Repository tests and dry-runs do not establish that Meta accepted a real post.

## Legacy retirement

`Agents/Jalapeno/main.py` retains historical metrics and reporting readers, but
its production, image-pipeline-live, Instagram-publish-live, validation,
simulation, legacy dry-run generation, and strategy-write modes fail with an
explicit retirement message. `--content-type` is no longer a valid CLI
argument.

Supported historical/read-only operations remain:

- `--metrics` and metrics diagnostics;
- `--daily-report`;
- `--weekly-report`;
- `--growth-report`;
- `--recommend-strategy`;
- `--caption-samples`.

Historical tables, reports, metrics, and publication records are preserved.
They are never selected as Wing Shot candidates or reused as fallback media.

## Rollback

1. Set `wing_shot_automatic_nightly_selection`,
   `wing_shot_instagram_publishing`, and
   `wing_shot_facebook_publishing` to disabled.
2. Set `wing_moderation_config.nightly_enabled=false` and
   `publishing_dry_run=true`.
3. Disable the GitHub schedule or repository Actions workflow.
4. Allow active leases to expire and use the server recovery RPC before a
   forward fix.
5. Preserve nightly receipts, platform attempts, moderation decisions, admin
   actions, and historical legacy records.

Rollback must not re-enable the fabricated AI image/video workflow.
