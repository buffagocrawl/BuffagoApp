# Wingdex photo experience

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

Current consolidation branch: `feat/wingdex-gallery-zoom-voting`. This document includes earlier implementation evidence from `feature/wingdex-photo-voting`; its historical test counts and screenshots are not current device certification. No gallery deployment, vote migration, or store build was performed during consolidation.

## Implementation

Both Wingdex routes use the shared restaurant gallery. Tapping a thumbnail opens a dark, full-screen native Modal with a close button, position, Like/Dislike totals, and selected-vote styling. Controls sit outside the image. The viewer signs and loads the selected processed asset; it does not preload the restaurant's full-size images.

Zoom uses pinned `react-native-zoom-toolkit@5.1.1` with the repository's React Native Gesture Handler, Reanimated, and Worklets versions. `ResumableZoom` handles pinch, pan, double tap, bounds, and reset, with a clamped 1–4× range. Its pan callbacks allow horizontal photo navigation only when the gesture begins and ends at 1×. Changing photos resets zoom. Explicit Previous/Next controls provide an additional navigation option. Crossing a gallery page boundary loads the next page and then opens its first new photo.

The existing `wing-public-gallery` Edge Function remains the private-media access boundary. Its source now retrieves metadata for batches of up to 250 destinations, pages metadata in groups of 1,000, and signs selected paths in batches of 100. It filters `media_type = 'photo'`, `status = 'approved'`, and requires a processed path. Cards request one ranked cover per destination; gallery pages request up to 60 thumbnails; the viewer requests one submission's processed asset. Thumbnail signing can fall back to the processed asset. Original assets are never selected or returned. Bucket permissions and five-minute signed URL protection are unchanged.

Cover and gallery ordering is `like_count DESC, dislike_count ASC, created_at ASC, id ASC`. This selects C in the requested A/B/C example and gives deterministic zero-like and tie behavior. There is no stored `cover_photo_id`. Covers refresh on returning to Wingdex, closing the gallery, and periodically while the screen is focused. The card uses the current Wingdex design system and retains readable restaurant names and scores. Empty cards and galleries use BuffaGo branding and a first-photo CTA, with no stock restaurant photography.

Own-vote reads select only `submission_id,vote`, filter `user_id` to the user returned by `supabase.auth.getUser()`, and batch submission IDs in groups of 250. Mutations use a composite-key upsert for a like/dislike and a submission/user-filtered delete for removal. The authenticated user supplies the mutation identity; account changes are checked. There is no owner exclusion or vote weighting.

A synchronous per-submission lock prevents duplicate taps before React updates disabled controls. Counts and selection update optimistically after authentication is checked; a failed mutation restores the previous state. The app never writes aggregate counters. Successful mutations reconcile totals through the protected media function. Request versions prevent a delayed reconciliation from overwriting a newer vote. Delayed media callbacks cannot blank a different selected photo, and account changes cannot publish a previous account's selection.

Signed assets are revalidated before expiry and when the app returns to the foreground. Failed media requests, withdrawn/deleted submissions, and failed vote reads/mutations show a controlled error with Retry. Pagination errors are visible inside the viewer. Guests can view counts and receive “Sign in to vote on photos” when tapping a vote.

## Deployment dependency discovered

A read-only check against the deployed gallery returned image keys `submission_id,signed_url` only. The existing RPC also permits additional publishing statuses, omits vote counters, ranks by recency, and can fall back to an original object. The voting schema supplied by the user was not recreated or modified. The compatibility fix is confined to the existing Edge Function source.

The prepared `wing-public-gallery` update must be released with the app change before live covers, totals, and processed viewer assets can work. The old deployed function does not support `include_covers` or the viewer's `submission_id` request. Live authenticated voting, winner changes, and persistence across restart remain unverified. No deployment was attempted because the task explicitly prohibits deployment.

## Verification

Final automated command:

```powershell
node --test --experimental-default-type=module tests/wingdex-photo-server.test.mjs tests/wingdex-photo-viewer.test.mjs tests/wingdex-gallery-device.test.mjs tests/wingdex-gallery-contract.test.mjs tests/wingdex-photo-voting.test.mjs tests/image-workflow-mobile-runtime.test.mjs tests/wingShotsSecurity.test.mjs tests/wingShotsAccountDeletion.test.mjs tests/journey-photo-device.test.mjs
```

Result: **68 tests passed, 0 failed**. Coverage includes all six vote transitions, rollback, duplicate interactions, authenticated identity, own-vote batching, deterministic covers and zero-like ties, eligibility, empty state, thumbnail selection, close/back, navigation, zoom reset/pan navigation suppression, pagination/retry, delayed image callbacks, delayed counter reconciliation, account switches, and batched selection/signing for 250 restaurants. Existing media workflow, security, account cleanup, and Journey photo regression tests also pass.

`npm run typecheck`: passed. Targeted ESLint: zero errors; eight existing warnings in the active Wingdex route. New viewer, gallery, photo helpers, and the legacy Wingdex route have no lint warnings.

Android smoke results used the installed BuffaGo development client and the local Expo bundle on `emulator-5554`:

| Check | Result |
| --- | --- |
| Open Wingdex and restaurant detail | Passed against live read-only data |
| Zero-photo restaurant card | Passed: Filomena's Pizzeria, branded first-photo CTA |
| Zero-photo gallery | Passed: “Be the first to add a photo” |
| One-photo restaurant, Photos affordance and thumbnail | Passed: J Timothy's Tavern |
| Full-screen viewer opens and closes | Passed; live old-function response shows controlled unavailable state |
| Aspect ratio, pinch, pan, double tap, reset | Passed with temporary local branded fixtures |
| Zoomed pan does not switch photos | Passed with local fixtures |
| Swipe at 1× and reset on changing photos | Passed with local fixtures |
| Guest Like tap explains sign-in requirement | Passed with local fixtures |
| Authenticated Like/Unlike/Dislike/switch and per-photo state | Automated tests passed; live smoke pending |
| Winning live cover after votes | Pending updated gallery function and authenticated session |
| Restart and confirm persisted Supabase vote | Pending authenticated live smoke |
| iOS gestures | Not tested: no iOS environment available |

The temporary fixture route was removed and the app restarted afterward. Fixtures used the existing BuffaGo logo and mascot, did not represent restaurant wings, and did not write production votes or ratings. Android evidence is in `artifacts/wingdex-photos/`: `android-empty-card.png`, `android-empty-gallery.png`, `android-zoom.png`, and `android-pinch.png`.

## Files changed for this task

- `app/(tabs)/ratings/index.jsx`: batched covers, cover refresh, shared gallery, first-photo CTA; preserves concurrent card layout edits.
- `app/ratings/index.jsx`: shared gallery, ranked cover display and periodic refresh.
- `components/WingdexPhotoGallery.jsx`: tappable thumbnails, totals, branded empty state, pagination and viewer integration.
- `components/WingdexPhotoViewer.jsx`: new zoomable viewer and voting UI.
- `lib/wingdexGallery.js`: batched cover request and selected processed-photo retrieval.
- `lib/wingdexPhotos.js`: ranking, optimistic voting, mutation lock and private own-vote reads.
- `types/wingdexPhotos.ts`: approved photo and `1 | -1 | null` vote types.
- `supabase/functions/wing-public-gallery/index.ts`: strict eligibility, ranking, aggregate response fields and batch signing.
- `package.json`, `package-lock.json`: pinned zoom dependency.
- `tests/wingdex-gallery-contract.test.mjs`, `tests/wingdex-gallery-device.test.mjs`: updated gallery/security contracts and thumbnail/viewer coverage.
- `tests/wingdex-photo-voting.test.mjs`, `tests/wingdex-photo-viewer.test.mjs`, `tests/wingdex-photo-server.test.mjs`: new vote, viewer, race and server/performance coverage.
- `docs/wingdex-photo-experience.md`: this handoff.
- `artifacts/wingdex-photos/`: local Android smoke evidence.
