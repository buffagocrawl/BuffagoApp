# Phase 5 Wing Jury service contract

Status: Phase 7B.2.5 feed hardening and real PostgreSQL validation underway; release remains blocked, not deployed. `ENABLE_WING_JURY` defaults to `false`; when disabled, the client service performs no Supabase or Edge Function call. Later amendments below supersede earlier implementation assumptions.

## Pre-vote feed

Client service: `crawl/lib/wingJuryService.js`, `getWingJuryPhotoBatch`.

Edge Function: `wing-jury-feed`.

Request body:

```json
{
  "latitude": 41.7,
  "longitude": -72.6,
  "cursor": null,
  "limit": 12,
  "judged_submission_ids": ["guest-session-photo-id"]
}
```

Latitude/longitude are optional and are rejected by the trusted boundary when outside valid ranges. `judged_submission_ids` is session-local guest state only. Authenticated judged-photo exclusion is performed server-side from `wing_jury_votes`.

Response:

```json
{
  "ok": true,
  "photos": [
    {
      "submission_id": "uuid",
      "signed_url": "https://...",
      "media_type": "photo",
      "expires_at": "timestamp"
    }
  ],
  "has_more": true,
  "next_cursor": "opaque-cursor",
  "location_fallback": false
}
```

The pre-vote response intentionally excludes restaurant ID/name/address, restaurant ratings, saved-list state, vote counts, owner identity, storage paths, and precise restaurant coordinates. Guest blind judging is a UI/privacy boundary, not cryptographic secrecy from a client that can access other public Buffago data.

The trusted feed filters approved public photo submissions, canonical processed assets, live storage objects, valid consent, non-deleted owners, and non-withdrawn media. It includes approved photos uploaded by the current user when they satisfy the same public rules. Phase 7B.2.5 uses full-catalog server-side eligibility and keyset ordering with bounded result transfer/signing and an opaque cursor; no destination window or geographic radius limits eventual discovery.

## Permanent authenticated vote

Client service: `recordWingJuryVerdict`.

Edge Function: `wing-jury-vote`.

Request:

```json
{ "submission_id": "uuid", "vote": -1 }
```

The trusted function derives the user from the bearer token, revalidates photo eligibility, and inserts into `public.wing_jury_votes` through the authenticated client boundary. The Phase 2B primary key `(submission_id, user_id)` and immutable grants prevent duplicates, updates, and deletes. A duplicate returns `existing_vote: true` with the original verdict; it never overwrites a conflicting verdict. Vote counts come from the separate `wing_jury_photo_vote_counts` trigger and only `+1` contributes to `like_count`.

Guest verdicts never call `wing-jury-vote`. `createGuestJurySession` retains judged IDs and temporary verdicts in memory only. Guest verdicts never affect public counts or analytics persistence.

## Post-vote reveal

Client service: `getWingJuryReveal`.

Edge Function: `wing-jury-reveal`.

Authenticated requests require an existing permanent vote for the submission. Guest requests require the local session verdict signal and do not create a database vote. The response includes the canonical restaurant identity/details, the specific photo’s Wing Jury `+1` count, existing Wingdex average rating, the current user’s latest rating if authenticated, Favorite/Want to Try state, and `save_action` (`favorite`, `want_to_try`, or `sign_in_to_save`). Gallery votes and Wingdex restaurant ratings are never combined with Wing Jury photo Likes.

## Errors and lifecycle

The service exposes stable error codes including `FEATURE_DISABLED`, `FEED_UNAVAILABLE`, `INVALID_PHOTO`, `INVALID_VOTE`, `VOTE_FAILED`, `EXISTING_VOTE`, and `REVEAL_UNAVAILABLE`. Phase 6 should offer retry/next/close behavior and clear the in-memory guest session on game close or account transition. `clearWingJurySession` is the shared cleanup operation.

## Deployment dependency

The Edge Functions and staged Phase 2B SQL must be deployed together only after Phase 2A historical migration reconciliation, full PostgreSQL/Supabase validation, security review, and explicit release authorization. The repository has not deployed these functions or enabled the flag.

## Phase 7B.2 trusted-boundary amendments

Verdicts must be JSON numbers exactly `-1`, `0`, or `1`. Missing/null values, booleans, strings, arrays, objects, fractions and other numbers fail without writes. The Edge boundary validates UUID photo identifiers; submitted account identifiers never determine ownership. Authenticated votes insert with the verified caller JWT, never the service credential. Ambiguous failures can retry: an existing row returns its original immutable verdict. Neutral persists and excludes a judged photo; only `+1` counts as a Jury Like. Gallery counters and restaurant ratings remain separate.

Feed accepts an object body, integer limit 1–24 (default 12), at most 500 UUID guest exclusions, and a cursor of at most 4096 characters. Location is a complete pair of finite JSON numbers in latitude/longitude ranges; absent pairs use nonlocation ordering and real zero coordinates remain valid. Explicit malformed pairs fail with `invalid_location`.

The cursor is base64 ciphertext encrypted and authenticated with AES-GCM, using a key derived from the server-only service credential with a versioned context. It expires after 15 minutes and is bound to the verified account (or public guest context) and exact coordinate pair. It carries no plaintext account or restaurant identifier. Invalid, expired, tampered or changed-context cursors return HTTP 400 `invalid_cursor`; account/location changes restart pagination. Credential rotation invalidates existing cursors. Cursor protection supplements current eligibility and owner checks; it grants no access.

The previous 250-destination/500-photo candidate-window defect is superseded by the Phase 7B.2.5 contract below. Production-scale query plans and actual Supabase runtime compatibility still require verification.

Two service-role-only read RPCs are staged locally:

- `public.is_public_wing_jury_photo(p_submission_id uuid) -> boolean`: approved photo with current consent/public attribution, live owner, no withdrawal and canonical processed object whose Storage metadata is active and not a delete marker. Edge reads invoke it before signing and recheck after signing. Database vote validation checks the same predicate while holding eligibility metadata row locks through commit.
- `public.wing_jury_restaurant_rating_summary(p_destination_id uuid) -> jsonb`: `{average_weight_score, rating_count}` across all nonnull canonical `weight_score` rows, without returning individual rating owners. Null scores are excluded from the mean/count; this does not change the saved-list rule that any persisted personal rating qualifies.

Both RPCs have fixed trusted search paths and EXECUTE revoked from PUBLIC, anon and authenticated; only service_role can call them. Their definer context reads private catalogs/ratings without exposing them as client APIs. All four feature tables have RLS and explicit effective ACL normalization. Private lists require the verified nonanonymous owner; votes have no ordinary UPDATE/DELETE/TRUNCATE privilege, with trigger defense against permanent verdict edits. Auth-user deletion is the supported cascade exception, and count deltas run in its transaction. Rating INSERT/UPDATE/DELETE reconciles lists under shared ordered identity locks, preserving a Favorite until its last qualifying rating disappears. Real independent-session locking still needs PostgreSQL verification.

Signed-out `AuthSessionMissingError` is guest state; other authentication errors remain errors. Anonymous-auth identities are guest players: local verdicts/exclusions, no permanent vote or list access. UI/service callers capture account identity and request generation; account transitions discard guest verdicts, photos, cursors, personal ratings, reveal/save state and stale asynchronous results. Jury requests pin the captured access token so a queued A request cannot silently execute as B. Guest sign-in intents are claimed once by a verified account and replay must match that account, with server eligibility checked again.

All responses use `Cache-Control: no-store`; CORS declares POST/OPTIONS. Local gateway configuration allows public feed/reveal with `verify_jwt=false` while handlers verify tokens before personalization. Vote retains `verify_jwt=true` and handler nonanonymous identity validation. This follows the [gateway/handler authorization distinction](https://supabase.com/docs/guides/functions/auth). No remote configuration was changed; actual deployed JWT mode, API keys, browser preflight, Storage URL fetchability/expiry and Deno imports are unverified.

The rating/list lock helper requires READ COMMITTED. REPEATABLE READ and SERIALIZABLE mutations fail closed with SQLSTATE `25001`, message `saved_destination_invariants_require_read_committed`; callers must retry a complete transaction using the supported isolation level. Multirow deadlock aborts must also retry the complete transaction; sequential PGlite tests do not prove independent-session behavior.

Truly signed-out public calls explicitly set an empty Authorization header to prevent the shared SDK from substituting a newly signed-in account token during dispatch. A verified account with no access token fails before invocation. Account-owned Buffacoin rating submissions pin the captured account JWT on the existing RPC builder; wallet operation IDs and restaurant rating semantics are preserved. Signed URLs are issued for 300 seconds; a later withdrawal may not revoke an already issued URL before expiry, so runtime revocation behavior remains a release requirement.

Password/signup and OAuth each have one saved-intent handoff owner. OAuth reserves the intent immediately after verifying the account, before optional profile/onboarding/telemetry work. Claims serialize with writes, verify the actual account and discard a cancelled/account-changed payload so it cannot survive for a later account. Route parameters include `savedActionUserId`; Wingdex requires that claimed identity and passes `expectedUserId` to the mutation. OAuth identity revisions remain checked through the last awaited telemetry and immediately before navigation. Full callback/device execution is not simulated by the shared-helper tests.

## Phase 7B.2.5 full-catalog feed contract

The service-role-only `public.wing_jury_feed_candidates` RPC accepts latitude/longitude, a verified nonanonymous account ID or NULL, up to 500 UUID guest exclusion hints, the complete previous keyset, and an integer candidate limit 1-120. Ordinary PUBLIC/anon/authenticated callers cannot execute it. The Edge handler derives the account from verified authentication, never request ownership fields. SQL filters current public eligibility and all permanent votes for that account before applying LIMIT.

With valid user coordinates, distance is great-circle Haversine in meters using a 6,371,000-meter sphere and a clamped trigonometric term. All valid-coordinate restaurants are ordered nearest first worldwide; missing, invalid or partial restaurant coordinates follow in a NULL-distance tier. No restaurant is omitted because it lacks coordinates. With absent/denied user location, all distances are NULL and the same deterministic general ordering applies. Tie order is destination UUID, photo creation timestamp, then photo UUID; multiple photos per restaurant remain distinct. Creation timestamp is serialized in UTC with six fractional digits to retain PostgreSQL precision.

Keyset parameters are `(distance, destination_id, created_at, submission_id)`. NULL distance sorts last, including on continuation. The encrypted cursor retains this keyset and its existing principal/location binding, length/TTL validation and eligibility-independent authorization. Changing account/location restarts ordering. Under stable eligibility/location/votes, pagination returns each unjudged eligible photo exactly once; additions, edits, withdrawals or coordinate changes can alter later pages, rather than constituting a frozen snapshot.

Edge responses contain at most 24 photos. Each request transfers at most ten 120-row candidate pages and signs/checks at most 12 candidates concurrently, preserving every unconsumed row when a visible page fills. These bounds cap Edge transfer/check/sign work, not database scanning: distance sorting can scan the catalog each RPC, and production-scale plans remain a release gate. At the work cap, `has_more=true` carries an advancing cursor even with an empty photo array. Exhaustion is reported only after the ordered candidate stream ends. Signing and current eligibility are rechecked; already issued URLs retain the earlier lifetime limitations.

The guest session keeps every judged ID locally, sends only its latest 500 as bounded server hints, and filters all returned IDs against its full session set. The service automatically advances at most four empty continuation pages per call, then returns the live cursor. The game offers Continue for an empty continuation and shows exhaustion only when `has_more=false`. Thus long guest sessions and inaccessible candidates cannot impose a permanent catalog cutoff or force an unbounded mobile download. Broken/nonadvancing continuation metadata fails with a controlled service error.

The full guest Set is retained for the continuous game session, including feed retries and continuation, and cleared on close, unmount or account transition. Local memory scales with distinct judged photos; request payloads remain capped at 500 UUIDs. A 700-verdict regression returns both the oldest judged photo and newer judged photos from the server and proves none reach the game. No server session store, production dependency or probabilistic exclusion is introduced.

Vote and reveal completions also require the captured photo, account epoch and active operation to match. Reveal retries are single-flight; broken-photo skipping cannot advance while voting/revealing or after a saved verdict. Late image-error callbacks from another photo/account are ignored. Deferred actual-component tests cover these races and the Continue button.
