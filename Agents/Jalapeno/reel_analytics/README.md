# Guess the Wing Spot analytics

The existing `jalapeno-metrics.yml` now calls `reel_metrics.py`, never legacy
`main.py`. Its display name covers Instagram and Facebook. The legacy collector
and all existing metrics tables remain historical, unchanged, and unused by
this collector. In particular no media-ID repairs, post-status updates, growth
recommendations, email delivery, or database inserts run here.

## Sources and mutation boundaries

Read the latest immutable state revision under both existing private namespaces:

- `jalapeno-assets/guess-wing-spot-v1/days/<Eastern-date>/states/`
- `jalapeno-assets/guess-wing-spot-live-test-v1/days/<Eastern-date>/states/`

Only platform entries with status `published` and a `publication_id` are eligible.
Discovery projects reel ID, platform/media ID, challenge geography, ledger date,
optional recorded publication timestamp, and live-test cohort. It does not copy
source-photo IDs, answers, captions, credits, asset paths, or votes. A provider
container ID is never mistaken for a published media ID. Deduplicate by platform
and published media ID; resolve actual publication time independently for each.

Existing ledger versions record publication intent times, not consistently an
actual `published_at`. Keep any recorded timestamp as provenance, but use Meta's
Instagram `timestamp` and Facebook Video `created_time` to calculate actual age.
Never use render time, run time, or a publication intent as the publication time.
There are no ledger repairs or migrations.

`storage.py` enforces permitted HTTP operations. It can read/list analytics and
publication `days/` objects and inspect the existing bucket's private flag. Its
only object write is an immutable create with `x-upsert=false` under
`guess-wing-spot-analytics-v1/`. No DELETE, PATCH, RPC, SQL, app table access,
source bucket access, or publication write is permitted. Existing publication
objects read during discovery are hashed and reread to verify unchanged bytes.
`meta.py` only issues GET requests to pinned account identities, media metadata,
permissions, and insights. It does not import any publishing implementation.

## Private storage and report access

Existing bucket: **private `jalapeno-assets`**.

- `guess-wing-spot-analytics-v1/snapshots/<platform>_<media-id>_<reel-id>_<window>.json`
- `guess-wing-spot-analytics-v1/reports/<Actions-run-id>.<attempt>.json`

Each snapshot includes metrics with value/reason pairs, actual capture time,
age, actual publication time and source, public permalink, platform definitions,
engagement components, and supported raw insight response data. Paging URLs and
credential fields are removed; known secret values are redacted. Provider errors
are fixed safe categories, not raw response messages. An atomic single-object
snapshot keeps raw and normalized values together without partial multi-object
commits. Conflicts do not overwrite the first capture. Workflow concurrency
serializes collectors; atomic create also protects against concurrent attempts.
A repeated run attempt returns its existing immutable report. Future attempts
skip existing snapshot identities and can retry work whose storage write failed.

Open the report JSON using the Supabase Storage dashboard with authorized access.
Its `markdown` field contains the human-readable report; structured sections
include recent Reels, per-window rankings, geographic sample sizes, equivalent
period comparisons, collection health, and mutation-protection evidence. No
public bucket or signed report link is created. The repository visibility is
checked through GitHub's authenticated repository endpoint before generating an
Actions summary. For this public repository, summaries/logs contain operational
counts and permission names only. Full reports/raw insight data are never
uploaded as Actions artifacts. If visibility cannot be verified, disclosure
defaults to the same restricted summary.

## Collection timing and modes

Daily at **20:30 America/New_York**, after the 19:30 publication slot. UTC
triggers `30 0 * * *` (EDT) and `30 1 * * *` (EST) are filtered by the Eastern
offset. Wrong-DST triggers skip; normal delayed same-evening runs are admitted.
GitHub schedules can be delayed and are not an exact-time service.

Manual dispatch defaults to `diagnostic`:

- `diagnostic`: Meta GETs, storage reads/listings, identity/grant checks, and
  capability probes. No snapshots, reports, claims, or repairs are written.
- `collect`: observe posts up to 30 days old; persist analytics only.
- `backfill`: extend to 90 days, with honest current-age labels.

Milestone observations are captured on the first collection in `[24h,48h)`,
`[72h,96h)`, or `[168h,192h)`. The stored age is measured after API collection,
not rounded into the target hour. Outside these daily tolerance windows,
`current-YYYY-MM-DD` records the current-age observation. Even very young posts
may have current-age observations, but never count as milestone snapshots.
Missing historical windows are explicitly listed; earlier existing observations
are not called missed. Backfilling a 7-day-old post cannot create 24h/72h history.
Lifetime metrics are not interpolated. Meta can delay insight availability.

Meta reads retry transient transport/server/rate errors at most three times
with exponential backoff and Retry-After support. Requests with Retry-After
over 60 seconds defer further Meta calls to the next run. High usage headers
introduce pacing. Failed metrics/posts/platforms do not stop other observations.
Permission/unsupported/empty results are null with reasons; real zero remains
zero. Immutable observations retain what was available at capture, and later
current-age observations can contain data that was previously unavailable.

## Definitions and comparisons

Instagram engagement: `(likes + comments + shares + saves) / reach`.
Facebook engagement: `(reactions + comments + shares) / reach`; saves have no
documented Reel API metric. Missing required components or unavailable/zero
reach yield null. These formulas and view definitions are platform-specific;
do not compare them as identical measurements. Watch times retain native
milliseconds. Do not substitute impressions or plays for unique reach.

Rank by reach, comments, and shares separately within platform, milestone, and
live-test/nightly cohort. Geographic results describe challenge areas, not viewer
demographics. Report means, non-null sample sizes, and actual observation age
ranges, never a sum of reach labelled unique people. Equivalent-period results
compare adjacent seven-day publication cohorts at the same milestone and require
at least three measured posts in each period. The cohort cutoff allows both
periods to mature through the target age and daily collection tolerance. These
are descriptive comparisons, not causal evidence. No strategy or geographic
rotation changes occur. No installs, downloads, or conversions are inferred.

## Official references checked 2026-10-29

Configured account: professional Instagram account linked to a Facebook Page,
Facebook Login, Graph API **v25.0**, confirmed repository setting. The collector
rejects an unreviewed API version rather than silently mixing definitions.

- [Instagram Media Insights](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/insights/):
  use `views`, `reach`, `likes`, `comments`, `shares`, `saved`,
  `ig_reels_video_view_total_time`, and `ig_reels_avg_watch_time`. Do not use
  deprecated `plays`/`impressions`. Instagram views are repeated organic plays;
  reach is an estimated unique-account count for that Reel.
- [Facebook v25 Video Insights](https://developers.facebook.com/docs/graph-api/reference/v25.0/video/video_insights/):
  use `fb_reels_total_plays` (includes replays), `blue_reels_play_count` (initial
  plays), `post_impressions_unique` (estimated Reel reach),
  `post_video_likes_by_reaction_type`, `post_video_social_actions`,
  `post_video_view_time`, and `post_video_avg_time_watched`. Comments/shares
  come from the named social-actions breakdown, not an assumed scalar total.
- [Facebook v25 Video](https://developers.facebook.com/docs/graph-api/reference/v25.0/video/):
  `created_time` is initial publication time; `permalink_url` supplies the link.
- [Instagram insights requirements](https://developers.facebook.com/docs/instagram-platform/insights/):
  Facebook Login requires `instagram_basic`, `instagram_manage_insights`, and
  `pages_read_engagement`. Business Manager-assigned roles may additionally
  require `ads_management`/`ads_read`; the collector reports actual access errors
  and does not request unrelated grants automatically.
- Facebook Video Insights requires `read_insights` and
  `pages_manage_engagement`, and a Page token for a user with ANALYZE access.
  Grant names and per-platform gaps are surfaced without changing publishing.
- [Supabase immutable upload semantics](https://supabase.com/docs/guides/storage/uploads/standard-uploads):
  create without upsert rejects existing paths atomically. Existing private
  bucket and API are reused; no schema changes, new service, or paid dependency.
- [Supabase TLS change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated):
  modern Python/requests TLS requires no CBC fallback for these HTTPS calls.

Meta's web tool returned 429 for some reference pages; the official references
above were successfully retrieved directly over HTTPS for review. Current docs
can show newer versions; v25 Facebook reference and live v25 probes are used to
confirm availability. All supported response definitions are also retained
privately with observations. No metric availability is promised before probing.

## Predeployment verification

`test_reel_analytics.py` covers both ledgers/platforms, private projection,
null/zero semantics, milestone ages, honest backfill, metadata times, partial
failures, retries and rate limits, idempotency/concurrency, engagement/reporting,
DST, public-summary redaction, immutable writes, diagnostics, publication hash
drift, and forbidden operations/imports. Run it before credentialed workflow work.
Only this analytics package, its entry point/tests, and the metrics workflow may
change. Existing publisher controls and source/app records are outside its HTTP
boundary. Live diagnostic/collection results are recorded in workflow summaries;
detailed real metrics stay in private reports.

## Read-only credential checks

`read_only_credentials.py` calls only the publisher adapter's GET-only token,
application-secret, pinned-account/link, required-permission and publishing-quota
checks. Its HTTP session rejects mutations, upload hosts and redirects. It does
not instantiate a publisher, access sources, or read/write a publication ledger.
The analytics workflow runs it only in diagnostic mode, after the independent
analytics diagnostic, even when that preceding diagnostic reports a failure.
Only safe check results and permission names are printed.

Do not use `guess_wing_spot_publish.py validate` as a strictly read-only credential
check: that broader validation mode also creates private storage validation
probes and screened candidate objects. Use the dedicated credential check and
`reel_metrics.py diagnostic` instead.

Re-running collection does not repair or overwrite an existing immutable
observation in the same milestone/current-day window. A newer report can
therefore still show an older observation's permission gap after permissions are
fixed. Retain its original capture time and age; a later genuinely new window
will produce a new observation. Diagnostic availability describes access now,
not a rewritten historical measurement.
