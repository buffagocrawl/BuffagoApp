# Restaurant review in Mango and the BuffaGo growth dashboard

Mango has a Pending Restaurants tab for the existing destination_suggestions queue. Reviewers can inspect submitted details and saved Wingman confidence/reasoning/place evidence, confirm or correct location details, and approve or reject with a required reason. Recent review history retains the decision, reviewer, timestamp, reason, and approved destination ID. No suggestion is deleted.

Approval uses a service-only destination creation function shared with wingman-intake. It inserts the existing destination fields and runs the usual table triggers. A matching name/state/address reuses the existing restaurant. A same-name/city address conflict fails for manual resolution. Database locking serializes creation and review; identical retries return the saved receipt. A conflicting review fails. Queue/history and review/create/count functions are unavailable to anon and authenticated clients; Mango's local server uses its existing active wing_reviewer/wing_admin identity and same-origin protection.

The Pi shows pending photos, restaurants, open feedback and open work in four compact cards. Restaurants come from the exact pending view used by Mango. A missing count displays unavailable rather than zero.

## Older submissions

Read-only production inspection found 13 suggestions and no explicitly linked Wingman logs. These older submissions remain reviewable and show that linked evidence is unavailable. New mobile submissions save their Wingman assessment directly on the suggestion. Client-supplied evidence is advisory and must be checked by the reviewer. Existing suggestions from other app intake paths also appear in this restaurant queue.

## Deployment order

The migration, Edge Function and local Mango are deployed. The growth Pi update is blocked by SSH connectivity; its installation path and actual display resolution have not been verified.

1. Review and apply only crawl/supabase/migrations/20261013011230_mango_restaurant_review.sql. The migration preserves the deployed growth snapshot definition and authorization and adds pending_restaurants to its product_pulse. It fails closed if the expected snapshot integration point is absent. Do not blindly deploy unrelated historical migrations.
2. Deploy the updated wingman-intake Edge Function after the migration. Its creation RPC must exist first.
3. Restart Mango using its normal launcher with the updated server/src files and existing protected environment. Open Pending Restaurants and verify the queue. Do not put service keys in client code.
4. Update models.py and ui/dashboard.py on buffago-growth (192.168.4.35), not life-pi. First inspect `systemctl cat buffago-growth.service` to confirm the active installation. The repository service uses /opt/buffago-growth-command-center. Back up the two files, copy into that active installation, retain ownership and permissions, and restart buffago-growth.service. Preserve .env and mission data.
5. Include WingmanAddDialog.jsx in the next mobile release so new suggestions retain their assessment. Older mobile clients can continue submitting suggestions without evidence.

Verify the snapshot product_pulse.pending_restaurants.total equals the Mango pending queue length. Use test submissions in a non-production environment for approve/reject smoke checks. An approved destination must be discoverable by the existing mobile search; rejection must leave the reason in Mango history. Recheck the Pi at 800x480, 1280x720 and 1600x900.

## Validation and deployment record (2026-10-12 EDT)

- Branch: `feature/mango-restaurant-review-rollout`. All source changes and screenshots remain unstaged, uncommitted and unpushed. No PR, merge or mobile store release was created.
- The Downloads patch path was absent. The existing untracked repository-root `mango-restaurant-review.patch` applied cleanly and was preserved unchanged.
- Mango: 66 tests passed; production build and lint passed. Initial origin tests encountered the running launcher's occupied ports; after stopping only Mango's two Node processes, all five proxy/origin tests passed. Added coverage for successful refresh clearing a stale load error. Six restaurant UI tests then passed after adding a malformed-evidence regression: non-string assessment reasoning and non-numeric confidence cannot break the queue.
- Database/intake: 15 tests passed across the PGlite contract suite, a real PostgreSQL concurrency suite in a fresh disposable database inside the existing local Supabase Postgres container, the mobile evidence/authentication suite and Wingman search-prefill tests. Concurrent identical reviews return one receipt; concurrent suggestions reuse one destination; competing approval/rejection commits one decision and rejects the other. The isolated database was removed after testing; the existing local app database was preserved.
- Pi: 99 Python tests passed, including Tk rendering checks. The 13 rendering tests passed again after adding a numeric restaurant-count fixture. Captures at 800x480, 1280x720 and 1600x900 were visually inspected. The initial 800x480 restaurant label extended past its card; wrapping and adjusted number placement now keep it inside the card, with a regression assertion. These are local fixture renders, not captures of the remote Pi.
- Mobile lint: zero errors, 98 existing warnings repository-wide; targeted lint on WingmanAddDialog and the new intake/concurrency tests passed without warnings. The evidence-saving callback was exercised with invented data and retained assessment, place and submitted details.
- Supabase project `vhfxnizaxdanmvmouuaf`: applied only `mango_restaurant_review`, recorded as migration version `20261013011230`. The local new migration filename was aligned with this recorded version to prevent a future migration push from applying it twice. Existing growth snapshot metrics and service-only authorization remain intact.
- Deployed `wingman-intake` version 16 after the migration; JWT verification remains enabled. Creation now uses the shared transactional creation RPC. Fixed the pre-existing missing/invalid-user path to return 401 before lookups or writes; isolated regression tests cover both paths. An unauthenticated live request returns 401.
- Restarted Mango's API and Vite using the same preflight and commands as the normal launcher, with the existing `.env`; both remain bound to loopback. No photo jobs were claimed. The live UI/API shows 13 pending restaurants, matching the pending view, count RPC and growth snapshot. All 13 old suggestions have no saved evidence; Mango displays the older-submission explanation when expanded. Production review history remains empty (zero reviews).
- Live foreign-Origin queue reads return 403. Database checks confirm anon/authenticated cannot execute the new privileged RPCs. The security advisor reports the expected informational RLS-with-no-client-policy finding for the service-only review table. It also reports unrelated existing project findings (including disabled RLS on destination_tags); no unrelated security changes were deployed.
- Growth Pi blocker: two attempts to `ssh -o BatchMode=yes -o ConnectTimeout=8 192.168.4.35` returned `connect to host 192.168.4.35 port 22: Connection timed out`. `buffago-growth` did not resolve. Consequently no remote path inspection, file copy, service restart, actual-resolution check or Pi-displayed count verification occurred. Pi `.env` and mission data were untouched. life-pi / Branden OS was not accessed or modified.
- No real restaurant approval or rejection was performed. The screenshot harness blocks every mutation on its live page; its fixture page intercepts all API calls before exercising a rejection.

Screenshots:

- `artifacts/restaurant-review/mango-live-pending.png`: live Mango pending count and submitted details.
- `artifacts/restaurant-review/mango-fixture-evidence.png`: invented Wingman evidence.
- `artifacts/restaurant-review/mango-fixture-approval.png`: invented location confirmation form.
- `artifacts/restaurant-review/mango-fixture-rejection-history.png`: invented rejection reason and reviewer history.
- `buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-{800x480,1280x720,1600x900}.png`: local fixture layout captures.

Outstanding: reconnect to the growth Pi, verify hostname and `systemctl cat buffago-growth.service`, back up/copy only models.py and ui/dashboard.py into its verified active installation, preserve `.env` and all mission data, restart only buffago-growth.service, then capture/check its actual screen resolution and displayed count. Include WingmanAddDialog.jsx in the next normal mobile release.

For rollback, return Mango/Pi/mobile/Edge Function code to the previous version first; retain the additive schema and audit records. Dropping review records would re-open already reviewed suggestions and should not be used as rollback.

## Approval prefill update
Mango fills editable name, full address, city, state, latitude and longitude from the suggestion and its saved evidence. Only missing-evidence submissions use legacy Wingman recovery: directly linked logs first, otherwise submitting user, state, normalized extracted restaurant name, complete normalized address and a bounded session (30 minutes before / 2 minutes after submission). Age of the suggestion does not limit recovery. Conflicting location matches leave recovered fields blank and show a warning; lookup failures and missing matches remain visible. The form displays matched log IDs and timestamps. No evidence backfill writes occur.
Approval opens with an editable suggested reason and saves only after Confirm review. Rejection opens with an empty reason. The mobile suggestion evidence now retains full submitted identity and prefers assessment location data over candidate fallback data.
No additional schema deployment is required for this update where the existing restaurant-review migration is installed. Shipping the mobile payload change requires the normal app release. The deployed Wingman edge function rate-limit repair was neither changed nor redeployed by this update.
Validation: FishBurger's live read-only API response recovered Columbus, 40.0328092, -82.99093 from two matching Oakland Park logs. Browser visual QA remains blocked because no browser surfaces are available in this session.
