# Live Pi deployment — 2026-10-29

**Deployed to `branden@192.168.4.40`, hostname `buffago-growth`, at the existing `/opt/buffago-growth-command-center` installation.** Both display and control services are active. This supersedes the initial access blocker in REPORT.md. The screenshot `pi-running-1920x1080.png` captures the actual running Pi dashboard, with live business data and the sanitized live social/state feed.

## Deployment and preservation

- Verified the existing known SSH host key, hostname, installed service definitions, deployment path and actual 1920x1080 screen. No applicable AGENTS.md was found under the installed app or the Pi user's home.
- Authenticated interactively. The original encrypted Windows key was not treated as an unattended credential. No password or private key is committed or copied into Pi's application.
- Downloaded installed source and compared Python ASTs. The existing business rendering functions and data pipeline matched the reviewed implementation; local AI fallback and teardown hooks were retained. The installed app was merged using `tools/stage_growth_goals.py`, rather than replaced wholesale by the repository app.
- Followed the established stage/install/restart process. Installed only `app.py`, `ui/dashboard.py`, `growth_goals.py`, `ui/growth_goals_panel.py` and `adapters/receive_growth.py`, plus the local aggregate cache. Restarted only `buffago-growth.service`.
- Backup: `/home/branden/growth-goals-backup-20261029T214931Z`. Original app/dashboard and the pre-existing authorized_keys file were backed up before installation.
- Verified hashes of `/etc/buffago-growth-command-center.env`, both service units, local `data/growth_config.json` and installed `models.py` against the predeployment baseline. All unchanged. The control-server PID also remained unchanged. No local secrets/configuration were overwritten.
- The only SSH configuration addition is a dedicated public upload key appended to the existing authorized_keys bytes. Its `restrict` and forced-command options allow only the bounded, validated cache receiver; no shell, port forwarding, agent forwarding or PTY. The original keys are preserved. A negative test requesting an arbitrary command was rejected without changing the valid cache.
- Final installed files were compiled by Pi's Python 3.11. Temporary startup tracing was removed. The physical system uses rootless Xwayland under labwc; desktop-root screenshots were black and compositor screenshot requests timed out. We verified the mapped running Tk canvas, its actual panel labels, and captured its X11 window pixels directly. The final capture was visually inspected and used to correct Linux font overlap before delivery.

## Read-only data and established goals

The analytics adapter dynamically scans all completed schema-v1 reports under the existing private `jalapeno-assets/guess-wing-spot-analytics-v1/reports/` namespace, choosing parsed generated_at rather than filename/run ID order. The latest available report during deployment was generated at 2026-10-29 20:54 UTC. Both existing daily and live-test publication ledgers are read independently, with their latest monotonic revisions projected per platform. There are two young live-test observations and insufficient mature history for winners or weekly comparisons. Facebook's reported permission gaps remain visible; unsupported saves say Not available. No Meta request or social publication was triggered.

Additional live read-only inspection established these state sources:

- `public.states`: the existing nationwide eligible catalog of all 50 states.
- `public.destinations.state_id`: restaurant counts, totaling 1,116 at verification.
- `public.destination_ratings.destination_id` joined to destinations: rating-contribution counts, including all existing records; these are not external-user-only marketing metrics.
- `public.wing_media_submissions`: photo contributions joined by destination, photo media type, not withdrawn, and in the deployed helper's approved lifecycle: approved, generation_pending, ready_to_post, scheduled, posting or posted. These count contributions, not unique restaurants or verified available display assets.

`adapters/state_counts.py` uses only paginated GETs with explicit column projections. Private IDs are discarded after aggregation. The browser/display feed receives only state codes, units, counts, dates and goal progress; no source photo paths, captions, answers or contributor IDs. Reads are sequential observations, not a transactionally frozen database snapshot.

**No authoritative state targets, population denominators or priority order were found** in the installed Pi configuration, cached snapshot, home/state-report file inventory, repository goal documentation, or the inspected database columns/functions. Targets and gaps therefore remain Not set/unavailable, and no percentage completion is fabricated. Restaurant counts are not substituted for restaurants-per-million targets. The wall explicitly labels the fallback ordering as Largest catalogs; priority not set. CT, OH and NJ lead that measured order at verification; they are not hardcoded. All 50 states and their rating/photo counts remain accessible through the detail view. If supplied later, source-backed priorities and matching-unit targets are supported by the adapter contract.

## Ongoing refresh

The existing Windows host performs private reads; Pi receives only the sanitized aggregate file:

- Task: `Buffago Growth Goals Refresh`, enabled every 10 minutes.
- Runtime: `%LOCALAPPDATA%/BuffagoGrowth/`, a pinned copy of the reviewed adapter files.
- Credentials: read from the existing protected `Agents/Jalapeno/.env`; never copied to Pi or placed in task arguments.
- Upload identity: `%USERPROFILE%/.ssh/buffago_growth_feed`, an ACL-restricted dedicated key with only the forced cache-upload capability on Pi. The original encrypted key is unchanged.
- Destination: `/opt/buffago-growth-command-center/data/growth-goals.json`, atomically replaced only after schema validation. No analytics, publication ledger, photo, source status, counter or restaurant record is written.
- Multiple automatic/manual task runs completed with LastTaskResult 0. Unattended authentication was tested using this restricted key, not assumed from the original key.
- The task uses the current user's Interactive logon context. A password-free S4U task principal was unavailable in this environment; the existing verified Interactive task was retained. **Windows must remain powered on and this user logged in for automatic refreshes.** No account password is stored by this task.
- Pi checks its local feed every minute. Invalid/failed reads retain last success and mark stale. Server read failures send retained values with a stale flag. Delivery older than 30 minutes or analytics older than 36 hours is visibly stale, so an offline/logged-out Windows host cannot indefinitely appear healthy.

No existing publisher or collector workflow, schedule, credential, selection/render/caption logic, production database function/schema or source record was changed. The new publisher and analytics schedules remain active; the old publisher remains disabled.

## Verification and remaining inputs

- 119 Python tests passed, including 20 focused parsing, discovery, permissions, null/zero, stale delivery/cache, unit mismatch, state aggregation, forced receiver, merge-preservation and connected UI tests.
- Python compile checks passed locally and on Pi; browser JavaScript syntax and git whitespace checks passed.
- Actual configured privileged secret values and forbidden source fields were absent from the real 50-state feed and browser assets. Browser routes/assets are unchanged; there is no new browser response or web bundle containing private data.
- Pi checks confirmed the 50-state feed, mapped 1920x1080 Tk canvas, expected social/state/permission labels, service health, installed release hashes, retained-good-cache stale behavior and unchanged configuration/control process.
- Remaining inputs: authoritative state targets and priority order; a population source if density goals are intended; Facebook insights permissions already reported by the collector. Automatic refresh has the Windows login/power dependency above. None was silently invented or changed.

Rollback uses the two original app/dashboard files in the named backup and restarts only the display service. The new modules/cache can remain unused. Disable only the new Windows refresh task if rolling back; remove only its marked forced upload-key entry if retiring that integration. Do not restore/replace local environment files, credentials, service units, state sources or publication schedules.
