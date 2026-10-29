# Growth & Goals delivery — 2026-10-29

Initial delivery record. The dashboard is now deployed with live state counts; see [the live deployment report](DEPLOYMENT.md) for the current status, source definitions, screenshot, verified refresh task and remaining target inputs.

## Scope and inspected implementation

Repository: `buffagocrawl/BuffagoApp`, `buffago-growth-command-center/`. The actual display is native Tkinter (`app.py`, `ui/dashboard.py`), not the phone browser. Its established installation is `/opt/buffago-growth-command-center`, managed by `buffago-growth.service`, with a separate, unchanged `buffago-growth-control.service`. Read the existing README installation process before deployment. No applicable repository ancestor or Pi-directory AGENTS.md was found; the global Codex AGENTS.md is empty. Chipotle and Serrano instructions are outside the changed scope.

The right half now contains Social performance and State goals, with large primary values, compact secondary metrics, publication status, collection gaps, stale indicators, public post links, and a scrollable read-only detail window. The left business metrics, charts, alerts and activity continue using their existing data pipeline and original physical font sizes; their horizontal layout is narrowed to make room. An existing empty-chart crash (`Painter.create_line`) was corrected to call the Canvas. Existing phone routes and assets are unchanged.

## Actual data sources and definitions

Inspected `Agents/Jalapeno/reel_analytics/{collector,reporting,storage,meta}.py`, its README, `reel_metrics.py`, and the deployed private reports and ledgers. Storage bucket `jalapeno-assets` remains private; the adapter does not change its settings. Analytics objects are immutable terminal report creates under `guess-wing-spot-analytics-v1/reports/<run-id>.json`; readable Markdown is embedded. Discovery exhausts paginated names, validates schema and parsed `generated_at`, and selects the greatest actual report timestamp. Run identifiers do not establish freshness. No run identifier is pinned in code.

Ledger reads use `guess-wing-spot-v1/days/<date>/states/<six-digit-revision>.json` and the separate `guess-wing-spot-live-test-v1/` namespace. Revisions have an explicit monotonic numeric convention; the highest revision defines the current per-platform result. Failed and unpublished platforms are included, rather than only successfully published posts. No ledger write or Meta request exists in this adapter.

Read-only live validation found a report generated at 2026-10-29 20:54 UTC: two young live-test posts, both published in their separate ledger, seven collection errors/gaps, actual Instagram measurements and zero values, Facebook permission gaps, and unsupported Facebook saves. No sufficient mature comparison cohorts exist. The screenshot uses this real display-safe social projection and explicitly labeled synthetic business data. Detailed source reports and the local projection are not committed.

Report data is projected explicitly; raw errors, Markdown, raw insights, source metadata, answers, media IDs and storage paths are not forwarded. Public URLs accept only HTTPS social hosts and public Reel/post routes without query strings or fragments. Unsupported saves say Not available; permission gaps say Permission needed; zero remains zero. Post age, observation age and snapshot window are distinct. Values are lifetime cumulative at capture, not new activity since the previous refresh. Reach is never summed as unique people; installs are not inferred.

Rankings require at least three measured milestone observations in one platform/window, excluding live tests. Geographic detail requires two challenge areas with at least three measured posts each at the same platform/window; these are post locations, not viewer locations. Weekly comparisons require the report's adjacent mature seven-day publication cohorts, at least three measured posts per period. Current-age observations are never treated as mature results.

## State inputs and targets

No trustworthy state counts, density targets, state contribution targets, nationwide eligible-state list, or priority order were found in Pi's checked-in configuration, demo snapshot, dashboard models, README, or repository state/goal documentation. No target values were invented. State coverage says Not set; ratings/photos and state timestamps identify unavailable inputs.

The adapter's explicit state contract supports all source-eligible states and preserves supplied priority order, then orders other eligible states by code. The first three coverage rows appear on the wall; all states and contribution metrics remain accessible in details. Units can be restaurants, restaurants per million residents, ratings or photos. A target is accepted only if its explicit target_unit equals the measured unit. Density is never reinterpreted as a restaurant count. Current, target, gap, progress and timestamps are shown only from supplied source-backed metrics.

This contract is an integration boundary, not a claim that the unavailable Pi state report already uses this schema. Mapping the actual existing report/configuration must follow inspection after access is restored. Established state targets used: **none available**.

## Server adapter and deployment handoff

Privileged keys must remain on an existing trusted server. Do not copy `Agents/Jalapeno/.env`, a service-role key, or Meta credentials to Pi. `adapters/export_growth.py` is a standard-library-only read adapter using server environment `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; it never imports a publisher or collector. HTTP permits only object GET and namespace-scoped Storage list POST. Redirects are refused. It atomically writes only the local sanitized export; failures retain previous values and mark the export stale.

On that trusted host, using its existing protected environment, run:

```text
python3 adapters/export_growth.py --output <local-sanitized-export-path>
```

An optional `--states <verified-state-input-path>` accepts a source-backed projection. Example shape (nulls below deliberately establish no target):

```json
{"priority_states":[],"states":[{"code":"NY","eligible":true,"updated_at":null,"metrics":[{"name":"Restaurant coverage","current":null,"target":null,"unit":"restaurants per million residents","target_unit":"restaurants per million residents","source":"path to inspected authoritative state report"}]}]}
```

Use the established protected server-to-Pi transfer mechanism to place only the sanitized export at `/var/lib/buffago-growth/growth-goals.json`, or set `BUFFAGO_GROWTH_GOALS_PATH` to its actual destination. Pi reads that local file every minute, independently of the left snapshot. A failed/partial load retains last successful data and marks stale; reports older than 36 hours are stale even if recently copied. No new hosted service, paid service, notification, collection schedule or production Edge Function is required or deployed.

Exact remaining steps:

1. Restore the documented SSH access to `branden@buffago-growth` / `buffago-growth.local` using the existing `buffago_growth` key. Both names currently fail DNS resolution. Historical `192.168.4.35` times out; `192.168.4.27` rejects the key. No alternative host was assumed.
2. Inspect current installed source, state reports, environment variable names and screen dimensions. Archived installed-source evidence records 1920x1080 and contains local app differences; do not blindly overwrite installed `app.py`.
3. Map the actual existing state sources and target definitions into the adapter contract, retaining units, priority and eligibility. Without that input the honest unavailable state is intentional.
4. Configure export execution and sanitized-file delivery on the existing trusted operations host. No suitable existing transfer/scheduler access was established; no infrastructure or schedule was guessed.
5. Following the README's stage/install process, install `growth_goals.py`, `ui/growth_goals_panel.py`, updated `ui/dashboard.py`, and merge the small local-feed refresh hook into the current installed `app.py`. Preserve local environment, cache, mission records and unrelated installed work. Then restart only `buffago-growth.service`, verify the live display and cached-data failure behavior, and capture an on-device screenshot.

## Verification

- 115 Python unit/UI tests passed, including 16 focused Growth & Goals tests.
- Focused coverage: report projection, timestamp discovery, pagination, failed reads, missing permissions, unsupported saves, null/zero, young cohorts, stale age, failed refresh retention, partial feed rejection, density/count mismatch, eligible state order, ledger failure results, public URL and HTTP read boundaries.
- Connected Tk layout and expanded detail tests run at 800x480, 1280x720 and 1920x1080; all Canvas items remain within display bounds. The physical Pi could not be reached. The 1920x1080 render was visually inspected, matching its previously recorded dimensions; 800x480 remains a compact fallback.
- Python compile checks, browser JavaScript syntax check and git whitespace check passed. No runtime dependencies added.
- Actual configured service-role and Meta secret values were checked against the real projection and all unchanged browser assets: none present. Forbidden private report field checks passed. Browser endpoints and assets have no new data path or response fields; this is a native display/file integration with no web build.
- GitHub read-only workflow inventory: Guess the Wing Spot publisher active, Reel Analytics active, old Publish Approved Wing Shot disabled_manually. No workflow files or states changed and no publication/collection was triggered.
- No consumer app, production schema/function, app data, photos, source media, votes, restaurant records, status/counters, publication ledgers or analytics records were changed. No notifications or paid services added.
