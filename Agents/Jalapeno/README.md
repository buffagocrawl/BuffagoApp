# Jalapeno

Jalapeno is Buffago's reusable Instagram agent and the foundation for the broader Buffago Agent Platform.

Phase 1 covered project setup, config loading, and safe simulation.

Phase 2 adds the database and logging foundation:

- Supabase-backed audit tables
- structured run logging
- dry-run support
- retry-ready post tracking
- prompt and workflow version tracking
- cost and metrics scaffolding
- conservative RLS posture

Phase 5 adds the AI generation bridge through Supabase Edge Functions. Jalapeno never reads an OpenAI key locally; Supabase owns that secret server-side.

The new Content Decision Engine sits on top of that foundation and behaves like a human social media manager:

- brainstorms multiple ideas
- scores them with configurable weights
- checks the last 30 published Instagram posts for duplication
- applies content-memory bonuses and penalties
- selects a winner with freshness and variety in mind
- generates the final caption, hashtags, alt text, and image prompt
- stores the full decision trail for future analytics

Phase 6 adds the Image Asset Pipeline:

- generates an image from the selected winner's final `image_prompt`
- validates the file and Instagram crop targets
- formats feed and square variants
- optionally applies the Buffago mascot as subtle branding
- uploads the final asset to Supabase Storage
- stores the public URL back on the image asset and decision records
- cleans up temporary files after successful upload

Phase 7 adds the Instagram Publishing Pipeline:

- loads the approved Phase 7 winner and the Phase 8 public image URL
- defers manual approval in the current MVP and auto-approves production publishes
- creates an Instagram media container through the Graph API
- polls the container until it is ready to publish
- publishes only when Instagram is explicitly enabled and dry-run is off
- fetches the published permalink and media metadata
- stores retry state, failure metadata, and a final report

Phases 12-14 turn Jalapeno into a fuller Instagram content operator:

- collects Instagram performance snapshots for published posts
- ties metrics back to creative metadata such as category, prompt reason, image style, CTA, hashtags, restaurant, state, models, and costs
- builds a recent performance context before new content decisions
- improves image prompts with stricter Buffago visual direction and one quality-regeneration pass
- persists failure context and action-required states
- generates daily and weekly admin reports and emails them through Resend when configured

## Prompt Library

Buffago brand, voice, and reusable prompt instructions live in standalone markdown files at the repository root:

- `prompt_library/brand.md`
- `prompt_library/voice.md`
- `prompt_library/content_rules.md`
- `prompt_library/banned_phrases.md`
- `prompt_library/required_ctas.md`
- `prompt_library/prompts/buffago_post.md`
- `prompt_library/prompts/meme.md`
- `prompt_library/prompts/image_generation.md`
- `prompt_library/prompts/caption_cleanup.md`
- `prompt_library/prompts/quality_review.md`

Jalapeno loads these files dynamically at runtime, and `python main.py --validate` fails fast if any prompt file is missing.

### Buffago Image Prompt Style

Jalapeno image prompts use `content_engine/visual_prompt_style.py` as the shared visual style system. It keeps Buffago images cinematic, comedic, wing-focused, and non-stock by combining a reusable visual style block, rotating camera and scene variants, visual comedy beats, action cues, recurring character archetypes, and strict no-text-in-generated-image guardrails.

Adjust future image direction in that module first. The local content engine stores `visual_style`, `camera_angle`, `scene_type`, `comedy_beat`, `character_archetype`, `wing_focus_level`, and `prompt_version` in candidate metadata without requiring a database migration.

## Setup

Use Python 3.12.

```powershell
cd Agents/Jalapeno
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Environment

Create `.env` from `.env.example`.

Phase 1 structural values:

- `FACEBOOK_PAGE_ID`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`

Phase 2 database values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional runtime override:

- `TIMEZONE`

Optional AI backend overrides:

- `JALAPENO_AI_FUNCTION_URL`
- `JALAPENO_AI_FUNCTION_TOKEN`

Meta integration secrets remain separate:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_LONG_LIVED_ACCESS_TOKEN`

Optional report delivery:

- `REPORT_EMAIL_TO`
- `REPORT_EMAIL_FROM`
- `RESEND_API_KEY`

If report email config is missing, Jalapeno still generates and stores reports, then prints a console warning that email delivery is disabled.

## Database Tables

### `jalapeno_runs`

One row per agent execution.

Stores:

- run identity and lifecycle
- trigger source
- post type
- agent, workflow, and prompt versions
- model names
- token counts and estimated cost
- dry-run flag
- metadata
- publish status and publish failure metadata

### `jalapeno_post_candidates`

Stores every generated candidate, not only the final winner.

Stores:

- candidate number
- idea and reasoning
- caption and hashtags
- image prompt and storage details
- raw AI payloads
- scoring fields
- selection and rejection details

### `jalapeno_posts`

Stores the selected or scheduled post.

Stores:

- chosen idea and generated caption
- media fields
- schedule and publish timestamps
- publish status
- approval metadata for deferred manual-approval support
- retry count
- Instagram IDs and permalink
- publish response payload

### `jalapeno_errors`

Stores every meaningful error with stage-level context.

Stores:

- run, post, and candidate references
- stage
- error type
- stack trace
- raw payload
- retryability
- resolution state

### `jalapeno_post_metrics`

Stores historical metric snapshots over time. Rows are appended, not overwritten.

Stores:

- likes, comments, shares, saves
- reach, impressions, profile visits, follows
- engagement rate
- collected/captured timestamp
- post age in hours and days
- published timestamp
- caption, category, prompt template, prompt reason, image prompt, image style, hashtags, CTA type, generation model, image model, cost metadata, topic, restaurant, and state metadata
- raw metric payload

### `jalapeno_performance_summaries`

Stores daily/weekly learning and report summaries.

Stores:

- summary type
- report period
- generated run reference
- JSON summary containing best/worst posts, categories, image styles, CTA types, costs, and recommendations

### `jalapeno_report_logs`

Stores generated admin reports and delivery state.

Stores:

- report type
- subject and body
- period start/end
- delivery status
- optional recipient
- metadata such as duration and email status

### `jalapeno_content_candidates`

Stores every candidate from the Content Decision Engine.

Stores:

- candidate identity and content type
- working title and summary
- target emotion and CTA
- image concept and caption angle
- theme, mood, hook, and source-signal metadata
- duplicate score and weighted total
- rejection details
- score breakdown and metadata

### `jalapeno_content_decisions`

Stores the final decision record for a content-engine run.

Stores:

- winner and runner-up candidate IDs
- decision summary
- model, token, and cost metadata
- platform flag
- optional image asset link fields for the uploaded URL, storage path, and upload timestamp

### `jalapeno_image_assets`

Stores the generated and formatted image asset for a selected content winner.

Stores:

- run and candidate references
- local temp path and formatted output paths
- bucket, storage path, and public URL
- image type, content type, dimensions, aspect ratio, format, and file size
- branding and meme formatting flags
- image prompt, image source, prompt version, prompt quality, generation time, and image model
- validation, upload, and cleanup state
- optional JSON metadata for source details, validation issues, cost estimates, and stage durations

Schema note: `20260701000200_jalapeno_image_asset_payload_columns.sql` is an additive backfill migration for the complete image asset insert payload. It uses `ADD COLUMN IF NOT EXISTS`, keeps newly introduced optional columns nullable, and preserves existing rows.

### `jalapeno_video_assets`

Stores manually uploaded Supabase Storage videos for the daily 8:00 PM Instagram Reel.

Stores:

- storage bucket and storage path
- optional public URL override
- style and caption type hints
- active flag
- used count and last used timestamp
- optional performance score and notes

The `20260701000400_jalapeno_video_assets.sql` migration creates the `jalapeno-wing-videos` public bucket, creates this table, and adds video linkage columns to post, Instagram publish, and metrics tables.

### `jalapeno_instagram_posts`

Stores the publishing attempt for the final post, including current MVP auto-approval metadata.

Stores:

- run, candidate, and optional post references
- container ID and container status
- safe request payload and raw response payload
- published media ID and permalink
- caption, hashtags, alt text, image URL, and content type
- publish status, failure metadata, retry count, and timestamps

### `jalapeno_content_memory`

Stores structured long-term memory for published posts.

Stores:

- post identity, platform, and publish time
- themes, moods, emotions, and CTA metadata
- restaurants, cities, states, food categories, holidays, and sports references
- hook style, hashtags, image style, and caption metrics
- later performance metrics such as likes, comments, shares, saves, reach, impressions, engagement rate, and follower growth

### `jalapeno_content_performance`

Stores post-performance snapshots for future learning.

Stores:

- likes, comments, shares, saves
- reach, impressions, engagement rate, and follower growth
- raw metric payload and capture time

### `jalapeno_settings`

Stores agent configuration in the database so behavior is not hardcoded.

Seeded keys:

- `posting_enabled`
- `dry_run`
- `instagram_enabled`
- `buffago_post_time`
- `meme_post_time`
- `video_post_time`
- `video_recent_reuse_days`
- `timezone`
- `text_model`
- `image_model`
- `temperature`
- `max_candidates`
- `max_retries`
- `prompt_version`
- `workflow_version`
- `default_hashtag_count`
- `default_image_size`
- `storage_bucket`
- `metrics_collection_enabled`

The image pipeline also reads these config sections from `config.yaml`:

- `image.default_aspect_ratio`
- `image.default_width`
- `image.default_height`
- `image.square_width`
- `image.square_height`
- `image.temp_dir`
- `image.output_format`
- `image.quality`
- `branding.enabled`
- `branding.logo_path` (defaults to the Buffago mascot PNG at `crawl/assets/wing-user.png`)
- `branding.placement`
- `branding.opacity` (defaults to a subtle 12% mascot opacity)
- `branding.margin_px`
- `branding.max_width_percent`
- `branding.border_enabled`
- `branding.accent_color`
- `branding.label_text` (kept for backward-compatible config parsing but not rendered)
- `storage.provider`
- `storage.bucket`
- `storage.video_bucket`
- `storage.public`
- `cleanup.cleanup_temp_files`
- `cleanup.keep_failed_images`
- `instagram.enabled`
- `instagram.dry_run`
- `instagram.ig_user_id_secret_name`
- `instagram.access_token_secret_name`
- `instagram.api_version`
- `instagram.quality_threshold`
- `publishing.container_poll_max_attempts`
- `publishing.container_poll_wait_seconds`
- `publishing.container_poll_timeout_seconds`
- `publishing.publish_max_retries`
- `publishing.retry_backoff_seconds`
- `publishing.retryable_error_codes`
- `publishing.fail_run_on_publish_failure`
- `notifications.enabled`
- `notifications.channels.console`
- `notifications.channels.email`
- `notifications.channels.webhook`

## Lifecycle

### Run lifecycle

1. A run starts in `jalapeno_runs` with `status=started`.
1. Candidates are added to `jalapeno_post_candidates`.
1. The selected candidate is linked back to the run.
1. The final post is created in `jalapeno_posts`.
1. Errors are written to `jalapeno_errors` whenever a meaningful failure occurs.
1. The run is completed or failed with timestamps and duration.

### Content decision lifecycle

1. The engine loads the prompt library, snapshot, external context, and content memory.
1. It generates 5 to 10 candidate ideas.
1. It scores every candidate with configurable category weights.
1. It compares each candidate against the previous 30 posts and rejects near duplicates.
1. It applies memory-based diversity bonuses and repetition penalties.
1. It chooses a winner and runner-up.
1. It generates the final caption package, hashtags, alt text, and image prompt.
1. It stores every candidate and the final decision record.
1. Published winners later feed the long-term memory store.

### Publish lifecycle

1. A post is drafted in `jalapeno_posts`.
1. The post moves through `image_generated`, `scheduled`, `publishing`, `published`, `failed`, or `skipped`.
1. Each retry increments `retry_count`.
1. Post publish responses and Instagram IDs are stored on the post row.
1. Metrics snapshots are appended to `jalapeno_post_metrics`; existing rows are never overwritten.

### Instagram publishing lifecycle

1. Load the approved Phase 7 winner and the Phase 8 public image URL.
1. In the current MVP, defer manual approval and auto-approve production publishes before the publish step.
1. Reject the publish if quality threshold, caption, image URL, dry-run, or test-mode checks fail.
1. Create one Instagram media container per auto-approved post.
1. Poll the container until it reaches `FINISHED`, or fail safely on `ERROR`, `EXPIRED`, or timeout.
1. Publish the container only once and skip republishing when a media ID already exists.
1. Fetch the published permalink when available.
1. Store the publish attempt in `jalapeno_instagram_posts`, carry approval metadata forward, and update the run with failure metadata when publishing fails.
1. Write a final publish report for every attempt.

## Dry-Run Behavior

- Dry-run is the default in `jalapeno_settings`.
- Validation and local simulation must not publish to Instagram.
- Dry-run logs and DB rows are still created so the audit trail stays realistic.
- The content decision engine also supports a dry-run path that writes the decision artifact without posting.
- Instagram publishing is disabled by default for direct/local publisher calls with `instagram.enabled=false` and `instagram.dry_run=true`.
- Production mode uses the resolved runtime settings as the source of truth: `--production` with `JALAPENO_DRY_RUN=false` resolves `instagram_enabled=true`, `posting_allowed=true`, and `meta_api_allowed=true`.
- Validation, test, dry-run, and manual workflow dispatch with `publish=false` still resolve `dry_run=true` and cannot publish.
- Validation simulates container creation and publish flow without calling live Instagram endpoints.
- `--daily-report` and `--weekly-report` can generate reports without email if Resend config is absent.
- `--metrics` reads Instagram Graph API metrics but never publishes.

## Retry Model

- Retry metadata lives on the post and error rows.
- `max_retries` is read from `jalapeno_settings`.
- Errors marked retryable can be retried without losing prior attempts.
- Publish retries are guarded by `run_id`, `candidate_id`, `container_id`, and `published_media_id` so the same media is not posted twice.

## Validation

Run the full validation path:

```powershell
python main.py --validate
```

Validation checks:

- required environment variables exist
- the prompt library exists and is readable
- Supabase connectivity is used when configured
- a read-only internal data snapshot is generated
- the snapshot is written to `data/latest_snapshot.json`
- fallback data is used when Supabase is unavailable or activity is low
- external context is generated for the day and written to `data/latest_external_context.json`
- a daily cache is written to `data/external_context_YYYY-MM-DD.json`
- safe holiday, sports, trend, and food-holiday signals are logged
- one sample AI text output is generated through Supabase or safe fallback content
- one sample AI image prompt is generated through Supabase or safe fallback content
- brand validation runs through the same AI bridge
- usage metadata is written to `data/ai_usage_latest.json`
- sample AI output is written to `data/latest_ai_output.json`
- the content decision engine runs a dry-run and writes `data/latest_content_decision.json`
- all decision-engine modules load successfully
- the image pipeline modules load successfully
- the image pipeline can render, validate, and format a local dry-run image without uploading it
- no live Instagram publish endpoint is called
- the Instagram publishing modules import successfully
- required publishing config keys exist
- configured secrets can be read without logging their values
- dry-run blocks publishing
- a fake approved post passes prechecks
- the current MVP auto-approval path can continue to publish without manual approval
- a fake publish can be simulated without calling live endpoints
- retry logic does not create duplicate publishes
- report generation works
- required Jalapeno tables exist or are reported as missing
- OpenAI or Jalapeno AI backend availability is reported
- Meta credentials and Instagram/Facebook IDs are reported
- report email config is reported as configured or disabled
- metrics collector dependencies are importable
- recent performance context can be built
- daily and weekly reports can be generated in dry-run-safe mode
- fallback/temp content path is available

To run the same validation without calling the AI backend:

```powershell
python main.py --validate --skip-ai
```

To rebuild the external context cache for the current day:

```powershell
python main.py --validate --refresh-external-context
```

## Content Decision Engine Workflow

The reusable content engine is platform-agnostic, but Jalapeno currently uses it for Instagram planning.

1. Load Buffago prompt guidance, snapshot data, external context, content memory, and recent performance context.
1. Generate 5 to 10 candidate ideas across post types such as restaurant spotlight, hidden gem, meme, challenge, leaderboard, and community highlight.
1. Score each candidate with the configurable weighting model.
1. Compare every candidate against the last 30 published posts and reject near duplicates.
1. Apply memory-based bonuses and penalties to favor diversity.
1. Prefer working categories/image styles/CTA patterns and penalize weak recent image styles.
1. Select a winner and runner-up using both score and human-style editorial judgment.
1. Generate the final caption package.
1. Generate 10 to 15 hashtags with branded, local, wing-specific, and restaurant-specific coverage.
1. Generate accessibility alt text.
1. Generate the final image prompt.
1. Persist all candidates and the decision record.
1. Save the published-memory record later when the post actually goes live.

The engine uses configurable weights in `content_engine/decision_config.json`, so future tuning does not require code changes.

## Metrics And Learning

Run metrics collection:

```powershell
python main.py --metrics
```

Metrics behavior:

- collects snapshots for posts published around 24 hours old
- collects snapshots again around 72 hours old
- refreshes all published posts from the last 30 days
- stores historical snapshots in `jalapeno_post_metrics`
- computes engagement rate from likes, comments, saves, shares, and reach/impressions
- detects token/auth failures and returns an action-required status instead of retrying forever
- logs rate limit events and defers safely

Before each content decision, Jalapeno builds a learning context from recent snapshots:

- best/worst posts from 7, 30, and 90 days
- best/worst categories
- best/worst image styles
- best CTA types and hashtag patterns
- duplicate topics to avoid
- strong and weak creative patterns

That context is stored in the decision summary and used by local scoring so future posts can favor working patterns, avoid recent duplicates, avoid poor image styles, and explain the content direction.

## Admin Reports

Generate a daily report:

```powershell
python main.py --daily-report
```

Generate a weekly report:

```powershell
python main.py --weekly-report
```

Daily reports include:

- runs in the last 24 hours
- posts generated, published, skipped, and failed
- recent metric highlights and best available post
- cost and token summary
- recommended adjustment for the next run

Weekly reports include:

- generated and published post tables
- failures
- best and worst posts
- best/worst categories, image styles, and CTA types
- engagement and cost summary
- recommended adjustments for the next week

Email delivery uses Resend when `REPORT_EMAIL_TO`, `REPORT_EMAIL_FROM`, and `RESEND_API_KEY` are present. Without those settings, the report is still generated and stored in `jalapeno_report_logs`.

## Failure Handling

Jalapeno handles common failures explicitly:

- missing Supabase data falls back to safe local snapshot content where existing snapshot code supports it
- OpenAI/image generation failures retry once with a stronger prompt where practical
- invalid image output fails before publishing and logs `image_quality_review_completed`
- Meta token/auth errors log `token_expired_detected` and mark action required
- Instagram publish failures persist safe payload metadata and do not mark posts as published
- duplicate content logs `duplicate_content_detected` and blocks or penalizes similar candidates
- rate limits log `rate_limit_retry`
- run failures persist failure metadata on `jalapeno_runs` and `jalapeno_errors`

## AI Model Configuration

Jalapeno keeps model selection centralized in `config.yaml` under `ai.models`.

- Production image generation defaults to `gpt-image-2` for the OpenAI Image API.
- Development, validation, and dry-run image generation also use `gpt-image-2`.
- Text generation keeps separate production and development routes.
- Image pipeline logs include the configured `image_model`.

## Image Asset Pipeline Workflow

The image asset pipeline reuses the Phase 7 winner and runs as a separate stage.

1. Load the selected winner from the content decision output.
1. Load the prompt library image-generation instructions.
1. Generate the image from the winner's final `image_prompt`.
1. Save the generated file to the configured temp directory.
1. Validate file existence, size, format, dimensions, aspect ratio, and corruption safety.
1. Format the image for Instagram feed output and square fallback output.
1. Apply the Buffago mascot PNG as a subtle lower-right watermark when branding is enabled.
1. Skip branding with a warning, rather than failing the run, if the configured mascot asset cannot be loaded.
1. Apply meme-specific top and bottom text formatting for meme content.
1. Upload the final feed image to Supabase Storage when uploads are enabled.
1. Persist the image asset row and link the public URL back to the winning decision.
1. Clean up temporary files after successful upload, or retain failures when configured.

Supabase Storage setup:

- Create the `jalapeno-assets` bucket before enabling uploads.
- Keep the bucket public if you want direct public URLs.
- The storage path format is `instagram/{yyyy}/{mm}/{dd}/{run_id}/{filename}`.

Supabase video Reel setup:

- Apply `supabase/migrations/20260701000400_jalapeno_video_assets.sql`.
- Upload Reel-ready video files to the `jalapeno-wing-videos` bucket, or set `JALAPENO_VIDEO_BUCKET` to the bucket you want to use.
- Add rows to `public.jalapeno_video_assets` with `storage_bucket`, `storage_path`, `active=true`, and optional `style` / `caption_type` hints.
- If the table is empty, validation and dry-run will warn clearly; the agent can auto-register root-level video files from the configured bucket.
- Reuse is avoided for `JALAPENO_VIDEO_RECENT_REUSE_DAYS` when enough active inventory exists.

## Content Memory

The long-term memory layer tracks published post structure so future runs can avoid repetition and learn what to emphasize.

The memory store records:

- post type and primary/secondary themes
- mood and target emotion
- restaurants, cities, states, food categories, holiday references, sports references, and current events
- hook style, CTA category, and specific CTA
- hashtags, image style, composition, caption length, emoji count, and question usage
- later performance metrics such as likes, comments, shares, saves, reach, impressions, engagement rate, and follower growth

The memory layer is intentionally reusable by future Buffago agents on TikTok, Facebook, Threads, X, LinkedIn, and beyond.

## Commands

Validate configuration, environment, snapshot, external context, and AI setup:

```powershell
python main.py --validate
```

Run a local dry-run:

```powershell
python main.py --dry-run
```

Run a Buffago dry-run with the same `POST_TYPE` selection used by the scheduler:

```powershell
$env:POST_TYPE="buffago"; python main.py --dry-run
```

Run a Reel/video dry-run with the same `POST_TYPE` selection used by the scheduler:

```powershell
$env:POST_TYPE="video"; python main.py --dry-run
```

Run the simulated Phase 1 workflow:

```powershell
python main.py --test
```

Run a safe validation that does not publish:

```powershell
python main.py --validate
```

Run a safe validation that also skips the AI backend:

```powershell
python main.py --validate --skip-ai
```

Run the live Buffago production publish flow:

```powershell
$env:POST_TYPE="buffago"; python main.py --production
```

Run the live Supabase video Reel production publish flow:

```powershell
$env:POST_TYPE="video"; python main.py --production
```

Run the live Instagram publish flow:

```powershell
python main.py --instagram-publish-live
```

Collect metrics for recent published posts:

```powershell
python main.py --metrics
```

Generate reports:

```powershell
python main.py --daily-report
python main.py --weekly-report
```

Run the test suite on Windows:

```powershell
python -m pytest
```

If Windows temp permissions block pytest, use a workspace temp base:

```powershell
New-Item -ItemType Directory -Force .\tmp | Out-Null
$env:TMP="$PWD\tmp"; $env:TEMP="$PWD\tmp"
python -m pytest .\tests -q -p no:cacheprovider --basetemp=.\tmp\jalapeno_pytest
```

## GitHub Actions Schedule

The production scheduler lives at `.github/workflows/jalapeno-schedule.yml`.

GitHub Actions scheduled workflows do not support `America/New_York` directly in this workflow format. Cron expressions are interpreted in UTC, so daylight saving time is not handled automatically by GitHub here.

Current UTC cron entries in the workflow:

- `0 20 * * *` for the scheduled 4:00 PM Eastern Daylight Time Buffago publish
- `0 0 * * *` for the scheduled 8:00 PM Eastern Daylight Time Supabase video Reel publish

When Eastern Standard Time resumes, update those cron entries to:

- `0 21 * * *` for 4:00 PM Eastern Standard Time
- `0 1 * * *` for 8:00 PM Eastern Standard Time

Time conversion reference:

- During daylight time, 4:00 PM ET = 20:00 UTC
- During daylight time, 8:00 PM ET = 00:00 UTC next day
- During standard time, 4:00 PM ET = 21:00 UTC
- During standard time, 8:00 PM ET = 01:00 UTC next day

Workflow behavior:

- Scheduled 4:00 PM ET runs set `POST_TYPE=buffago` and call `python main.py --production`
- Scheduled 8:00 PM ET runs set `POST_TYPE=video` and call `python main.py --production`
- Manual dispatch exposes a required `post_type` choice with valid values `buffago` and `video`
- Manual dispatch defaults `publish=false`, which runs `python main.py --dry-run`
- Manual dispatch can opt into live publishing by setting `publish=true`, which runs `python main.py --production`
- Current MVP production runs auto-publish and do not wait for manual approval

Workflow logging:

- logs the run source as `schedule` or `workflow_dispatch`
- logs the resolved `POST_TYPE`
- logs whether the run is dry-run or production
- logs the GitHub workflow run ID
- logs explicit `status=success` or `status=failure`

Required GitHub secrets:

- `FACEBOOK_PAGE_ID`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_SECRET`
- `META_LONG_LIVED_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- optional report secrets: `REPORT_EMAIL_TO`, `REPORT_EMAIL_FROM`, `RESEND_API_KEY`

Notes on secret mapping:

- `INSTAGRAM_BUSINESS_ACCOUNT_ID` is both a Jalapeno-required environment variable and the value used for the Instagram publishing target
- Scheduled production and manual live publishing set `JALAPENO_DRY_RUN=false` in the workflow; no separate `JALAPENO_INSTAGRAM_ENABLED` secret is required.
- `SUPABASE_SERVICE_ROLE_KEY` is also reused as the default Jalapeno AI function token when `JALAPENO_AI_FUNCTION_TOKEN` is not separately set
- No real secret values should be committed to the repository

## Inspecting Data

Use the Supabase SQL editor or table browser to inspect recent activity:

```sql
select *
from public.jalapeno_runs
order by started_at desc
limit 20;
```

```sql
select *
from public.jalapeno_errors
order by created_at desc
limit 20;
```

Useful follow-up queries:

- recent selected candidates from `jalapeno_post_candidates`
- latest published posts from `jalapeno_posts`
- metric history from `jalapeno_post_metrics`
- engine candidates from `jalapeno_content_candidates`
- decision history from `jalapeno_content_decisions`
- memory history from `jalapeno_content_memory`

## Logging

Logs are written to `logs/jalapeno.log` and printed to the console.

Structured log events are emitted for:

- run started
- settings loaded
- candidate generation started and completed
- candidate scored
- candidate rejected as duplicate
- candidate selected
- caption generated
- hashtags generated
- alt text generated
- image prompt generated
- image generated
- image pipeline started
- image prompt loaded
- image generation started
- image generation completed
- image generation failed
- image saved temp
- image validated
- image resized
- branding applied
- branding skipped
- meme format applied
- image uploaded
- image URL saved
- temp cleanup completed
- image pipeline failed
- Instagram upload started and completed
- publish pipeline started and completed
- publish precheck started, passed, and failed
- media container create started, created, and failed
- container status check started, checked, ready, failed, and timeout
- publish started, succeeded, and failed
- permalink fetch started, saved, and failed
- publish retry scheduled, started, skipped, succeeded, and failed
- run marked publish failed
- publish report created
- publish notification sent and failed
- metrics collection started and completed
- metrics_collection_failed
- metrics_snapshot_persisted
- performance_context_built
- image_quality_review_started
- image_quality_review_completed
- image_regeneration_triggered
- duplicate_content_detected
- fallback_content_used
- email_report_generated
- email_report_sent
- email_report_failed
- weekly_summary_generated
- failure_alert_required
- rate_limit_retry
- token_expired_detected
- content memory loaded and analyzed
- theme rotation detected
- diversity bonus applied
- theme penalty applied
- CTA penalty applied
- restaurant penalty applied
- winner selected
- content saved
- run completed
- run failed

Every log includes as much context as is available at that stage, including:

- `run_id`
- `agent_name`
- `post_type`
- `stage`
- `status`
- `duration_ms`
- `dry_run`
- `model_name`
- `image_model_name`
- `image_model`
- `branding_enabled`
- `branding_asset_path`
- `branding_asset_loaded`
- `branding_position`
- `branding_scale`
- `prompt_version`
- `workflow_version`
- `estimated_cost`
- `candidate_id`
- `post_id`
- `instagram_media_id`

## Platform Note

Jalapeno is Agent #1 in the Buffago Agent Platform.
The table and helper naming convention is intentionally reusable for future agents:

- `<agent>_runs`
- `<agent>_settings`
- `<agent>_errors`
- agent-specific tables as needed
