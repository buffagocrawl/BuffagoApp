# Buffago Growth Command Center

The October 8 operational follow-up is documented in [the redesign report](artifacts/operations-redesign/REPORT.md), including screenshots, metric definitions, tests and exact later deployment requirements. It is not deployed. Use only the new `20261008165529_growth_wall_activity_weekly_catalog.sql` follow-up for these backend changes; the deployed predecessor differs from the earlier local migration copy.

A low-resource, always-on founder dashboard for Buffago. It is a separate Tkinter application: the display uses no browser, JavaScript runtime or Supabase SDK. An independent Python LAN server provides phone controls; no mobile app changes are included.

## Run locally

Python 3.9+ with Tkinter is required. On Windows, the standard Python installer includes Tkinter. On Raspberry Pi OS:

```bash
sudo apt update
sudo apt install --no-install-recommends python3 python3-tk x11-xserver-utils
```

Copy the example configuration, enable demo mode, and launch:

```bash
cd buffago-growth-command-center
cp .env.example .env
python3 app.py
```

`Esc` leaves fullscreen and `F11` toggles it. To run in a window, set `BUFFAGO_GROWTH_FULLSCREEN=false`. The UI redraws only when data changes, once a minute for freshness text, or when resized. The network worker refreshes every 600 seconds (10 minutes) by default.

## Demo mode

Set `BUFFAGO_GROWTH_DEMO=true`. Sample Product Pulse and Growth OS data lives in `data/demo_snapshot.json`. When a Today's Move is absent, the wall derives a next action from the weakest score factor without writing a Growth OS record. Demo mode still exercises parsing, rendering, refresh scheduling, and caching.

## Live Supabase configuration

Set these values in `.env` or the service environment file:

```dotenv
BUFFAGO_GROWTH_DEMO=false
BUFFAGO_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
BUFFAGO_DASHBOARD_DEVICE_TOKEN=YOUR_DEVICE_SPECIFIC_TOKEN
```

The display calls only `buffago-growth-snapshot` with `X-Buffago-Dashboard-Key: ${BUFFAGO_DASHBOARD_DEVICE_TOKEN}`. Custom application authentication requires no Authorization header or anon JWT. Device authentication takes precedence over optional authenticated-user debugging via `BUFFAGO_GROWTH_ACCESS_TOKEN`. `BUFFAGO_SUPABASE_ANON_JWT` is optional and unused by normal Pi requests.

Keep the controller and display tokens on the Python server only. Never configure service-role keys, database credentials or Supabase secrets on the Pi. The browser receives none of these credentials.

## Failure behavior

Each valid response is atomically cached. A timeout, network error, 401/403, malformed JSON, partial payload, or null store field cannot replace the last good snapshot. The dashboard keeps showing cached data, marks it stale, reports its age, and retries on the normal interval. A first boot without cache shows a composed empty state instead of an exception.

Logs go to stderr/journald and `logs/buffago-growth.log`. Local logs rotate at 512 KB with two backups. View service logs with `journalctl -u buffago-growth -f`.

## Raspberry Pi installation

Raspberry Pi 1 Model B+ should run Raspberry Pi OS Lite with a minimal X session or Raspberry Pi OS Desktop. Copy this directory to `/opt/buffago-growth-command-center`, then create the state directory:

```bash
sudo mkdir -p /var/lib/buffago-growth /opt/buffago-growth-command-center/logs
sudo chown branden:branden /var/lib/buffago-growth /opt/buffago-growth-command-center/logs
sudo cp .env.example /etc/buffago-growth-command-center.env
sudo chown root:root /etc/buffago-growth-command-center.env
sudo chmod 600 /etc/buffago-growth-command-center.env
sudo editor /etc/buffago-growth-command-center.env
```

Set `BUFFAGO_GROWTH_CACHE_PATH=/var/lib/buffago-growth/snapshot-cache.json` in that environment file. Install and enable the service:

```bash
sudo cp systemd/buffago-growth.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now buffago-growth.service
sudo systemctl status buffago-growth.service
```

The display assumes an X11 desktop with automatic login for `branden`, `DISPLAY=:0` and `XAUTHORITY=/home/branden/.Xauthority`. Check the desktop session with `printenv XAUTHORITY`; if it reports another path, set that exact path in a systemd override using `sudo systemctl edit buffago-growth.service` and an `[Service]` section with `Environment=XAUTHORITY=...`. The startup helper waits until `xset q` can connect, disables blanking/DPMS/screensaver, then opens Tk fullscreen without keyboard input. `ProtectHome=false` allows the authority file to be read. A Wayland-only session is not supported by this deployment configuration; select X11 and enable desktop auto-login.

To prevent sleep, copy the desktop autostart helper for the kiosk user:

```bash
mkdir -p ~/.config/autostart
cp systemd/disable-blanking.desktop ~/.config/autostart/
```

Disable screen blanking in Raspberry Pi Configuration and disable desktop power management, idle display timeout and screensaver locking in the desktop settings for `branden`. Install the autostart helper into `/home/branden/.config/autostart/` as `branden`; it reapplies `xset s off`, `xset -dpms`, and `xset s noblank` on every desktop login. The service applies these settings before every display launch. No Chromium is used.

## Tests and checks

No test packages are required:

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q .
node --check control_web/control.js
```

## Resource profile and limitations

The runtime imports only Python's standard library. Tkinter links to Tcl/Tk through the OS package. There is no pip runtime dependency, animation loop, or continuous redraw. Exact resident memory depends on the Pi OS/Tk build; measure it on target with `ps -o pid,rss,%cpu,cmd -C python3` after several refresh cycles.

Product Pulse reports mobile-only iOS and Android device opens, New York calendar-month MAU, all-time entity totals, monthly chart history from the first real mobile app-open month through the current month, pending photo review and all open operations work. Pre-instrumentation MAU/device history is untracked (`null`), while actual zero months remain zero. Marketing Score retains its separate trailing 12-month scoring window. Growth Engine presents the versioned Marketing Score, its factors and explanation, the active Growth OS experiment, today's move or a derived local action, ranked recommendations, and the current unexpired insight. The rolling-30-day Growth OS north-star remains intact and named separately from calendar MAU. Store ingestion and snapshot fields remain available for future connection, but unconnected store cards are omitted from the wall.

Phone controls now use the existing admin backend described below; the display continues to use only its snapshot endpoint.

## Product Pulse backend update

See `artifacts/product-pulse/report.md` for the earlier operational snapshot work and `artifacts/redesign/report.md` for the Growth Command Center redesign, score formula, live values, checks, screenshot paths, and Pi update commands. Production already has `20261008121036_product_pulse_operations` applied. The unapplied follow-up `supabase/migrations/20261008130000_growth_command_center_redesign.sql` adds mobile-only Product Pulse metrics and Marketing Score fields without reusing the applied migration. The active snapshot Edge Function returns the RPC object with a generic spread, so no Edge Function deployment is needed.

Run `node --test tests/*.test.mjs` for local PostgreSQL/RPC tests. They reuse the pinned PGlite development dependency in `../crawl/node_modules` and the inspected deployed RPC fixture. Python screenshot tests require Pillow as a development dependency and a desktop/X session; the Pi runtime remains standard-library-only. Screenshots are written to `artifacts/product-pulse/`.

## Phone control architecture

The monitor remains a fullscreen Tkinter ambient display. The phone is a separate control surface:

```text
Phone -> http://buffago-growth.local:8787 -> control_server.py
       -> HTTPS buffago-growth-admin Edge Function
Display app.py -> HTTPS buffago-growth-snapshot Edge Function
```

Both programs use Python's standard library only. The control server serves its own HTML, CSS and vanilla JavaScript from `control_web/`; no internet is required to load those assets. Reading live data and saving changes requires the Pi to reach Supabase. There is no server background polling, browser framework, CDN, WebSocket, or browser on the Pi. The phone refreshes state manually. After saving successfully, it fetches fresh state; the monitor updates on its next scheduled 600-second refresh. Existing explicit refresh settings override the new default.

The five tabs are Overview, Experiment, Today, Activity and Insight. Overview includes MAU target progress, previous MAU, today's move, quick founder logging, balance counts and five recent audit events. Forms create/replace experiments and moves, update targets, close experiments with confirmation, publish/expire insights and log activity. Balance has no score. Controls are at least 46px high and inputs use 16px text. Writes wait for acknowledgement; an API failure never reports success. If saving succeeds but subsequent state refresh fails, the UI explicitly distinguishes those outcomes.

## Control configuration

Use the same root-owned, mode-0600 environment file described above. Add:

```dotenv
BUFFAGO_CONTROL_ENABLED=true
BUFFAGO_CONTROL_HOST=0.0.0.0
BUFFAGO_CONTROL_PORT=8787
BUFFAGO_GROWTH_CONTROLLER_TOKEN=YOUR_SEPARATE_CONTROLLER_TOKEN
```

Also configure `BUFFAGO_SUPABASE_URL` and the separate `BUFFAGO_DASHBOARD_DEVICE_TOKEN` for live display. The controller token is scoped to `growth_admin:write`; the display token to `growth_snapshot:read`. Set `BUFFAGO_GROWTH_DEMO=false`. Control requires only a controller token and a valid HTTPS project URL; it does not require an anon JWT. With control disabled it exits without starting a listener.

## Install and manage the independent services

From `/opt/buffago-growth-command-center`:

```bash
sudo cp systemd/buffago-growth.service systemd/buffago-growth-control.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now buffago-growth.service buffago-growth-control.service
sudo systemctl status buffago-growth-control.service
```

Both units use `User=branden`, `Group=branden`, `WorkingDirectory=/opt/buffago-growth-command-center` and `/etc/buffago-growth-command-center.env`. Control starts after `network-online.target` under `multi-user.target`; display starts under `graphical.target` and waits for the X session. Both use `Restart=on-failure` with a 10-second delay. Neither depends on the other. Control retains `ProtectHome=true`; display has `ProtectHome=false` to read Xauthority.

```bash
sudo systemctl restart buffago-growth-control.service
sudo systemctl stop buffago-growth-control.service
sudo systemctl start buffago-growth-control.service
journalctl -u buffago-growth-control.service -f
sudo systemctl restart buffago-growth.service
```

After changing credentials, restart the service that uses them. Restarting control rotates its CSRF token; reload the phone page before the next write.

## Reach it from your phone

Connect the phone and Pi to the same trusted home LAN. Optionally enable mDNS:

```bash
sudo apt install --no-install-recommends avahi-daemon
sudo hostnamectl set-hostname buffago-growth
sudo systemctl enable --now avahi-daemon
sudo systemctl restart avahi-daemon
```

Open **http://buffago-growth.local:8787** to open Growth Control directly. If mDNS is unavailable on your phone/network, find the Pi's current address with `hostname -I` and use **http://<pi-ip>:8787**. No LAN IP is hardcoded. A guest network or wireless client isolation may prevent access. If a host firewall is enabled, permit TCP 8787 only from your trusted LAN subnet.

## Security model

**DO NOT PORT-FORWARD PORT 8787 TO THE INTERNET.** Do not publish this service through a public tunnel. Anyone on the trusted LAN can open the controls and submit actions. Local HTTP traffic is unencrypted; upstream calls use HTTPS.

Every mutation requires a same-origin JSON POST and the random server CSRF token obtained from `/api/state`. There are no login sessions or authentication cookies. No CORS allowance is provided. A restrictive content security policy blocks remote assets, inline scripts and framing. Remote text uses `textContent`.

The server sends `X-Buffago-Growth-Controller: <controller token>` only to the fixed admin function path. It never sends the display token. Redirects are refused. Browser headers, URLs and arbitrary action names are never proxied. Requests have a 16 KiB limit, per-field limits, known field/action validation, enum/date/number checks and a 12-second upstream timeout. A single HTTP worker limits memory use; during an upstream request, other phone requests may wait. Connections have a five-second read timeout.

The browser receives only selected state fields, bounded recent lists, a local CSRF token. Upstream write bodies and error messages are not forwarded. Configured credentials are redacted even if accidentally echoed in permitted state text. API 401/403, network failures, timeouts, rejected fields and invalid responses become friendly messages. Requests, credentials and raw exceptions are not logged by control.

Rotate the controller token using your existing backend administration process: issue a replacement scoped only to `growth_admin:write`, put it in the protected environment file, restart control, verify a read and harmless intended write, then revoke the old token. If compromised, revoke the old token immediately. Do not rotate/reuse the display token for this. No backend changes are included in this project.

## Measurements and Pi 1 B+ checks

A dependency-free harness measures both real processes, with Tk rendering the existing demo and control idle, without credentials, upstream traffic or persistent cache writes:

```bash
python3 tools/measure_resources.py --seconds 60
```

Development measurement on Windows / Python 3.12, over 30 seconds after five seconds of startup:

| Process | Resident memory | Idle CPU (one core) |
| --- | ---: | ---: |
| Tkinter display | 37.07 MiB | 0.000% |
| Local control | 26.26 MiB | 0.000% |
| Combined | 63.33 MiB | 0.000% |

These are measured development-host values, not Pi measurements or guarantees. CPU rounded to zero means no measurable CPU-time increase during this sample. The harness also supports Linux `/proc` for measurements on the Pi. Run it for at least 1200 seconds on target to include 10-minute refresh cycles. To measure the installed live services, run `ps -o pid,rss,%cpu,cmd -p "$(systemctl show -p MainPID --value buffago-growth.service),$(systemctl show -p MainPID --value buffago-growth-control.service)"`; RSS is KiB and ps CPU is a lifetime average. Include X/desktop memory using `free -m` and monitor swap with `vmstat 5`.

The implementation's footprint is modest relative to 512 MB, but a Pi 1 B+ has a slow single-core ARMv6 CPU. Use an ARMv6-compatible Raspberry Pi OS image with Python 3.9+ and minimal X. TLS handshake speed, desktop memory and actual live response sizes need target verification. No Pi was connected for this development run. Full rendered phone-browser QA was unavailable in this environment; check iPhone/Android wrapping, keyboard use and touch controls on the LAN before regular use. Admin transport and actions were tested against mocked upstream responses, not production writes. ID-based actions use `data.id`; verify that convention against the deployed admin function when configuring live access.

## Required deployment environment and boot verification

For normal live operation of both services:

```dotenv
BUFFAGO_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
BUFFAGO_DASHBOARD_DEVICE_TOKEN=YOUR_DISPLAY_TOKEN
BUFFAGO_GROWTH_CONTROLLER_TOKEN=YOUR_CONTROLLER_TOKEN
BUFFAGO_CONTROL_ENABLED=true
BUFFAGO_GROWTH_DEMO=false
BUFFAGO_REFRESH_SECONDS=600
BUFFAGO_GROWTH_CACHE_PATH=/var/lib/buffago-growth/snapshot-cache.json
```

Host `0.0.0.0`, port `8787`, fullscreen and the 600-second refresh have defaults. The old `BUFFAGO_GROWTH_REFRESH_SECONDS` override remains compatible; remove it when adopting the new default. `BUFFAGO_REFRESH_SECONDS` takes precedence. There is no automatic browser polling; state loads on opening, Refresh and successful writes.

Enable both independent units with the installation command above, then verify:

```bash
systemctl is-enabled buffago-growth.service buffago-growth-control.service
```

Both should report `enabled`. Reboot and check both with `systemctl status`. Enable automatic desktop login for `branden` so X11 becomes available without keyboard interaction. These files configure boot behavior; running installation and verification on the actual Pi is required.

## Daily manual marketing missions

Click **Today's Marketing Mission** in the Growth Engine to open instructions, evidence limits, an engagement question and a 24–48-hour evaluation checklist. The dashboard shows the Eastern date, topic, platforms, estimated time and weekly progress. Themes follow Monday rankings, Tuesday Wing Wars, Wednesday Hidden Gem, Thursday debate, Friday challenge, Saturday spotlight and Sunday recap. Towns and debates rotate every six weeks. The mission changes on the next minute tick after America/New_York midnight, including when Supabase is unavailable.

Create all content yourself and publish manually. Select only the platforms actually used, then **Mark as Posted**. This records an owner confirmation, not independently verified publication. Reopen to correct platform choices or undo. Expand the weekly overview or completed history; click a row to view its mission and correct its confirmation. Completed records retain the original theme and selected topic even if recommendations change later.

Records use the existing atomic local JSON cache pattern in `marketing-missions.json`, beside `BUFFAGO_GROWTH_CACHE_PATH` (by default in `data/`). Back up this file and ensure the display service user can write its directory. Only the display process writes these records. They do not update Supabase, Marketing Score, weekly goals or experiment progress. The existing Monday goal refresh remains managed by the existing backend workflow.

The current snapshot supplies aggregate rating activity but no verified restaurant-level scores, comparison coverage or approved-photo details. Missions therefore use predefined evergreen topics and instruct the owner to verify restaurant evidence manually. Aggregate activity is described only as the existing snapshot window; no trends or winners are inferred. Existing upstream account exclusions are reused without new queries. No social APIs, LLM dependencies, content generation, scheduling or publishing are introduced.

The dashboard retains its existing Tkinter kiosk layout at 800×480, 1280×720 and 1600×900. Mission details scroll and controls wrap into rows at narrow widths. This feature is in the display application; the existing LAN phone admin page remains unchanged. It is not a new mobile web interface.

### Manual Raspberry Pi update

No deployment or production restart was performed during development. When ready to update manually:

1. Back up your existing installation, protected environment file and snapshot/mission data. Copy the reviewed source files (`app.py`, `missions.py`, `ui/dashboard.py`, `ui/mission_panel.py`) into the existing `/opt/buffago-growth-command-center` installation, preserving owner and permissions. Do not replace `.env` or the data directory.
2. Verify Python 3.9+ and the OS timezone database: `python3 -c "from zoneinfo import ZoneInfo; print(ZoneInfo('America/New_York'))"`. If missing, install the OS `tzdata` package. No Python runtime package is added.
3. Verify that `branden` can write the directory containing `BUFFAGO_GROWTH_CACHE_PATH`, since it also stores mission confirmations. No migration or new credentials are required.
4. Run `python3 -m unittest discover -s tests` from the reviewed source directory in a desktop session with Tk available. The screenshot capture test uses optional developer Pillow; the application does not require it.
5. At a time you choose, restart only the display: `sudo systemctl restart buffago-growth.service`. Check `systemctl status buffago-growth.service` and `journalctl -u buffago-growth.service -n 50`. The control service needs no update for this feature.
6. Open the mission, confirm one platform, reopen and correct it, then undo the trial confirmation. Verify weekly progress, existing metrics and charts. For a restart persistence check, confirm a real completed mission, restart the display manually and check that the confirmation remains.
