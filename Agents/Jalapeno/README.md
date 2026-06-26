# Jalapeno

Jalapeno is Buffago’s first reusable agent and the Instagram-specific foundation for the broader Buffago Agent Platform.

Phase 1 covered project setup, config loading, and safe simulation.

Phase 2 adds the database and logging foundation:

- Supabase-backed audit tables
- structured run logging
- dry-run support
- retry-ready post tracking
- prompt and workflow version tracking
- cost and metrics scaffolding
- conservative RLS posture

This phase does not implement content generation or Instagram publishing yet.

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

Future content and Meta integration secrets remain separate:

- `OPENAI_API_KEY`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_LONG_LIVED_ACCESS_TOKEN`

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

Stores metric snapshots over time.

Stores:

- likes, comments, shares, saves
- reach, impressions, profile visits, follows
- engagement rate
- raw metric payload
- capture time

### `jalapeno_settings`

Stores agent configuration in the database so behavior is not hardcoded.

Seeded keys:

- `posting_enabled`
- `dry_run`
- `instagram_enabled`
- `buffago_post_time`
- `meme_post_time`
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

## Lifecycle

### Run lifecycle

1. A run starts in `jalapeno_runs` with `status=started`.
1. Candidates are added to `jalapeno_post_candidates`.
1. The selected candidate is linked back to the run.
1. The final post is created in `jalapeno_posts`.
1. Errors are written to `jalapeno_errors` whenever a meaningful failure occurs.
1. The run is completed or failed with timestamps and duration.

### Publish lifecycle

1. A post is drafted in `jalapeno_posts`.
1. The post moves through `image_generated`, `scheduled`, `publishing`, `published`, `failed`, or `skipped`.
1. Each retry increments `retry_count`.
1. Post publish responses and Instagram IDs are stored on the post row.
1. Metrics snapshots are appended to `jalapeno_post_metrics`; existing rows are never overwritten.

## Dry-Run Behavior

- Dry-run is the default in `jalapeno_settings`.
- Validation and local simulation must not publish to Instagram.
- Dry-run logs and DB rows are still created so the audit trail stays realistic.

## Retry Model

- Retry metadata lives on the post and error rows.
- `max_retries` is read from `jalapeno_settings`.
- Errors marked retryable can be retried without losing prior attempts.

## Validation

Run the Phase 2 validation path:

```powershell
python main.py --validate
```

Validation checks:

- required environment variables exist
- Supabase connectivity works
- Jalapeno tables exist
- required settings exist
- dry-run is enabled by default
- storage bucket is configured
- a validation run can be inserted and completed
- no Instagram publish call is made

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, validation fails early.

## Commands

Validate configuration and environment:

```powershell
python main.py --validate
```

Run a local dry-run:

```powershell
python main.py --dry-run
```

Run the simulated Phase 1 workflow:

```powershell
python main.py --test
```

Run the safe production placeholder:

```powershell
python main.py --production
```

Run the test suite on Windows:

```powershell
python -m pytest
```

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

## Logging

Logs are written to `logs/jalapeno.log` and printed to the console.

Structured log events are emitted for:

- run started
- settings loaded
- candidate generation started and completed
- candidate selected
- caption generated
- image prompt generated
- image generated
- image uploaded
- Instagram upload started and completed
- metrics collection started and completed
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
