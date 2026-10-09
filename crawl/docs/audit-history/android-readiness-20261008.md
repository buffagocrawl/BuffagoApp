# Android development client investigation

No dependency upgrades are needed: installed Expo 54.0.37, React Native 0.81.5, expo-dev-client 6.0.21, expo-network 8.0.8, expo-video 3.0.16, and Expo Router 6.0.24 pass `npx expo install --check`. Gradle's current autolinking output includes both Network and Video. Rebuilding replaces the stale binary missing those modules.

`eas.json` development uses `developmentClient: true`, internal distribution, and the development EAS environment. Android package is `com.buffago.app`. App config obtains Maps exclusively from `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` and rejects an EAS Android build when it is absent. No secret was printed or hardcoded.

The Maps variable is absent from the process, `.env.development`, and `.env.production`. The current ignored native manifest also lacks Maps API metadata. `eas env:list development --format short` completed through a subprocess that suppresses all values; none of the Maps key, Supabase URL, or Supabase anon-key variable names were listed in project development scope. Account-scope variables and the validity/restrictions of a future key are unverified.

Both local environment files contain Supabase URL and anon key, and both point at the same target. JWT claims indicate an anon role and future expiry for both keys; remote acceptance is unverified. This is not evidence of an isolated test backend. Treat it as production read-only; no live transaction or auth mutation was attempted. Supabase client obtains both values from environment, with empty hardcoded overrides. Fixture checks cannot establish live backend readiness.

Android SDK is installed, with build tools/compile/target SDK 36, minimum SDK 24, and NDK 27.1.12297006 selected by Gradle. JAVA_HOME selects Android Studio JBR 21.0.7; PATH java separately resolves Java 25. Use JAVA_HOME for Gradle. The Medium_Phone_API_36.1 AVD was started hidden and booted successfully.

The existing native directory is stale: versionName 1.0.3 versus app config 1.0.5. No native source changes were made. A direct local emulator debug build succeeded in 7m50s (572 tasks; 552 executed), with output in `android-local-build.log`. An incremental rebuild with NODE_ENV=development also succeeded in 25s (22 tasks executed), documented in `android-local-build-development.log`. The fresh APK is 88,260,091 bytes, installed successfully on emulator-5554, and reports versionCode 6 / versionName 1.0.3. Generated ExpoModulesPackageList includes NetworkModule and VideoModule. This build resolves the missing native module blocker and safely loads the app, but cannot certify keyed Maps or current app-config synchronization.

## Exact commands

From `crawl`, after privately supplying a restricted Android Maps key in the environment and confirming an isolated Supabase testing target:

```powershell
$env:NODE_ENV = 'development'
$env:EAS_BUILD_PLATFORM = 'android'
npx expo prebuild --platform android --no-install
npx expo run:android --variant debug --device
npx expo start --dev-client
```

Review generated native changes before retaining them. Do not use `--clean` against an existing native tree containing unreviewed local changes. No dependency upgrade is required.

Local compilation only, as attempted in the existing native directory:

```powershell
$env:NODE_ENV = 'development'
Set-Location android
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --console=plain
```

APK output: `crawl/android/app/build/outputs/apk/debug/app-debug.apk`. This is an emulator-specific x86_64 build. Use `-PreactNativeArchitectures=arm64-v8a` for an arm64 device.

Native smoke commands actually used after the local build, from `crawl`:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
npx expo start --dev-client --port 8082 --localhost --max-workers 2
adb shell am start -a android.intent.action.VIEW -d 'buffago://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8082' com.buffago.app
```

The emulator host address 10.0.2.2 succeeded. The attempted 127.0.0.1 connection with adb reverse timed out before JavaScript loaded; it was corrected by using the emulator host address.

Only after explicit external-build authorization and configuring the development environment:

```powershell
eas build --platform android --profile development
```

No EAS cloud build, upload, deployment, commit, push, merge, or build submission occurred. EAS local builds are not the chosen Windows path; [Expo local-build documentation](https://docs.expo.dev/build-reference/local-builds/) describes host restrictions. [Expo development build documentation](https://docs.expo.dev/develop/development-builds/introduction/) documents rebuilding when native libraries/configuration change.

## Native verification status

Completed: AVD startup; fresh APK install; Android app bundle (2,359 modules); app launch through Expo Router; initial session hydration with error:null / hasSession:false; unauthenticated onboarding; navigation to the authentication screen and Sign In tab; email focus with Android keyboard displayed; keyboard dismissal; background and resume without an observed crash. No credentials were entered and no authentication request or live write was submitted. Actual native screenshots: `android-native-startup.png`, `android-native-keyboard.png`, and `android-native-resume.png`. Startup screenshot shows onboarding with safe top/bottom regions and the Android gesture bar. These checks apply to unauthenticated screens only.

Still unverified: Maps access from Crawls/Wingdex, valid/invalid coordinates, missing-key UI on those protected screens, location permissions and services, map close/reopen and background/resume, five-tab layouts/navigation, route persistence and all live financial/progress/photo actions, protected modals, text scaling, light/dark theme behavior and small-screen layouts. The browser fixture harness does not provide authenticated native fixtures. The current local backend target is not confirmed isolated, so authenticated mutation tests were not attempted. Browser fallbacks do not count as native Maps verification.
