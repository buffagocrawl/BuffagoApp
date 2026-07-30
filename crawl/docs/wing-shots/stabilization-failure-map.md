# Wing Shot stabilization failure map (non-production)

## Current transition map

`rating saved -> modal -> permission -> selection -> local validation -> staging authorization -> private staging upload -> authoritative validation -> idempotent reservation -> promotion -> finalization -> success`

The UI now treats this as one uploader operation. Storage paths, ownership, reservation, promotion, and finalization remain server-controlled; the client retains only the correlation/idempotency session needed to retry safely.

## Confirmed regressions

1. `wing-media-stage-authorize` returned 401 inside the function. The gateway was configured with `verify_jwt = false` so the handler could return a controlled JSON error. The handler then called `auth.getUser()` without passing the request bearer explicitly; the server client had no caller session. The client also did not explicitly dispatch the refreshed access token on retry. The fix parses `Authorization`, calls `auth.getUser(token)`, and sends the exact refresh response token once.
2. `wing-media-promote` looked up the reservation in `wing_media_submissions`, but reservation creates `wing_submission_upload_intents`. The promotion request therefore failed ownership/state lookup after a successful reservation. Promotion now uses the reserved intent contract and remains idempotent.
3. `finalize_wing_submission_upload` checked `storage.objects.owner_id = auth.uid()`. The destination object is copied by `wing-media-promote` using its service-role Storage client, so that metadata is not the mobile caller's user ID even when the object exists at the reserved path. This produced `P0001: uploaded_object_not_found`; it was not an eventual-consistency race. The finalizer now receives the exact canonical Storage response and checks it against the authenticated user's immutable reservation. A tightly scoped definer helper verifies only the matching `wing-submissions/originals/<auth.uid()>/<submission-id>/source` object; it does not expose arbitrary Storage rows.

## Failure points and recovery

- Permission, unreadable, unsupported, duration, dimensions, and size failures are permanent media failures and require a new selection.
- Authentication failures refresh once; a second 401 becomes `authentication_required` and does not loop.
- Network, timeout, 429, and 5xx failures are retryable and preserve the selected media and staged object.
- Reservation and finalization use the existing idempotency keys and submission intent. A retry must finalize or promote the existing intent rather than create another one.
- Cleanup is best-effort for user cancellation/permanent validation failure. Garbage collection fails closed if it cannot determine active reservations and never removes an active reserved correlation.

## Validation source of truth

Client limits are in `lib/wingShotLimits.js` and `lib/wingShots.js`; server limits are mirrored in `wing-media-validate`. Current limits are 20 MiB photos, 50 MiB videos, 3–10 second videos, and maximum edge 2048 photos / 4096 video. The server additionally checks the downloaded object bytes and declared size, MIME, basic media signature, and ownership/path shape.

Production remains disabled. No deployment or migration was executed by the stabilization pass.
