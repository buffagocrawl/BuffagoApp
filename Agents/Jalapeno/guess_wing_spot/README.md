# Guess the Wing Spot — local plan / preview only

This independent generator assembles a silent 15-second 1080×1920 H.264/30 fps
reel from three existing processed wing photos. It does not import Jalapeño's
legacy clients, orchestrator, processing workers, queues, publishers, reward,
notification, cleanup, or settlement adapters. Plan and preview have no publish
mode. The separate automatic Actions publisher is documented in `AUTOMATION.md`.

## Commands

Run from the repository root (Python 3.12+, Pillow; pytest for tests):

```powershell
python -B Agents/Jalapeno/guess_wing_spot_main.py plan --env-file Agents/Jalapeno/.env --seed 2026-10-29
python -B Agents/Jalapeno/guess_wing_spot_main.py preview --env-file Agents/Jalapeno/.env --seed 2026-10-29 --ffmpeg C:/path/to/ffmpeg.exe --ffprobe C:/path/to/ffprobe.exe
python -B -m pytest Agents/Jalapeno/tests/test_guess_wing_spot.py -q -o cache_dir=Agents/Jalapeno/tmp/guess-pytest-cache --basetemp=Agents/Jalapeno/tmp/guess-tests
```

`--env-file` is optional if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY already
exist in the environment. Only those two keys are read. No .env is modified,
no global environment is changed, and secrets/response bodies are not logged.
This first adapter can use the existing service credential but exposes only
allowlisted GET/HEAD calls. Before nightly operation, provision a narrowly
authorized read-only identity in a separately approved infrastructure task.

FFmpeg and ffprobe must be on PATH or explicitly supplied. No runtime installer
or download is invoked by the generator. Set GUESS_WING_FONT to a bold TrueType
font on a platform without Arial/DejaVu Sans. The default logo is the existing
`crawl/assets/images/buffago-logo.png`, read without modifying app assets.

## Verified source contract

The implementation was checked against the production catalog and mappings on
2026-10-29. Source retrieval reads all current photo submissions, their related
destinations/users, states, current abuse signals, and authoritative
`wing_jury_photo_vote_counts`. Jury aggregates are generated from
`wing_jury_votes`; the deployed bridge synchronizes `wing_media_photo_votes`.
**Do not sum the two vote tables.** No voting or eligibility RPC is called.
There is no new database object, migration, function, or storage object.

Per photo, require nonnegative integer authoritative counters and
`likes + dislikes > 0 AND likes > dislikes`. Neutral/“Average” is excluded from
the denominator. Missing aggregates fail closed. Restaurant ratings and source
submission counters are not used for eligibility.

Require surviving ownership, no withdrawal/deletion/rejection, valid recorded
consent and attribution, acceptable moderation/wing verification, no high or
critical abuse signals, a canonical processed-photo path, and successful HEAD
of the existing private object. An explicit approval timestamp and recorded
approver are required even for `approved` rows. Publication lifecycle states
(`generation_pending`, `ready_to_post`, `scheduled`, `posting`, `posted`) may
qualify only with that same approval evidence and all current safety checks.
Failed/rejected/withdrawn/unknown states never qualify. Prior feature flags,
publication, image duplicate groups, and previous generator use are not hard
exclusions. No source state is reset to approved.

Full source rows are read into memory to hash every field, but are never written
to manifests. Fresh source/vote/safety/geography/asset reads occur immediately
before rendering. Before/after hashes cover all photo source records, including
timestamps, counters and fields unrelated to eligibility. External concurrent
changes mark a run `source_changed_during_run` and prevent history exposure.
This is observational evidence, not a database lock or a transaction snapshot.
The adapter has no source-writing capability. A future publishing adapter must
revalidate *again*, including byte hashes/consent/withdrawal/approval/votes and
current geographic evidence, immediately before publication.

## Dynamic geography and rotation

No state, restaurant, source-photo ID or geographic shortlist is hardcoded.
Each invocation fetches current sources and rebuilds all groups.

Complete street/city/state/ZIP addresses must corroborate the state relation.
Harmless city punctuation/state suffix differences are normalized locally.
Town grouping additionally requires agreement between the city label and
address city. A contradictory/missing city label permits only independently
verified state grouping, not guessed town membership. Missing/contradictory
state/address evidence excludes a location with a reason.

Physical identity uses normalized complete addresses (including units), not
destination IDs. Secondary proximity deduplication requires identical normalized
street/unit and coordinates within 20m; restaurant names never merge branches.
This is conservative address evidence, not authoritative municipal-boundary
geocoding. Postal towns, unusual address formats, and duplicate records with
inconsistent units/coordinates need review. No app data is repaired.

County support is optional. `--county-map path.json` accepts a **private** list
of Jalapeño-owned, verified mappings tied to exact
`canonical_address_identity` values from plan manifests:

```json
[{"canonical_address_identity":"XX|123 main st|example town|12345",
  "state_code":"XX","county":"Example County","verified":true,
  "verified_at":"2026-10-29","evidence":"Authoritative address/boundary source reviewed by owner"}]
```

No county is inferred from a town name, and no geocoding/enrichment is performed.
Mappings must contain no tokens, credentials or signed URLs. Without mappings,
county grouping is explicitly unavailable; town/state groups still work.

Only groups with at least three physical locations survive. First select among
least recently generated states (seeded ties); *then* prefer town, county, state
within that state. Rotate least recently generated areas in the preferred tier.
This prevents one state's local inventory from starving statewide challenges
elsewhere. With no history, seeded states have equal consideration regardless
of inventory size. Source reuse is a soft preference, never a ban. Small pools
may repeat all sources/combinations. A seed reproduces a choice only against
the same source inventory and history. Plan/skip/failure runs do not rotate.

## Output and review

Default outputs and history live under ignored `guess_wing_spot/local/`:

- `runs/<reel_id>/public/guess-the-wing-spot.mp4`: generic filename, no answers
  or source metadata. Only this MP4 and public caption are future public assets.
- `public/caption.txt`: deterministic geographic challenge, plain-text creator
  credits, and a small geography/food/wing/brand hashtag set. No @mentions.
- `manifest.private.json`: **private restaurant answers**, ordered source IDs,
  physical identities, safety/consent/vote snapshots, selected group evidence,
  all eligible groups considered, rationale, hashes, outputs and review warnings.
- `private-work/`: private source copies and local rendering intermediates.
- `review-frames/`: hook, each photo segment and final composite.
- `history/<reel_id>.json`: independent successful preview-generation history.

Plan reads sources and writes a local plan/caption, but does not render, upload,
publish, or alter rotation history. Without visual findings it uses HEAD only
for assets; hash-bound visual findings require GET of the affected source to
check whether the finding still matches. Preview additionally
downloads the three existing processed photos, renders locally, uses ffprobe to
verify H.264/1080×1920/30 fps/450 frames/15 seconds/no audio, and extracts five
representative frames. No output uploads or remote writes exist in either mode.
All generated files are local; use a private directory with appropriate Windows
ACLs/Unix permissions. File mode 0600 is requested for manifests/ledger files;
Windows directory ACLs remain authoritative. Never attach private manifests or
work directories to public CI artifacts.

Timeline: 60-frame hook; three 90-frame photos; 120-frame composite. Simple cuts
preserve the exact boundaries. Foreground photos retain their aspect ratio with
restrained blurred fill. Gentle centered 3% movement affects imagery only;
numbers and creator credits stay static. Foreground enlargement is capped at
1.35x plus movement; low-resolution inputs receive explicit warnings. The final
composite shows the full aspect-preserved photos, not narrow food crops.

The 11–15 second closing frame keeps all three numbered photos visible, with
“Guess the spots: 1, 2, 3” as the most prominent text. Below the photos it shows
“Share your wing pics on BuffaGo”, “Download on iOS & Android”, and the existing
BuffaGo logo. Supporting text uses at least 46px type at 1080px width, high
contrast, and conservative margins. Per-photo credits remain in each source's
individual segment and in the caption; no creator credit is removed.

Every caption adds “Got wing pics? Share yours on BuffaGo. Available on the App
Store and Google Play.” after the required photo credits and before hashtags.
“Link in bio” is omitted because the isolated generator has no verified bio
download-link configuration. The repository's `appstore.png` and `playstore.png`
assets are BuffaGo app icons, not official store badges; no badges are invented
or fetched. The timeline, source selection and publication protections are
unchanged. Render version: `guess-wing-spot-v2-sharing-cta`.

Anonymous/opted-out credits follow the existing “BuffaGo community” behavior.
Username/display-name credits are kept as plain text; missing credits or obvious
restaurant-name overlap exclude that source. This cannot detect all attribution
clues. Consent text permits combining/editing/branding; retain the recorded
version and attribution preference. No new consent flow is created.

**Every output requires human visual review before future publication.** There
is no OCR/name-removal system or automatic approval. Inspect the private source
images at full resolution and all frames for signage, packaging, menus,
watermarks, restaurant names/handles and other answer clues. Do not erase required
attribution. Select another source if credit reveals the answer. Check wings,
text safety margins and legibility on a phone. Neither review warning nor
preview status authorizes publication. This version is silent.

Known visual failures can be recorded in an independent private file and passed
with `--review-file guess_wing_spot/local/visual-review.private.json`. Entries
contain `photo_id`, `processed_sha256`, `decision: "exclude_answer_clue"`, a
human `reason`, and `reviewed_at`. The affected source is read and hash-checked;
an unchanged known answer clue is excluded, and changed bytes require fresh
inspection rather than silently inheriting a finding. These records never
modify source media, consent, source statuses, or app tables. No allowlist of
pilot photos or geographic restriction is introduced. A review finding is not
publication approval. Mark failed local previews with a private visual-review
finding; never publish them. Previously generated previews still count as
generation exposure for rotation, even when visual review rejects them.

## Independent durable history and future activation

`reel_id + platform` is reserved as the publication idempotency key. Both platform
slots always remain `not_published`; a generated preview is never publication.
No legacy source-linked social jobs are created. All preview history is owned
by Jalapeño outside app tables; source photos remain untouched.

An ephemeral GitHub runner filesystem is **not** durable history. Before nightly
execution, use a separately provisioned private Jalapeño ledger store, for
example a versioned private object-store prefix containing immutable reel
manifests and a conditional-write rotation index, or an independent service
database. Serialize selection/index updates and reconcile failures. Load the
durable history before discovery and persist generation/publication separately.
For one machine, a private persistent directory plus backup and a single runner
is practical. No infrastructure or schedule is provisioned here.

Before activation: review visual/consent policy, validate address data, decide
durable history/security/retention, add a separately authorized publishing layer
with immediate source revalidation, test per-reel/platform idempotency and
partial failures, verify Meta permissions/token renewal and Facebook **Reel**
publishing (the current adapter uses Page `/videos`), and explicitly approve the
nightly time and enablement. Do not enable the old source-mutating workflow for
this format. Existing workflows, flags and publishers are unchanged.
