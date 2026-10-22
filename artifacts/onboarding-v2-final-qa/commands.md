# Executed command reference

Repo root unless marked crawl. Tool output in report/logs; no real credentials in commands. Host clock UTC timestamps are recorded in actions.jsonl. Physical serial omitted.

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git log -3 --oneline
node --version
npm --version
java -version
adb version
adb devices
docker ps --format '{{.Names}} {{.Status}}'
# Docker daemon unavailable; no backend commands executed beyond inventory.
```

Existing emulator started hidden with `-avd Medium_Phone_API_36.1 -no-window -no-audio -no-snapshot-save -cores 4 -gpu host`. Queried boot completion, Android release, screen size, installed package version/debug flags and last ANR. App-private tar was captured as raw adb exec-out bytes before first pm clear, never through PowerShell text redirection. All resets targeted disposable QA emulator only. Private archive and SQLite copies are ignored under crawl/.expo/final-qa-private.

In crawl, process-local configuration (not written to env files):

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_ONBOARDING_V2='true'
$env:EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE='true'
$env:EXPO_PUBLIC_SUPABASE_URL='http://10.0.2.2:55321'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='qa-synthetic-not-a-real-key'
$env:REACT_NATIVE_PACKAGER_HOSTNAME='127.0.0.1'
node node_modules/expo/bin/cli start --dev-client --offline --max-workers 2 --port 8081
node scripts/qa/probe-android-metro.mjs http://127.0.0.1:8081
# Initial premature probe failed at manifest; later complete probe PASS:
# 2026-10-22T12:22:27.593Z manifest=200 bundle=200 bytes=16875590 elapsed=2132ms
```

From root, existing read-only bridge `node crawl/scripts/qa/onboarding-readonly-catalog.mjs`; actual UI helper `node crawl/scripts/qa/onboarding-final-android-ui.mjs nodes|tap|shot|back|input|launch`. Exact actions and UTC times in actions.jsonl. adb reverse tcp:8081 tcp:8081 and development-client URL from QA.md. All PNGs captured by helper using adb screencap and exec-out bytes; fresh UI XML accompanies ordinary captures. Force-stop/start launch helper polls fresh UI until Home, captures PNG and records PID/time. Manual slider tap/swipe coordinates were derived from native bounds; actual SQLite values, not intended gesture endpoints, determine reported scores. Screen size/density/font changed using adb wm/settings then restored to 1170x2532/480/1.0.

Separate disposable Metro processes: 8082 same safe endpoint with both flags false; 8083 V2 true/invite false. Same readiness probe PASS at 8082 (12:30:18Z, 16875592 bytes, 4635ms); 8083 loaded actual native neutral-CTA UI. Fresh legacy install first displayed Android location permission; denied by native tap, then dev-menu Continue/Close, then actual legacy Welcome. No GPS granted. A probe command once used the wrong root-relative script path and failed MODULE_NOT_FOUND; corrected by using crawl/scripts/qa path. A streamed tar restore failed EOF; corrected with adb push to temporary file and app-UID tar extraction. Restoration summary recorded only after successful file-based extraction. Temporary emulator archive removed afterward.

Final client fix was hot-refreshed, followed by cold start at 360x640dp/1.3 and fresh UI capture/tap to auth. Original emulator archive restored with app stopped; no identity or preview archive committed. Emulator stopped with adb emu kill. All three Metro sessions and read-only bridge stopped with Ctrl-C.

Automated commands in QA.md were executed before and after final client change. Additional focused command from root:

```powershell
node --test --experimental-default-type=module crawl/tests/onboarding-auth-journey.test.mjs
git diff --check
node scripts/security/scan-secrets.mjs --staged
git diff --cached --check
```

Supabase skill reviewed; changelog fetched read-only to private local file (web markdown fetch failed content-type, curl succeeded). Official signup/session/listener documentation reviewed; no Supabase feature/backend change implemented. Signup user without session was never counted as authenticated success. References: https://supabase.com/docs/reference/javascript/auth-signup and https://supabase.com/docs/reference/javascript/auth-onauthstatechange.
