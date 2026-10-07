# Buffago Growth Command Center

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

Set `BUFFAGO_GROWTH_DEMO=true`. Sample product and Growth OS data lives in `data/demo_snapshot.json`. `data/growth_config.json` remains the local fallback for experiment, daily action, founder balance, and insight whenever a valid backend section is absent. Demo mode still exercises parsing, rendering, refresh scheduling, and caching.

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

V1 derives the downloads arrow only from whether daily downloads are positive because the provided payload has no previous-day download field. Backend-managed Growth OS sections take precedence independently; missing or malformed sections use local JSON and then the existing empty state. Local growth content is edited as JSON and reloaded on process restart. The client does not read Jalapeno files directly.

Phone controls now use the existing admin backend described below; the display continues to use only its snapshot endpoint.

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
