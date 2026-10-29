# Automatic daily Reels — isolated publisher

The original `guess_wing_spot_main.py plan|preview` remains local-only. Only
`guess_wing_spot_publish.py publish`, in the new main-branch GitHub Actions
workflow, can write independent tracking objects or publish. No source-linked
RPC, original worker, publisher, processing, reward or notification is imported.
No app code, tables, functions, migrations or source media are changed.

## Schedule and controls

`.github/workflows/guess-wing-spot.yml` has daily `30 23 * * *` and `30 0 * * *`
UTC triggers. `clock_gate.py` chooses the trigger appropriate for Eastern DST,
uses the Eastern calendar date, admits normal delays after 19:30, and refuses
publication outside 18:00–21:00 America/New_York. A wrong-DST trigger skips even
if it falls inside the window. Both cron triggers cannot create two daily posts.
Manual publish is also restricted to that window. Plan/preview work any time.

The **new** repository variable `GUESS_WING_SPOT_ENABLED=true` is mandatory for
publishing. The old workflow must remain `disabled_manually`; its global
`JALAPENO_AUTOMATION_ENABLED` variable is never used or enabled by this workflow.
Manual dispatch defaults to plan. `validate` checks readiness without publishing.
There is no per-reel human approval gate in the automatic publisher.

Existing secrets are reused by name: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
META_LONG_LIVED_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID, FACEBOOK_PAGE_ID.
META_GRAPH_API_VERSION is explicit (inspected repository setting: v25.0).
New nonsecret identity pins GUESS_EXPECTED_INSTAGRAM_USERNAME and
GUESS_EXPECTED_FACEBOOK_NAME must match the read-only provider results before
activation. Validation discovers names from the configured IDs if pins are not
yet set; publishing requires both pins. Tokens are never printed or saved.

## Durable private ledger and claims

Existing **private** bucket `jalapeno-assets`, namespace `guess-wing-spot-v1/`:

- `claims/<Eastern-date>/<run|instagram|facebook>/<sequence>.json`: atomic
  create-without-upsert claims. Concurrent creates have exactly one winner.
- `runs/<GitHub-run-id>.json`: original Eastern date binding. A rerun after
  that date has elapsed skips rather than creating another day's extra post.
- `days/<date>/states/<revision>.json`: immutable complete state revisions,
  including daily reel selection, hashes, screening, provider IDs, intents,
  attempts, outcomes and safe errors. A completed date resumes its same reel.
- `history/<date>.json`: independent generation history for geographic rotation.
- `screening/<hash-binding>.json`: OCR decision tied to exact bytes, aliases,
  creator credit, screening-code version and Tesseract version.
- `reviews.json`: existing private hash-bound visual exclusions.
- `county-map.json`: optional verified address-based county mappings; absent
  means graceful town/state-only discovery.
- `outputs/<reel-id>.mp4`: generated video only. Never original photos, private
  manifests, answers or review frames. One-hour signed URLs are held in memory
  for Instagram ingestion and are never persisted/logged. Facebook uses binary
  upload of this generated file. Only namespace-owned generated MP4s older than
  seven days are cleaned up; source and legacy objects are unreachable.

No state overwrite, mutable index, schema change, paid service, Actions cache,
or expiring artifact is the sole ledger. Every state write is read back before
a provider mutation. The workflow serializes runs with cancellation disabled.
Durable claims provide an independent guard: recovery requires the prior owning
GitHub run **attempt** to be confirmed completed through the read-only Actions
API for this exact workflow. A missing/unavailable ownership proof blocks rather
than stealing a lock. Local publishing and non-main workflow publishing fail.
Claims allow at most 12 invocations per date/scope; platforms at most 8 attempts.

Skipped inventory/screening dates may be reevaluated on a later invocation in
the same publication window. Once planned, source IDs/order/reel ID are durable
before rendering; retries resume that plan. Successful platforms are not posted
again. Preview generation is never marked as publication.

This repository is public. **No upload-artifact step is provided.** Actions
summaries whitelist only geography, date, status, safe reasons and public links.
Do not add captions, source IDs, answers, raw provider responses, signed URLs,
.env files or private local files to logs/commits/artifacts.

## Automatic screening and source revalidation

Tesseract (local, free) checks four rotations and two segmentation modes.
Restaurant names are normalized into full-name and distinctive aliases;
substring/fuzzy OCR matches and required-credit clues reject a source. Very
small images, malformed OCR, timeouts and ambiguous low-confidence text reject
the source. Selection tries another eligible source, bounded to 12 trios, and
skips safely if no three-location geography survives. Existing human exclusions
are retained privately and checked by source hash. No watermark/credit is erased.

OCR is **not a guarantee** of detecting stylized logos, unreadable/occluded names,
unknown aliases or all visual answer clues. No paid vision service is used.
The conservative checks can skip safe content. Failed screening never relaxes
vote, consent, ownership, moderation, geography or attribution requirements.
Screening cache results expire logically whenever exact bytes, credit, aliases,
screening implementation version or OCR engine version changes.

Immediately before each platform's publish POST, reread selected full source
records, canonical Jury counts, consent, ownership, withdrawal, approval,
moderation/wing checks, abuse signals and location evidence; HEAD/GET each
processed asset; verify byte hashes and screening binding. Any change stops that
platform and records a safe reason. No source statuses/counters/timestamps are
ever updated. Automatic manifests are independent of the local preview's human
review warning; automated screening is the automatic path's approval condition.

## Meta protocol and uncertain outcomes

Official documentation retrieved 2026-10-29 (Facebook Login / Page-linked
professional Instagram account; configured Graph API v25.0):

- https://developers.facebook.com/docs/instagram-platform/content-publishing/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/
- https://developers.facebook.com/docs/video-api/guides/reels-publishing/
- Meta-owned API examples: https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api
- Storage create concurrency: https://supabase.com/docs/guides/storage/uploads/standard-uploads

Instagram: REELS media container, bounded processing polls, fresh validation,
then media_publish. Facebook: Page video_reels start, generated binary upload
to rupload.facebook.com, fresh validation, video_reels finish with
video_state=PUBLISHED, and bounded status reconciliation. The old Page `/videos`
adapter is not used. Page access tokens are obtained in memory from the existing
credential. Page/Instagram IDs, linkage, pinned names, publishing quota access
and required permissions are checked by read-only calls before mutation.
The Facebook Login professional binding is verified through the Page's
instagram_business_account relation, not an unsupported Basic Display field.

Each POST has a durable preceding intent. If final publication times out or the
response is lost, later invocations reconcile the **stored container/video ID**.
They do not blindly submit publication again. Instagram PUBLISHED is sufficient
to record success even if its permalink cannot be retrieved. Facebook requires
the stored video's publishing phase to be complete. If a create response is
lost before any provider ID can be saved, the platform remains uncertain and
does not create a second session automatically. An operational investigation may
be necessary for an irreconcilable provider outcome; this is failure recovery,
not nightly human approval. The other platform can still proceed.

Rerun a failed Actions run (new run attempt) inside the allowed window to resume
only missing platforms. Do not delete claims/state to force a second post.
Explicit provider rejection can retry on a later invocation within bounds;
uncertain publication remains reconciliation-only. Expired credentials block
without printing token values or rotating secrets. Future dates remain separate.

## Activation checklist

1. Focused mocked tests, local real FFmpeg tests, and PR secret scan pass.
2. Confirm old workflow is disabled. Keep the new enable control false.
3. Seed private reviews from existing local findings (never commit their IDs).
4. Dispatch validate in Actions: existing secret names, provider identity/grants,
   local OCR, atomic private-storage create/readback and an automatically screened
   real-source trio must pass. Resolve only genuine credential/account blockers.
5. Pin the verified names, merge the scoped PR through normal checks, and set
   only GUESS_WING_SPOT_ENABLED=true. Do not change legacy flags or app config.
6. If within 18:00–21:00 Eastern, dispatch one controlled publish for today's
   durable date. Otherwise wait for the next 19:30 scheduled trigger. Report
   actual run/post links only after they exist; never claim future success.
