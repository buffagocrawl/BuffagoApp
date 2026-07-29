# Mango Habanero

Mango Habanero is BuffaGo's local Wing Shot human-review desk. It reads the existing `wing_media_submissions` workflow through service-only Supabase RPCs, creates short-lived previews from the private `wing-submissions` bucket, records reviewer transitions, and manages the single next-publish priority used by Jalapeño.

## Setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `MANGO_REVIEWER_ID`. The reviewer UUID must have an active `wing_reviewer` or `wing_admin` row in `public.app_user_roles`.
4. Apply the migrations in `crawl/supabase/migrations` in the repository's normal Supabase order, including `20260729170000_mango_habanero_review_dashboard.sql` and `20260729171000_mango_habanero_jalapeno_priority_selection.sql`.
5. Run `Start Mango Habanero.bat`.

The UI is `http://127.0.0.1:4317`. The service-only API listens on `http://127.0.0.1:4318`; neither binds to other interfaces.

## Workflow

Pending cards use the existing `in_review` state. Approve transitions to `approved`; reject transitions to `rejected` with a structured existing Wing Shots rejection category plus the reviewer note. The original upload is never deleted or moved. Approved, unposted cards can be made the one database-enforced `is_publish_priority`; posted or otherwise ineligible rows automatically lose that flag. Jalapeño selects that priority first, then chooses randomly from the complete eligible approved pool.

## Troubleshooting

- “Could not reach Mango Habanero”: check both child terminal windows, confirm Node is installed, and press Retry.
- “wing_reviewer_role_required”: verify `MANGO_REVIEWER_ID` is a UUID with an active `wing_reviewer` or `wing_admin` role.
- “No preview media”: processing has not produced a private derivative yet; the card will show processing warnings returned by the existing worker tables.
- A migration fails on a pre-existing object: compare migration history and apply only the missing forward migration; do not make `wing-submissions` public.
- If the browser opens before the API is ready, wait for the API window to log `startup_succeeded`, then refresh.

## Security notes

The service-role key is read only by `server/index.mjs`; Vite receives no secret environment variables and the key is not placed in `dist`. Preview URLs are generated on demand, expire within the configured short window, and are sent with `Cache-Control: no-store`. The API exposes only localhost and all dashboard mutations use service-role-only RPCs that validate the configured reviewer role.
