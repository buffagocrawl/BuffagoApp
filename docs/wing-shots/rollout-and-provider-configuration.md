# Wing Shots rollout and external configuration

Wing Shots ships fail-closed. The application can accept no media and publish
nothing until the database flags and runtime gates are deliberately enabled.
Scheduled GitHub Actions runs remain dry-run even when the product surfaces are
enabled. A live run additionally requires the manual workflow confirmation
phrase, per-platform gates, human approval on each publishing job, and valid
provider configuration.

## Deployment order

1. Verify the Strategy B database prerequisites and the canonical migration
   manifest.
2. Apply the Wing Shots migrations in timestamp order.
3. Deploy `wing-media-preview` and `delete-account`.
4. Deploy the processing worker with private network/secret access and FFmpeg.
5. Run processing, image, synthetic-audio-removal, RLS, and clean-night skip
   validation in the target environment.
6. Enable the moderation queue for staff and validate reviewer authorization.
7. Enable prompt/photo upload for a small deterministic rollout. Keep video
   upload disabled until target-environment FFmpeg evidence passes.
8. Enable Creator history, notifications, and leaderboard after reward and
   privacy receipts have been inspected.
9. Run the nightly workflow in dry-run and approve generated community-derived
   previews.
10. Enable each Meta platform independently only after its real provider
    validation succeeds.
11. Enable automatic nightly selection last.

All rows in `engagement_feature_flags` whose keys start with `wing_shot_`
default to `enabled = false, rollout_percent = 0`. Change them through the
existing privileged feature-flag administration path; clients have read-only,
server-derived rollout decisions.

## Runtime configuration

Processing worker secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WING_MODERATION_PROVIDER_URL`
- `WING_MODERATION_API_KEY`
- `WING_MODERATION_MODEL`
- `WING_MODERATION_MODEL_VERSION`

Processing worker non-secret controls include
`WING_MODERATION_PROVIDER_MODE`, `WING_MODERATION_TIMEOUT_SECONDS`,
`WING_PROCESSING_ENVIRONMENT`, and a unique `WING_PROCESSING_WORKER_ID`.
Production fails closed when the AI provider is not configured or returns an
invalid structured result. The service-role key must never use an `EXPO_PUBLIC_`
name or enter a mobile build.

Nightly publishing secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_LONG_LIVED_ACCESS_TOKEN`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `FACEBOOK_PAGE_ID`

Nightly repository variables:

- `META_GRAPH_API_VERSION` — explicitly validated for live mode; no implicit
  live default
- `WING_SHOTS_LIVE_PUBLISHING_ENABLED`
- `WING_INSTAGRAM_PUBLISHING_ENABLED`
- `WING_FACEBOOK_PUBLISHING_ENABLED`

Meta production validation still requires the BuffaGo app and business assets
to have the current permissions for Instagram professional-account publishing
and Facebook Page publishing, a valid Page/account linkage, app review or
business verification where Meta requires it, and a durable token-lifecycle
procedure. Reconfirm those requirements against Meta's current official
documentation at activation time. Repository tests do not constitute Meta
approval.

Mobile public configuration:

- `EXPO_PUBLIC_BUFFAGO_INSTAGRAM_URL`
- `EXPO_PUBLIC_BUFFAGO_INSTAGRAM_DEEP_LINK`
- `EXPO_PUBLIC_BUFFAGO_FACEBOOK_URL`
- `EXPO_PUBLIC_BUFFAGO_FACEBOOK_DEEP_LINK`

The social reward is intentionally a one-time **Visited BuffaGo on
Instagram/Facebook** badge. It is not a verified-follow claim.

## Validation commands

From the repository root:

```powershell
cd crawl
npm run migration:integrity
npm run typecheck
npm run lint -- --quiet
node --test --experimental-default-type=module tests/*wing*.test.mjs tests/wing*.test.mjs
npm run security:scan
cd ..\Agents\Jalapeno
python -m pytest tests/test_wing_media_processing.py tests/test_wing_processing_worker.py tests/test_wing_processing_repository.py tests/test_wing_shots_orchestration.py tests/test_wing_shots_publishers.py
python -m scheduling.community_schedule_guard validate --mode dry-run
```

Before live Meta activation, validate each platform separately with an approved,
previously unposted test submission and preserve the sanitized job attempt,
external post ID, and permalink receipt. A dry-run receipt must never be
presented as provider success.

## Rollback

1. Set all `wing_shot_*` feature flags to `enabled = false,
   rollout_percent = 0`.
2. Set all three workflow live variables to `false`.
3. Leave the nightly workflow in dry-run or disable its schedule while
   investigating.
4. Allow active processing leases to expire; do not delete job, moderation,
   reward, notification, or administrative audit records.
5. Withdraw or fail unposted jobs through server-authoritative transitions.
6. Revoke compromised Meta or moderation credentials at the provider, then
   rotate GitHub/runtime secrets.
7. Keep the private bucket private. Do not restore the legacy fabricated-media
   workflow or make historical Jalapeño buckets public.

The SQL rollback notes in each migration are operational guidance, not an
instruction to destructively reverse audit-bearing tables.

## External validation classification

Until real target-environment evidence exists, the following remain
`CODE_COMPLETE_EXTERNAL_VALIDATION_REQUIRED`:

- Meta app review/business permissions and token lifecycle
- Instagram professional-account publishing
- Facebook Page publishing
- production AI moderation model/endpoint behavior
- production push provider delivery
- app-store privacy disclosure and legal/counsel approval of consent wording

