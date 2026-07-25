# Root-cause analysis

Ranked causes:

1. **Unknown startup state / Expo dev-client lifecycle** — clean state can expose the developer menu, permissions, onboarding, or a transient blank hierarchy. The original flow assumed a signed-out auth screen.
2. **Monolithic flow state drift** — selectors were invoked before the auth modal, segmented mode, keyboard, and native submit action were jointly ready.
3. **Auth submit remains unproven** — the first staged run reached the form but remained in default Sign Up mode; subsequent two clean launches stopped at safe readiness gates. No evidence supports blaming Supabase or credentials.

Chosen configuration: Expo development client with Metro prewarm, explicit `adb reverse`, package `com.buffago.app`, and a controlled `buffago://auth/login` route only after `app.root` is stable. This remains less deterministic than a release-like local E2E build because Expo/Metro restarts and first-run prompts remain observable.

State policy: `CLEAR_APP_DATA` uses only `adb shell pm clear com.buffago.app`, then controlled launch. It never resets the emulator globally or mutates backend data. `PRESERVE_APP_DATA` force-stops only. `CLEAR_SESSION_ONLY` intentionally fails closed until a development-only state bridge exists.
