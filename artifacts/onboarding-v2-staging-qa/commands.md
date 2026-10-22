# Executed staging/native QA commands and configuration

No credentials in this file. Private credentials, sessions, original logs and archives stay under ignored `crawl/.expo/`.

## Baseline and local target

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
supabase --version
supabase start --help
supabase functions serve --help
docker ps --format '{{.Names}} {{.Status}}'
```

Branch required/matched; clean start 580173a. Supabase CLI 2.107.0, Node 22.20.0, Windows/Android toolchain same as prior final QA. Docker Desktop started hidden; existing local services auto-resumed. No Supabase start/reset/db push/migration command executed. Inspected the prepared acceptance README/config and existing fixture scripts first; did not rerun the fixture script because it reseeds/mutates advanced state.

Read-only queries used only `docker exec -i supabase_db_buffago-polish-acceptance psql -X -U postgres -d postgres -qAt`, inspecting table count, existing flags/buckets, reservation definition, and later sanitized receipts. No remote link/project operation. Existing credentials loader rejects any API_URL other than exact `http://127.0.0.1:55321`.

## Gateway repair

```powershell
docker logs --tail 6 supabase_kong_buffago-polish-acceptance
# Permission denied writing /home/kong/kong.yml
docker run --rm --network none --entrypoint id public.ecr.aws/supabase/kong:2.8.1 kong
# Kong UID 100 / GID 65533
```

Used Python tarfile and `docker cp ...:/home/kong -` privately to inspect ownership and back up unchanged config. Only kong.yml was root-owned; directory/other files belonged to Kong. First attempted root exec failed because container was restarting. Stopped only that gateway container, then sent a tar containing the original kong.yml bytes with UID100/GID65533/mode0644 through `docker cp -a - ...:/home/kong`; started the same gateway and existing Edge container. No container deletion/volume recreation/database reset. Auth health returned HTTP 200.

Prepared empty ignored runtime function folders with exact tracked index.ts for stage-authorize, validate, promote and staging-cleanup plus shared wingShotResponse.ts. No production deploy; source hashes retained. Ran:

```powershell
& 'C:/Users/Brand/AppData/Local/Programs/Python/Python312/python.exe' crawl/scripts/qa/app-polish-runtime-routing.py
docker exec --user 0 supabase_kong_buffago-polish-acceptance chown kong:nogroup /home/kong/kong.yml
```

Patched that helper to preserve Kong ownership automatically after its config copy. Later validation executed the patched helper after `docker restart supabase_kong_buffago-polish-acceptance`; `stat` reported UID100/GID65533, gateway health/Auth health HTTP200. Existing transparent local Edge loopback transport retained and gateway JWT code unchanged. Anonymous POST `{}` to local `/functions/v1/wing-media-stage-authorize` returned HTTP401/authentication_required. Never passed `--no-verify-jwt` or modified auth authorization.

## Actual Android runtime

Existing Medium Phone AVD started hidden/headless with `-avd Medium_Phone_API_36.1 -no-window -no-audio -no-snapshot-save -cores 4 -gpu host`. Existing debug client APK used, no new binary build. Original emulator app-private data archived as raw adb exec-out tar bytes before clearing; original actor/device data not exposed.

Metro was launched in crawl with process-only values:

```text
EXPO_NO_DOTENV=1
EXPO_PUBLIC_ONBOARDING_V2=true
EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE=true
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<existing local anonymous key read privately>
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1
```

No env file changed. Release defaults stay false; visual-QA fixture/module-substitution flags unset. Only a local anon key goes to the app; admin key remains host-only for read-only receipts.

```powershell
# cwd crawl
node node_modules/expo/bin/cli start --dev-client --offline --max-workers 2 --port 8081
node scripts/qa/probe-android-metro.mjs http://127.0.0.1:8081
adb reverse tcp:55321 tcp:55321
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d 'buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.buffago.app
```

Initial premature Metro probe/client load timed out. Complete manifest/full-bundle probe passed (14:35:51Z, HTTP200/200, 16875834 bytes, 15671ms). Relaunched client after readiness; native developer-menu Continue/Close, actual fresh Welcome observed. UI dumps sometimes returned null root during startup; fresh retries, not cached XML, determined successful landings.

Actions and host UTC timestamps in actions.jsonl. Private native helper derived from tracked `onboarding-final-android-ui.mjs`, redirects output to this evidence folder, taps actual native XML labels/testIDs, captures real adb PNGs, polls expected native UI and performs force-stop/process-cold launch. Slider extension uses measured native slider bounds. An initial digit-regex typo in that temporary helper failed before score assignment; returned to step1 and recaptured all four correct 8/7/6/9 values. First signup submit occurred before the next attempted tap (which then correctly found no signup button); genuine current UI and verified session proved uploader arrival, not that failed tap.

Private fill helper typed generated isolated identity from private account.json; logs record only character counts. Email fields were never committed. A premature signin screenshot containing filled fields was excluded privately; later Home was recaptured. XML 31 redacts the test identity; its blank screenshot remains genuine.

Synthetic media pushed to `/sdcard/Download/buffago-synthetic-qa.jpg`, native media-scanner broadcast, explicit Android scoped-picker selection. First selection picked a QA screenshot (newer picker item); canceled crop without confirming/submitting. Correct synthetic grid selected, inspected and confirmed; Anonymous/consent selected; native Submit executed once. Native screenshot helper was changed locally to capture via `/data/local/tmp` so its own screenshots no longer become gallery candidates. No customer image used.

Signout used actual profile UI, not forced token deletion. A second deliberately fresh emulator app-data campaign tested an existing account from the invitation. After client fix, a deliberate `adb VIEW buffago://onboarding` reopened the retained preview after tapping Signout, solely to retest the photo-intent branch. This manual route is explicitly labeled in the trace; never counted as an automatic onboarding replay.

## Validation

From crawl:

```powershell
$files = Get-ChildItem tests/onboarding*.test.*,tests/wingman*.test.mjs,tests/wingShot*.test.mjs,tests/wing-shot*.test.mjs,tests/auth/*.test.js,tests/image-workflow-mobile-runtime.test.mjs | Select-Object -ExpandProperty FullName
node --test --experimental-default-type=module $files
node --test --experimental-default-type=module tests/onboarding-auth-journey.test.mjs
npm run lint
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions
npm run test:quick-rating
```

Broad 411/407 PASS/4 existing SKIP/0 FAIL. Focused16 PASS. Lint0 errors/100 warnings. Standard TS three baseline TS5097 failures; workaround PASS. Quick rating PASS. Gateway helper parsed with Python AST and executed locally; preserved ownership/restart/Auth health verified.

Read-only receipt helper extracts real native persisted session into private SQLite, calls actual local GoTrue getUser, checks current account, server submission/account/venue/null-rating/status, private storage bytes and denied anonymous download, completion keys and local-preview/no canonical-rating state. Only booleans/counts/status/scores appear in public receipts. Original media count remains one for the new account after all cancellations/restarts.

Sanitized native logcat (`-v threadtime -s ReactNativeJS ActivityManager AndroidRuntime`), Metro output, real user-event timeline and source hashes retained. No provider mock run was labeled real OAuth. External docs consulted read-only: Supabase changelog/signup/auth-listener docs and Expo Router stack dismissTo documentation. No production data access.

Final local checks: `git diff --check`, `git diff --cached --check`, `node scripts/security/scan-secrets.mjs --staged`. Original emulator data restored with app stopped, temporary file removed, timeout setting restored, emulator and temporary Metro stopped. Existing acceptance services and synthetic server records retained for review.
