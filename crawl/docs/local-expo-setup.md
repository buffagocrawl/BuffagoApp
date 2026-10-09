# Local Expo setup (Windows)

## Current configuration audit

- `.env.development` exists and contains a syntactically valid Supabase URL and a nonempty anon key. Its `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` is missing. It contains a legacy `EXPO_PUBLIC_GOOGLE_API_KEY`, which is for Directions and does not configure native Android Maps.
- `.env.production` contains the Supabase URL and anon key plus a generic Maps key, but no platform-specific Android Maps key. Production secrets were not copied into `.env.local` as fallbacks.
- Development and production Supabase URLs have the same safe project identifier (`vhfxnizaxdanmvmouuaf`). Both anon JWT project references match that project. Local auth/data operations can therefore reach the production project. Do not use local builds to submit ratings, spend coins, change accounts, upload photos, or run database-write tests.
- The source has no `SUPABASE_SERVICE_ROLE_KEY` in the Expo env files. Never add one to an `EXPO_PUBLIC_*` variable or any mobile app configuration.
- `.env.local` was prepared by copying `.env.development`; it preserves existing values and adds a clear Android Maps placeholder. Expo CLI's standard local env loader loads `.env.local` in development mode. Keep it aligned with `.env.development` when that file changes.
- `.gitignore` ignores `.env` and `.env.*` while allowing `.env.example`, so `.env.local` and the other credential files stay untracked.

## Values and where they belong

All local values belong in `C:\Users\Brand\repo\BuffagoApp\crawl\.env.local` (or in `.env.development` if you deliberately choose Expo's standard mode-based file). For this setup, `.env.local` is the active local override.

| Variable | Current state | Where to retrieve it | Used by |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Populated from `.env.development`; points to the same project as production | Supabase Dashboard → project → Connect / Project URL | Local Expo, EAS development and production if explicitly configured in those cloud environments |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Populated from `.env.development`; JWT project reference matches URL | Supabase Dashboard → Project Settings → API Keys → publishable/anon key | Local Expo, EAS development and production if explicitly configured in those cloud environments |
| `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` | **Needs user input**; placeholder in `.env.local`; missing in `.env.development` | Google Cloud Console → the intended project → APIs & Services → Credentials. Use a key with Maps SDK for Android enabled, restricted to Android app `com.buffago.app` and the signing certificate SHA-1 for the build being tested | Local Android native builds and EAS Android development/production builds |
| `EXPO_PUBLIC_GOOGLE_IOS_API_KEY` | Missing in development; not needed for Android | Google Cloud Console → APIs & Services → Credentials; restrict for the iOS bundle ID `com.buffago.app` | Only iOS native builds; EAS iOS builds fail without it |
| `EXPO_PUBLIC_GOOGLE_API_KEY` | Development legacy generic key is populated; used for Directions requests, not Android native Maps | Google Cloud Console → APIs & Services → Credentials; restrict to the APIs that use Directions | Local/EAS app runtime when walking Directions are enabled; not used to generate Android Maps manifest metadata |

The configured Android package and Gradle application ID are both `com.buffago.app`. No Maps key is hardcoded in `app.config.js`. Expo's Android Maps config plugin writes `com.google.android.geo.API_KEY` from `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY`. Missing-key behavior: EAS Android/iOS native builds throw a clear error for the platform key. Config inspection and web builds can resolve without native keys. Keep the existing map fallback and readiness safeguards; no map runtime behavior was changed.

### Additional runtime variables found in source

These do not block starting the app; most have defaults or only enable optional features. Add them to `.env.local` only when you need that feature or a non-default deployment setting:

- `EXPO_PUBLIC_USE_PROXY`, `EXPO_PUBLIC_STRICT_ENV`: Supabase client behavior.
- `EXPO_PUBLIC_REFERRAL_BASE_URL`: referral links.
- `EXPO_PUBLIC_BUFFAGO_FACEBOOK_URL`, `EXPO_PUBLIC_BUFFAGO_FACEBOOK_DEEP_LINK`, `EXPO_PUBLIC_BUFFAGO_INSTAGRAM_URL`, `EXPO_PUBLIC_BUFFAGO_INSTAGRAM_DEEP_LINK`: community links (Instagram has source defaults).
- `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_ANALYTICS_DISABLED`: analytics labeling/disable switch.
- `EXPO_PUBLIC_CAYENNE_E2E`: test diagnostics only.
- `EXPO_PUBLIC_MASCOT_ENABLED`, `EXPO_PUBLIC_MASCOT_ANIMATIONS_ENABLED`, `EXPO_PUBLIC_MASCOT_DEBUG_LABELS`, `EXPO_PUBLIC_MASCOT_VARIANT`, `EXPO_PUBLIC_MASCOT_CELEBRATION_FREQUENCY`: optional mascot configuration.
- `EXPO_PUBLIC_ONBOARDING_FIRST_VALUE_EXPERIMENT`, `EXPO_PUBLIC_ONBOARDING_STEP6_TREATMENT`: optional onboarding experiment flags.

## EAS cloud environments

`.env.local` and `.env.development` are local files; EAS cloud builds do not read these files from your Windows machine. `eas.json` assigns the `development` build profile to the EAS `development` environment and the `production` profile to the EAS `production` environment. Enter the needed values in the Expo dashboard's project environment-variable settings (or manage them with EAS CLI) for each environment:

- **EAS development Android build:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` in EAS environment `development`.
- **EAS production Android build:** the same three variables in EAS environment `production`. Supply the intended production Supabase project explicitly; do not rely on local files or an implicit fallback. Current checked-in `.env.production` points at the same project identifier as development.
- **EAS iOS builds:** also set `EXPO_PUBLIC_GOOGLE_IOS_API_KEY` for the selected environment.
- `EXPO_PUBLIC_GOOGLE_API_KEY` is separate and is needed at runtime for the Directions feature if enabled.

The EAS build profile selects the cloud environment; it does not synchronize local env files. Avoid adding any service-role key to EAS mobile build variables.

## Start on Windows

After entering a valid Android Maps key in `.env.local`, use PowerShell in the `crawl` directory:

```powershell
npm install
npx expo start --clear
```

Use Expo Go only for flows supported by Expo Go. Google Maps Android native configuration requires a custom development build. With Android Studio/SDK and a device or emulator available:

```powershell
npx expo run:android
```

Then run `npx expo start --dev-client` for the installed development client. Do not run prebuild with `--clean`; it deletes generated native files. `expo run:android` may regenerate native configuration as part of the normal local build. Rebuild/reinstall Android after changing the Maps key, app config, native plugins, package ID, or native dependencies. Changing only JS or Supabase values normally needs a Metro reload; restart Metro after editing env files.

## Separate development Supabase project

For safe local data testing, create/configure a separate project in Supabase, then replace `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` with that project's URL and publishable/anon key. Configure its auth redirect URLs/providers for `buffago://auth/callback` and the app's development flow. Do not run write-oriented local testing against the current shared project. Configure the EAS `development` environment with the separate project's values if cloud development builds should use it; keep production values in EAS `production`.

## Troubleshooting

- **Metro still uses old values:** stop Metro, verify the variable names in `.env.local`, then run `npx expo start --clear`. Restart the app after changing public variables.
- **Supabase/auth errors:** verify URL and anon key came from the same Supabase project; the project reference in the anon JWT should match the URL hostname. Confirm the project's auth providers and redirect URL allow `buffago://auth/callback`. Do not paste tokens into logs or issue reports.
- **Blank/Google Maps unavailable on Android:** confirm the Android-specific key is populated, Maps SDK for Android is enabled in Google Cloud, the key restriction includes `com.buffago.app` and the installed build's signing SHA-1, and billing/API restrictions allow the request. Rebuild/reinstall Android after changing the key. The app retains its safe map fallback if native Maps is unavailable.
- **EAS says a key is missing:** add the variable to the EAS environment named in `eas.json`; local `.env.local` is not uploaded automatically.
- **Expo dependency warnings:** run `npx expo install --check`; align packages with the installed Expo SDK before making a native development build.
