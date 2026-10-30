# Autonomous Growth Pi — deployed and verified

Functional commit `8927afc0734aea2f91b00031ed6f54242e093076`, merged through [PR #41](https://github.com/buffagocrawl/BuffagoApp/pull/41) as `74f67b5068fc67020a1c12901ec36ee4248a59b3`. CI scoped checks, secret scan and read-only capability diagnostics passed before merge. No branch protection was bypassed and no force-push was used. Prior PRs #39 and #40 were already merged and were included in the inspected base; no unrelated open PR was merged.

## Actual deployment

Verified `branden@192.168.4.40`, hostname `buffago-growth`, known SSH host key and actual 1920x1080 display. Installed-source AST checks preserve business rendering and local hooks except the explicitly replaced Unique Mobile Devices chart. The app's snapshot transport, MAU, ratings, accounts, alerts and activity remain intact. Only the display service was restarted; its original unit, the control unit/PID, original environment file, models and local growth configuration were verified unchanged by hash/PID checks.

Installed only the scoped app hooks, renderer, weekly chart, latest-data model, local approval module and native pull client. Added `buffago-growth-feed.service` and `.timer` and a new root-owned mode-0640 `/etc/buffago-growth-feed.json`. That new file contains only a fixed endpoint, a narrow read capability and the cache destination. Broad Supabase service-role keys and Meta credentials were checked absent on Pi. Existing settings/secrets were not overwritten. The Pi-owned `data/state-goals.json` was created only because it did not already exist; it remains unapproved.

The authenticated endpoint `buffago-pi-feed` is a **new, separate** read-only function on the existing Supabase project, version 1. Existing app functions and database/schema/functions were not changed. Its own constant-time credential check is why platform JWT verification is disabled for this function only. It GETs exactly two fixed private analytics objects: a reader-hash configuration and the sanitized current feed. It cannot forward arbitrary paths, query app tables, call Meta or mutate anything. Anonymous requests were rejected with 401; authenticated requests returned the sanitized feed. There is no public/signed raw-report URL or new browser credential/data path.

## Independence and recovery proof

The independent producer is the **existing enabled analytics GitHub Actions workflow**, with unchanged cron expressions. Its reviewed main-branch collection now reads current Meta observations/account day ranges, preserves analytics history, reads state aggregates and writes only the separate fixed sanitized `guess-wing-spot-analytics-v1/dashboard/feed.json`. No producer, export, transfer, authentication agent or key on Windows is needed for future refreshes. Pi's system timer pulls every ten minutes, with boot activation and a bounded random delay. No new paid service was added.

The verification sequence is in `verification.json`:

1. Stopped the old Windows task and recorded its last-run time.
2. Ran [analytics-only collection + cloud producer 40979773526](https://github.com/buffagocrawl/BuffagoApp/actions/runs/40979773526) on GitHub main while that task remained stopped.
3. Cloud source collection: `2026-10-30 00:27:42 UTC` / **Oct 29 20:27 EDT**. Cloud feed produced at `00:28:03 UTC` / **20:28 EDT**.
4. Pi independently fetched and atomically installed it at `00:30:08 UTC` / **20:30 EDT**, with all 50 states and eight weekly points. The Windows task's last-run time was unchanged throughout this proof.
5. Only after that success, disabled **only** `Buffago Growth Goals Refresh`. Other Windows tasks were not changed.
6. Ran the pull client in a real transient systemd **PrivateNetwork=yes** namespace. It failed with a bounded exit, kept all source values/capture timestamps and the last successful Pi-refresh timestamp unchanged, and set the offline indicator. The test took 18.936 seconds. It did not change the host's network settings or affect the display/control processes.
7. Ran the same service with networking available: the authenticated pull recovered and cleared the failure marker. Enabled the system timer. Its automatic trigger at **20:32:35 EDT** produced a further successful pull at **20:32:42 EDT**, while the Windows task remained disabled.

The screenshot `pi-running-1920x1080.png` was captured from the **actual mapped running Tk Canvas on Pi**, not the demo renderer. Rootless Xwayland prevents useful desktop-root capture, so direct X11 window pixels were captured and converted to PNG without reconstructing the UI. The running labels, new chart, absence of old permission warnings, unapproved targets and preserved service/config hashes were checked. Both existing display/control services and the new feed timer are healthy.

Network outages retain the original last-good cache. Writes use a same-directory temporary file, fsync and atomic replace. HTTP retries are bounded to two, redirects refused, payloads size/schema checked, and the service has a 45-second timeout. The timer automatically tries again after networking returns. Source collection time, source/metric age and Pi refresh time are separate; cache reads do not change them. Rendering uses America/New_York and EDT/EST. A successful fetch of an old source remains visibly source-old; an offline device can show cached source data without pretending it was recollected.

## Fresh social observations

Each successful collection creates separate append-only `latest-observations/` records keyed by actual post and Actions attempt. Reports use the latest successful capture for current rows. Original `snapshots/` records remain immutable, and rankings/cohort comparisons continue to use those original historical milestones only. The newest feed no longer carries a historical permission warning forward after a successful fresh observation.

The verified latest Facebook Reel was published at **19:46 EDT**, captured at **20:27 EDT**, at an actual observation age of about **0.68 hours**. Returned values were **4 views**, **2 initial plays**, **2,543 ms total watch time** and **2,543 ms average watch time** (provider-reported definitions; no derived denominator). Reach remains `unsupported_or_unavailable`; reactions/comments/shares remain `empty_or_unavailable` rather than invented zeroes; saves remain `unsupported_by_documented_reel_api` / Not available. No required Facebook analytics permission is missing. The actual Pi screenshot shows fresh Facebook views and no Permission needed warning. Instagram's real zero comments/shares/saves/likes remain zero.

## Weekly Instagram metric — precise contract and retrieved history

Source: pinned **Graph API v25.0 IG User `/insights`**, metric `views`, period `day`, metric_type `total_value`, no breakdown. Scope: **account-wide content views**, across reels, posts and stories, gained within the requested day ranges. It is neither app device opens nor the lifetime views of Reels grouped by publication week.

For each America/New_York calendar day, the collector requests inclusive Unix `since=local midnight` and `until=next local midnight minus one second`. Calendar-day lengths therefore correctly become 23 or 25 hours at DST changes. Week membership is Monday–Sunday in that timezone, including year crossings. Returned daily values are summed only when every required day is available and metric definitions match. Empty/missing days make the week unavailable, not zero. Explicit numeric API zero remains zero. Retained successful daily values keep their original capture time and compatible interval; no long snapshot gap is allocated across weeks.

The read-only capability probe succeeded before deployment, then the main collection retrieved **53 numeric daily ranges, Sep 7 through Oct 29, 2026**: **seven complete weeks** and the partial **Oct 26–29** week through the requested capture boundary. This is the requested most-recent-eight-week view within Meta's documented up-to-90-day user-insight retention, not a claim to have retrieved all 90 days. The current partial week was **69 views** at verification, shown separately from the complete trend. Complete weeks Oct 12 and Oct 19 returned 87 and 128; the earlier zero-valued weeks are actual API zeros. There is no comparison arrow treating the partial week as equivalent to a full week. Provider insights may lag up to 48 hours.

Official documentation inspected directly:

- [Instagram account insights contract](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights/) — views total_value, day period, inclusive Unix range semantics and content scope. The current documentation names a newer default version; the deployed v25 capability and actual response shape were separately verified.
- [Instagram insights guide](https://developers.facebook.com/docs/instagram-platform/insights/) — user insight retention, UTC response timestamps and empty-data semantics.
- [Supabase Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads) — private authenticated object access. Existing project infrastructure is reused; no bucket policy/schema was changed.

## State goals — approval still required

See [the concise state-goal proposal](STATE-GOAL-PROPOSAL.md). It recommends CT as the contribution anchor, NY as a neighboring category-relevant expansion hypothesis, and MA as a contained adjacent pilot; the order is not inferred solely from catalog size. All targets are **new proposals**, not user-established goals. All use exact contribution/catalog counts, not restaurants per million; no population source/year is used or invented. Current proposal baselines were refreshed from read-only cloud aggregates at **20:28 EDT**.

The live dashboard labels these states review candidates, keeps all targets **Not set**, and draws **no progress bars** for them. All 50 states remain discoverable. Future activation requires explicit root approval metadata, per-target approved status and units matching the measured current value in the Pi-owned JSON file. No restaurant/app record is changed by approval configuration.

## Checks and boundaries

- 39 focused analytics tests passed, including recovered permissions/latest versus history, real zero, immutable cohorts, exact daily bounds, DST/year crossings, compatible definitions, partial/missing weeks, historical-value retention and unchanged cron expressions.
- 125 dashboard tests passed, including client-only pull, atomic-write failure, bounded retries, offline cache retention/recovery, source versus device freshness, null versus zero, unapproved/unit-mismatched targets and the separate partial-week chart.
- Three Node feed tests passed for required authentication, GET-only/fixed-object scope, credential/header isolation, and generic failures without private data.
- Pi compilation, actual runtime labels/window capture, release hashes, source privacy checks, real network isolation/recovery and automatic timer success passed. The live feed contained no configured privileged secrets, source IDs, raw provider responses, source photo paths or private answers. Browser code/routes are unchanged.
- Publisher and recovery workflow blob hashes were verified unchanged; the existing new publisher and analytics workflows remain active, and the old publisher remains disabled. **No social publication, deletion, edit, republish, publisher dispatch, schedule or recovery change was made.** The actual scheduled publisher may continue its own previously authorized work independently.
- All app/state/photo/video/vote/status/counter/consent access introduced here is read-only. No consumer app files, production app tables/schema/functions or source records were modified. Counts may naturally evolve through ordinary app activity; this implementation does not write them. Analytics writes are confined to independent private analytics storage; existing publication objects were hashed and reread unchanged by the collector.

Remaining inputs are user approval of state goals and the provider's unavailable Facebook metrics above. No Windows dependency or deployment blocker remains. The source producer retains the existing GitHub scheduling behavior; scheduling troubleshooting remains tabled, and no trigger/recovery changes were attempted.

## Rollback

Backup: `/home/branden/pi-autonomous-backup-20261030T002806Z`. For a full rollback, stop/disable only the new feed timer and stop its oneshot service. Restore the backed-up `app.py`, `ui/dashboard.py`, `growth_goals.py` and `ui/growth_goals_panel.py` with their relative paths under `/opt/buffago-growth-command-center`, then restart only `buffago-growth.service`. The additional unused modules may remain. Do not replace the original environment file, models, existing service units, local settings, source records or publication ledgers.

To intentionally restore the former refresh architecture, re-enable/start only the Windows task `Buffago Growth Goals Refresh`; that explicitly reintroduces its login/power dependency. The new read-only endpoint can remain authenticated and unused. Retire/revoke its narrow capability separately if desired. Keep the Pi-owned proposal file inactive unless separately approved. Use a normal reviewed revert PR for source changes if reverting repository main. Never delete or rewrite historical analytics or publication history as part of rollback.
