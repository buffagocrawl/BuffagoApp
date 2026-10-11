> Current 2026-10-10 handoff: external R3 queries are reported complete, but nine full bodies are not present locally; XP-level additionally mismatches checkout. See [current release review](buffago-final-supabase-deployment-approval.md#chatgpt--ready-for-deployment-review), [exact blockers](buffago-final-engineering-blockers.md) and [focused test results](buffago-final-engineering-verification.json). Earlier evidence below is retained and does not establish complete production parity.

## Final release review ? superseding status

**PARTIAL / production NO-GO; no deployment authorization.** The authoritative current packet is [buffago-final-supabase-deployment-approval.md](buffago-final-supabase-deployment-approval.md). Older counts and readiness statements below are dated historical evidence. Actual transitive L1?L4 definitions, Storage/Auth/gateway acceptance, deletion fence/recovery, predecessor Edge bundles, reviewed trust provisioning and owner maintenance/history approvals remain external gates. Historical integrity and two historical assertions remain red; the exception is not approved. Both feature flags remain false. No production connection, deployment, commit, push or native build occurred.

# Wing Jury + Favorites + Want to Try — initiative handoff

Updated: 2026-10-10. **Phase7B.3D PARTIAL; production NO-GO.** Adapter/retry engineering and bounded matched-body tests are implemented; [7B.3D engineering closeout and approval packet](phase-7b3d-approval-packet.md) is authoritative for current gates. Frozen artifacts and both false flags are preserved. Actual transitive behavior/two event handlers/deployed lifecycle, reviewed adapter parity and trust provisioning, history/custom-ledger decisions, window/owner/smoke/rollback artifacts and separate production authorization remain. No Phase7C.

Phase7B.3C checkpoint1 (superseded by final checkpoint): B01–B07 production evidence received and reviewed; do not repeat it. Connected project/control-plane/session/runtime, effective owner authority, six-column ledger/35versions/latest20261009201342, absence of candidate collisions, validated/nondeferrable constraint/index metadata and momentary blockers verified for2026-10-10. Exact B03 defaults and six-column ledger PREPARE/type proof pass; eight additional body correspondences found. Matched Buffacoin focused checks passed with synthetic dependencies; final run then pending after full-row ledger supplement. No full snapshot/connection/custom ledger write or feature enablement; concrete plan being documented.

## Objective and Git safety

Deliver Wingdex Favorites and Want to Try, guest-compatible Wing Jury replacing Weekly Missions on Home, remove Home States Visited only, and compact Social rating posts without available photos. Preserve Wing Facts, ratings, gallery voting, Journey, achievements, historical missions and shared rewards.

One branch: `feat/wing-jury-favorites-want-to-try`. Initial root Git state: clean `main...origin/main`; branch absent, created locally. `git -C crawl rev-parse --show-toplevel` resolves to the root workspace. No additional branch/worktree, commit, push, deployment, remote write or migration. Application code remains untouched.

## Discovery milestone 1

- Read-only agents A (ratings/Wingdex), B (schema/security), C (Home/navigation) ran concurrently; Agent D (tests/build/accessibility) ran when A completed because there are four total slots including orchestrator. All four investigations complete.
- App lives in `crawl/`; Expo 54 / React Native 0.81 / Expo Router 6, Supabase JS 2.58 range, React Query 5, React Native Paper.
- Active Wingdex: `crawl/app/(tabs)/ratings/index.jsx`; Home: `crawl/app/(tabs)/home/index.jsx`; Social: `crawl/app/(tabs)/leaderboards/index.jsx`.
- Personal rating eligibility differs from existing globally unrated Wingdex category.
- Social `renderFeedRow` conditionally renders `WingShotImage` only with a URI, but shared `crawl/components/ui/OperationUI.jsx:53` replaces failed media with an unavailable block. Investigate actual rating/photo association before implementation.

## Phase checklist

1. Discovery and architecture — PASS, complete; STOP.
2. Database contracts, additive migrations, local security validation — pending authorization.
3. Shared services, rating cleanup, destinations, auth intents — pending.
4. Wingdex Favorites / Want to Try UI — pending.
5. Home Wing Jury and Home removals; Social media UI — pending.
6. Integration, security, performance and mobile regression QA — pending.
7. Final review and handoff — pending; release actions require separate authorization.

## Discovery milestone 2 — architecture map and reusable systems

All paths in this section are relative to `crawl/`. Line numbers describe the discovery snapshot.

| System | Actual code and behavior | Reuse / proposed boundary |
| --- | --- | --- |
| Routing | `app/(tabs)/_layout.tsx:66,100` registers Home/Wingdex. `app/index.jsx:5` redirects `/home`; separate `app/home/index.jsx` and `app/ratings/index.jsx` legacy routes exist. | New actions use canonical tab routes. Verify legacy entry routing before changing redirects. |
| Wingdex | `app/(tabs)/ratings/index.jsx:902,963,997,1017` builds personal `myRated` / `ratedByMe`; `:1024` globally unrated list; `:1727` cards, detail `:1757`. | Keep existing browse/filter/gallery. Add Favorites / Want to Try tabs; personal eligibility only. Focus refresh currently refreshes coins/photos, but not all rating eligibility (`:422,496,1148,1165`). |
| Rating wizard | `components/RatingWizardDialog.jsx:353` awaits `onFinalize`; `RatingSheet.jsx` not an active submission path found. | Preserve wizard and committed rating behavior, refresh collections only after authoritative success. |
| Journey | `(tabs)/journey/index.jsx:10` imports `app/profile/history/index.jsx`; `:140` self-view guard, `:343` safe other-user access, `:378` personal ratings, `:533` focus refresh. | Lists remain private; never add private collections to another user's Journey payload. |
| Home | `app/(tabs)/home/index.jsx` owns suggested destination, facts, stats, rating wizard and mission entry. | Replace compact mission entry with Wing Jury adjacent to retained Wing Facts; remove States Visited card and reflow remaining stats. |
| Destination state | Wingdex `:1435` writes `buffago:homeNextSpot`, emits `buffago:home_next_spot_selected`, navigates Home. Home `:1974,2028,2046` applies/reloads/listens and locks automatic replacement. | Extract one service, retain storage key/event for compatibility. Set Destination changes Home; Take Me There first sets destination then launches maps. |
| Maps | Home `:2155` opens Google Maps URL; `app/crawl/[id].jsx:117,1030` uses Apple Maps / `google.navigation:`. | Common finite-coordinate validation, native-provider launch and web fallback. Current Home truthiness guard rejects valid coordinate zero. |
| Location | `providers/LocationProvider.tsx` via `useLocationCtx`; Home `:305` receives coords/status/refresh. Home `:110` resolves nearest state through destination coordinates. | Jury uses available valid coords without blocking guest gameplay on permissions; stable nonlocation fallback. |
| Public media | `supabase/functions/wing-public-gallery/index.ts:35,60,82,118` reads approved photos, validates consent/owner/withdrawal, signs canonical derivatives for 300 seconds. `supabase/config.toml` sets its `verify_jwt=false`. `types/wingdexPhotos.ts` safe DTO. | Guest reads already possible through this server boundary. Reuse eligibility/signing, never make bucket public or expose originals/moderation metadata. |
| Gallery votes | `lib/wingdexPhotos.js:5,15,26,41` mutable +/-1 upsert/delete with optimistic counters and per-photo tap lock. `components/WingdexPhotoGallery.jsx`, `WingdexPhotoViewer.jsx`. | Keep API/table/counters unchanged. Jury gets a separate immutable -1/0/+1 table and controller. |
| Auth | `app/auth/login.jsx:140,363,403,578`; `app/auth/callback.jsx:296,449,881`; `lib/facebookOAuth.js:12,173`; `lib/notifications/deepLinks.js:34` already produces returnTo. | Login currently ignores returnTo and routes Home. Restore a validated internal route plus bounded pending save intent across password/signup/OAuth, exactly once. |
| Shared UI | `components/ui/OperationUI.jsx`, `src/theme/operationTokens`, React Native Paper. | Reuse buttons/cards/chips/empty/loading states, touch targets and labels. Add Jury-specific loading/error/reveal states. Do not globally alter gallery image fallback to fix Social. |

### Agent A — all rating completion paths and qualifying ratings

Recommended qualifying rating definition: any persisted personal `destination_ratings` record, including Buffacoin, consistent with Wingdex personal-rated behavior; no additional upload/proximity/provenance requirement. Review whether malformed/unscored historical rows require explicit exclusion before coding; do not invent a new score threshold silently. Onboarding previews and guest null-user ratings do not qualify for an authenticated user's lists.

| Entry point | Persistence anchor | Cleanup consequence |
| --- | --- | --- |
| Signed-in Home | `app/(tabs)/home/index.jsx:2627` calls `submit_validated_restaurant_rating`; rating ID `:2646`; SQL insert `20260729127000_wing_shots_home_rating.sql:140`. | Cleanup at rating commit even if subsequent photo upload (`:2680`) fails. |
| Signed-in Crawl | `app/crawl/[id].jsx:1229` calls `submit_validated_crawl_rating`; SQL upsert `20260729120500_wing_shots_rating_provenance.sql:322`. | Cover INSERT and UPDATE. |
| Wingdex Buffacoin | `app/(tabs)/ratings/index.jsx:1529` -> `lib/buffacoinRatingTransaction.js:10` -> `submit_buffacoin_rating_v1`; SQL `20260729153000_serrano_trust_repair.sql:122`. | Do not alter wallet/idempotency logic. |
| Login/callback seed replay | `app/auth/login.jsx:363`, `app/auth/callback.jsx:296` use same Buffacoin helper. | Database cleanup covers replay without a UI completion callback. |
| Guest Home/Crawl | Home `:2661`, Crawl `:1251` direct null-user writes. | Skip personal collection cleanup; preserve existing behavior. |
| Onboarding preview | `components/OnboardingFlow.tsx:895,936,954` local preview/seed/event only. | No collection cleanup until actual authenticated seed persistence. |

Implement a database trigger on `destination_ratings` INSERT and relevant UPDATE, skipping null user IDs. It deletes Want to Try in the SAME transaction as a qualifying rating; a rollback leaves both unchanged. A shared transaction-scoped lock on `(user_id,destination_id)` must serialize collection additions and rating commits. Rating-side acquire must precede eligibility-changing writes (BEFORE trigger); AFTER trigger performs cleanup. Collection add obtains the same lock, then rechecks eligibility using a fresh statement snapshot. Test both race orderings under READ COMMITTED, upsert, user/destination changes and retries. Acquire old/new identity locks in deterministic order and audit interaction with existing wallet/crawl/operation locks to avoid deadlocks. Cover DELETE/reassignment of final rating with Favorite removal; never auto-create Want to Try. UI invalidation improves freshness but is not the invariant. Do not clean up on upload success, wizard close or local analytics events.

### Agent B — security and schema evidence

- `supabase/migrations/20260729120000_wing_shots_core.sql:502` creates private `wing-submissions`; `20260729121000_wing_shots_security_rpc.sql:1011,1026` enables RLS/revokes media direct client access. Keep originals inaccessible through public discovery.
- `20261008232910_wing_photo_vote_gallery_eligibility.sql:4,54` replaces private gallery validation/count helpers. It assumes existing vote table/policies/triggers/grants; it does not establish them from scratch. No creation migration for `wing_media_photo_votes` was found in repository. Local fixture recreates reviewed behavior in `tests/wingdex-photo-vote-postgres.test.mjs:29`; do not mistake fixture success for deployed catalog parity.
- Older `20261007000241_image_workflow_rc_regression.sql:44` public-status/gallery rules include publishing states/original fallback; these are too broad for Jury. Use current approved-only canonical derivative boundary.
- `supabase/docs/database_map.md:5` warns exports are incomplete. `docs/wingdex-gallery-zoom-voting-readiness.md:21` records historical linked-project state, not fresh remote verification. Clean-reset readiness/live parity remain unproven.
- Destination coordinates use current `lat/lng` (`supabase/schema/Supabase Snippet DataDump.csv:485`); Home rating SQL already uses Haversine (`20260729127000_wing_shots_home_rating.sql:123`). Add/use rating `(user_id,destination_id)` lookup index only after inspecting whether existing unique index prefix already covers it.
- Two separate collection tables are the orchestrator's proposed contract; Agent B also identified a viable single table with unique `(user_id,destination_id)` and list_type enum. Either can enforce mutual membership, but keep the selected two-table contract stable across Phase 2/services unless review changes it.

### Agent C — Home removal boundaries and navigation

- Remove Home-specific mission import/state/load/focus/dismissal/action/entry/dialog/styles at `home/index.jsx:38,61,469–502,1056–1109,3028–3039,3348–3376,3990–4000,4138–4149`. Preserve qualifying rating action `:2695`; remove only its obsolete `refreshMissionSummary` callback (`:2700`).
- Preserve `lib/weeklyMission.js:74`, `components/WeeklyChallengeStats.jsx:20` (mounted in profile history `:1091`), `components/home/MissionDashboard.jsx` and shared rewards. `components/engagement/RetentionJourneyCard.jsx:28` uses dashboard but no live mount was found. Remove obsolete Home entry points; do not retire legitimate profile missions by inference.
- `20260730214940_weekly_mission_rating_reconciliation.sql:101,122` reconciles/claims rewards after rating INSERT. `20260723143000_engagement_retention.sql:380` grants XP with receipts. These remain. Historical assignments, migrations, achievements, XP and balances remain.
- Mission notification types `mission_nearly_complete` / `weekly_ending` and preferences exist in retention SQL `:161,169`. No local mission-specific cron/producer found; remote schedule status is unknown. Keep dispatch/background infrastructure; review any actual Home mission deep link before UI removal. No mission data deletion or scheduler changes authorized.
- Preserve Wing Facts state/loader/entry/dialog (`home/index.jsx:390,1663,3379,3888`) and `utils/funFacts.ts:7` fallback shared with onboarding/Crawls.
- Remove States Visited `StatCard` at `home/index.jsx:3190`; only eliminate dedicated percentage (`:1952`) / `openStats('states')` branch (`:1846`) and Home-only loads (`:1456`) after a consumer audit. Preserve current-state Wingdex and Top 50 cards (`:3188–3189`), states tables, Journey/progress/achievements and location logic. No database changes needed for this removal.
- Jury gameplay, Set Destination and directions remain guest accessible. Authentication is required only for saving and existing account-only actions. A guest chooses verdict locally before reveal. Guest sign-in prompt copy: “Found wings worth trying? Sign in to save this restaurant to your Want to Try list.” Offer Sign In / Create Account and Not Now.

### Social discovery — rating media must be exact

`app/(tabs)/leaderboards/index.jsx:388–400` loads the first approved RESTAURANT gallery photo into `restaurantShots[destination_id]`; `:1166,1191` renders it. No URI already means no image. `components/ui/OperationUI.jsx:53–57` leaves an unavailable block on failure; the current source does not use the reported black-logo placeholder here.

Plan: retain user, score, restaurant and detailed-rating navigation, label action “View Detailed Rating.” Resolve photo by exact rating identity, not destination cover. All/state `v_social_feed` projection (`20260622130000_add_social_opt_out.sql:46`) and client select (`leaderboards:797`) lack stable rating ID; friends RPC already has `rating_id` (`20260623190000_add_friends_system.sql:470`). Add rating_id to the feed projection without changing existing field ordering/visibility/sorting/pagination. Extend approved-public photo read with bounded `rating_ids`; require matching submission rating/user/destination and publicly readable rating. Photo `rating_id` is nullable since `20260729140000_wing_shots_unrestricted_sources.sql:6`, so unlinked restaurant/profile images must not fill a rating post.

Use Social-specific media state: unknown/loading, available, missing/permanently inaccessible, transient-error. Null/empty/missing/unlinked/deleted/private photos render text-only with no image wrapper, height/aspect ratio/margin, generic placeholder or image caption. Retain existing valid image sizing/interactions. Refresh expired signed URLs once and retry bounded transient failures; do not permanently cache network failure as absent. Resolve definitive 404/withdrawal/private to text-only. No upload/rating record edits. Test long restaurant names and text scaling on Android/iOS; preserve all/state/friends scopes and detail/profile taps.

## Recommended data schema, grants and migration strategy

Names are proposed contracts, not implemented objects. Match existing FK ID types from the local schema contract in Phase 2; do not infer from client string casts.

| Proposed object | Keys / constraints / indexes | Access |
| --- | --- | --- |
| `restaurant_favorites` | `(user_id,destination_id)` primary key; FK actual app user and destination; `created_at timestamptz not null default now()`; `(user_id,created_at desc,destination_id)` list index. | RLS own SELECT only; mutation via narrowly granted authenticated RPC. Add requires qualifying rating. Removal always allowed. No anon grants. |
| `restaurant_want_to_try` | Same keys/FKs/list index. Personal qualifying rating must NOT exist. | Same ownership; server eligibility and shared lock, cleanup on committed rating. No anon grants. |
| `wing_jury_votes` | `(user_id,submission_id)` primary key; `verdict smallint not null check (verdict in (-1,0,1))`; created_at; FK approved photo ID and account; `(submission_id,verdict)` count index. | Own SELECT, authenticated insert via RPC only; no client UPDATE/DELETE grants or policies. Enforce immutable rows with trigger as defense in depth. No anon records. Reject Supabase anonymous-auth users as well as null auth.uid(). |
| Approved-public eligibility helper / Jury read RPC | Central predicate mirrors live photo/consent/owner/withdrawal/canonical derivative boundary; partial index on `(destination_id,created_at,id)` for approved photo/live-owner/unwithdrawn candidates. | Internal service read only for private fields. Public Edge returns safe DTOs; server verifies JWT before personalized exclusion. |
| Exact-rating public photo lookup | `rating_id` stable feed column; existing unique submission rating relationship audit; bounded IDs. | Preserve social visibility; no private or unlinked-photo fallback. |

No score columns, gallery vote constraints or mission/state records change. No reuse of gallery votes, no writes to rating rows from Jury. An eligible restaurant cannot appear in both lists; eligibility is transaction-enforced, not a cross-table CHECK (Postgres CHECK is unsuitable for cross-table invariants). For deleted/invalidated last qualifying ratings, filter eligibility on reads and reconcile favorites server-side; never resurrect Want to Try automatically. Account-deletion FK behavior must follow the app's established deletion/anonymization contract and be tested before choosing CASCADE versus retained/pseudonymized Jury rows.

Use RPC desired-state operations, revoke default PUBLIC/anon EXECUTE, explicit authenticated grants, pinned search_path, auth.uid-derived ownership and real-account checks. RLS guards owner reads; revoked table DML forces eligibility through RPC. Privileged helpers in non-exposed schema only where needed; public wrapper is invoker, with narrowly granted internal function. Do not trust client user_id, JWT user_metadata or destination/rating claims. Immutable vote retries return the saved verdict (never overwrite) and reveal; conflicting retry verdict returns already-voted status. Recheck photo eligibility inside vote transaction, and never permit likes on revoked/unapproved material.

Create only NEW additive migrations in `crawl/supabase/migrations` via `supabase migration new` after Phase 2 authorization; never edit historical baseline SQL. First inspect local migration integrity/current-schema contract and gallery table/trigger existence, because later patches assume deployed objects. Update local contract/fingerprint and tests deliberately. Apply to disposable LOCAL DB only; no remote writes/migrations/production tests. No CLI reset unless local target is verified. Preserve rollback plan (disable entry flag and revert additive grants/functions safely; do not discard users' saved lists/votes).

Supabase docs reviewed: [RLS grants and policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostGIS](https://supabase.com/docs/guides/database/extensions/postgis). Changelog fetched via curl after browser markdown fetch failed. [September Postgres changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) and [extension pinning change](https://supabase.com/changelog/extension-version-pinning-ignored) reviewed; no extension upgrades/reindex/remote changes undertaken. Confirm local runtime/catalog before new geospatial dependencies.

## Wing Jury retrieval, reveal and vote coexistence

Use a dedicated read-only `wing-jury-feed` Edge boundary with bounded SQL selection, deriving signed-in identity from a verified bearer token, never request-body user_id. Guests use no Supabase anonymous sign-in. Reuse private bucket signing/eligibility code, but do not reuse existing gallery's unbounded candidate scan or per-restaurant Social requests.

Feed query filters approved, photo-only, live owner, valid publishing consent, not withdrawn, canonical processed derivative; includes current user's eligible photos. Auth query uses `NOT EXISTS wing_jury_votes WHERE user_id=auth.uid() AND submission_id=photo.id` (not verdict truthiness, so neutral excludes). Guest handler sends bounded session-seen IDs / uses memory Set; server bounds exclusions and pages. A fresh session may repeat. Pin location/order context for a page cursor; order by restaurant distance then deterministic creation/id tie breaks. Missing permission/timeout/invalid coords uses deterministic recent-photo ordering; restaurants lacking coordinates follow located candidates, with no false distance label. Never download entire photo universe for client sorting. Cursor must be opaque/tamper-validated and bound to order context; changing user or location resets cursor/exclusions. For strict nearest order, avoid arbitrary radius caps that silently omit closer photos.

Initial recommendation: SQL spherical distance on current numeric lat/lng with eligibility indexes and bounded output, benchmark using EXPLAIN ANALYZE on representative local fixtures. No PostGIS installed evidence found in local migrations. If scan cost exceeds budget, Phase 2 can use an additive PostGIS geography/generated-point + GiST index after local extension support is verified; exact distance sorting of candidates is needed because approximate KNN alone is not an exact global nearest contract. Acceptance target: bounded page (e.g. 12, cap 30), no N+1 signing; measure p95 on representative data, propose <1s API target and record fixture scale. Never report unmeasured performance as passed.

Before-verdict DTO: opaque case token, signed derivative URL, expiry; omit restaurant ID/name/location/address, uploader metadata and ratings. Token binds photo and expiry; no restaurant ID in accessibility labels, analytics or render tree. Signed URL may expose submission path and public gallery data may be cross-referenced: requirement is gameplay identity hiding, NOT cryptographic secrecy about already-public photos. Guest reveal is public READ only, UI-gated by a local verdict. Strong malicious-client reveal gating for guests is incompatible with no persisted guest proof; this requires explicit product review if intended.

Auth submit verifies token/auth/photo and inserts one immutable verdict transactionally, returns safe reveal only AFTER commit. Reveal includes restaurant, `photoLikeCount`, existing Wingdex average, latest personal rating ordered `created_at desc,id desc`, personal eligible Favorite status and save action. Error/timeout keeps identity hidden until confirmed existing committed vote; retry is idempotent. Average comes from same Wingdex score convention, never Jury verdicts. Neutral is a real saved vote. Next excludes all permanent history; Close returns Home. Submission unavailable after vote gives graceful unavailable state and permits Next/Close.

Guest `registerVerdict` updates local state/seen Set, then requests public reveal; never calls gallery vote controller, Jury insert RPC, anonymous auth, engagement rewards or persistent vote analytics. Guest likes/dislikes/average must not change ANY public counts. Guests see Add to Want to Try; prompt only when tapped. No favorite claim from guest-local rating data. On sign-in, preserve restaurant intent, refetch eligibility and permit Want to Try only if still unrated; if rated, explain and offer Favorite. Do not replay guest verdicts as permanent votes. Clear personalized caches/session state on sign-out/account switch.

Default public Like count decision: show existing gallery `like_count` unchanged, and show Jury positive totals separately if product later wants them. This cleanly preserves existing gallery behavior; do not merge counters until explicit semantics are approved. Auth Jury likes are public via their own aggregate, no voter identities; guest reveal may read these counts without affecting them.

## Proposed shared service contracts

| Contract | Behavior |
| --- | --- |
| `getRestaurantCollectionState(destinationIds)` | Auth-only bounded `{destinationId,hasQualifyingRating,latestRating,isFavorite,isWantToTry}`. Never fetch another user's lists. |
| `listRestaurantCollection(kind,cursor,limit)` | Auth-only Favorites / Want to Try page with reusable Wingdex destination DTO; created_at/id stable order. |
| `setRestaurantCollection({destinationId,kind,saved})` | Auth-only desired state, server eligibility, idempotent; return authoritative state or `rating_required` / `already_rated` / `auth_required`. Removal succeeds independently of eligibility. |
| `selectDestination(destination)` | Validate canonical destination + finite coords, persist existing key, emit existing event, navigate canonical Home; manual selection remains locked against automatic nearest update. |
| `takeMeThere(destination)` | Await selection, launch shared platform maps helper with fallback; if maps fails Home selection survives and user sees retry. |
| `getWingJuryPage({location,cursor,sessionSeen,limit})` | Guest/public read; authenticated history exclusion derived from token. Safe before-verdict DTO only. Missing location does not gate feed. |
| `registerJuryVerdict(caseToken,verdict)` | Guest branch local-only verdict/seen state + public read; auth branch immutable insert/confirm transaction. UI state `loading -> judging -> submitting -> revealed -> next`, plus recoverable failure/empty/unavailable. |
| `getJuryReveal(caseToken)` | Guest public reveal read after local verdict; auth requires committed vote. Authoritative average/counts, authenticated latest rating/collection status; guest no private fields. |
| `requestRestaurantSave(intent)` | Guest prompt with Not Now; store expiring `{version,action,destinationId,returnRoute,createdAt}` locally only on affirmative auth choice; validate route allowlist, consume once after successful login+onboarding. Recheck eligibility; never blind replay. |
| `loadPublicRatingPhotos(ratingIds)` | Approved-public exact rating association with typed available/missing/transient result, refreshed expiring URLs. No restaurant-cover substitution. |

## Seven-phase implementation checklist and acceptance criteria

| Phase | Work / dependencies | Exit criteria |
| --- | --- | --- |
| 1 — Discovery | A/B/C/D findings, Git safety, baseline, this plan. | Code paths and invariants documented; baseline actual results; review choices named; documentation only; STOP. |
| 2 — Local DB and API contracts | Depends on 1 approval. Verify catalog/baseline; additive collection/Jury objects, serialized cleanup, safe public feed/reveal and exact-rating photo read, stable feed rating ID. | Local allow/deny RLS tests: guests zero DML; ownership spoof denied; -1/0/+1 unique immutable votes, own-photo allowed; revoked media denied; concurrent rating/save invariant; all rating paths covered; migration integrity and schema harness pass. No remote changes. |
| 3 — Services and state | Depends on 2. Collections, destination/maps, Jury controller, expiring intent restoration; rating completion invalidation. | Retry/account-switch/race tests; Set Destination updates Home only; Take Me There selects and launches native maps with fallback; seed replay cleanup; no guest vote/reward/count writes; allowlisted return intents consumed once after password/signup/OAuth. |
| 4 — Wingdex UI | Depends on 3. Favorites / Want to Try tabs, detail/card save actions, auth prompt and focus refresh. | Personally rated only Favorites; personally unrated Want to Try even when community rated; persisted rating removes item without refresh; removal/retry/empty/error tested; browse/gallery/Journey unchanged. |
| 5 — Home Jury and Social UI | Depends on 2–4. Replace mission compact entry with Jury beside Facts, remove States Visited and reflow; judging/reveal/Next/Close; exact-rating Social photo state. | Guests play without auth and reveal locally, session repeats prevented; authenticated permanent neutral/positive/negative exclusion; identity absent until success; complete reveal/save rules; no mission or States Visited Home entry/gaps; Facts/ratings/progress preserved; Social null/private/deleted photos text-only, valid images preserve layout, transient errors retry; detailed-rating/profile navigation retained. |
| 6 — Regression/security/performance/mobile | Depends on 5. Meaningful runtime DB concurrency/access tests, service tests, Android/iOS layout/navigation and location-denied/timeout tests. | Baselines remain pass without new lint/type errors; gallery mutable votes unchanged; Jury never changes rating/XP/guest totals; exact ordering/exclusion, bounded query/signing and count plans measured; accessible verdict labels/state/target sizes, text scaling and long names; real device/build evidence or explicit pending limitation. |
| 7 — Review and final handoff | Depends on 6. Review scope, evidence, schema/grants, rollback and remaining risks; maintain this document. | Requirements traced to tests/code, exact changed files and limitations listed, owner review ready. No commit/push/deployment/production write/remote migration unless separately authorized. |

## Risks and review decisions

1. Public Like count semantics need review: recommended gallery count stays unchanged, Jury tally separate. Combining sources risks double counting the same person's gallery/Jury likes and breaking current gallery counters.
2. Qualifying rating includes Buffacoin per personal Wingdex behavior; confirm whether any scored personal row qualifies (recommended) versus new provenance requirement. Never silently restrict to photo-upload eligibility.
3. Identity hiding is UI/API minimization over public photos; guest local verdict cannot prove to a hostile client that a verdict happened. Strict secrecy would need a different product requirement.
4. Weekly Missions backend/profile rewards remain active. Review notification routes that might lead to a removed Home dialog; do not delete historical data or shared XP to remove a card.
5. Legacy `/home` versus tab Home routing, OAuth/onboarding return redirects and duplicate ratings screens can strand selected destinations/intents. Explicit canonical-route regression coverage is required.
6. Rating-versus-save concurrency needs shared DB serialization and runtime testing; a simple front-end delete or RLS NOT EXISTS alone races. Trigger failures can block ratings, so test rollback and avoid external calls in triggers.
7. Service-role public media boundaries must validate eligibility manually and recheck moderation; signed URLs remain usable until expiry. Do not expose originals/pending/private metadata or trust submitted IDs for ownership.
8. Separate private lists/cache keys per account; refresh on focus/commit, cancel stale requests on identity change. Signing expiry/transient errors currently risk false missing-photo caching.
9. Existing gallery scans all candidates and signs them before pagination; do not copy that cost into nearest-first feed. Proximity precision, missing destination coordinates, antimeridian and distance ties need fixtures.
10. Current tests include source assertions; they do not prove RLS concurrency, native accessibility/layout or deployed schema. Remote catalog/scheduler/production media health remain unverified by design.

## Likely files to change after authorization

- `crawl/supabase/migrations/<new CLI-generated migrations>.sql`; local contract/fingerprint artifacts per existing scripts; `crawl/tests/database/*`.
- New `crawl/supabase/functions/wing-jury-feed/index.ts` (or equivalent cohesive Jury read boundary) and shared approved-public eligibility/signing helper; `crawl/supabase/functions/wing-public-gallery/index.ts` for separate bounded exact-rating lookup; `crawl/supabase/config.toml` explicit function auth settings.
- New `crawl/lib/restaurantCollections.js`, `wingJury.js`, `destinationSelection.js`, maps and pending auth-intent helpers; new DTO types/hooks/tests.
- `crawl/app/(tabs)/ratings/index.jsx`, `crawl/app/(tabs)/home/index.jsx`, `crawl/app/(tabs)/leaderboards/index.jsx`; new Jury dialog/component; Home-specific mission removal code. Shared `OperationUI.jsx` only if adding opt-in media behavior (avoid global fallback regression).
- `crawl/app/auth/login.jsx`, `crawl/app/auth/callback.jsx`; relevant OAuth intent handling; `crawl/app/crawl/[id].jsx` for map reuse and postcommit collection invalidation.
- Home/quick-actions/mission/Social/gallery/auth/navigation tests and selectors; legacy `crawl/app/index.jsx`, `app/home/index.jsx`, `app/ratings/index.jsx` only if canonical route fix is needed and reviewed.
- This `docs/codex-handoff.md`. No historical mission migrations, uploads, ratings, Journey/achievement calculations targeted for deletion.

## Baseline validation and evidence limits

Commands run from `crawl/`. Local npm dependencies already present; no installation needed.

- `npm run typecheck`: PASS, exit 0.
- `npm run lint`: PASS, exit 0; 95 existing warnings, 0 errors. No fix mode used.
- `npm run test:auth`: PASS, 24/24.
- `npm run test:analytics`: PASS, 5/5.
- `npm run test:quick-rating`: PASS (script reports success without test count).
- `node --test tests/wingdex-gallery-contract.test.mjs tests/wingdex-gallery-device.test.mjs tests/wingdex-photo-server.test.mjs tests/wingdex-photo-viewer.test.mjs tests/wingdex-photo-voting.test.mjs tests/wingdex-photo-vote-postgres.test.mjs tests/wingShotsHomeRating.test.mjs tests/wingShotsSocialCommunity.test.mjs tests/wing-shots-component-contract.test.mjs tests/wing-shots-social-client.test.mjs`: PASS, 100/100 (98 top-level plus 2 nested). Includes local PGlite checks; Deno-specific optional path not exercised because `WINGDEX_DENO` not enabled.
- `node --test tests/wing-shots-native-config.test.mjs`: PASS, 3/3.
- `node --test --experimental-default-type=module tests/home/weekly-mission-home-surface.test.js tests/home/quick-actions-home.test.js tests/weekly-mission.test.js tests/notifications/deep-links.test.js`: PASS, 24/24. Existing Home tests explicitly assert mission entry/styles; replace those obsolete UI expectations in Phase 5 while retaining shared mission tests.
- `npm run test:rls`: FAIL, 48/50 pass. Failing tests in `tests/database/migration-integrity-reconciliation.test.js:14,20`: “known current-schema migration is explicitly registered and checksum-stable” and “recovered Phase 1 migrations are present as unique root files.” These are pre-existing schema/migration evidence failures, not newly introduced Jury behavior.
- `npm run migration:integrity`: FAIL. 69 root migrations, duplicate timestamp `20260729200000`, 27 checksum mismatches, 17 unmanifested root migrations, zero legacy archives. Duplicate guard `supabase/validation/duplicate-migration-guard.ps1:7` groups full filenames and does not prove timestamp uniqueness. Phase 2 must reconcile baseline evidence deliberately before additive migrations; do not blindly regenerate checksums or edit history to make the test green.
- Agent D found Android Gradle wrapper/config and installed `adb.exe`; no iOS directory, `xcrun`, or standalone `gradle` command. `eas.json` has internal dev-client and production Android app-bundle profiles. Absence of global Gradle does not alone prove wrapper builds impossible; builds were not attempted.
- Android/iOS builds and real-device layouts not run during read-only discovery. No production-readonly smoke suites run because test actions/environment safety require inspection first; no remote database queries or writes used.

## Resume instructions and exact Phase 2 next action

STOP at Phase 1. Phase 2 requires a new authorization from the user. On resume read this file, inspect `git status --short --branch`, confirm `feat/wing-jury-favorites-want-to-try`, and preserve unrelated changes. Do not create another branch/worktree. Read Supabase and Supabase Postgres best-practices skills and applicable repository guidance once. FIRST reproduce `npm run migration:integrity` and inspect `tests/database/migration-integrity-reconciliation.test.js` plus manifest/current-schema contract; establish the authoritative local baseline and missing gallery-table creation evidence without editing old applied migrations or silently blessing mismatches. Then settle Like-count semantics/qualifying-rating choice, define additive schema/RPC contracts and LOCAL security/concurrency tests before using `supabase migration new`. No remote migration, production write, commit, push or deployment is authorized by this handoff.

Final Git verification: feature branch active; only `docs/codex-handoff.md` and `docs/phase-2a-database-baseline-reconciliation.md` are untracked/changed. No application, test, configuration or SQL files changed. No commits/pushes/deployments, new worktrees or remote database operations. All required Phase 1 discoveries and amended requirements are captured; baseline failures are explicit and Phase 2 starts with their reconciliation.

## Phase 2A - database baseline reconciliation

The complete reconciliation report is [docs/phase-2a-database-baseline-reconciliation.md](/C:/Users/Brand/repo/BuffagoApp/docs/phase-2a-database-baseline-reconciliation.md).

### Findings and root causes

- `npm run migration:integrity` reproduced `69` root migrations, `0` legacy archives, duplicate timestamp `20260729200000`, `27` checksum mismatches, and `17` unmanifested root migrations.
- The duplicate files are `20260729200000_duplicate_media_classification.sql` from `2dd3625` and `20260729200000_duplicate_media_classification_fixed.sql` from `f19635c`. The latter is an unmanifested corrective follow-up; its timestamp was reused.
- `22` checksum mismatches are LF/CRLF byte-policy differences. `5` have content differences: creator rewards (`193e6b0`), notifications (`f66fd00`), creator surfaces (`193e6b0`), image workflow (`74182f0`), and the current photo-vote candidate. Exact expected/actual hashes and all files are in the report.
- The `17` unmanifested files are historical Wing Shot/Jalapeno/Mango Habanero/upload/review/mission migrations added after the candidate manifest convention was established. The manifest has no safe repository generator and is not proof of applied production bytes.
- The two `npm run test:rls` failures are both migration-integrity assertions: `27 !== 0` checksum mismatches and `1 !== 0` duplicate versions. They are not RLS-policy failures.
- Focused photo/RLS fixtures passed `35/35` in PGlite. This remains isolated fixture evidence, not deployed catalog or live concurrency evidence.
- Supabase CLI `2.107.0` is installed, but Docker/local Postgres is unavailable; no local migration list or database operation could run.

### Safe fixes and remaining discrepancies

No SQL, historical migration, timestamp, manifest hash, RLS policy, test assertion, remote ledger, or database was changed. No safe reconciliation procedure could be established from repository evidence alone. The baseline remains blocked by unresolved applied-byte/ledger provenance, duplicate version, unmanifested files, and unavailable isolated Postgres runtime. The current checker and tests were intentionally left strict.

### Commands/results and files modified

- `npm run migration:integrity` - FAIL, expected baseline discrepancies above.
- `npm run test:rls` - FAIL, `48/50`; only the two migration-integrity subtests fail.
- Focused photo security suite - PASS, `35/35`.
- `supabase --version` - `2.107.0`; `supabase status`/`migration list --local` blocked by unavailable Docker/Postgres, with no writes attempted.
- Files modified: `docs/codex-handoff.md` and `docs/phase-2a-database-baseline-reconciliation.md` only. No application, test, configuration or SQL file changed.

### Phase 2B next action and resume instructions

Do not create Favorites, Want to Try, or Wing Jury migrations yet. On resume, confirm this branch and status, read the Phase 2A report, obtain or authorize an authoritative migration-ledger/applied-byte reconciliation plan, and verify a disposable local Postgres runtime. Rerun the exact commands above after any approved metadata-only repair. Only after integrity and security baselines are demonstrably reconciled should Phase 2B define additive schema/RPC contracts and request migration authorization.

## Phase 6A — independent UI cleanup (running out of sequence)

Status: PASS for the three scoped UI changes. Phase 6A was intentionally run while Phase 2A remains blocked. No migrations, database objects, backend APIs, rating rows, photo rows, commits, pushes, deployments, remote database operations, or destructive cleanup were performed.

The three implementation slices were kept separate and reviewed serially where Home/Social files could overlap:

- Agent A result — Weekly Missions was removed from canonical Home, including its Home-only loading, dismissal, dialog, entry point, navigation callbacks, and styles. Shared mission libraries, profile-history mission UI, reward/achievement infrastructure, Buffacoin calculations, and rating-side mission recording remain untouched.
- Agent B result — States Visited was removed from the Home statistics row. State tracking/load/calculation data and the existing state stats branch remain available; State Wingdex and Top 50 cards remain and the row reflows without a blank slot.
- Agent C result — Social no longer loads the first destination gallery photo for a rating post. This removes the unrelated-photo/black-placeholder path and unused image spacing while retaining user, restaurant, score, detailed-rating navigation, pagination, sorting, authentication, and scope behavior. The current non-friends `v_social_feed` projection does not expose a stable rating/submission identifier, and direct `wing_media_submissions` reads are restricted; therefore no speculative photo match was implemented. The exact associated-photo limitation is documented here rather than changing schema or inventing a relationship. Existing friends feed rows retain their existing `rating_id` in the connector contract for future exact media work.

Files changed in Phase 6A:

- `crawl/app/(tabs)/home/index.jsx`
- `crawl/app/(tabs)/leaderboards/index.jsx`
- `crawl/tests/home/quick-actions-home.test.js`
- `crawl/tests/home/weekly-mission-home-surface.test.js`
- `crawl/tests/social/social-feed-no-image.test.js`
- this handoff

Regression and build verification:

- `node --test --experimental-default-type=module tests/home/quick-actions-home.test.js tests/home/weekly-mission-home-surface.test.js tests/social/social-feed-no-image.test.js` — PASS, 15/15.
- `node --test --experimental-default-type=module tests/operation-ui-overhaul.test.mjs tests/weekly-mission.test.js tests/image-workflow-mobile-runtime.test.mjs` — PASS, 31/31. Existing mission infrastructure and image-flow coverage remain green.
- `npm run typecheck` — PASS, `tsc --noEmit` exit 0.
- `npm run lint` — PASS, 0 errors and 95 pre-existing/general warnings. No lint error was introduced.
- Android/iOS screenshot/device smoke verification — unavailable in this environment; no device or simulator was connected. Static responsive assertions cover compact Home layout and no image wrapper/spacing in Social.

Remaining issues and limitations:

- The known migration-integrity baseline remains 27 checksum discrepancies and 17 unmanifested migrations; `npm run test:rls` was rerun read-only and remains 48/50 with exactly the two documented migration metadata failures. No migration metadata, SQL, or test was modified.
- Local PostgreSQL remains unavailable because Docker/Linux engine is unavailable and `127.0.0.1:54322` refuses connections. No database operation was attempted.
- Social exact rating-associated photo display for non-friends feed rows remains blocked by the existing projection/API boundary. Text-only rendering is the safe behavior until an authoritative stable association is available.

Exact next action: do not begin Phase 2B or Wing Jury/Favorites/Want to Try implementation. First obtain authoritative deployment-ledger/applied-byte evidence, a disposable local PostgreSQL runtime, and a safe migration-baseline reconciliation procedure; then rerun the baseline integrity/security checks and request explicit authorization for additive database work.

Resume instructions: remain on `feat/wing-jury-favorites-want-to-try`; inspect this handoff and `docs/phase-2a-database-baseline-reconciliation.md`; preserve the Phase 6A files above; resolve the database blocker using the documented safe evidence path; only after baseline checks pass, request authorization before implementing Phase 2B. Do not commit, push, deploy, touch Supabase migrations, repair historical checksums, or implement Wing Jury/Favorites/Want to Try in this phase.

## Phase 2A Final Reconciliation — verified production ledger evidence (2026-10-09)

Status: PARTIAL / BLOCKED. The supplied read-only Supabase inspection is authoritative for the rows present in the production migration ledger, but it does not establish the complete historical schema evolution or the exact bytes used by each deployment. No SQL, manifest, database, remote ledger, application feature, commit, push, deployment, or destructive operation was changed in this reconciliation.

The verified production evidence is project `vhfxnizaxdanmvmouuaf`, ACTIVE_HEALTHY, with 35 rows in `supabase_migrations.schema_migrations`, every row containing stored SQL statements, and versions ranging from `20260625000100` through `20261009201342`. The supplied evidence explicitly records these relevant statuses:

| Version | Local source | Remote ledger | Local manifest | Safe interpretation |
| --- | --- | --- | --- | --- |
| `20260729122000` | present | not recorded | present, checksum invalid | Historical SQL was edited in Git; applied status and applied bytes unknown. Do not rewrite or reapply. |
| `20260729126000` | present | not recorded | present, checksum invalid | Same. The 14-digit value is a migration version string accepted by the repository guard; its timestamp-like `26` hour component is not proof of a parser collision or invalid ledger row. |
| `20260729132000` | present | not recorded | present, checksum invalid | Historical SQL was edited in Git; applied status and applied bytes unknown. Do not rewrite or reapply. |
| `20260729200000` | two local files | not recorded | original only; `_fixed` unmanifested | Real local version collision. Neither path can be declared applied from ledger absence. Do not rename, delete, merge, or execute either file. |
| `20261007000241` | present | recorded | present, checksum invalid | Applied ledger row is verified; exact deployed SQL is unresolved because stored statement text/artifact was not supplied. Do not alter historical SQL or hash. |
| `20261008144550` | no exact local source | recorded | no exact local source | Remote-only ledger row with stored SQL. It may be the deployed counterpart of a local candidate, but no semantic or byte mapping is proven. |
| `20261008232910` | present | not recorded | present, checksum invalid | Candidate/local history is not permission to run it. Its relationship to the recorded October rows is unresolved. |
| `20261009201342` | no exact local source | recorded | no exact local source | Remote-only ledger row with stored SQL; local source mapping is unresolved. |

The complete 35-version ledger list was not included in the supplied evidence, so every other local root cannot honestly be classified individually as recorded or unrecorded. Locally there are 69 root files, one real duplicate version, 52 manifest entries, and 17 unmanifested roots. The manifest is a repository release-candidate record, not an authoritative production ledger.

### Specialist review results

The available runtime exposed no independent subagent execution surface, so the requested High-reasoning slices were performed serially and reviewed as separate ownership areas:

- Remote/local comparison: the bounded matrix above is supported; a complete row-by-row matrix still requires the full 35-row ledger and stored statement payloads or deployment artifacts.
- Five checksum discrepancies: the three July rows are known post-manifest Git edits; `20261007000241` is ledger-recorded but has unresolved applied bytes; `20261008232910` is not ledger-recorded and conflicts temporally/semantically with two recorded October rows. No checksum was changed.
- Duplicate review: `duplicate_media_classification.sql` came from `2dd3625`; `_fixed` came from `f19635c`. The SQL differs in the three-object inspection from `o.etag` to `o.metadata->>'eTag'`. This is a real version collision, not a validator interpretation problem. Neither file is safely removable or renamable without applied-status evidence.
- Manifest review: the 17 unmanifested roots have Git introduction history except `20260729210000_wing_upload_retry_idempotency.sql`, whose introducing commit is not reachable in the visible history. Adding them to the manifest would falsely convert provenance uncertainty into deployment evidence, so no rows were added.
- Security review: the reconciliation preserves strict migration assertions, RLS/security tests, private-storage assumptions, and historical SQL. No policy, grant, `SECURITY DEFINER`, or application behavior was changed. PGlite remains isolated evidence, not full Supabase/PostgreSQL integration.

### Validation results

- `npm run migration:integrity` — FAIL: 69 roots; duplicate `20260729200000`; 5 genuine content mismatches; 17 unmanifested. This is improved from 27 checksum mismatches because 22 line-ending-only differences are now handled without suppressing content drift.
- `npm run test:rls` — FAIL, 50/52 passed. The only failures are the two strict migration-integrity assertions (`5 !== 0` and `1 !== 0`); no RLS/security assertion was weakened.
- `node --test --experimental-default-type=module tests/database/migration-integrity-reconciliation.test.js` — FAIL, 3/5 passed; both new validator regressions and the recovered hash test pass, while strict baseline assertions remain correctly failing.
- `powershell -NoProfile -ExecutionPolicy Bypass -File supabase\\validation\\duplicate-migration-guard.ps1` — FAIL as intended; reports both colliding `20260729200000` files.
- `node --test --experimental-default-type=module tests/wingdex-photo-postgres.test.mjs tests/wingdex-photo-server.test.mjs tests/wingdex-photo-voting.test.mjs` — PASS, 32/32 focused isolated photo/security tests.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 existing warnings.
- `supabase status; supabase migration list --local` — unavailable: Docker Desktop/Linux engine is not running and `127.0.0.1:54322` refused the connection. No database operation was attempted.

### Phase 2B decision gate

Phase 2B remains BLOCKED. Version uniqueness, trustworthy ordering, authoritative checksum reconciliation, and applied-versus-unapplied ambiguity are unresolved. The security gate is preserved, and the validator now detects real drift, but passing isolated SQL/PGlite tests cannot authorize additive migrations.

The exact remaining evidence is:

1. The complete ordered 35-row remote ledger (`version`, `name`, and stored `statements`) from an authorized read-only inspection.
2. The deployment artifact or CI bundle and SHA-256 for each of the five mismatch versions plus the recorded October versions `20261008144550` and `20261009201342`.
3. If no artifacts exist, read-only catalog definitions (`pg_get_functiondef`, `pg_get_viewdef`, relevant `information_schema`/`pg_catalog`) for semantic comparison, explicitly labeled weaker than byte provenance.
4. Evidence showing whether either `20260729200000` path and the 17 unmanifested files were applied through a mechanism that did not write the standard ledger.
5. A disposable Docker-backed PostgreSQL/Supabase runtime before claiming clean-initialization or full live RLS validation.

Preserved initiative scope: Wingdex Favorites; Want to Try; Set Destination; Take Me There; Wing Jury blind voting; guest verdicts without persistence; sign-in prompts for saving; photo proximity ordering; completed Phase 6A Home Weekly Missions removal, Home States Visited removal, and Social missing-image cleanup. The exact Social rating-photo association follow-up remains open because the non-friends projection lacks a stable association identifier.

Exact next action: keep Phase 2B blocked and obtain the five evidence items above through an authorized read-only process. Resume by reading this handoff and `docs/phase-2a-database-baseline-reconciliation.md`, confirming the same branch and dirty files, then rerunning the listed checks after evidence review. Do not use `db push`, `db reset`, `migration repair`, remote writes, migration renames/deletions, or feature implementation.

## Phase 2B LOCAL — database foundations (2026-10-09)

Status: PASS for local-only schema design and isolated behavior tests. This does not change Phase 2A’s historical migration status, does not authorize production deployment, and does not authorize Wing Jury/Favorites/Want to Try UI work. No remote database, migration ledger, production schema, historical SQL, manifest, commit, push, deployment, or reset was touched.

The requested `docs/supabase-migration-evidence-2026-10-09.md` filename was absent. The supplied evidence was reviewed from the existing working-tree file `docs/buffago_remote_migration_evidence_2026-10-09.md` (80 lines), alongside this handoff and `docs/phase-2a-database-baseline-reconciliation.md` before implementation.

### Local staged SQL

- `crawl/supabase/local/phase-2b/20261009_local_phase2b_foundation.sql`
- `crawl/supabase/local/phase-2b/README.md`

The SQL is intentionally outside `crawl/supabase/migrations/`, so it does not fabricate a historical migration, alter the integrity inventory, or imply deployment. It assumes the existing canonical Buffago tables and photo eligibility boundary; the test fixture supplies reduced isolated prerequisites.

### Objects, constraints, and authorization

- `public.user_destination_favorites`: composite primary key `(user_id, destination_id)`, destination/user foreign keys, destination index, authenticated owner-only RLS. Insert validation requires an existing rating by the same user. Unique conflict handling supports idempotent favorite requests.
- `public.user_want_to_try`: composite primary key `(user_id, destination_id)`, destination/user foreign keys, destination index, authenticated owner-only RLS. Insert validation rejects already-rated restaurants and uses a per-user/destination advisory transaction lock.
- `public.wing_jury_votes`: composite primary key `(submission_id, user_id)`, `vote in (-1, 0, 1)`, photo/user foreign keys, authenticated own-read/insert RLS, and no ordinary-user update/delete grants or policies. Neutral is a persisted completed vote.
- `public.wing_jury_photo_vote_counts`: separate aggregate table with nonnegative counts and an index on `like_count`. Its trigger counts only `+1` rows from `wing_jury_votes`; it never updates existing mutable gallery-vote counters or restaurant ratings.
- Private security-definer trigger helpers enforce authentication, ownership, approved/public photo eligibility, immutable jury identity, rating cleanup, and advisory-lock ordering. The only helper granted to authenticated users is the non-exposed photo-eligibility predicate needed by the aggregate RLS policy.

### Rating integration

An `AFTER INSERT` trigger on `public.destination_ratings` removes the matching Want to Try row. This covers the existing Home, Crawl, Buffacoin, onboarding replay, and other successful paths because they persist through the canonical rating table; no caller or rating RPC was modified. A rolled-back/failed/draft attempt does not insert a committed rating and does not remove Want to Try. An `AFTER DELETE` trigger removes a Favorite so deletion cannot leave an invalid favorite. The inspected canonical table has no separate rating-withdrawal column; any future soft-withdrawal path must call the same cleanup in its transaction and receive a dedicated review.

### Local validation

- `node --test --experimental-default-type=module tests/database/phase-2b-local-foundation.test.mjs` — PASS, 7/7. Covers favorite eligibility/removal/idempotency, Want to Try unrated eligibility and successful/rolled-back rating cleanup, anonymous/cross-user denial, vote immutability, neutral persistence, vote constraints, approved-photo eligibility, concurrent duplicate submission handling, +1-only counts, gallery-vote isolation, restaurant-rating isolation, and entry-point contracts.
- `node --test --experimental-default-type=module tests/wingdex-photo-postgres.test.mjs tests/wingdex-photo-server.test.mjs tests/wingdex-photo-voting.test.mjs` — PASS, 32/32. Existing photo/gallery security remains green.
- `npm run test:rls` — FAIL, 50/52; only the two historical migration-integrity assertions fail. No security assertion was weakened.
- `npm run migration:integrity` — FAIL, unchanged: 69 roots, duplicate `20260729200000`, 5 checksum mismatches, 17 unmanifested.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 existing warnings.

PGlite provides isolated PostgreSQL behavior coverage, including serialized same-instance duplicate submissions. It is not a full Supabase/PostgreSQL integration environment and does not prove true cross-session concurrency, production catalog compatibility, clean historical initialization, or live RLS. Docker/PostgreSQL remains unavailable (`127.0.0.1:54322` refused and Docker Desktop/Linux engine unavailable).

### Phase 2A and release gate

Phase 2A remains PARTIAL / BLOCKED. The supplied remote evidence and stored-statement MD5 fingerprints (`20261007000241` `629d2f0809661b0d2886f6e58c939f90`, `20261008144550` `9237cb7e3c4fda5709a29a12839aedd5`, `20261009201342` `009dd8fbf37a2198e666e1aa06427a65`) informed compatibility review but do not authorize replay or deployment. New foundations remain local-only until applied-byte provenance, duplicate/unmanifested status, a safe migration chain, and full PostgreSQL verification are established.

Exact next action: keep Phase 2A blocked and do not begin UI or production migration work. Obtain a disposable Docker-backed Supabase/PostgreSQL runtime, execute the staged SQL only in that isolated environment, add true two-session concurrency tests, and reconcile the staged objects against the authoritative production catalog before creating any release migration. Preserve the Phase 6A UI results and the Social exact rating-photo association follow-up.

Current branch/status: `feat/wing-jury-favorites-want-to-try`; all prior UI, validator, test, and documentation changes remain preserved. No commits, pushes, deployments, remote migrations, remote writes, database resets, or destructive cleanup occurred.

## Phase 2A Recovery — provenance and validator correction

Status: PARTIAL / BLOCKED. Concrete local progress was made, but Phase 2B is not authorized. No migration SQL, manifest row, database, remote ledger, production environment, or application feature code was changed. Phase 6A files and its Social photo-association follow-up are preserved.

### New provenance findings

The manifest was introduced as release-candidate documentation, not a deployment ledger:

- `6fb5cde` (2026-07-23 23:06) first recorded candidate checksums, but the table was not machine-readable to the checker.
- `2926bf5`, `fd8f114`, and `b39be75` successively changed the table shape. `b39be75` is the first snapshot where the checker can parse all nine initial rows.
- A read-only historical replay of every manifest-editing snapshot shows the last internally consistent snapshot was `99c5a8d` (`QA Testing Video release`, 2026-07-29 15:06:58): 42 root files, 42 manifest rows, no content mismatches, no unmanifested files, and no duplicate versions under the corrected line-ending/version interpretation. This establishes a last-known repository-consistent point, not proof that production applied those bytes; no historical command log proves the checker was actually run then.
- `67a26db` (2026-07-29 19:42) is the first later break: it introduced five unmanifested migrations and left three already-manifested migration files with content drift.
- `e916fdde` (2026-07-30 20:58) is where the duplicate timestamp becomes visible in the root set: `20260729200000_duplicate_media_classification.sql` already existed, and the later `_fixed` file reuses the same 14-digit version. The collision is a real migration-version collision, not merely a filename interpretation issue.
- `74182f0` (2026-10-07 19:50) added the applied image-workflow migration and its manifest row, but the committed LF blob hash is neither the manifest hash nor its CRLF representation. The manifest says the remote ledger version was verified, but the repository evidence cannot establish which exact SQL bytes were applied.
- `67a0ade` (2026-10-09 16:03) added the candidate photo-vote migration with the same hash problem: its committed LF and CRLF hashes both differ from the manifest row.

The 17 unmanifested files were introduced by identifiable historical commits: `6693513` (rating rule), `d057dc6` (Mango Habanero dashboard/priority), `193e6b0` (Jalapeño authority/social), `f19635c` (duplicate fix and upload retry), `1a32c7d` (staging/rate-limit files), `5832ff7` (upload validation, mission reconciliation, legacy finalizer), `c113a97` and `6bed0c1` (review lifecycle), and `5b3df73` (review reconciliation/contract fix). One tracked unmanifested file, `20260729210000_wing_upload_retry_idempotency.sql`, has no reachable introducing commit in the visible Git history; its blob is present in `HEAD`, which is additional provenance ambiguity requiring external evidence.

The five true content mismatches and their causes are:

- `20260729122000_wing_shots_creator_rewards.sql` — `193e6b0` changed reward ledger labels from Creator XP to Creator Reputation.
- `20260729126000_wing_shots_notifications.sql` — `f66fd00` changed notification copy from Creator XP to Creator Reputation.
- `20260729132000_wing_creator_surfaces.sql` — `193e6b0` changed rejection-category mapping and user-safe copy.
- `20261007000241_image_workflow_rc_regression.sql` — added by `74182f0`; manifest hash does not match either committed LF or CRLF bytes.
- `20261008232910_wing_photo_vote_gallery_eligibility.sql` — added by `67a0ade`; manifest hash does not match either committed LF or CRLF bytes.

The first three are historical SQL edits after the manifest entry was recorded and may affect persisted function behavior. The last two are candidate/applied byte-provenance discrepancies. Repository inspection alone cannot determine whether production used the manifest bytes, the committed SQL bytes, or another deployment artifact.

### Safe tooling correction performed

Two minimal validator-only fixes were made; migration SQL and manifest data were not rewritten:

- `crawl/scripts/check-migration-integrity.mjs` now accepts the manifest hash against either raw checkout bytes or CRLF-normalized canonical text. This preserves exact content checking while eliminating false Windows line-ending failures from the manifest’s mixed historical LF/CRLF conventions.
- `crawl/supabase/validation/duplicate-migration-guard.ps1` now groups the 14-digit migration version prefix instead of the full filename. It now correctly fails on `20260729200000` and identifies both colliding files.
- `crawl/tests/database/migration-integrity-reconciliation.test.js` adds regression coverage for Windows line-ending portability and version-prefix duplicate detection. Existing strict baseline assertions were not weakened.

### Validation and comparison

- Before correction: `npm run migration:integrity` — FAIL, 69 roots, duplicate `20260729200000`, 27 checksum mismatches, 17 unmanifested.
- After correction: `npm run migration:integrity` — FAIL, 69 roots, duplicate `20260729200000`, 5 true content mismatches, 17 unmanifested. This is an improvement of 22 false line-ending reports; the baseline is still not trusted.
- `npm run test:rls` — FAIL, 50/52 pass; exactly the two strict migration-integrity assertions fail (`5 !== 0` and `1 !== 0`). The suite’s test count increased by the two new regression tests; no security assertion was weakened.
- `node --test --experimental-default-type=module tests/database/migration-integrity-reconciliation.test.js` — FAIL, 3/5 pass; the two strict baseline assertions fail, while the two new validator regressions pass and the recovered Phase 2 hash test passes.
- `powershell -NoProfile -ExecutionPolicy Bypass -File supabase\validation\duplicate-migration-guard.ps1` — FAIL as intended, explicitly reporting both `20260729200000` files.
- `node --test --experimental-default-type=module tests/wingdex-photo-postgres.test.mjs tests/wingdex-photo-server.test.mjs tests/wingdex-photo-voting.test.mjs` — PASS, 32/32. This remains isolated PGlite/fixture evidence, not full Supabase integration.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 existing warnings.
- `supabase status; supabase migration list --local` — FAIL to connect because Docker Desktop/Linux engine is unavailable and `127.0.0.1:54322` refuses connections. No database operation occurred.

### Decision gate

- Version uniqueness: FAIL; one real collision remains.
- Trustworthy ordering: FAIL until the collision is reconciled against the applied ledger.
- Authoritative checksum strategy: PARTIAL; local validator is now line-ending portable, but five content rows and mixed historical manifest provenance remain unresolved.
- Applied-migration ambiguity: FAIL; the repository cannot establish whether unmanifested migrations or either duplicate were applied.
- New migration validation: IMPROVED locally; it now detects real content drift and duplicate versions correctly, but cannot replace applied-byte/ledger evidence.
- Security testing: preserved; focused PGlite security tests pass 32/32 and the broader RLS suite’s non-integrity tests pass. Full Supabase/RLS catalog verification remains unavailable without Docker/Postgres.

### Required external evidence and precise read-only checks

No remote access was used. A human with authorization must later run, from `crawl/`, a read-only linked inspection such as `supabase migration list --linked` and capture the complete version/name ledger. If direct SQL access is authorized, capture:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

That ledger distinguishes which of the 17 unmanifested versions and which duplicate-version path were applied, but it cannot prove applied SQL bytes. For every applied version in the five content-mismatch set and the two new October rows, obtain the deployment artifact or CI release bundle that supplied the SQL and its SHA-256. Compare those bytes against both the manifest hash and the committed Git blob hash. If no applied-byte artifact exists, compare authoritative catalog definitions using `pg_get_functiondef`, `pg_get_viewdef`, and relevant `information_schema`/`pg_catalog` queries, documenting that catalog equivalence is weaker than byte provenance. Do not run `db push`, `db reset`, `migration repair`, or any write-capable command as part of this evidence collection.

Exact next action: keep Phase 2B blocked. Obtain the linked migration ledger plus applied-byte/deployment artifacts, resolve the duplicate’s applied status and the 17 unmanifested statuses, then decide whether to preserve historical files, create a separately documented baseline reconciliation, or stop for irreducible ambiguity. Only after that evidence is reviewed and the strict integrity/security gates pass may Phase 2B request authorization.

Files changed in this recovery: `crawl/scripts/check-migration-integrity.mjs`, `crawl/supabase/validation/duplicate-migration-guard.ps1`, `crawl/tests/database/migration-integrity-reconciliation.test.js`, and this handoff. No migration SQL, manifest, application UI, feature table, remote database, commit, push, or deployment was changed.

## Phase 3 — Wingdex Favorites and Want to Try (2026-10-09)

Status: LOCAL CLIENT IMPLEMENTATION COMPLETE / RELEASE BLOCKED. The client experience is implemented against the staged Phase 2B contracts, but the production feature flag is disabled by default because the feature tables are not deployed and Phase 2A remains blocked. No Wing Jury UI, destination-navigation actions, feature migration, remote write, commit, push, or deployment was performed.

### Shared service and release gating

- `crawl/lib/savedDestinations.js` is the shared domain service for personal rating eligibility, Favorites, Want to Try, list loading, idempotent save/remove operations, guest handling, authentication intent persistence, and error mapping. It never uses Wingdex’s global unrated filter.
- `crawl/hooks/useSavedDestinations.js` owns per-user state, auth-transition clearing, request deduplication for rapid taps, list loading, and post-rating invalidation.
- `crawl/config/features.ts` adds `ENABLE_SAVED_DESTINATIONS`, default `false`. A local/preview build may explicitly set `EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS=true`; production remains off until the staged schema is authorized and deployed.
- Favorites require the authenticated user’s existing rating. Want to Try requires that user not have a qualifying rating. The staged database constraints/triggers remain authoritative; client preflight is only UX validation.

### Wingdex and authentication integration

- `crawl/app/(tabs)/ratings/index.jsx` adds an opt-in Discover/Favorites/Want to Try rail, personal saved-state controls on cards and details, loading/empty/error states, search within saved lists, retry behavior, and persisted state refresh after mutations.
- Rapid duplicate operations are deduplicated by the shared hook. State is refreshed only after successful requests; failed requests surface an actionable error.
- Successful Buffacoin rating completion invalidates Want to Try state after the transaction commits. Home, Crawl, onboarding replay, and other successful rating paths persist through the canonical `destination_ratings` table, where the staged `AFTER INSERT` trigger performs authoritative cleanup; failed/draft attempts do not insert and therefore do not clean up.
- `crawl/app/auth/login.jsx` consumes a single saved-action intent after authentication and returns the user to Wingdex to complete the requested save/remove operation. Guests never write saved-list tables and receive a sign-in/create-account prompt with a cancel path.
- Auth state changes clear user-specific saved state, preventing account-switch leakage.

### Phase 3 validation

- `node --test --experimental-default-type=module ./lib/savedDestinationIntent.test.js ./tests/saved-destinations-service.test.mjs` — PASS, 5/5. Covers one-time intent consumption, personal-rating eligibility, no global unrated reuse, unavailable-table mapping, guest no-write behavior, Want to Try eligibility/removal, and idempotent upsert behavior.
- `node --test --experimental-default-type=module ./tests/database/phase-2b-local-foundation.test.mjs ./tests/home/quick-actions-home.test.js ./tests/home/weekly-mission-home-surface.test.js ./tests/social/*.test.js` — PASS, 22/22. Preserves the local foundation and Phase 6A UI/Social regressions.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 96 warnings. Warnings are existing repository warnings plus no new lint errors; no warning suppression was added.
- `npm run test:rls` — FAIL, 50/52. Only the two known historical migration-integrity assertions fail; security assertions remain passing.
- `npm run migration:integrity` — FAIL, unchanged historical baseline: 69 roots, duplicate `20260729200000`, 5 genuine checksum mismatches, and 17 unmanifested migrations.

No Android/iOS device or emulator was available for screenshot/UI smoke verification in this run. The layout uses existing React Native Paper controls, wrapping action rows, 44px-class touch content, and existing responsive list patterns, but physical-device verification remains outstanding. The service tests are mock-backed; they do not claim live Supabase table/RLS integration.

### Exact Phase 3 files changed

- `crawl/app/(tabs)/ratings/index.jsx`
- `crawl/app/auth/login.jsx`
- `crawl/config/features.ts`
- `crawl/hooks/useSavedDestinations.js`
- `crawl/lib/savedDestinations.js`
- `crawl/lib/savedDestinationIntent.test.js`
- `crawl/tests/saved-destinations-service.test.mjs`
- `docs/codex-handoff.md`

### Remaining issues and next action

Phase 2A remains PARTIAL / BLOCKED. Phase 2B remains local-only and not deployment-authorized. The saved-list tables, triggers, and RLS policies must receive an approved release migration and full Docker-backed PostgreSQL/Supabase verification before enabling `EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS` for production. PGlite/local fixtures do not prove live RLS, clean historical initialization, or true cross-session concurrency.

Exact next action: keep the feature flag disabled, preserve this branch and worktree, obtain the outstanding migration-ledger/applied-byte evidence and disposable PostgreSQL runtime, then authorize and verify a release migration before enabling Phase 3 in any production build. Resume by reading this handoff, `docs/phase-2a-database-baseline-reconciliation.md`, the Phase 2B README/SQL, and the remote evidence document. Do not begin Wing Jury UI, deploy staged SQL, or modify historical migrations until that gate is cleared.

Git safety: branch remains `feat/wing-jury-favorites-want-to-try`; no branch/worktree was created, no commit/push/deployment occurred, no remote database write or migration was applied, and all pre-existing worktree changes were preserved. No independent subagent execution surface was available, so the requested work areas were reviewed serially by the orchestrator.

## Phase 4 — Destination Navigation (2026-10-09)

Status: PARTIAL / LOCAL COMPLETE. Destination navigation is implemented against the existing Home destination contract and is still gated by `ENABLE_SAVED_DESTINATIONS=false`. No database tables, migrations, remote flags, remote writes, Crawl state, commit, push, or deployment were changed.

### Architecture and implementation

- Existing Home selection uses `buffago:homeNextSpot` in AsyncStorage plus the `buffago:home_next_spot_selected` DeviceEventEmitter event. Home reloads that state on focus/app restart and updates its compact Nearby Spot card. Phase 4 formalizes the constants without replacing the existing behavior.
- Existing `selectedRoute` storage and Crawl route state remain separate. Set Destination does not create, alter, or overwrite a Crawl or route selection, so active Crawl progress is preserved.
- `crawl/lib/destinationNavigationCore.js` validates canonical restaurant IDs, coordinate ranges, and address fallback data; builds platform-specific directions URLs; and maps launcher failures to explicit errors.
- `crawl/lib/destinationNavigation.js` adapts the core helper to React Native Linking/Platform.
- `crawl/lib/homeDestination.js` persists Home destination state and emits the existing synchronization event.
- `crawl/app/(tabs)/ratings/index.jsx` adds separate Set Destination and Take Me There actions to Want to Try cards and restaurant details. Rapid destination actions are serialized. Set Destination persists and returns to Home; Take Me There first synchronizes Home, then launches external directions without requiring current GPS permission.
- `crawl/app/(tabs)/home/index.jsx` now imports the shared existing Home destination constants only; its compact layout, Wing Facts, Weekly Missions removal, and States Visited removal are preserved.

### Platform behavior

- Android prefers `google.navigation:q=lat,lng&mode=d` for valid coordinates and falls back to HTTPS Google Maps directions when unavailable.
- iOS uses Apple Maps directions with coordinate-first or encoded-address fallback, then HTTPS Google Maps if necessary.
- Coordinates are emitted latitude,longitude in the correct order. Invalid coordinates are not launched; a valid address may be used instead. Missing both details fails visibly.
- No background location permission or API key was added. Map-launch failures are surfaced to the user. The helper itself does not duplicate launches; UI actions are serialized while selection/launch is active.

### Validation

- `node --test --experimental-default-type=module ./tests/destination-navigation.test.mjs` — PASS, 5/5. Covers coordinate ordering, iOS address encoding, invalid/missing destination details, Android fallback behavior without duplicate opens, and Home persistence/event synchronization.
- Combined Phase 3/4 and preserved regression command (`destination-navigation`, saved-destination, Phase 2B local foundation, Home, and Social tests) — PASS, 31/31.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 warnings. Warnings are existing repository warnings; no suppressions were added.
- Live Android/iOS build, native map-app availability, and screenshot verification — unavailable in this environment; no device or emulator was attached. Platform launcher behavior is mock-tested only.

### Feature gate and remaining limitations

`ENABLE_SAVED_DESTINATIONS` remains false by default. Controlled local/preview testing requires `EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS=true`; production must not enable it until the Phase 2A migration gate, approved release migration, live RLS verification, and full PostgreSQL validation are complete. The saved-list service remains mock/local-fixture verified, not live Supabase verified.

Phase 2A remains PARTIAL / BLOCKED and Phase 2B remains local-only. The exact next action is to keep the feature disabled, obtain the outstanding migration ledger/applied-byte evidence and Docker-backed PostgreSQL runtime, then authorize and verify the release migration before enabling Phase 3/4 in production. Phase 5 may not begin until the product owner authorizes it after this validation gate. Resume by reading this handoff, the Phase 3 files, `crawl/lib/destinationNavigationCore.js`, and the Phase 2A/2B documents. Do not implement Wing Jury UI or apply/deploy migrations.

Git safety: branch remains `feat/wing-jury-favorites-want-to-try`; no branches/worktrees, commits, pushes, deployments, remote database writes, migrations, or destructive cleanup occurred. All prior worktree changes were preserved. No independent subagent execution surface was available, so the requested destination-state, maps, UI, and QA slices were reviewed serially.

## Phase 5 — Wing Jury backend and photo discovery (2026-10-09)

Status: PARTIAL / LOCAL COMPLETE. The backend/service contract and local security/performance fixtures are implemented, but the Edge Functions and staged schema are not deployed and `ENABLE_WING_JURY` remains false. Phase 6 UI must not begin against production until the release gates below are cleared.

### Architecture and specialist outcomes

No independent subagent execution surface was available in this runtime. The requested work areas were reviewed serially as separate slices: photo eligibility/feed, geospatial ordering, immutable voting, reveal/saved-list integration, and adversarial QA.

The smallest compatible architecture is three Supabase Edge Functions over the existing private approved-photo/storage boundary, plus one reusable React Native service:

- `wing-jury-feed` — bounded public/guest/authenticated blind-photo feed.
- `wing-jury-vote` — authenticated permanent vote boundary.
- `wing-jury-reveal` — post-verdict identity/statistics boundary.
- `crawl/lib/wingJuryService.js` — Phase 6 client contract, guest session state, feature gate, error mapping, feed normalization, vote delegation, reveal delegation, and logout/session cleanup.

Existing `wing-public-gallery` and mutable `wing_media_photo_votes` remain unchanged and are not reused for Wing Jury votes.

### Photo eligibility and feed

`wing-jury-feed` validates approved photo status, canonical processed asset identity, live signed storage object, consent, public attribution mode, non-deleted owner, non-withdrawn state, and valid canonical restaurant association. Approved photos uploaded by the current user are included when they meet the same public rules. Pending, rejected, private, deleted, withdrawn, assetless, and invalid-association photos are excluded.

The feed uses bounded retrieval: at most 250 candidate destinations and 500 photo candidates per request, with a maximum page size of 24. Valid authorized location is used for haversine ordering; missing/invalid location falls back to deterministic destination ordering. Ties use destination ID, creation time, and submission ID. An opaque cursor provides stable pagination. Authenticated judged photos are excluded server-side from `wing_jury_votes`; guest judged IDs are memory-only session state sent to the feed.

Pre-vote data contains only submission ID, signed image URL, media type, and expiry. It does not contain restaurant identity, destination ID, coordinates, ratings, saved-list state, owner identity, storage paths, or public vote totals. This is a blind-judging application boundary, not cryptographic secrecy from a client that can access other public Buffago discovery data.

### Authenticated and guest verdicts

`wing-jury-vote` derives identity from the bearer token, rejects anonymous users, rechecks photo eligibility, and inserts through the authenticated Supabase client so Phase 2B RLS/triggers remain active. The `(submission_id,user_id)` primary key, no update/delete grants, and existing count trigger provide immutable one-vote semantics. Duplicate `23505` requests return the original vote as `existing_vote=true`; conflicting retries cannot overwrite it. Only `+1` contributes to `wing_jury_photo_vote_counts.like_count`; neutral/dislike and mutable gallery votes remain separate.

Guests use `createGuestJurySession` in `wingJuryService.js`. Verdicts and judged IDs stay in memory, no Supabase vote function is called, no global counts change, and the session can be cleared with `clearWingJurySession`. The service has no anonymous-auth vote path.

### Reveal and saved-list integration

`wing-jury-reveal` revalidates the photo and requires an existing permanent vote for authenticated users. Guest reveal requires the local verdict signal and does not create a permanent vote. It returns canonical restaurant details, the specific photo’s Wing Jury `+1` count, the existing Wingdex average based on `weight_score`, the authenticated user’s latest rating only, Favorite status, Want to Try status, and a `save_action` contract. It does not combine photo Likes with gallery votes or restaurant ratings. Phase 6 must reuse `savedDestinations.js` for any save mutation; no duplicate save logic was added.

### Local SQL and documentation

`crawl/supabase/local/phase-2b/20261009_local_phase2b_foundation.sql` received only two local-only performance indexes: an approved processed-photo candidate index and `(submission_id,vote)` for aggregate refreshes. Historical migrations, manifests, and remote schema were untouched.

`docs/phase-5-wing-jury-api-contract.md` is the Phase 6 integration contract, including request/response shapes, blind boundary, guest behavior, duplicate semantics, reveal gate, errors, and deployment dependencies.

### Validation

- `node --test --experimental-default-type=module ./tests/wing-jury-service.test.mjs` — PASS, 6/6. Covers default-off no-call behavior, blind response normalization, guest-local verdicts, authenticated trusted-boundary delegation, invalid votes, and Edge Function contract assertions.
- Combined affected regression suite covering Wing Jury service, Phase 2B local foundation, existing gallery/security tests, Phase 3 saved destinations, Phase 4 destination navigation, Home, and Social — PASS, 70/70.
- `node --test --experimental-default-type=module ./tests/database/phase-2b-local-foundation.test.mjs` — PASS, 7/7.
- Existing gallery/photo tests — PASS, 32/32 within the combined run.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 warnings. Warnings are existing repository warnings; no suppressions were added.
- `npm run test:rls` — FAIL, 50/52. The two failures are the known historical migration-integrity assertions; the remaining RLS/security assertions pass.
- `npm run migration:integrity` — historical baseline remains expected to fail: 69 roots, duplicate `20260729200000`, 5 checksum mismatches, and 17 unmanifested migrations. No migration file was changed.
- Docker-backed Supabase/PostgreSQL and live Edge Function/RLS verification — unavailable. PGlite remains isolated evidence and does not prove live Supabase behavior, true cross-session concurrency, catalog compatibility, or deployment readiness.

### Security and performance review

No service-role key is present in client code; service-role access is confined to Edge Functions. Feed output strips restaurant identity and private metadata. Vote identity is token-derived, guests cannot write, photo eligibility is rechecked at vote/reveal boundaries, and private vote rows are not returned. The new staged indexes support bounded candidate selection and count refreshes. `wing-jury-feed` still uses a bounded candidate window rather than an unbounded catalog scan; a later production review should inspect `EXPLAIN` plans after the release baseline is available.

### Feature gate, remaining blockers, and Phase 6 readiness

`crawl/config/features.ts` adds `ENABLE_WING_JURY`, default false and independent from `ENABLE_SAVED_DESTINATIONS`. No production request reaches the new functions while disabled. The Edge Functions and staged SQL must be deployed together only after Phase 2A reconciliation, release migration authorization, full PostgreSQL/Supabase validation, RLS review, and explicit feature-release approval.

Phase 2A remains PARTIAL / BLOCKED. Phase 2B remains local-only. Phase 6 may consume `docs/phase-5-wing-jury-api-contract.md` and `crawl/lib/wingJuryService.js` for UI wiring, but must keep the flag disabled and must not claim live integration.

Exact next action: obtain authorized historical migration evidence and a Docker-backed PostgreSQL/Supabase runtime. After the release migration and Edge Functions are separately approved and verified, Phase 6 may implement the Wing Jury interface without changing the service contract. Do not deploy, enable the flag, or modify historical migrations.

Git safety: branch remains `feat/wing-jury-favorites-want-to-try`; no branches/worktrees, commits, pushes, deployments, remote writes, migration applications, resets, or destructive cleanup occurred. All previous Phase 3, Phase 4, Phase 6A, Phase 2A, and Phase 2B worktree changes remain preserved.

## Phase 6 — Wing Jury UI and Home integration (2026-10-09)

Status: PARTIAL / LOCAL COMPLETE. The local Wing Jury experience is implemented and tested, while the feature flag remains disabled because the Phase 5 Edge Functions and Phase 2B staged schema are not deployed. No production configuration, remote database, migration, commit, push, or deployment was changed.

### UI and navigation

- `crawl/app/wing-jury/index.jsx` adds the dedicated `/wing-jury` route inside the existing Expo Router architecture.
- `crawl/components/WingJuryGame.jsx` implements the explicit `LOADING`, `READY_TO_VOTE`, `SUBMITTING`, `REVEAL_LOADING`, `REVEALED`, `REVEAL_ERROR`, `ERROR`, `FEED_EXHAUSTED`, and disabled states.
- The pre-vote surface renders only the signed approved image, Wing Jury branding, a neutral prompt, and three accessible verdict controls. Restaurant identity, ratings, save state, and vote totals are only rendered after reveal data arrives.
- Authenticated verdicts call the Phase 5 permanent vote service. Guest verdicts remain in the in-memory session. Reveal retry does not submit a second vote after a confirmed vote.
- Broken images can be skipped without recording a vote. Close clears the guest session and returns through the existing navigation stack. Next Photo consumes the current item and loads the next bounded page; exhausted feeds have a dedicated Return Home state.
- Home retains Wing Facts and now conditionally renders a compact `home-wing-jury-entry` card beside it. Weekly Missions and States Visited remain absent. The Home entry is gated by `ENABLE_WING_JURY`.

### Reveal and saved-list integration

- Reveal uses the Phase 5 nested response contract (`restaurant`, `photo_like_count`, `restaurant_rating`, `personal_rating`, `favorite`, `want_to_try`, and `save_action`). Photo Likes and Wingdex Average remain separate metrics.
- Favorite and Want to Try mutations reuse `useSavedDestinations` and `savedDestinations.js`; no second backend or persistence path was added.
- Guest save attempts store the existing bounded save intent and show Sign In / Create Account plus Not Now. Signed-in save actions remain visibly unavailable while `ENABLE_SAVED_DESTINATIONS=false`.
- Account changes are observed through Supabase auth events and the local guest session is cleared on Close. The existing login intent mechanism remains the supported post-auth continuation path.

### Phase 6 validation

- `node --test --experimental-default-type=module ./tests/wing-jury-ui.test.mjs ./tests/wing-jury-service.test.mjs ./tests/home/quick-actions-home.test.js ./tests/home/weekly-mission-home-surface.test.js` — PASS, 25/25.
- Combined affected Phase 2B/3/4/5/Home/Social regression suite — PASS, 76/76.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 96 existing warnings; no new lint errors. The one new hook warning was removed during final review.
- `git diff --check` — PASS; only the repository’s existing LF/CRLF warning was reported during status inspection.
- Screenshot/device verification — unavailable. No Android/iOS simulator or device was attached, and no screenshot artifacts were generated. `npx expo export --platform web --output-dir .expo/phase6-web --no-bytecode` started Metro but produced no output artifacts in the ignored directory, so no web bundle pass is claimed. The UI has static contract coverage and mock-backed service coverage only; live Supabase verification remains unavailable.

### Exact Phase 6 files added or modified

- `crawl/app/(tabs)/home/index.jsx`
- `crawl/app/wing-jury/index.jsx`
- `crawl/components/WingJuryGame.jsx`
- `crawl/tests/wing-jury-ui.test.mjs`
- `docs/codex-handoff.md`

### Remaining issues and next action

Phase 2A remains PARTIAL / BLOCKED. Phase 2B remains local-only, and Phase 5 remains local-only. Phase 6 is ready for a later release-validation pass, not production enablement. Full PostgreSQL/Supabase Edge Function/RLS verification, device screenshots, and release migration authorization remain required. The known migration-integrity baseline and 50/52 RLS result are unchanged.

Exact next action: obtain the authorized migration reconciliation evidence and disposable Docker-backed PostgreSQL/Supabase runtime, deploy and verify the additive release migration plus Wing Jury Edge Functions only after approval, then perform Android/iOS screenshot and live integration validation before enabling either feature flag. Phase 7 should be final security/release review; do not add new feature scope before that gate.

Git safety: branch remains `feat/wing-jury-favorites-want-to-try`; no commits, pushes, deployments, remote writes, migration applications, resets, destructive cleanup, additional branches, or worktrees occurred. All previous initiative work remains preserved. No independent subagent execution surface was available, so the requested UI, reveal, navigation, state, and QA slices were reviewed serially by the orchestrator.

## Phase 7A — Visual QA, build verification, and regression (2026-10-09)

Status: PARTIAL / LOCAL QA COMPLETE. The web JavaScript export now completes with real artifacts. Android/iOS JavaScript export attempts did not reach an exit status or produce artifacts before the Windows command window timed out during dependency traversal. Real screenshots could not be generated because the configured browser/simulator surface was unavailable. No production flags, migrations, remote writes, deployments, commits, or pushes occurred.

### Expo/Metro investigation

- Phase 6’s original command was `npx expo export --platform web --output-dir .expo/phase6-web --no-bytecode`. It started Metro but returned no artifacts or usable exit status in the prior command window; no source exception was reported.
- Re-running with the existing Expo tooling, an explicit output directory, and one worker — `npx expo export --platform web --output-dir .expo/phase7a-web --no-bytecode --max-workers 1` — completed successfully with `EXPORT_EXIT:0`.
- Web Metro bundled 1,919 modules and produced 44 files, including `crawl/.expo/phase7a-web/index.html`, `metadata.json`, assets, and `_expo/static/js/web/entry-b2562708b7e0d12b2827b52cc07ab7fc.js`.
- Android and iOS checks were attempted with the corresponding `--platform android` and `--platform ios` commands, both using one worker. They emitted only expected environment/splash-color warnings and progress output, then remained active without artifacts. The exact export processes were stopped after verification; this is an environment/tool-timeout limitation, not evidence of a source compile failure.
- No native store build was attempted. Expo native builds require the platform/device tooling that is unavailable here; no paid cloud build was triggered.

### Screenshots and visual review

The requested `docs/screenshots/wing-jury-phase7a/` screenshots were not generated. The browser-control runtime reported that no browser was available, and no Android/iOS simulator or device was attached. No screenshot paths are being claimed. Static UI contract tests, typecheck, and web bundle output are the available evidence; visual pixel inspection remains required when a browser or device runtime is available.

### Regression and security validation

- Wing Jury UI/service/Home regression command — PASS, 25/25.
- Combined Phase 2B/3/4/5/Home/Social regression suite — PASS, 76/76.
- Authentication suite — PASS, 24/24.
- Full RLS suite — FAIL, 50/52; only the two known historical migration-integrity assertions fail.
- `npm run migration:integrity` — FAIL, unchanged historical baseline: 69 roots, duplicate `20260729200000`, 5 checksum mismatches, 17 unmanifested migrations.
- `npm run security:scan` — PASS, secret/public-config scan passed for 2,134 tracked files.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 warnings. The warning count is back to the established baseline; no Phase 6 warning remains in `WingJuryGame.jsx`.
- `git diff --check` — PASS, with only the repository’s existing LF/CRLF conversion warning during status inspection.

Gameplay, authentication, and destinations were validated through the existing Phase 5 service tests, Phase 6 UI contracts, saved-list tests, and destination tests. The contract coverage verifies loading/ready/submitting/reveal/retry/exhaustion paths, guest-local verdicts, no guest vote invocation, saved-list intent, blind pre-vote fields, and preserved Home/navigation behavior. Live Supabase, device, and pixel-level verification remain unavailable.

### Phase 7A remaining issues and next action

No visual defects were identified because real rendering inspection was unavailable; no UI code was changed during Phase 7A. `ENABLE_WING_JURY=false` and `ENABLE_SAVED_DESTINATIONS=false` remain the defaults. Phase 2A/2B/5 release blockers remain unchanged, and Phase 7B is not authorized.

Exact next action: run the supplied web export and capture the required screenshots with a functioning browser/device runtime at 390×844, 393×852, 430×932, and approximately 360×800; then complete Android/iOS native verification and live Supabase/RLS validation only after migration reconciliation and deployment authorization. Do not enable flags or begin store/release work from this environment.

Git safety: branch remains `feat/wing-jury-favorites-want-to-try`; no commits, pushes, deployments, remote database writes, migrations, resets, new branches/worktrees, or destructive cleanup occurred. The ignored web export artifacts remain local only. All earlier phase work is preserved.

## Phase 7A.1 — Real UI screenshots (2026-10-09)

Status: PARTIAL / LOCAL VISUAL QA COMPLETE. Real screenshots were captured from the actual Expo/React Native web components using deterministic development fixtures. The production flags remain disabled, no live Supabase data or writes were used, and Android/iOS device rendering remains unverified.

### Browser and preview method

- The configured in-app browser runtime reported `No browser is available`.
- A locally installed Google Chrome was found at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Chrome Headless 155 was launched with a temporary local profile and DevTools port `9228`; screenshots were captured through the Chrome DevTools Protocol, not fabricated or recreated HTML.
- Expo development server: `BUFFAGO_NATIVE_VISUAL_QA=1`, `EXPO_PUBLIC_ENABLE_WING_JURY=true`, and `EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS=true` on `http://localhost:8085`. The fixture resolver is development-only and blocks live hosts and writes.
- A development-only `preview` query mode was added to the existing `WingJuryGame` component for `blind`, `rated`, `unrated`, `guest`, and `exhausted` deterministic visual states. It is guarded by `__DEV__` and does not change production service behavior or feature defaults.

### Screenshot artifacts

The screenshot index is [`docs/screenshots/wing-jury-phase7a/README.md`](screenshots/wing-jury-phase7a/README.md). Primary artifacts are 390×844:

- `01-home-390x844.png` — Wing Facts and Wing Jury; Weekly Missions and States Visited are absent.
- `02-wingdex-favorites-390x844.png` — saved Favorite card.
- `03-wingdex-want-to-try-390x844.png` — saved Want to Try card with Set Destination and Take Me There.
- `04-wing-jury-blind-390x844.png` — real bundled wing photo and three verdict controls with restaurant identity hidden.
- `05-wing-jury-reveal-rated-390x844.png` — restaurant reveal, Photo Likes, Wingdex Average, latest rating, Favorite action.
- `06-wing-jury-reveal-unrated-390x844.png` — unrated reveal and Want to Try action.
- `07-wing-jury-guest-prompt-390x844.png` — guest save authentication dialog.
- `08-wing-jury-exhausted-390x844.png` — exhausted feed and Return Home.
- `09-social-no-image-390x844.png` — text-only Social rating post without a black image placeholder.

Additional responsive artifacts: `01-home-360x800.png` and `04-wing-jury-blind-430x932.png`.

### Visual findings and corrections

- Home renders the two compact Wing Facts/Wing Jury actions side-by-side at 390 px and stacks them cleanly at 360 px without clipping.
- Blind voting contains only the image, branding, prompt, verdict controls, and Close; restaurant identity and metrics are not present before voting.
- The reveal requires the scrollable content area rather than the window to scroll; the inspected capture shows the reveal card, metrics, save action, Next Photo, and Close together.
- A real web asset-resolution defect in the local preview was corrected by normalizing the bundled asset URI instead of calling the unavailable web `Image.resolveAssetSource` API.
- The Wing Jury photo frame was given a stable 300 px mobile height to prevent the reveal state from expanding the image and pushing its content out of view.
- Switching Wingdex to Favorites exposed a React maximum-update-depth loop. The cause was a focus-effect dependency on the unstable aggregate object returned by `useSavedDestinations`; `ratings/index.jsx` now depends on the stable `loadList` callback. The Favorites and Want to Try captures complete without that runtime error.
- Social visually confirms compact text-only posts: no unrelated gallery image or black placeholder appears.

### Verification

- `npx expo export --platform web --output-dir .expo/phase7a1-web --no-bytecode --max-workers 1` — PASS, exit 0; Metro bundled 1,919 modules and emitted the web bundle and metadata.
- `npx expo export --platform android --output-dir .expo/phase7a1-android --no-bytecode --max-workers 1` — PASS, exit 0; Android JavaScript bundle emitted (`2360 modules`, `.expo/phase7a1-android/_expo/static/js/android/entry-6d463ca4c7a2940020988dedad29f110.js`). This is JS export validation, not a device build.
- `npx expo export --platform ios --output-dir .expo/phase7a1-ios --no-bytecode --max-workers 1` — PASS, exit 0; iOS JavaScript bundle emitted (`2365 modules`, `.expo/phase7a1-ios/_expo/static/js/ios/entry-7e4a7201262d3184378d2d2564224bab.js`). This is JS export validation, not simulator/device validation.
- Focused UI/service/navigation/social command — PASS, 17/17 tests.
- Native visual fixture suite — PASS, 6/6 tests.
- `npm run typecheck` — PASS, exit 0.
- `npm run lint` — PASS, 0 errors and 95 warnings, restored to the established baseline; no warning suppression added.
- `git diff --check` — PASS; only the existing repository LF/CRLF status warning remains.
- Real-device/simulator verification — not available. No Android emulator, iOS simulator, or physical device was attached. No live Supabase integration was claimed.
- Final post-capture rerun after URI/layout and saved-list fixes: focused suite 17/17, fixture suite 6/6, typecheck PASS, lint 0 errors/95 warnings, and `git diff --check` PASS.

### Current blockers and next action

`ENABLE_WING_JURY=false` and `ENABLE_SAVED_DESTINATIONS=false` remain the production defaults. Phase 2A historical migration integrity remains blocked; Phase 2B schema, Phase 5 functions, and Phase 6 UI remain local-only. The local preview proves rendering and interaction shape, not release readiness. Exact next action: preserve these artifacts for human review, then resolve the Phase 2A migration gate and obtain authorized live Supabase/PostgreSQL/device verification before any production enablement or store build. Do not start Phase 7B from this run.

### Phase 7A.1 safety

Branch remains `feat/wing-jury-favorites-want-to-try`. No commits, pushes, deployments, remote database writes, remote migrations, resets, additional branches/worktrees, or destructive cleanup occurred. All earlier initiative changes were preserved.

## Phase 7B.1 — release preparation in progress (2026-10-09)

Current authorization supersedes earlier stop notes: prepare local readiness documentation, read-only production catalog evidence, focused security tests, and then UI styling polish. No release or production modification is authorized. Database/architecture and security reviewers are running at High reasoning; the UI reviewer is inspecting the screenshot harness before the polish pass. Root owns this handoff and final validation. Both feature flags remain disabled by default; all pre-existing worktree changes are preserved.

The branch was verified as `feat/wing-jury-favorites-want-to-try`. No commits, pushes, branches/worktrees, deployments, remote writes, resets, or cleanup have occurred. Production ledger absence will not be treated as object absence. Historical integrity and real PostgreSQL/Supabase concurrency/RLS remain release gates.

### Phase 7B.1 review milestone — catalog and security

Read-only catalog review confirms prerequisite relations exist and four new feature tables are absent. Production default authenticated grants are broader than the staged SQL revokes, so narrow GRANT statements do not establish narrow effective privileges. Rating UPDATE/reassignment cleanup, multiple-rating Favorite deletion, account-cascade count maintenance, guest session handling and account-transition privacy also require remediation and real-runtime tests. The original staged SQL and historical chain remain unchanged; no deployable migration draft is promoted while prerequisites/security gates are unresolved.

The database reviewer owns the exact read-only query packet and evidence inventory; the security reviewer is adding focused regression coverage. UI styling work has begun after the readiness review identified these blockers. Root regression checks: affected existing suites 43/43; historical RLS 50/52 with the same two integrity failures; integrity remains 69 roots / one duplicate / five mismatches / seventeen unmanifested; tracked-file secret scan passes 2,134 files. Read-only ADB inspection now shows an attached Android emulator, so prior claims of no attached emulator are stale; no native validation or build is claimed here.

### Phase 7B.1 packaging milestone — actual test evidence

`docs/phase-7b-deployment-readiness.md` now contains the ordered forward-only strategy, SQL/Edge dependencies, auth/RLS requirements, flags, smoke tests, disable/rollback procedures, device prerequisites and exact approval boundaries. `docs/phase-7b-security-review.md` records thirteen release findings. The query packet contains fourteen narrowly scoped read-only SELECT blocks (Q01–Q12 plus Q09b/Q11b). Catalog evidence confirms PG17.6 and private wing-submissions bucket; storage versioning metadata requires active-object eligibility review.

Final backend combined run: 37 tests, 31 passing, six actually failing TODO regressions, zero unexpected failures. Five passing database finding reproductions establish defects rather than desired behavior. Original Phase2B tests remain7/7. Existing affected UI/service/navigation/Home/Social/fixture tests43/43; related photo/gallery/auth29/29 after configuring the installed Python312 runtime; auth24/24. Typecheck passes, lint0errors95warnings. `database:harness` fails before initialization because `supabase/contracts/buffago-baseline-v1.json` is absent; Deno unavailable, Docker daemon unavailable, no real PostgreSQL/Supabase integration claimed. Historical RLS50/52 and integrity failures preserved. Tracked secret scan passes2134 files (does not cover untracked files); reviewed frontend sources contain no service-role credential names/values.

UI capture is now using a dedicated Chrome9230 session and fixture Expo8085 process only; actual flags stay false by default. Root inspected Home360 and reveal360; remaining captures and final polish report are in progress. The mascot is development fixture artwork, correcting the earlier description as a real user photo. Production code uses canonical approved signed user submissions, but no live Jury feed deployment/availability is claimed.

## Phase 7B.1 — final readiness package and UI polish (2026-10-09)

**Status: PARTIAL.** Readiness packaging and requested local UI polish are complete; production schema/security/Edge release remains BLOCKED. This final section supersedes in-progress counts and older phase authorization/runtime notes. Stop here: no remote migration, deployment, enablement, commit/push or store build.

### Verified database dependencies and draft status

High-reasoning database/architecture review executed all **15 read-only SELECT blocks** in `docs/phase-7b-supabase-verification-queries.sql` against `vhfxnizaxdanmvmouuaf`: Q01–Q13 plus Q09b/Q11b. Only schema/ACL definitions and nonsecret bucket id/public configuration were read; no application/auth-user/storage-object records or secrets. Eight baseline relations exist; four feature tables and nine feature helpers are absent. Key/column types, indexes, policies, grants, triggers and concrete rating RPC INSERT/conflict-UPDATE paths are inventoried in `docs/phase-7b-database-review.md`. PostgreSQL is 17.6 and `wing-submissions` is private. Ledger absence was never treated as object absence.

No release migration draft was created or promoted: historical integrity, the candidate security/lifecycle contract and real-runtime validation remain unresolved. Original staged Phase 2B SQL stays unchanged outside the migration queue. The forward-only plan requires prerequisite/conflict assertions, CLI-generated unique versions beyond the verified maximum, explicit authenticated privilege revocation before narrow grants, feature-owned definitions only, and validated cleanup/count/storage logic. Never rewrite historical applied bytes, replay 69 roots, replace unrelated definitions or mark unverified history applied. Order after separate approval: reviewed SQL → feed → vote → reveal with shared utilities/configuration → separately approved flag/cohort distribution.

### Security and Edge dependencies

`docs/phase-7b-security-review.md` records inherited broad authenticated grants, rating UPDATE/reassignment cleanup, multiple-rating Favorite deletion, unresolved independent-session concurrency/lock ordering, account-cascade count drift, Storage active-version/delete-marker eligibility, signed-out `AuthSessionMissingError`, account-switch/in-flight reveal privacy, malformed votes coerced to neutral, base64 cursor identity disclosure, null-coordinate fallback and anonymous-auth exclusion. Jury gateway configuration is absent. No backend/API/auth/voting change was made to hide these findings; RLS was not relaxed.

Reviewed source derives ownership from verified tokens, writes votes through caller JWT, projects safe DTOs, requires own committed votes for authenticated reveals, signs canonical approved/consented/nonwithdrawn photos and returns original duplicate verdicts. Service-role credentials remain server-only. These mock/static guarantees do not establish deployed gateway, real JWT/RLS/Storage, concurrency or account-transition privacy. Public guest verdict signals are UI state, not persistence proofs. Historical source artifacts/hashes, runtime baseline, corrected enforcement and integrated acceptance remain missing.

### UI polish and screenshots

Home cards fit side by side at 360/390 px and stack on narrow screens. Reveal uses an outlined Close, orange Next Photo, improved spacing and unrestricted name wrapping. Guest sign-in is a full-width orange primary action above Not Now. Wingdex padding/action gaps, 12 px labels and 44 px controls allow wrapping without overlap. Navigation, eligibility, intents/dismissal and voting behavior are preserved.

All eight required screenshots were captured and inspected at **360×800 and 390×844**. `docs/screenshots/wing-jury-phase7b/README.md` also links Home320 stacking and two disclosed browser-DOM long-name stress captures, eleven PNGs total. Actual Expo components use read-only development fixtures through Chrome CDP9230 and local Expo8085. Successful captures recorded no runtime exceptions. The mascot is an existing development-only preview, correcting the earlier 'real bundled wing photo' description. Production code uses signed approved submissions without mascot fallback; actual production Jury delivery is unverified because the feature is not deployed. Both flags remain false by default; preview overrides are local-process only.

### Actual final test results

- Affected UI/service/navigation/intent/Home/Social/fixture suite: **43/43 PASS** after final styles and two updated Home source-style contracts. UI review subset: **40/40 PASS**. Initial final-style check failed two stale literal style assertions; they now explicitly require equal flex basis, minimum dimensions and wrapping. No skipped assertions or historical check weakening.
- Original Phase 2B PGlite fixture: **7/7 PASS**. New database findings: **5/5 reproduce defects**, not desired-behavior acceptance.
- New Edge/security suite: **14 PASS, six actually failing TODO regressions**. Existing service checks: six PASS. Combined staged/findings/Edge/service: **38 total, 32 PASS, six TODO, zero unexpected failures**. Exit 0 does not establish release readiness.
- Related photo/gallery/auth: **29/29 PASS** using existing Python312 Pillow/requests via `WINGDEX_PYTHON`; initial missing-runtime variable failure resolved. Existing auth suite: **24/24 PASS**.
- Historical RLS: **50/52 PASS**, same two integrity assertions fail. Integrity FAIL: **69 roots, duplicate `20260729200000`, five mismatches, seventeen unmanifested**. Historical SQL/manifest/checks untouched.
- Typecheck **PASS** after final source edits; lint **zero errors, 95 existing warnings**. All four Edge sources transpile without syntax diagnostics; HTTP handlers execute in Node VM mocks, not Deno.
- Secret scan **PASS for 2,134 tracked files**; new assertions separately cover six frontend Jury/list/navigation files for service-role/secret-key references. The tracked scanner does not include untracked initiative files.
- Database harness **FAIL before initialization**: missing `crawl/supabase/contracts/buffago-baseline-v1.json` (ENOENT). Docker daemon pipe unavailable; psql/Deno unavailable. No real PostgreSQL/Supabase integration, independent-session concurrency, full replay, `deno check`, live signing/gateway smoke test or native acceptance claimed.
- `git diff --check` **PASS**, existing LF/CRLF conversion warning only. Branch/HEAD unchanged: `feat/wing-jury-favorites-want-to-try`, `960a5422cb9aa8f59acd47e009937cceb8d90291`.

Read-only ADB shows Android emulator `emulator-5554 device`, correcting earlier unavailable-device notes. No device build/change or native acceptance occurred. Android/iOS rendering, font scaling/accessibility, auth transitions and real image expiry remain prerequisites; earlier JS exports are not device builds.

### Files changed in this phase

Source: `crawl/app/(tabs)/home/index.jsx`, `crawl/app/(tabs)/ratings/index.jsx`, `crawl/components/WingJuryGame.jsx`. Tests: `crawl/tests/home/quick-actions-home.test.js`, `crawl/tests/database/phase-7b-readiness-findings.test.mjs`, `crawl/tests/wing-jury-edge-security.test.mjs`. Documentation: this handoff, `docs/phase-7b-deployment-readiness.md`, `docs/phase-7b-database-review.md`, `docs/phase-7b-security-review.md`, `docs/phase-7b-supabase-verification-queries.sql`, `docs/phase-7b-ui-polish.md`, and screenshot README/eleven PNGs under `docs/screenshots/wing-jury-phase7b/`. Derived capture scripts/logs remain ignored local artifacts. All prior worktree changes are preserved.

### Exact next action and resume instructions

Read the four readiness/review reports and query packet first. Continue with a scoped local remediation pass for documented security/guest/lifecycle defects; convert TODO regressions into normal passing acceptance tests and retain correction evidence. Obtain authoritative historical applied SQL/deployment-artifact hashes and the missing baseline contract, restore a disposable PostgreSQL17/Supabase runtime, then run independent-session RLS/concurrency and actual Storage/Edge tests. Re-run the 15 SELECT blocks after catalog changes; all are already executed, and no user application records are required to prepare the next step.

Keep migration promotion blocked until historical disposition, prerequisites and runtime/security acceptance are established. Then generate/review unique forward migrations and exact compatible Edge/config artifacts. Separate user approval is required before remote apply/deploy/config/secret changes, remote write smoke tests, flag distribution, production emergency ACL/endpoint actions, commits/pushes, store builds or publication. Emergency disable must preserve user data. This phase asks for no such approval and performs none of those actions.

### Final Git and production safety

Only the required branch was used. No commits, pushes, new branches/worktrees, migration applications, deployments, production writes/configuration changes, resets, destructive cleanup, feature enablement or store builds. Remote activity was read-only catalog/config verification. Original staged SQL, historical migrations/manifest and earlier work remain preserved. Stop condition reached: readiness package and local UI polish complete.

## Phase 7B.2 milestone � baseline and approved contracts (2026-10-09)
Current authorization is local security remediation only. Baseline reproduced: 38 total, 32 pass, six actually failing TODOs; five database tests reproduce defects. Exact failure/root-cause/verification and S-01 through S-14 map: docs/phase-7b2-failure-matrix.md. Three High-reasoning GPT-6.1 Sol agents own database, Edge, and client changes under approved shared contracts. Integrated independent review follows. Branch verified unchanged; pre-existing dirty work preserved. No commits/pushes/deployments/remote writes/migrations/flag changes/store builds. Production release and historical baseline remain blocked.


## Phase 7B.2 recovery milestone (2026-10-10)
Recovered the interrupted session without resetting or recreating work. Repository is authoritative: staged SQL now has explicit ACL normalization, nonanonymous RLS, rating BEFORE locks/UPDATE cleanup, multi-rating Favorite preservation, immutable vote defense/cascade count arithmetic, active Storage predicate, and two service-only read RPCs. Edge sources contain strict votes, AES-GCM principal/location/expiry-bound cursors, shared DB eligibility checks before/after signing, all-history score aggregate, no-store/CORS and local gateway settings (feed/reveal public; vote JWT verified). Original six TODO metadata is already removed; backend rerun is in progress, no green result claimed yet.
Client partial work recovered: accountBoundary.js, token-pinned Jury requests, epoch-gated WingJuryGame/useSavedDestinations, claimed intents/login handoff. Wingdex route replay still lacks savedActionUserId validation and private rating stale-response isolation; new delayed component/hook tests were not created before interruption. Three agents errored at usage limit; none is currently editing. Next: finish only remaining client defects, rerun focused suites, independent integrated adversarial review, then complete required verification and readiness/API documentation. Previous-session evidence: initial DB12/12 and photo138/138; expanded DB/Edge/client edits must be reverified. Historical SQL/manifest unchanged, feature defaults false, branch/HEAD retained. No commit/push/deploy/remote writes/migration/cleanup/store build.


## Phase 7B.2 integrated milestone (2026-10-10)
Recovered backend acceptance passed57/57 including all original6 unchanged assertions, no TODO/skip. Database specialist final19/19 includes a new fail-closed non-READ COMMITTED guard; Edge specialist42/42 combined(service6+Edge36) includes signing/withdrawal page fill and deterministic latest-rating tie. Root final backend run in progress after these changes. Client remaining privacy work is implemented and behavioral tests expanding: ratings auth/stale aggregate/recent/wallet/replay isolation; game initial auth error retry and pinned coordinates; explicit guest empty Authorization; cancelled guest intents no longer persisted; serialized stale intent write/claim cleanup. Fresh independent High reviewer inspecting actual integrated files, final review pending client completion.
Root historical rerun remains50/52 with only two integrity assertions; integrity69roots/duplicate20260729200000/5mismatches/17unmanifested. Harness still failsENOENT baseline contract before init. Docker daemon unavailable and54322refused; psql/Deno absent. Root owns release/API/matrix/query docs; database edits complete; Edge edits complete; client_finish owns client and privacy tests; independent_review read-only. Production flags remain defaultfalse. No remote operations/commits/push/build/deploy/history edits. Next: finish behavioral coverage and adversarial review, required integrated checks, final classifications/report.



## Phase 7B.2 FINAL - authoritative resume checkpoint (2026-10-10)

**PARTIAL: all six original backend regressions fixed and verified, integrated security review complete; production release BLOCKED.** Continued interrupted SQL/Edge/client work in place. No reset, recreation or abandoned agent edits remain. Root completed the final OAuth claim-order correction. All specialists froze files; independent review is finished. Earlier milestone pending statements are superseded.

All six tests in `crawl/tests/wing-jury-edge-security.test.mjs` PASS with original assertion bodies retained, TODO metadata removed:

- malformed verdict payloads cannot silently create an immutable neutral vote
- blind feed cursor does not disclose the hidden destination identity
- real signed-out Supabase session can fetch the guest feed
- real signed-out Supabase session can record an in-memory neutral verdict
- absent location selects the documented nonlocation fallback
- anonymous-auth gameplay sends its in-memory judged IDs to the guest feed

Root causes: numeric coercion; transparent/unvalidated cursors; missing-session guest misclassification; absent coordinates coerced to zero; anonymous IDs mistaken for permanent accounts. See failure matrix for complete expected/actual/root-cause/impact/files and S-01..S-14 coverage.

Completed fixes: explicit ACL normalization and nonanonymous owner RLS; protected fixed-search-path definer functions, no new views; immutable votes and original-verdict duplicate retry; neutral persistence, +1-only Jury Likes, independent gallery; atomic cascade count deltas; ordered rating identity locks, INSERT/UPDATE Want cleanup, multiple-rating Favorite retention/final deletion, rollback/reassignment and unsupported isolation rejection. READ COMMITTED is required; no independent-session proof claimed.

Edge: strict bodies/verdicts/UUIDs/coordinates; AES-GCM bounded/expiring principal/location cursors; shared SQL approved/public/consent/live-owner/active-storage eligibility before/after signing and on vote; all-history rating mean RPC without private owner rows; no-store/CORS. Local feed/reveal public gateway with handler personalization; vote gateway and handler nonanonymous authentication. No remote configuration changed.

Client: account epochs isolate private ratings, saved state, feeds/votes/reveals and stale async results; captured token pinning for Jury and existing Buffacoin RPC; empty guest Authorization; serialized intents claimed once for verified user and account-bound Wingdex replay. Anonymous login latch, signup competing redirects, final-photo spinner and StrictMode reactivation corrected. OAuth claims immediately after verified account resolution before optional setup, clears cancelled/changed payloads, guards final navigation through telemetry and final getUser. Shared-helper behavioral coverage is real; full callback/device runtime was source-reviewed, not simulated.

Independent High reviewer inspected actual integrated implementation, independently ran115/115 (DB19 + Edge/service42 + client54), closed final Medium OAuth orphan-intent finding with reproduction (cancelled claim removes payload; later B gets null), and identified no remaining High/Medium privacy or authorization defect in reviewed local implementation. Edge reviewer also independently ran privacy26/26.

### Actual final verification

| Check | Result |
| --- | --- |
| Combined backend | 61/61 PASS: DB19 + Edge36 + service6; zero TODO/skip/fail |
| Phase 2B actual isolated PGlite SQL | 19/19 PASS: original foundation7 + acceptance12 |
| Expanded client/auth/navigation/trust | 89/89 PASS, including privacy26, saved-list/intent, destination, Jury UI/service, auth24, unchanged password races12 and transaction/trust tests |
| Home/Social | 24/24 PASS |
| Existing photo/gallery/security/auth | 138/138 PASS with installed Python312 WINGDEX_PYTHON; initial missing-runtime setup corrected |
| Historical RLS | 50/52; only known current-schema migration checksum-stable and recovered Phase1 root-file integrity assertions fail |
| Strict integrity | FAIL unchanged:69roots, duplicate20260729200000,5mismatches,17unmanifested |
| Database harness | FAIL before initialization:missing supabase/contracts/buffago-baseline-v1.json; no DB operation |
| Typecheck | PASS on final sources |
| Lint | PASS:0errors,103warnings, no suppression |
| git diff --check | PASS; LF/CRLF notices only |

Ignored logs: crawl/.expo/phase7b2-final-{backend,client,photo,home-social,typecheck,lint}.log and phase7b2-rls.log. Commands overlap; do not sum as unique tests. Historical assertions remain intact; password harness only mocks new import, no assertions weakened. No new feature-related failure in these runs.

### Exact Phase 7B.2 changed files (27)

Other dirty Home/Social/flags/baseline/fixture initiative files predate this phase and are preserved. Untracked feature files were modified in place; git diff --stat omits them.

- crawl/supabase/local/phase-2b/20261009_local_phase2b_foundation.sql
- crawl/supabase/local/phase-2b/README.md
- crawl/tests/database/phase-2b-local-foundation.test.mjs
- crawl/tests/database/phase-7b-readiness-findings.test.mjs
- crawl/supabase/functions/_shared/wingJury.ts
- crawl/supabase/functions/wing-jury-feed/index.ts
- crawl/supabase/functions/wing-jury-vote/index.ts
- crawl/supabase/functions/wing-jury-reveal/index.ts
- crawl/supabase/config.toml
- crawl/tests/wing-jury-edge-security.test.mjs
- crawl/lib/accountBoundary.js
- crawl/lib/wingJuryService.js
- crawl/lib/savedDestinations.js
- crawl/hooks/useSavedDestinations.js
- crawl/components/WingJuryGame.jsx
- crawl/app/(tabs)/ratings/index.jsx
- crawl/app/auth/login.jsx
- crawl/app/auth/callback.jsx
- crawl/tests/client-account-privacy.test.mjs
- crawl/tests/auth/password-device-races.test.mjs
- docs/codex-handoff.md
- docs/phase-7b-deployment-readiness.md
- docs/phase-5-wing-jury-api-contract.md
- docs/phase-7b2-failure-matrix.md
- docs/phase-7b-supabase-verification-queries.sql
- docs/phase-7b-security-review.md
- docs/phase-7b-database-review.md

### Remaining blockers and exact next action

PGlite synthetic roles/single connection and Node network/runtime fixtures are not full Supabase security/concurrency verification. Docker CLI exists but daemon pipe unavailable, port54322 refuses connection, psql/Deno unavailable. Need disposable PostgreSQL17/Supabase independent-session rating/save/vote/withdrawal/cascade races, actual role/default ACL/PostgREST, deadlock/isolation retries, Storage versions/signed URL fetchability/expiry, gateway/JWT/CORS/Deno and native auth/navigation. Already issued300-second URLs may survive withdrawal until expiry.

Feed remains250destinations/500photos, excludes null coordinates, and radius selection can stop on destinations without eligible photos. Global nearest/coverage, antimeridian and representative query plans remain release gates. Historical applied-byte provenance, duplicate/checksum/unmanifested disposition and missing baseline contract unresolved. No forward production migration prepared. Q14/Q15 were added locally and not executed remotely.

Next recommended work: restore disposable PostgreSQL/Supabase validation and reconcile historical baseline evidence; resolve documented discovery acceptance before Phase7B.3 migration preparation. Read this final checkpoint/readiness/API/matrix first, preserve worktree, rerun only after changes or new runtime evidence. Do not restart completed security investigations; do not begin deployment.

Branch feat/wing-jury-favorites-want-to-try, HEAD960a5422cb9aa8f59acd47e009937cceb8d90291 unchanged. Both feature defaults false. No commits/pushes/new branches/worktrees/deployments/remote DB writes or queries/migration applications/config changes/history edits/stash/reset/destructive cleanup/store builds in Phase7B.2. Stop condition reached: original six pass and integrated review complete, release blockers retained.

Handoff originally contained mixed legacy encoding; this final header/append preserves existing historical bytes rather than rewriting unrelated content.


## Phase 7B.2.5 recovery checkpoint (2026-10-10)

Recovered Phase7B.2 final state, branch/dirty files preserved. Existing original6 and61/89/138 acceptance remain completed, not restarted. User authorizes local PostgreSQL validation/feed hardening/lint delta only. Docker daemon is now AVAILABLE29.4.2, WSL2/docker-desktop available, CLI2.107.0, cached postgres17.6. Existingcrawl Supabase containers including54322 are NOT test targets. PostgreSQL specialist creates a separate labelled disposable cached-image container with no hostport; verify target before prerequisitefixture+local stagedSQL, separate sessions. No blind69-file replay or remoteoperation.

Ownership: postgres_725 High owns new isolatedPG fixture/harness/tests and phase2B README; feed_725 High owns localfoundationSQL/sharedEdge/feed/tests, sharedcontract approval pending; lint_725 Medium owns ONLYratings/index.jsx eight stable accountScope hookdependencies; rootdocs and clientguest pagination integration if necessary. Independent reviewer follows integrated changes. Root fallbackreview notes500guestexcludedIDs cap must not stop sessions reaching farther photos; resolving sharedcontract before editing. No completedsolution discarded; no historyedits/flags/commit/push/deploy/cleanup/newbranch/worktree.

Next: approve feedSQL RPC/keyset contract, execute realPG acceptance/concurrency tests, fixeightinitiativewarnings, focusedintegrationregressions, freshindependentreview, finaldocs/results. PostgreSQL historicalbaseline remainsseparateblocked.

## Phase 7B.2.5 FINAL authoritative checkpoint (2026-10-10)

**PASS for authorized local scope; COMPLETE and STOPPED. Production and Phase 7B.3 migration preparation remain BLOCKED by prerequisites below.** This checkpoint supersedes all earlier pending/Docker-unavailable/candidate-cap statements. Existing tracked/untracked work was recovered in place. Prior agents were unavailable; completed feed/lint files and logs were inspected directly. A new specialist finished independent review and corrected its one concrete UI finding.

### Actual PostgreSQL results

Recovered crawl/.expo/phase7b25-postgres-final.log completed at 08:29: 19/19 PASS, zero fail/skip/TODO,120,821 ms. Tested staged SQL and database tests predate this completed log and were unchanged during resume, so the expensive suite was not repeated. Reverified buffago-phase7b25-e5de47ce1daf: cached postgres:17.6, disposable label, network none, no published ports; read-only version probe returned actual PostgreSQL 17.6 and buffago_phase7b25. Two earlier disposable containers retained; development Supabase untouched. Tmpfs data survives only while containers run; no cleanup attempted.

Actual independent psql backends and pg_blocking_pids waits cover both rating/Want and final-rating/Favorite race orderings, UPDATE/reassignment, rollback, immutable neutral/+1/-1 uniqueness, conflicting duplicate original verdict, same/distinct-user vote races, atomic +1-only Likes, account cascades, photo withdrawal/existing Storage archival locks, READ COMMITTED enforcement, real multistatement deadlock and whole-transaction retry. Gallery votes/counters remain unchanged; Jury does not write restaurant ratings. Inherited default ACL normalization and fixed-search-path helper grants are tested. PostgreSQL enforces actual RLS under SET ROLE anon/authenticated on synthetic prerequisite tables, with auth.uid/auth.jwt backed by session GUC fixture claims. This is database-enforced authorization with simulated identity, NOT cryptographically verified Supabase Auth/PostgREST/Edge gateway acceptance.

Catalog acceptance traverses1,003 destinations / 702 eligible photos, including 300 nearer destinations without eligible photos; all-history aggregate includes 1,002 ratings. Typed SQL accepts numeric strings; strict original JSON types are enforced by Edge tests, not SQL casts. EXPLAIN ANALYZE on extracted current RPC body: located 28.959 ms (eligible scan/nested loop/top-N distance sort), no-location 21.967 ms; list 0.116 ms, rating 0.160 ms, Storage 0.099 ms, authenticated RLS list 0.104 ms. Small synthetic plans do not certify production scale: distance ordering can scan/sort eligible catalog per page. Retain realistic load/query-plan gate.

### Feed, guest policy and independent review

Preserved service-only full-catalog keyset RPC, worldwide Haversine ordering/no radius cutoff, deterministic destination/microsecond-time/photo ties, final missing-coordinate tier, <=24 visible photos and <=120 candidates per SQL page, bounded Edge work/signing. Auth exclusions precede LIMIT. AES-GCM principal/location/TTL-bound cursor is blind; malformed/tampered cursors fail safely. Stream end alone means exhaustion. Four automatic empty-page advances then usable FEED_CONTINUE retain progress; actual-game Continue regression passes.

slice(-500) is ONLY a bounded request hint. Complete local session Set filters every returned photo, including older IDs no longer sent. Existing 700-verdict regression proves old/new judged IDs cannot reach gameplay. Local memory grows with distinct judged photos; requests stay <=500 UUIDs. No probabilistic exclusion or new server-session dependency. Retry/continuation retains Set; close/unmount/account transition clears it. Account/request guards reject stale feed responses.

Independent reviewer found broken-image Skip during pending vote/reveal could attach previous reveal to next photo. Fixed per-photo/account/operation response guards, single-flight reveal retry, guarded Skip and stale image-error rejection; three new deferred actual-game regressions pass. No additional concrete ACL/definer/SQL race/cursor/privacy/flag defect identified. Both flags default false; runtime/scale gates retained.

### Verification

- Recovered PostgreSQL 19/19 PASS: .expo/phase7b25-postgres-final.log (unchanged tested SQL).
- Recovered feed backend 48/48 PASS: .expo/phase7b25-feed-final.log.
- Resume affected foundation/feed-pagination/Edge/privacy/service/UI/navigation/password-races 114/114 PASS: .expo/phase7b25-resume-affected.log (before final UI correction).
- Final corrected game/feed-client/privacy 41/41 PASS: .expo/phase7b25-final-game.log; privacy 30/30 includes three new deferred regressions. Specialist privacy 30/30 overlaps (.expo/phase7b25-final-review-privacy.log).
- Final typecheck PASS exit 0: .expo/phase7b25-final-typecheck.log.
- Final lint PASS exit 0:0 errors / 95 warnings: .expo/phase7b25-final-lint.log. Eight added accountScope hook warnings removed without suppression.
- Historical RLS rerun 50/52: ONLY known current-schema checksum-stable and recovered Phase 1 unique-root assertions fail (.expo/phase7b25-resume-rls.log).
- Strict migration checker FAIL unchanged: 69 roots, duplicate 20260729200000, five checksum mismatches, seventeen unmanifested (.expo/phase7b25-resume-integrity.log).
- git diff --check PASS, existing line-ending notices only.

Counts overlap; do not sum as unique tests. Unchanged prior Home/Social 24/24, auth 24/24 and photo/gallery/security 138/138 preserved as recovered evidence, not new runs. No assertions weakened. Missing supabase/contracts/buffago-baseline-v1.json still blocks separate legacy runtime harness; isolatedPG runner does not need it.

### Exact Phase 7B.2.5 changed/added files (16)

1. crawl/scripts/phase7b25-postgres.mjs
2. crawl/tests/database/fixtures/phase7b25-postgres-bootstrap.sql
3. crawl/tests/database/phase7b25-postgres-integration.test.mjs
4. crawl/supabase/local/phase-2b/20261009_local_phase2b_foundation.sql
5. crawl/supabase/local/phase-2b/README.md
6. crawl/supabase/functions/_shared/wingJury.ts
7. crawl/supabase/functions/wing-jury-feed/index.ts
8. crawl/tests/wing-jury-feed-pagination.test.mjs
9. crawl/tests/wing-jury-feed-client.test.mjs
10. crawl/lib/wingJuryService.js
11. crawl/components/WingJuryGame.jsx
12. crawl/tests/client-account-privacy.test.mjs
13. crawl/app/(tabs)/ratings/index.jsx
14. docs/phase-5-wing-jury-api-contract.md
15. docs/phase-7b-deployment-readiness.md
16. docs/codex-handoff.md

This resume edited only game, privacy tests and three docs. Other dirty initiative files predate this finish and remain preserved. Ignored logs under crawl/.expo are local evidence, not release artifacts.

### Remaining gates and exact next action

Do not begin Phase 7B.3 here. Migration preparation cannot begin until authoritative applied-byte historical ledger/duplicate/checksum/unmanifested evidence and missing baseline contract are resolved, catalog parity and actual disposable Supabase Auth/PostgREST/Edge JWT/CORS/Deno/Storage versions/signing/fetchability/expiry verified, representative-scale discovery measured and native auth/navigation/accessibility accepted. Already issued 300-second URLs may survive withdrawal until expiry. No forward production migration prepared.

Exact next action: separately scoped historical-baseline evidence reconciliation and disposable Supabase runtime acceptance plan, retaining both flags false. Local PostgreSQL and discovery-cap blockers are now closed; production prerequisites remain.

Safety: branch feat/wing-jury-favorites-want-to-try; HEAD 960a5422cb9aa8f59acd47e009937cceb8d90291 unchanged. No commits/pushes/new branches/worktrees/production reads or writes/remote migrations/deployments/feature enablement/historical SQL edits/stack stops or resets/destructive cleanup. Handoff updated; Phase 7B.2.5 complete and stopped.
## Phase 7B.2.6 FINAL - production baseline and migration gate (2026-10-10)

**Phase 7B.2.6 PASS for analysis/documentation; complete and STOPPED.** Production baseline compatibility is PARTIAL, Phase 7B.3 drafting is CONDITIONAL and not yet authorized, production SQL application and feature enablement are NOT ready. This checkpoint supersedes blanket earlier requirements that all historical byte artifacts, native QA and deployed Edge acceptance precede any local nondeployable draft. It does not waive application/enablement gates or historical failures.

Authoritative analysis: [production baseline contract](phase-7b-production-baseline-contract.md). Pending handoff packet: [four remaining verification SELECTs](phase-7b-remaining-verification.sql). No remote queries were executed in this phase. Do not run the original fifteen catalog blocks again merely to reproduce already established facts.

### Verified baseline and explicit unknowns

Existing 2026-10-09 production catalog evidence confirms canonical UUID auth/destination/rating/media keys, NUMERIC coordinates/generated rating score, TIMESTAMPTZ creation/withdrawal metadata, private wing-submissions bucket, auth helper signatures, three persisted-rating RPC signatures/events, mutable gallery vote separation, existing RLS and broad inherited/default ACLs. Four feature tables and original nine private helper names were absent then. Production ledger is a separate dated 35-row metadata inventory, NOT a full source/deployment artifact or proof of SQL nonexecution for absent versions.

Current staging inventory is exact: four tables, fourteen functions (eleven private/three public), nine triggers, nine policies, six explicit indexes plus four PK indexes. Staging convenience IF NOT EXISTS/OR REPLACE/drops are not production fail-closed preflight. No implementation or staged SQL changed.

UNVERIFIED: five later function names/overloads, global index/type collisions and two newer rating trigger names; omitted media/crawl keys/CHECKs/incoming deletion edges; safe existing trigger/dependency source closure; actual API/current-owner role inheritance/authority and precisely retained client-read policy details. The four packet blocks fill these metadata gaps without application records, auth-user/storage-object rows, function bodies, trigger argument values, arbitrary settings or migration SQL text. Profile lifecycle is included. Any observed incompatible mandatory prerequisite becomes category A and stops the draft. New media ON DELETE RESTRICT may affect existing hard-delete/cascade behavior; actual deletion design/source closure is an application gate. READ COMMITTED is required even for null-owner rating events through cleanup helpers; the BEFORE helper alone skipping null identity is not an isolation exception.

### Historical decision

- Duplicate 20260729200000: B current deployment tooling blocker, plus C provenance debt and D applied-path identity. Freeze BOTH files. No deletion/rename/retimestamp/replay/mark-applied.
- Five genuine checksum discrepancies: C, D exact deployed bytes/mapping; keep ordinary strict pipeline blocked (B). Three July copy/category changes have no demonstrated new-feature dependency. October RC/current gallery candidate need safe deployed artifact comparison for historical equivalence; current relevant catalog/dependency compatibility can be established separately. No anomaly alone demonstrates A new-schema incompatibility.
- Seventeen unmanifested roots: C/D, with duplicate-fixed also B. Three exact versions recorded (20260729160000,20260730120000,20260730222132), fourteen absent. Missing ledger/manifest rows never prove missing objects. Local staging-transport/cron names are not equivalent to different remote timestamps merely by name.
- Current root-glob apply-engagement-migrations runner is unsuitable; it replays every root. Legacy runtime harness missing JSON is a tooling/baseline-pack limitation and would still report blocked/not-run if JSON merely restored. This Markdown contract is not that JSON or a clean-init pass. Do not weaken strict assertions/checkers.

Recommended strategy: quarantined forward-only draft after narrow contract clearance; exact new-artifact-only release package/runner for any later application, never root replay/db push from this checkout. Applying with unresolved history requires explicit HUMAN frozen-history exception naming all anomalies/remote-only mappings/residual D questions, approved target and exact new versions/hashes. Preserve failed historical checks and record exception separately; do not claim integrity repaired. No exception or later action is approved here.

### Three gates and exact next action

1. Drafting: obtain and review RV01-RV04; approve bounded deletion/coexistence/owner contract; separately authorize Phase 7B.3 quarantined draft. Historical unrelated artifacts and native/deployed Edge tests are not blockers to writing a conditional local draft. Draft needs unique CLI-generated future versions and fail-closed preflight; none generated now.
2. SQL application: completed draft, exact hashes/versions, fresh target/ledger maximum, catalog conflict/drift preflight, safe relevant baseline source and production-shaped disposable PG/Supabase role/RPC/RLS tests, transaction/index/locking plan, approved feature-only runner and historical disposition/exception. Separate exact application approval. Flags remain false; rating triggers affect existing flows immediately, so their compatibility cannot wait for enablement.
3. Enablement: verified applied SQL; separately approved feed->vote->reveal/shared/config deployment; real JWT/gateway/CORS/Deno/Storage versions/signing/fetchability/expiry, actual ratings and realistic feed scale, native auth/navigation/accessibility, approved synthetic live tests and emergency disable. Separate cohort/bundle flag approval. Retain data/cleanup invariants, use forward corrective versions; previously issued 300-second signed URLs may outlive withdrawal.

Exact next action: bring docs/phase-7b-remaining-verification.sql to ChatGPT's authorized READ-ONLY connector for vhfxnizaxdanmvmouuaf, return four separate metadata result sets with project/date, classify only concrete remaining contract gaps, review proposed historical exception, then decide whether to authorize Phase 7B.3. No migration creation/application or deployment in this phase.

### Actual verification and files

Final four SQL blocks executed successfully ONLY in already verified disposable buffago-phase7b25-e5de47ce1daf / buffago_phase7b25_1, postgres 17.6, labelled, network none, no host ports, BEGIN READ ONLY then ROLLBACK; exit 0. This is syntax/catalog-projection validation, not fresh production evidence. Log: crawl/.expo/phase7b26-packet-local-validation.log.

Source inventory/document links/read-only statement scan PASS: 4 tables/14 functions/9 triggers/9 policies/6 explicit indexes and four pending SELECT blocks. Initial inventory check found shorthand policy names; final contract now enumerates all nine exactly and check passes. Focused unchanged migration-integrity tests: 3/5 PASS, ONLY the same checksum-stable and unique-root integrity assertions fail; log crawl/.expo/phase7b26-integrity-focused.log. No assertions altered. git diff --check PASS. No large UI/concurrency/feed suite repeated; preserve completed Phase 7B.2.5 PostgreSQL 19/19 and its lint 0 errors / 95 warnings/typecheck exit 0 evidence.

High-reasoning GPT-6.1 Sol specialists independently reviewed architecture and migration safety, then final contract/packet. They identified missing namespace coverage, isolation wording, role-owner authority and profile lifecycle metadata; root corrected the documents/packet. No feature source or migration tooling edits. Ignored specialist reports: crawl/.expo/phase7b26-architecture.md and phase7b26-migration-safety.md.

Exactly four repository documents created/updated in this phase:

- docs/phase-7b-production-baseline-contract.md (new)
- docs/phase-7b-remaining-verification.sql (new, pending remote execution)
- docs/phase-7b-deployment-readiness.md (updated)
- docs/codex-handoff.md (updated)

Git safety: feat/wing-jury-favorites-want-to-try, HEAD 960a5422cb9aa8f59acd47e009937cceb8d90291 unchanged. Pre-existing tracked/untracked work preserved. No commits/pushes/branches/worktrees/remote calls/writes/ledger changes/remote migrations/Edge deployments/feature flag changes/history edits/builds/stack stops/resets/destructive cleanup. Both feature defaults false. Phase 7B.2.6 stop condition reached; Phase 7B.3 not started.
## Phase 7B.3 checkpoint 1 — RV evidence incorporated in review (2026-10-10)
User authorized local preparation only on existing branch. RV01–RV04 executed successfully in production through ChatGPT; supplied report is dated metadata-summary evidence, not retained raw definitions. Namespace checks clear; role/schema authority and permissive baseline rating reads established. Reviewing staged SQL against media RESTRICT/SET NULL edges and existing trigger candidates. Exact CHECK expressions, fingerprints and safe dependency closure are not present in the supplied report. No migration generated or application authorized. Local PG17.6 verification will distinguish reduced-fixture regression, reported-lifecycle models, local-source candidates and actual production parity. Historical checks remain unchanged; no remote calls to Supabase, commits, pushes, deployments or flags.

## Phase 7B.3 checkpoint 2 — compatibility review and conditional draft stop
RV01–RV04 production execution is incorporated into baseline contract. Full review: docs/phase-7b3-local-preparation-review.md. Exact production constraints/fingerprints omitted from supplied summary, missing attached reward source and unestablished new media retention/deletion contract keep compatibility partial. No unique migration draft generated: conditional drafting gate has not cleared. Local PG17.6 suite plus five reported-lifecycle/source-candidate models is running; unchanged historical integrity assertions remain 3/5 PASS with same two failures. Notification/reward witnesses are explicitly synthetic, not production parity. No baseline or historical SQL/tooling changes.

## Phase 7B.3 FINAL — local preparation compatibility boundary (2026-10-10)

**STOPPED after local review/verification. Draft preparation remains BLOCKED by partial compatibility; production migration application cannot safely be authorized.** User's local-only authorization accepted; no further permission requested. Conditional uniquely versioned drafting not performed because exact lifecycle/owner/attached-source contract is insufficiently established. This supersedes all older pending-RV and next-phase authorization statements; no claim Phase 7B.3 drafts are complete.

RV01–RV04 successfully executed on named production project through ChatGPT's read-only integration; supplied durable summary incorporated in baseline contract/readiness. No production query made by this session. Exact returned constraint/fingerprint/authority fields are absent from supplied summary, not assumed failed or unexecuted. Recover those results before requesting additional queries.

### Actual verification

- `node --test tests/database/phase7b25-postgres-integration.test.mjs tests/database/phase7b3-production-summary-model.test.mjs`: exit 0, **24/24 PASS**, 19 unchanged integration tests plus five new reported-permission/lifecycle models, 103.34 seconds. Real PG17.6/RLS/claims/independent-backend waits/races/deadlock retry/rating cleanup/counts/immutable votes preserved. New tests establish public baseline ratings versus private lists, linked-rating/account RESTRICT rollback, local-candidate owner pseudonymization/account vote cascade, Buffacoin guard rejection and synthetic AFTER witness ordering/failure rollback. They do NOT establish actual deployed notification/reward/RPC/dependency parity or exact production CHECK/generated score/role/Storage parity.
- Dedicated verified containers `buffago-phase7b25-5e5bb0cd1c18` and `buffago-phase7b25-c3ecf17a5de2`, cached `postgres:17.6` image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, local Docker Desktop named pipe, network none, no host ports, tmpfs. Retained as disposable evidence; no existing stack reset/stopped.
- Unchanged migration-integrity focused tests: exit 1, **3/5 PASS**, same checksum-stable and unique-root assertions FAIL. No historical/checker/manifest/assertion changes. Duplicate/five mismatch/seventeen unmanifested and source mappings remain unresolved. Logs: `crawl/.expo/phase7b3-postgres.log`, `crawl/.expo/phase7b3-integrity.log` (ignored local evidence; durable results here).
- `git diff --check`: PASS, existing line-ending notices only. Branch `feat/wing-jury-favorites-want-to-try`; HEAD `960a5422cb9aa8f59acd47e009937cceb8d90291` unchanged. Both feature defaults false. Supabase skill and current official RLS/changelog references reviewed; changelog cached in ignored `.expo` evidence.

### Remaining blockers and exact next action

[Full compatibility review and complete blocker inventory](phase-7b3-local-preparation-review.md). Recover already returned exact RV02 CHECK/FK/validation/deletion inventory, RV03 identities/fingerprints/WHEN/ACLs, RV04 trusted-owner authority. Obtain sanitized attached trigger/dependency source, especially missing production reward helper and actual wallet/notification/media/Storage locks. Establish supported account/rating/media deletion including new vote retention RESTRICT; do not loosen baseline FKs. Then produce quarantined CLI-generated new versions/fail-closed exact preflight/explicit owner and constraints, verify exact drafts and negative rollback against production-shaped actual RPC/trigger/role/Supabase pack. This is the remaining local preparation work, not authorized production work.

Application additionally blocked by historical reconciliation OR explicit human frozen-history exception, missing legacy baseline JSON/harness evidence, approved exact-version/hash feature-only runner, fresh project/PG/catalog/ledger/namespace/owner/Data API check, index/transaction/locking workload plan and separate exact application approval. Never root replay/db push from this checkout. Enablement additionally blocked by actual Edge/Auth/gateway/JWT/CORS/Deno/Storage signing/versions/expiry, scale/native acceptance, live tests/emergency plan and separately approved artifact/flag/cohort delivery. Flags false do not prevent SQL cleanup triggers affecting existing rating flows.

Exactly five repository files added/updated in this phase: `docs/phase-7b-production-baseline-contract.md`, `docs/phase-7b-deployment-readiness.md`, `docs/codex-handoff.md`, new `docs/phase-7b3-local-preparation-review.md`, new `crawl/tests/database/phase7b3-production-summary-model.test.mjs`. Prior dirty work preserved; staged foundation unchanged. No version reservations/root migration additions/historical edits/new branches/worktrees/commits/pushes/production calls/writes/ledger changes/remote migrations/deployments/builds/feature enablement/destructive cleanup. Stop boundary reached.

## Phase 7B.3A checkpoint 1 — exact evidence and draft design (2026-10-10)
All requested evidence and staged SQL reviewed. New exact report closes validated FK/CHECK, 18 enabled trigger attachments/MD5 and observed postgres CREATE/TRIGGER gaps for local drafting. User authorizes local quarantined drafts. Selected no-new-retention design: Jury media FK CASCADE, auth CASCADE, counts media CASCADE; immutable DELETE exception only when auth or media parent absent. Withdrawal retains votes but removes eligibility. Existing baseline RESTRICT remains unchanged. Unknown actual reward/notification/Storage source and RPC lock closure become explicit application gates, not a reason to repeat historical research. CLI generates a new file inside isolated unlinked phase-7b3a project only; historical roots/manifest untouched. Next: structural/collision preflight, explicit owner/grants, strict separate fingerprint preflight, production-shaped surrogate fixture and exact-draft acceptance. Flags false; no remote/commit/push/deploy action.

## Phase 7B.3A checkpoint 2 — exact draft and local acceptance
Unique CLI draft 20261010192747 exists only under crawl/supabase/local/phase-7b3a/supabase/migrations. Explicit named keys, postgres ownership, pg_catalog-only paths, new-object revokes/RLS and media CASCADE; no production helpers replaced. Structural/namespace/precondition preflight plus separate strict read-only production MD5 gate prepared. Safe source comparisons: raw body matches guard/notification/pseudonymization, LF matches two gallery helpers; Mango differs. Actual dependency behavior and remaining surrogate bodies are application gates. Initial fixture-owner schema USAGE defect corrected without API grants; first final draft acceptance 14/14, unchanged staged PG regression19/19, service/Edge52/52 and typecheck PASS. Tightened complete incoming-FK/trigger inventories and explicit order/reassignment/isolation checks are now in final exact-draft rerun. Full runbook at docs/phase-7b3a-deployment-runbook.md. Integrity remains69/duplicate1/mismatch5/unmanifested17 and focused3/5 with same2 failures; no historical edits/remote writes/flags/commits/pushes.

## Phase 7B.3A FINAL — local forward migration preparation (2026-10-10)

**PASS for authorized local preparation; COMPLETE and STOPPED.** Supersedes older drafting-deferred/missing-exact-metadata decisions. Three verdicts: **local drafting YES; production migration application NO; feature enablement NO.** Unknown actual production behaviors are explicit application-time gates, not renewed unrelated historical investigations. No production deployment can safely be authorized now.

### Evidence and compatibility closed

Completely reviewed requested handoff/review/baseline/readiness/exact evidence and staged SQL. Exact production report closes nineteen validated foundational/media definitions, twenty incoming media FK actions, eighteen enabled trigger attachment/MD5/owner metadata and observed postgres CREATE/TRIGGER authority. Production queries were supplied from ChatGPT; this session made no production/Supabase query or write.

Raw extracted function-body MD5 matches: guard, friend notification, owner pseudonymization. LF body MD5 matches: gallery validation/count refresh. Mango candidate differs; Badge/approval/derivative/referral/profile/Storage bodies unavailable or not reproduced. Matched body text does not establish historical file provenance or transitive behavior. Fixture executes five matched source candidates; notification social/preference/config helpers are explicit surrogates, Mango is unmatched local source and remaining twelve attachments are surrogate bodies. All eighteen baseline attachments/tested bodies are preserved before/after new migration.

Design: votes and counts media CASCADE; votes auth CASCADE; collections auth/destination CASCADE. No new media RESTRICT. Immutable direct edits/deletes forbidden while both parents exist; disappearance of auth/media permits parent cascade. Media cascade skips count decrement because count row also cascades, independent of FK order. Withdrawal/pseudonymization retain votes/counts while denying eligibility/feed/new votes/count-policy visibility. Existing rating/crawl/route/account/destination cascades may hit baseline media RESTRICT and roll back; do not weaken or silently repair those paths. Predicate trims Unicode whitespace to match the observed gallery boundary. Gallery counters/RPCs/rewards/notifications/photo processing unchanged by feature SQL.

New definitions: four tables, fourteen functions, nine triggers, nine policies, six explicit indexes/four PK indexes. Explicit named constraints, postgres ownership, pg_catalog-only feature paths, effective default-grant normalization, restrictive owner/nonanonymous RLS and no API TRIGGER/UPDATE/TRUNCATE/count-DML grant. Direct-DML architecture retained. New-only CREATE; no replacement/drop of existing objects. Locked structural preflight checks consumed types/nullability/owners/RLS/roles/authority, exact19 definitions/all20 incoming actions/all18 attachments/security paths, full relation/type/index/overload/trigger collisions. Strict separate read-only fingerprint preflight refuses surrogate Badge source; no fingerprint bypass/rehash or production-parity claim. Rating name order remains BEFORE lock→guard; AFTER friend notification→Want cleanup→Badge; fixture observes Want=1 before cleanup and0 in Badge surrogate. READ COMMITTED/whole-transaction retry required, including null-owner rating events.

### Exact quarantined artifacts and hashes

CLI2.107.0 generated `20261010192747_wing_jury_saved_destinations_forward.sql` via `supabase migration new` in isolated unlinked `crawl/supabase/local/phase-7b3a` project. It exceeds every local root and dated remote maximum20261009201342; fresh current remote maximum remains a gate. Existing root chain and manifests untouched.

- `crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql`: SHA-256 **f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3**.
- `crawl/supabase/local/phase-7b3a/production-fingerprint-preflight.sql`: SHA-256 **66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b**.
- `draft-package.json` pins exact allowlist/hashes/status `quarantined-not-approved`; `verify-package.mjs` validates offline only, rejects altered SQL/extra migrations/target/allowlist/nonforward versions, contains no production connection/apply capability.
- Complete runbook: [phase-7b3a-deployment-runbook.md](phase-7b3a-deployment-runbook.md). Production executor/native new-version ledger recording still requires separate design review/disposable proof/approval; offline validation is not deployment approval.

### Actual final verification on frozen bytes

- `node --test tests/database/phase7b3a-draft-postgres.test.mjs tests/database/phase7b3a-package.test.mjs`: **18/18 PASS**, exit0,121.689sec; **15 actual PG17.6 acceptance +3 offline package tests**. Exact frozen migration bytes tested. Independent backends/observed waits cover both rating/Want and final-rating/Favorite orders, old/new reassignment identities, media delete/vote orders, conflicting retries/distinct votes/account-count arithmetic. Covers all18 baseline preservation, negative constraint/trigger/role/overload/index/reapply checks, mid-DDL full rollback, strict fingerprint rejection of surrogates, full new-table ACLs/ownership/search paths, guest/anonymous/spoof/cross-user restrictions, linked-parent RESTRICT rollback, pseudonymization, cascades, withdrawal/Unicode consent, matched gallery independence, guard/notification source plus surrogate reward failure/order, unsupported isolation including guest null identity. Log `crawl/.expo/phase7b3a-final-frozen-artifacts.log`.
- Unchanged original staged PG integration: **19/19 PASS**, exit0,108.174sec. Log `.expo/phase7b3a-regression-postgres.log`; verifies previous fixture/feed/aggregate/Storage/roles/deadlock retries as regression, not new exact production parity.
- Edge/service/feed/saved-list regression: **52/52 PASS**, exit0,66.032sec. Log `.expo/phase7b3a-service-regression.log`; Node harness/network fixtures, not live Edge/Deno.
- Offline verifier: PASS final pinned hashes; package tests reject tampering/extra SQL/wrong target/nonforward/allowlist drift. Typecheck **PASS**, exit0 (`.expo/phase7b3a-typecheck.log`). No app/TS/Edge/feature-config source changed. Lint not repeated; prior lint evidence remains dated.
- Historical focused integrity: **3/5 PASS, two unchanged failures**, exit1 (`.expo/phase7b3a-integrity-focused.log`). Strict checker **FAIL unchanged:69 roots/duplicate20260729200000/five mismatches/seventeen unmanifested** (`.expo/phase7b3a-integrity.log`). No assertions/checkers/manifest/historical SQL altered.
- Initial local fixture deficiencies corrected: trusted auth/Storage owners needed schema USAGE for RI checks; Badge surrogate path now matches observed public path. Tightened metadata gate retains strict failures; collision-first preflight identifies reapply before changed incoming inventory. Final frozen-byte run is authoritative; earlier intermediate logs are not release evidence.
- Final PG container `buffago-phase7b25-ef60aa1f8932`; regression container `buffago-phase7b25-e7199bd914a2`. Local named pipe/Docker desktop-linux, verified image17.6 ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, labels, networknone, no host ports, tmpfs. All disposable evidence retained; existing development stacks untouched. Other preparation-run containers/logs remain diagnostic only; no cleanup/stack stop.

### Specific remaining gates and next action

Application: safe actual Badge reward/unmatched Mango/approval/derivative/Storage/account-referral behavior and notification dependencies; actual Home/Crawl/Buffacoin RPC/wallet/operation/crawl lock closure/isolation/retry/deletion orchestration; trusted actual executor/Auth-Storage read/FK/row-lock privileges and real Supabase Auth/Data API/JWT RLS/private nonexposure; historical provenance disposition OR explicit human frozen-history exception naming all anomalies; missing legacy baseline JSON/harness remains separate blocked/not-run evidence; approved/tested exact-artifact-only executor and new-version recording; fresh approved project/PG/ledger maximum/catalog/complete namespace/ACL/security path/fingerprint; representative index/feed/lock/timeout plan, coordinated DDL/role window, scoped existing-flow smoke/containment and separate exact application authorization. No root replay/db push or blanket investigation repeated.

Enablement additionally: authorized/applied SQL with post-apply catalog and actual flows verified; exact compatible feed→vote→reveal/shared/config delivery; real gateway/JWT/anonymous/CORS/Deno/Storage versions/signing/fetchability/expiry; realistic scale and native auth/navigation/accessibility; approved live smoke/emergency disable and separate bundle/cohort flags. Preserve user data/cleanup invariants; roll forward; issued300-second URLs may survive withdrawal until expiry.

Next action: review this exact quarantined package/runbook and close the named application behavior/executor/runtime/history-disposition gates in a separately scoped task. No production authorization requested or inferred. Both flags stay false; stop after local preparation.

### Exact files changed in Phase 7B.3A (15)

1. `docs/phase-7b-production-baseline-contract.md`
2. `docs/phase-7b-deployment-readiness.md`
3. `docs/codex-handoff.md`
4. New `docs/phase-7b3a-deployment-runbook.md`
5. `crawl/scripts/phase7b25-postgres.mjs` — optional fixture sources, same dedicated local target protections/defaults.
6. New `crawl/tests/database/fixtures/phase7b3a-production-shaped-bootstrap.sql`
7. New `crawl/tests/database/phase7b3a-draft-postgres.test.mjs`
8. New `crawl/tests/database/phase7b3a-package.test.mjs`
9. New `crawl/supabase/local/phase-7b3a/supabase/config.toml`
10. New `crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql`
11. New `crawl/supabase/local/phase-7b3a/structural-preflight.sql`
12. New `crawl/supabase/local/phase-7b3a/production-fingerprint-preflight.sql`
13. New `crawl/supabase/local/phase-7b3a/source-comparisons.json`
14. New `crawl/supabase/local/phase-7b3a/draft-package.json`
15. New `crawl/supabase/local/phase-7b3a/verify-package.mjs`

CLI-generated ignored `.temp/cli-latest`, ignored `.expo` generation scripts/negative package copies/logs/changelog are local diagnostics, not deployment payloads. User-supplied evidence file and original Phase2B staged SQL unchanged. Prior dirty work preserved. Branch `feat/wing-jury-favorites-want-to-try`, HEAD `960a5422cb9aa8f59acd47e009937cceb8d90291` unchanged. No new branches/worktrees/commits/pushes/production calls/writes/ledger repairs/remote migration application/deployment/history modifications/flag enablement/store build/destructive cleanup. Handoff updated; local phase stop reached.
# Phase 7B.3B checkpoint 1 — 2026-10-10 (superseded by final checkpoint)

Frozen migration and fingerprint-preflight hashes verified unchanged; branch remains `feat/wing-jury-favorites-want-to-try`. Two independent High-reasoning read-only reviews completed. New bounded work: local-only feature executor kernel with atomic new ledger insertion before the frozen terminal COMMIT, approved catalog/ledger snapshot drift checks, strict production fingerprint checks and effective post-DDL ACL guard. No production transport/authorization exists. Disposable executor verification pending. Actual trigger/RPC/deletion behavior, execution identity, history exception and runtime/maintenance gates remain open. Prior completed feature suites are not repeated. No production action or flag change authorized.

## Phase 7B.3B checkpoint 2 — executor review and focused acceptance

High-reasoning database and independent reviewers completed initial/final read-only reviews; no remaining local-prototype/documentation defect identified after fixes. Constructor constrains surrogate exception to disposable names; production plan always strict. Atomic feature/only-new-ledger insertion occurs before original terminal COMMIT; no root glob or history repair. Drift snapshot includes full ledger, roles/ACL/defaults, constraints/indexes/functions, ledger triggers/rules, view/rule digests and DDL event triggers. Pre-COMMIT gates reject unapproved grantees, effective rights, SET-role paths, grant options and column grants.

Intermediate focused executor acceptance: 12/12 PASS then 13/13 PASS including remaining read-only SQL syntax/snapshot reproducibility on PG17.6. Final 14-case run adds the reviewed column/grant-option refusal test; running. One observed temporary initialization-server readiness race was corrected in the Docker-only runner, preserving local identity/no-network protections and existing stacks. Initial missing linked-media test fixture corrected; no frozen SQL/preflight modifications. Final run will be authoritative; intermediate logs are diagnostic.

Read-only packet and final gate created. No current production snapshot/target/executor connection/ledger representation is approved. Production adapter remains unimplemented; actual Badge/Mango/approval/derivative/referral/Storage/notification/RPC/deletion/retry behavior remains bounded evidence gate. Current Buffacoin single RPC/throw is not established whole-transaction retry. Historical duplicate/five mismatches/seventeen omissions/two failed assertions and legacy missing evidence preserved. No production or flag action; PARTIAL/NO-GO remains expected final verdict.

## Phase 7B.3B final checkpoint — COMPLETE LOCAL WORK; STOPPED

**PARTIAL / NO-GO for requesting production deployment authorization.** Local migration drafting remains cleared; production application and feature enablement remain independently blocked. Full current runbook/abort/order/smoke/containment/approvals: [phase-7b3b-final-release-gate.md](phase-7b3b-final-release-gate.md).

Frozen integrity reverified before work and at completion: migration version20261010192747 SHA256 `f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3`; strict preflight SHA256 `66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b`. Package status remains quarantined-not-approved. Both frozen files/seven-file package and historical root SQL/manifests/checkers/assertions untouched by3B.

Actual final command from `crawl/`: `node --test tests/database/phase7b3b-executor-postgres.test.mjs` — **14/14 PASS**, exit0,71.146sec;13 real PG17.6 cases and one offline target/hash/approval case. Exact original body used; original SQL stored in synthetic compatible text[] ledger, only new row added atomically before original COMMIT; full strict lane correctly rejects surrogate Badge, no fingerprint substitution. Coverage: whole-ledger/schema drift, target/hash/identity/authority refusal, collision/nonforward/reapply; partial DDL and ledger failure full rollback; effective inherited/standalone/default/SET/column/grant-option rights refusal; concurrent executor observed wait then stale refusal; lost acknowledgement logged failed-or-unknown then read-only committed-state verification; preserved rating attachments, rating/media deletion/cleanup/RESTRICT rollback and guest/cross-owner RLS; remaining SQL executes read-only and exact snapshot artifact matches constructor.

Log `.expo/phase7b3b-executor-postgres-final.log`; local external append-only attempt/outcome evidence `.expo/phase7b3b-executor-evidence.jsonl`. Container `buffago-phase7b25-682d49f1b7de`; cached17.6 image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`; verified desktop-linux/local named pipe, labelled tmpfs/networknone/no hostports; retained. Existing stacks untouched. Intermediate initial fixture-link failure and initialization-server readiness race corrected and followed by passing final acceptance; diagnostic logs/containers retained, no cleanup.

Final offline package verifier PASS unchanged. git diff --check PASS (only pre-existing LF/CRLF warnings). New-file whitespace scan performed separately because untracked files are not included in git diff. No application/TS/Edge/feature-config source changes; typecheck/service/full prior feature suites appropriately not rerun. Prior3A acceptance18/18, stagedPG19/19, service52/52 and typecheckPASS remain dated evidence. Historical 3/5 focused /two failing assertions and69roots/one duplicate/five mismatches/seventeen omissions remain visible; no checker rerun or assertion suppression.

Two specialized High-reasoning reviewers gave final read-only local-scope/documentation PASS after concrete executor/SQL fixes; no production-readiness claim. Remaining read-only packet `phase-7b3b-remaining-production-readonly.sql` B01–B07 and `phase-7b3b-catalog-snapshot-readonly.sql`, plus unchanged strict frozen preflight, await ChatGPT execution against visibly confirmed project ref. No production read/write executed here. SQL metadata cannot prove routing, actual source behavior or live gateway authorization; no baseline fingerprint fabricated/auto-approved.

Remaining gates: actual Badge/Mango/approval/derivative/referral/Storage/notification dependencies and RPC/wallet/operation/crawl/deletion behavior; demonstrated READ COMMITTED/whole-transaction retry/idempotency (Buffacoin currently single-RPC/throw); actual postgres connection/control-plane/TLS identity and consumed-schema/FK/read/row-lock/ledger authority; actual existing ledger schema/constraints/triggers/rules and custom-new-row representation acceptance; production transport adapter implementation/review/verified-target proof (prototype has NONE); fresh catalog/ledger/max/namespace/ACL/fingerprint/event-trigger evidence; explicit historical disposition or named frozen-history exception; representative index/lock/scale window/DDL-role freeze; scoped smoke/incident owner/prior deployed Edge bundle evidence; separate exact SQL/ledger/smoke authorization. Enablement additionally needs approved Edge/runtime/Storage/native/distribution and flag release. No gate collapsed into local passing tests.

Both defaults false, no explicit enabling override found in current process/root local env flag checks; installed/hosted/build effective values still require release acceptance. Local candidate Edge paths/config hashes recorded in `phase-7b3b-edge-candidate-hashes.json`; actual deployed predecessors unavailable, explicitly an approval-time gate. Emergency non-destructive endpoint/new-DML containment preserves data/cleanup triggers; flags do not contain rating-trigger defects; forward correction/reconciliation required for committed DB defect.

### Exact Phase 7B.3B files changed (10)

1. New `crawl/scripts/phase7b3b-feature-executor.mjs` — transportless plan/disposable transaction kernel.
2. New `crawl/tests/database/phase7b3b-executor-postgres.test.mjs` —14 focused cases.
3. `crawl/scripts/phase7b25-postgres.mjs` — permanent-server readiness race correction only.
4. New `docs/phase-7b3b-final-release-gate.md` — current verdict and complete release runbook.
5. New `docs/phase-7b3b-remaining-production-readonly.sql` — bounded B01–B07 packet.
6. New `docs/phase-7b3b-catalog-snapshot-readonly.sql` — exact reviewed-state drift snapshot.
7. New `docs/phase-7b3b-edge-candidate-hashes.json` — local source/config inventory, not deployed rollback proof.
8. `docs/phase-7b-production-baseline-contract.md` — prominent3B current verdict supersedes old gates.
9. `docs/phase-7b-deployment-readiness.md` — final3B status/evidence/gates.
10. `docs/codex-handoff.md` — frequent checkpoints/final result/inventory/safety.

Ignored `.expo` logs/evidence/changelog are local diagnostics only. Branch `feat/wing-jury-favorites-want-to-try`; HEAD `960a5422cb9aa8f59acd47e009937cceb8d90291` unchanged. Prior dirty work preserved. No new branches/worktrees/commits/pushes/production calls/writes/remote applications/ledger repairs/Edge deployments/historical modifications/feature enablement/store builds/destructive cleanup. Stop reached; do not begin Phase7C. Next external action is bounded read-only evidence and review of named gates, not production authorization or another broad historical investigation.

## Phase7B.3C final checkpoint — COMPLETE LOCAL WORK; STOPPED

**PARTIAL / NO-GO for production migration authorization.** Local preparation YES; production application NO; feature enablement NO. B01–B07 supplied production observations incorporated into release gate, baseline contract and readiness. [Current exact compatibility/behavior/adapter/historical plan](phase-7b3c-compatibility-and-adapter-plan.md). Do not repeat seven groups; do not run full snapshot outside approved window. New production report preserved unchanged; no remote calls made here.

Closed dated evidence: control-plane ref/host/runtime17.6/sessionREAD COMMITTED/postgres nonsuper+BYPASSRLS; actual CREATE/USAGE/owner/FK/read/row-lock/TRIGGER/ledger authority, API private/ledger denial and no reachable SET roles; actual ledger six columns/two validated keys/no relation triggers or rules/35distinct versions/latest20261009201342 <candidate20261010192747; queried collisions absent;167 validated nondeferrable constraints/28 valid ready indexes; no qualifying blockers at observation. Individual read-only queries are not an atomic approved application snapshot. Existing six supabase_admin event triggers remain; only issue_pg_graphql_access CREATE FUNCTION and pgrst_ddl_watch ddl_command_end require relevant handler-behavior evidence for this artifact.

Exact public default ACLs tablearwdDxtm (includes MAINTAIN),sequencerwU,functionX installed in local fixture. Frozen ALL revokes/narrow grants and supplementary pre-COMMIT ACL/owner/RLS/SET/grantee/grant-option/column guards PASS; unrelated defaults/probe rights preserved; no feature sequence/new membership/baseline rights introduced. No frozen change required. Actual six-column ledger named INSERT/type representation PREPAREs successfully and is SQL-compatible; **no migration-ledger rows written locally or remotely in3C**. Singleton original-SQL array/custom mechanism still needs explicit consumer/human disposition; mixed cardinalities are not approval. Nonfrozen executor/snapshot now additionally hashes whole ledger rows including created_by/idempotency_key/rollback; local SELECT/VALUES detects metadata drift and static artifact agrees with constructor. Full snapshot never executed and no digest approved/fabricated.

Source correspondence: eight new matches from seven bounded local files—Home/Crawl/Buffacoin/withdrawal/account prepare+complete raw; approval+derivative queue LF-normalized. Comparison JSON records hashes/paths only; no body/secret dump, historical provenance claim or old migration replay. Older Crawl body and Mango candidate do not match. Prior five matched guard/notification/pseudonymization/gallery bodies remain reusable. Account prepare does not unlink media.rating_id; local delete-account checkout prepares → removes Storage → completes → Auth delete; actual deployed correspondence/Auth behavior unverified and baseline linked-media rating RESTRICT may still fail deletion. Preserve policy; verify supported orchestration or explicitly accept documented baseline outcome.

Actual final local command from `crawl/`: `node --test tests/database/phase7b3c-compatibility-postgres.test.mjs` — **4/4 PASS**, exit0,24.938sec; all four use real PG17.6. Exact default-ACL proof; six-column ledger PREPARE/no-write/full-row drift/static snapshot proof; actual matched Buffacoin body debit/rating/Want/reward-failure rollback + same-operation replay; independent backend observed operation-advisory wait/no double debit. Wallet/crawl/operation table shapes, generated score and unknown reward/notification/lifecycle dependencies remain labelled synthetic. Full production equivalence/whole-system deadlock freedom/live caller retries are not claimed. Prior completed suites not repeated.

Final log `.expo/phase7b3c-compatibility-postgres-final.log`; container `buffago-phase7b25-20c720730cd8`, desktop-linux/local named pipe, cached17.6 image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, labelled tmpfs/networknone/no hostports/retained; no existing stack touched. Intermediate4/4 log/container retained as diagnostics only. Offline frozen verifier PASS twice; exact frozen hashes remain migration `f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3`, preflight `66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b`. Bounded history draft current/manifest/LF hashes and8matching source rows validated; strict historical checker not rerun/modified. git diff --check PASS, separate ten-file whitespace/JSON checks PASS. No app/TS/Edge/config source change; typecheck/service/full old tests not repeated.

Historical exact DRAFT_NOT_APPROVED record pins both duplicate20260729200000 files, all five mismatches/seventeen omissions with current/LF/manifest hashes, manifest/evidence-log and prototype hash, target/version/both frozen hashes, two unchanged failed assertion names, unresolved remote/local identities and missing legacy baseline/harness limitation. Required human choice: honest independently scoped reconciliation OR named/hash-bound frozen-history residual-risk exception with accountable owner/date/expiry/remediation and separate custom ledger-mechanism decision. Never change old bytes/checks/manifest/ledger or mark versions. No exception or production permission granted; future actual adapter hash/approval still required.

Only concrete remaining SQL gates: five targeted behavior cases (actual Badge/Mango/consumed helper/referral/social/transition/photo-blocker/Storage/account lifecycle/two applicable event handlers; real Home/Crawl/Buffacoin interaction/caller READ COMMITTED+40P01/40001 whole-RPC retry preserving operation IDs; deployed account/media deletion); implement/review specified authenticated TLS verify-full adapter and pass disposable TLS/credential/approval/authority/session/rollback/recovery tests, followed by separately approved actual read-only identity proof; historical and custom-ledger decision; representative index/lock/scale interruption/change-window/role-DDL freeze plus smoke/incident/forward-recovery ownership; full snapshot/immediate frozen preflight only inside approved window; separate exact production SQL/new-ledger/smoke write authorization. Known matching bodies must be reused, not re-requested; recover already returned B02/B06 handler/helper metadata first. API/enablement adds actual JWT/PostgREST/private exposure/Storage signing/version/Edge/native/runtime/predecessor artifacts/distribution approval.

### Exact Phase7B.3C files changed (10)

1. New `crawl/tests/database/phase7b3c-compatibility-postgres.test.mjs`.
2. `crawl/scripts/phase7b3b-feature-executor.mjs` — nonfrozen full-ledger-row digest only.
3. `docs/phase-7b3b-catalog-snapshot-readonly.sql` — matching full-row digest text; NOT executed.
4. New `docs/phase-7b3c-source-comparisons.json`.
5. New `docs/phase-7b3c-history-exception-draft.json` — DRAFT_NOT_APPROVED only.
6. New `docs/phase-7b3c-compatibility-and-adapter-plan.md`.
7. `docs/phase-7b3b-final-release-gate.md` — verified3C facts/closed gaps/narrow remaining gates.
8. `docs/phase-7b-production-baseline-contract.md` — authoritative3C status and privilege/ledger contract.
9. `docs/phase-7b-deployment-readiness.md` — final3C decision/evidence/minimum next work.
10. `docs/codex-handoff.md` — checkpoint/final facts/results/stop/safety.

No new production-query packet; existing B01–B07 not rerun and full snapshot not run, even locally. No adapter implemented or connected. Supplied report/frozen package/historical SQL/manifest/checkers/assertions/flags untouched. Both defaults false; no enabling override in root local env flag check. Ignored `.expo` logs are diagnostics. Branch `feat/wing-jury-favorites-want-to-try`, HEAD `960a5422cb9aa8f59acd47e009937cceb8d90291` unchanged; previous dirty work preserved. No commits/pushes/new branches/worktrees/production calls/writes/remote migrations/ledger record writes/deployments/store builds/feature enablement/destructive cleanup.

Minimum next action: obtain only screened missing consumed-behavior/applicable-handler and actual caller/deployed delete-account evidence; decide exact history/custom-ledger draft; separately scope adapter implementation/disposable TLS acceptance. No production authorization request yet. Stop reached; do not begin Phase7C.



## Phase7B.3D final checkpoint — engineering closeout, stop

**PARTIAL; production NO-GO; no Phase7C.** Final verification: PostgreSQL17.6 closeout **34/34 PASS**, zero failures/skips (366978.528ms): executor14, compatibility4, adapter9 (seven offline policy/protocol checks plus two real PostgreSQL atomic/recovery and TLS/SCRAM checks), matched-body behavior7. Thus27 checks use actual disposable PostgreSQL. Log: crawl/.expo/phase7b3d-postgres-closeout.log. Client regressions **60/60 PASS**, zero failures/skips (23578.4061ms), log crawl/.expo/phase7b3d-client-verified.log. Typecheck **PASS, exit0**, log crawl/.expo/phase7b3d-typecheck-verified.log. Frozen package verification and git diff --check PASS. Earlier failed/interrupted logs are retained diagnostics, superseded by these final results.

Closed locally: authenticated TLS/SCRAM adapter controls; signed target/action/hash/expiry and fail-closed drift gates; atomic feature-only SQL plus one new original-SQL ledger row without historical replay; durable evidence/protocol controls and unknown-COMMIT classification; bounded account-pinned Home/Crawl/Buffacoin whole-RPC retries; focused execution of the eight already matched source bodies. No test assertion was relaxed to mask behavior. Synthetic transitive dependencies are explicitly bounded, not production parity. Home concurrent uniqueness23505 remains a known recoverable same-ID receipt outcome; failed account cleanup manifests remain terminal and media.rating_id remains linked.

Open technical gates: L1 actual rating/reward/referral/social/Badge dependencies; L2 media/Storage/Mango transitions and guards; L3 deployed account-deletion orchestration and supported failure recovery; L4 actual issue_pg_graphql_access/pgrst_ddl_watch handlers; L5 runtime/operations/ledger-consumer acceptance. Full production-target adapter end-to-end parity/review and independent external trust/credential/CA/tool provisioning remain required. Do not repeat B01-B07 or request the eight matched bodies again.

Human authorization remains absent: exact history exception (DRAFT_NOT_APPROVED), custom singleton ledger/consumer compatibility, maintenance window/locking and current signed digests, accepted incident/recovery owner (Branden proposed; acceptance/backup absent), authorized synthetic smoke scope, exact deployed Edge rollback predecessor and any approved forward repair. Technical tests do not approve these decisions. [Approval packet](phase-7b3d-approval-packet.md) defines artifacts, residual risks and precise L1-L5 tests. Minimum next action: provide only missing screened helper/handler/deployed lifecycle evidence and arrange separately authorized controlled acceptance plus adapter operational review; then obtain the hash-bound decisions. Deployment remains blocked.

Frozen migration SHA256 f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3 and preflight SHA25666ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b unchanged. [Artifact inventory](phase-7b3d-artifact-hashes.json) is engineering evidence, not approval.

Phase3D files changed (earlier initiative work preserved): crawl/app/(tabs)/home/index.jsx; crawl/app/crawl/[id].jsx; crawl/lib/buffacoinRatingTransaction.js; crawl/lib/ratingRpcRetry.js; crawl/scripts/phase7b25-postgres.mjs; crawl/scripts/phase7b3b-feature-executor.mjs; crawl/scripts/phase7b3d-production-adapter.mjs; crawl/scripts/phase7b3d-native-postgres.mjs; crawl/scripts/phase7b3d-closeout-inventory.mjs; crawl/tests/database/phase7b3d-adapter.test.mjs; crawl/tests/database/phase7b3d-behavior-postgres.test.mjs; crawl/tests/rating-rpc-retry.test.mjs; crawl/tests/rating-mission-tracking.test.mjs; docs/phase-7b3b-catalog-snapshot-readonly.sql; docs/phase-7b3d-approval-packet.md; docs/phase-7b3d-artifact-hashes.json; docs/phase-7b3a-deployment-runbook.md; docs/phase-7b3b-final-release-gate.md; docs/phase-7b-deployment-readiness.md; docs/codex-handoff.md. Ignored .expo fixture binaries/data/scripts and diagnostics retained.

Git safety: branch feat/wing-jury-favorites-want-to-try, HEAD960a5422cb9aa8f59acd47e009937cceb8d90291 unchanged; no commits, pushes, new branches/worktrees, historical migration modifications, production connections/SQL, migrations against external targets, deployments, submissions or feature enablement. Both ENABLE_WING_JURY and ENABLE_SAVED_DESTINATIONS remain false with no session environment override. Disposable local fixture SQL only. Stop after engineering closeout.
