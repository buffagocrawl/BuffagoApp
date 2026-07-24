# Human setup required

## Required before Cayenne can run native journeys

1. Install Maestro and verify with `maestro --version`. This unlocks the checked-in Android journey contracts.
2. Create an Android emulator in Android Studio's Device Manager using an API level compatible with the Expo SDK 54 development build; verify with `emulator -list-avds` and `adb devices`.
3. Build/install a Buffago development build with the repository's Expo/EAS process and verify package `com.buffago.app` is visible in `adb shell pm list packages`.
4. Provide a QA-only Supabase URL/anon key and, if fixture RPCs require it, a service credential through a local secret store; verify the project identity is QA/staging and never production.
5. Create QA identities such as `cayenne-alice@qa.buffago.test` and apply the reviewed QA fixture functions/migrations.

## Required for advanced testing

- Install Playwright browsers with `npx playwright install` if web E2E is enabled.
- Configure OAuth test applications/accounts for provider-return coverage.
- Connect a physical Android device and configure notification/deep-link credentials for push delivery validation.
- Provide a Mac or hosted iOS device service for iOS execution.
- Configure CI secrets and artifact storage if scheduled/merge-gate runs are enabled.

## Optional improvements

- Cloud device farm, parallel emulator fleet, nightly scheduling, centralized artifact storage, and performance profiling.
