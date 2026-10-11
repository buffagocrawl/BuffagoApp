# Mango Habanero

Mango Habanero is BuffaGo's local Wing Shot human-review desk. It reads the existing `wing_media_submissions` workflow through service-only Supabase RPCs, creates short-lived previews from the private `wing-submissions` bucket, records reviewer transitions, and manages the single next-publish priority used by Jalapeño.

## Setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `MANGO_REVIEWER_ID`. The reviewer UUID must have an active `wing_reviewer` or `wing_admin` row in `public.app_user_roles`.
4. Set `MANGO_PYTHON_EXECUTABLE` to an absolute path to a trusted Python executable with `Agents/Jalapeno/requirements.txt` installed. Use forward slashes in `.env`, for example `C:/Users/Brand/AppData/Local/Programs/Python/Python312/python.exe`. The launcher validates imports without claiming jobs. Existing backend review and photo-derivative contracts must already be available; this fix requires no migration or deployment.
5. Run `Start Mango Habanero.bat`.

The UI is `http://127.0.0.1:4317`. The service-only API listens on `http://127.0.0.1:4318`; neither binds to other interfaces.

The `.bat` launcher pins the API to port 4318, and Vite requires port 4317 rather than silently choosing another port. Open `http://127.0.0.1:4317` after restarting both Mango processes. Frontend API URLs remain relative (`/api/...`); the development proxy preserves the browser's Host so it matches Origin at the API's local same-origin guard. Forwarded headers do not authorize requests. A foreign Origin, mismatched local Origin, or foreign Host remains rejected.

## Workflow

Pending cards use the existing `in_review` state. Approve transitions to `approved`; reject transitions to `rejected` with a structured existing Wing Shots rejection category plus the reviewer note. The original upload is never deleted or moved. Approved, unposted cards can be made the one database-enforced `is_publish_priority`; posted or otherwise ineligible rows automatically lose that flag. Jalapeño selects that priority first, then chooses randomly from the complete eligible approved pool.

Load the private original preview, review it, and click **Approve** once. That click explicitly submits `standard_acceptable` with the audit note “Original photo reviewed and acceptable.” Mango validates the configured reviewer and current submission on the server. Ready photos skip processing. Otherwise Mango runs only `--photo-once --photo-submission-id <selected UUID> --photo-review-only` using production manual-review mode, shows **Preparing photo…**, verifies successful settlement, canonical paths, required objects and blockers, then shows **Approving…** while calling `mango_review_wing_submission`. Success refreshes the queue. Rejection requires a category and at least eight characters of notes and never invokes processing.

Preparation runs only after an explicit approval click. There is no backlog recovery, startup processing, publishing invocation, approval daemon, or automatic approval after restart. The worker receives credentials through an isolated server-side environment, never arguments or output. One worker runs per Mango server at a time; per-submission request locks and backend leases protect concurrent requests. Worker execution is limited to two minutes and 64 KiB of discarded output. Backend requests time out after 20 seconds.

If a response is interrupted, refresh and click again to reconcile current state. Confirmed matching reviewer decisions with the exact moderation audit receipt are returned without another moderation call. Prepared media is reused if approval failed. Active leases (normally five minutes) and backend retry schedules must finish before another preparation attempt. Dead/cancelled jobs or a succeeded job with missing objects require operator attention; Mango never resets attempts or clears blockers. A concurrent rejection, consent change, or other blocker prevents approval; the existing backend guards remain the final authority.

Photo derivatives are insert-only. Existing objects must have the correct JPEG metadata, size and exact bytes of the current metadata-stripped transform of the selected original. This intentionally conservative check may reject derivatives generated with a different Pillow/encoder version. Incompatible objects are preserved and reported as `EXISTING_DERIVATIVE_INCOMPATIBLE`; Mango never overwrites or deletes them. Partial retries regenerate locally to verify compatibility, reuse matching objects and upload only missing objects. Social publishing and its existing callers are unchanged.

## Troubleshooting

- “Could not reach Mango Habanero”: check both child terminal windows, confirm Node is installed, and press Retry.
- “wing_reviewer_role_required”: verify `MANGO_REVIEWER_ID` is a UUID with an active `wing_reviewer` or `wing_admin` role.
- “No preview media”: processing has not produced a private derivative yet; the card will show processing warnings returned by the existing worker tables.
- A migration fails on a pre-existing object: compare migration history and apply only the missing forward migration; do not make `wing-submissions` public.
- If the browser opens before the API is ready, wait for the API window to log `startup_succeeded`, then refresh.

## Security notes

The service-role key is read only by `server/index.mjs`; Vite receives no secret environment variables and the key is not placed in `dist`. Preview URLs are generated on demand, expire within the configured short window, and are sent with `Cache-Control: no-store`. The API exposes only localhost and all dashboard mutations use service-role-only RPCs that validate the configured reviewer role.

## Local validation

Run `npm test` and `npm run build` in this directory. Tests use isolated Supabase/storage fixtures and mock fetch responses to render and exercise the actual React UI in jsdom; they do not load `.env`. For manual browser verification with invented data only, run `npm run build` followed by `node tests/mockUi.mjs`, then open `http://127.0.0.1:4327`. This fixture never creates a Supabase client or invokes a worker.
