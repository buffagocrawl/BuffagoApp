# Noon community restaurant spotlights

Instagram photo series at noon America/New_York on Monday, Wednesday, Friday,
Saturday and Sunday. Independent of the evening guessing Reel and its Pi scheduler.

## Behavior

- Select an approved, consented, moderated community photo with existing processed
  JPEG and greater than 50% positive Wing Jury votes. Existing source safety checks
  remain in force. Named attribution is preserved when required by the contributor.
- Restaurant score is the arithmetic average of destination_ratings.weight_score,
  the same field/aggregation used by Wingdex's restaurant list
  (`crawl/app/(tabs)/ratings/index.jsx`, sumWeight/count). Null scores count as zero,
  matching that screen's `Number(weight_score ?? 0)` behavior. Eligibility
  uses the unrounded average strictly greater than 80. Caption shows two decimals
  and the number of contributing ratings. No new minimum count is imposed.
- Neither photo ID, restaurant destination ID nor normalized complete physical
  address may repeat within 30
  elapsed days of publication in this series. Evening Reels retain their own rules.
- The full photo is contained on a 1080x1350 canvas with score/count footer.
  Restaurant name/location, factual description, contributor credit and download
  CTA appear in the caption. Only the reviewed wing-shots-v1 consent contract is
  accepted. A verified restaurant Instagram handle is mandatory; selection tries
  another eligible photo/location when discovery fails. No invented tasting notes
  or inferred handles. A nonempty eligible pool without a renderable verified
  candidate records `no_verified_candidate` with private-state verification counts.
- Empty eligible pools are recorded as no_eligible_candidate; no repeats or lower
  threshold fallback. Plan reports only counts; no private artifacts reach logs.

## Durable safety and recovery

Uses existing private jalapeno-assets bucket under community-spotlight-v1/.
No source row, source object, existing database schema, or evening ledger changes.
Atomic create-without-upsert claims protect each date. Append-only state revisions
retain the candidate, score snapshot, caption, output hash and provider IDs.
Each provider POST has a durable intent. Unknown POST outcomes never trigger a
second POST automatically. A known container can reconcile PUBLISHED; an unknown
container or unresolved publish intent requires operator investigation in private
state. Unresolved dates remain reserved indefinitely, including beyond 30 days.
History scans the private series day folders and fails closed on unavailable state.

Noon is a target. UTC triggers cover standard/daylight time; runtime accepts only
12:00 through strictly before 13:00 Eastern on the five configured days. Attempts
at :00, :20 and :40 resume the same dated state. At most three ordinary preparation/
publication attempts are allowed per date; pending intents remain read-only for
reconciliation (claims are additionally capped at twelve). Main Actions workflow identity,
original run creation window and run-date binding reject delayed next-day reruns.
Read-only audits after the window report missed, pending, empty-pool, published or
disabled status and a count of all older unresolved reservations. Failed audits
require inspection of the private ledger; no provider IDs or captions are logged.
GitHub schedule delivery can still be late or dropped, including
its audit triggers; this is not a guaranteed delivery service.

Before final publication the source consent, moderation, photo availability,
restaurant score/count, caption and generated image hash are revalidated.
If a source changes, publishing fails closed for review of the existing container.

## Verified restaurant handles

Discovery is deterministic and uses no paid services, Meta API calls or LLMs.
The inspected live source has 1,228 destinations with no website/social URL
columns; `wing_destination_social_locations` exists but has zero rows. That table
holds provider place IDs/confidence, not official website/location evidence, so a
future row alone must not authorize an Instagram tag. No source table is modified.

`website_sources.json` contains four search-discovered website hints keyed by
destination UUID. These are not verified handles. For other locations, bounded
public Bing search HTML finds possible official sites; search snippets/results
never count as verification. Search anti-bot blocks or unavailable pages fail
closed. Add official website/location URLs here to bypass unreliable search.

The site's homepage title/H1/brand metadata must identify the restaurant, excluding
known directories/social providers. The official page must match name, street and
unit, city, state and ZIP with conservative abbreviation folding. Evidence comes
from either exact-location Restaurant/LocalBusiness JSON-LD `sameAs`, or an
Instagram profile link on a single-location page containing the complete address.
Multi-location pages cannot lend a global footer account to a branch. Multiple
handles on matching official evidence are `conflicting`; malformed/post URLs do
not qualify. Location-data contradictions remain unresolved, including unit
differences. The verifier does not change source data to make a match work.

`verified_handles.json` preserves human-reviewed mappings. Add entries keyed by exact destination
UUID only after checking an official restaurant source links to the Instagram
account for that location. Include name, city, state and address exactly matching the source,
handle without @, verified: true, verified_at (ISO date), official_source_url.
Chain-wide accounts should only be used when the official location page explicitly
identifies that account. Missing evidence means the candidate is skipped.

Durable private storage in `jalapeno-assets/community-spotlight-v1/instagram/`:

- `cache/<destination-id>/<time>-<nonce>.json`: append-only results containing
  destination, matched location, handle (only if verified), official evidence URLs,
  verification/check/expiry times, method, reason and location/seed fingerprint.
- `overrides/<destination-id>.json`: optional operator-owned mapping with the same
  fields as a manual registry entry. Private overrides take priority over the repo
  registry; both precede automatic cache/discovery. `{"verified":false}` blocks a
  candidate explicitly. Automation never overwrites overrides or manual mappings.

Verified automatic results expire after 30 days; unresolved/conflicting results
after 7 days; unavailable sites after 1 day. Location/seed/version changes invalidate
cache reuse. `deferred` means the shared run budget was exhausted and is never
negative-cached. Subsequent writable runs can advance past cached failures.
The private cache is shared across Actions runs; HTTP page caching is per process.
Plan/default preview only read it; publication preparation or `--save-cache` writes
new immutable verification records. Private writes are read back before reuse.
Overlapping unexpired cache records with different handles remain conflicting;
concurrent discovery cannot silently replace one handle with another. Human
overrides can explicitly resolve or block a conflict.

The fetcher allows public HTTPS port 443 only, rejects userinfo, local/private DNS
answers and unsafe redirects, and pins the validated public IP while checking the
original TLS hostname. It sends no source credentials/cookies and ignores proxy
environment credentials. Redirects are restricted to the same host/www alias.
Limits per run: 32 wire requests, 90-second budget plus bounded in-flight work,
2 attempts/request, 2 redirects, 5-second DNS/connect/socket timeouts, 10-second
page-read deadline and 2 MB/page. At most 3 search seeds and 4 location/contact
pages per seed, with the shared budget taking priority. No JS, scripts, retrieved
instructions, login forms or Meta endpoints are executed/contacted by discovery.
Static parsing deliberately leaves some legitimate sites unresolved.

## Readiness and activation

1. Merge this branch after the mock tests pass. Workflow is disabled by default.
2. Run workflow_dispatch with mode=plan to inspect eligible/verified counts and
   verification statuses read-only. This works with publishing disabled.
3. Check existing secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   META_LONG_LIVED_ACCESS_TOKEN, META_APP_SECRET, INSTAGRAM_BUSINESS_ACCOUNT_ID,
   FACEBOOK_PAGE_ID. Existing variables META_GRAPH_API_VERSION,
   GUESS_EXPECTED_INSTAGRAM_USERNAME and GUESS_EXPECTED_FACEBOOK_NAME must be pinned.
   The existing Graph validator checks the Page/account link and permissions.
4. Inspect a local candidate render/caption privately with approved real media.
   Tests use synthetic images only; no real content has been published by tests.
5. Set repository variable COMMUNITY_SPOTLIGHT_ENABLED=true to enable the next
   eligible noon slot. Manual publish also requires this flag, main workflow and
   noon window. Roll back with COMMUNITY_SPOTLIGHT_ENABLED=false.
6. Verify the actual Instagram media ID in private state after the first run.
   A successful dispatch or uploaded image alone is not publication evidence.

CLI: python Agents/Jalapeno/spotlight_main.py plan|health|publish

Private local discovery/preview (no publication, no ledger writes by default): set PYTHONPATH to
Agents/Jalapeno, then run `python -m spotlight.preview --env-file
Agents/Jalapeno/.env --output .tmp/spotlight-preview`. The ignored local directory
contains photo.jpg, caption.txt and verification-report.json; never attach these
to public CI artifacts. The report includes per-location outcomes and evidence,
while stdout only reports aggregate counts. Default preview neither signs media
URLs nor constructs a Meta client. Use a fresh ignored private output directory.
If nothing verifies, the report is still written and exit status is 1.

Optional `--save-cache` enables only private verification-cache writes, even while
publishing is disabled. It does not claim a daily slot, mutate any source, upload
the photo/caption or contact Meta. Omit it for the strictly read-only command.
This option was used to validate real private cache persistence; a subsequent
default preview verifies read-only reuse.

Unknown create responses cannot be automatically identified safely. Unknown
publish responses with a known container are queried for PUBLISHED before any
further action. A FINISHED response is insufficient proof of failure; no second
publish POST is sent. Operators must investigate unresolved reservations privately;
do not delete the ledger or replay POSTs to clear an alert. Reconciliation timestamps
use observation time conservatively, extending rather than shortening the cooldown.

Tests: python -m pytest Agents/Jalapeno/tests/test_community_spotlight.py
Agents/Jalapeno/tests/test_spotlight_verification.py
Agents/Jalapeno/tests/test_guess_wing_spot.py
Agents/Jalapeno/tests/test_guess_wing_spot_publish.py -q
