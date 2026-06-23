# BuffaGo Mobile App

Expo mobile client for BuffaGo, a gamified wing-crawl discovery and rating app.

## Stack

- Expo and React Native
- Expo Router
- React Native Paper
- Supabase Auth and Postgres
- React Query
- Google Maps / Directions
- Supabase Edge Functions for privileged AI and account workflows

## Local Setup

```bash
npm install
cp .env.example .env
npx expo start
```

Use a development build or emulator for the full native map/location experience.

## Environment

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_API_KEY=
EXPO_PUBLIC_STRICT_ENV=false
EXPO_PUBLIC_USE_PROXY=false
```

Values prefixed with `EXPO_PUBLIC_` are visible in the mobile bundle. Keep
OpenAI keys, Supabase service role keys, and unrestricted Google Places keys in
Supabase Edge Function secrets only.

## App Modules

- `app/`: Expo Router screens.
- `components/`: shared UI and workflow components.
- `hooks/`: Supabase-backed route, crawl, and onboarding hooks.
- `lib/Wingman/`: client service wrapper for AI-assisted restaurant intake.
- `supabase/functions/`: server-side privileged workflows.
- `supabase/migrations/`: database and policy changes.

## iOS Splash Screen

iOS uses `assets/images/BuffaGo-splash.png` through the
`expo-splash-screen` config plugin in `app.config.js`. The source is a
lossless 1024×1024 PNG displayed inside a 320-point square with `contain`.
Expo generates 1×, 2×, and 3× iOS launch assets (up to 960×960), so the
source is not enlarged on current Retina iPhones. The app forces dark UI
mode, but the launch screen intentionally uses one opaque branded cream
image in both system appearances. A separate Expo `dark` splash is not
configured because Expo would change iOS interface style to `Automatic`.

The legacy top-level `splash` config remains in place for Android. Do not
replace `assets/splash.png` as part of an iOS-only change because Android's
checked-in splash resources are generated from that path.

To update the iOS splash later:

1. Export a square, lossless PNG at 1024×1024 or larger. Keep important
   artwork comfortably inside the square safe area.
2. Replace `assets/images/BuffaGo-splash.png`, keeping the filename, or
   update its iOS image path in `app.config.js`.
3. Keep `imageWidth` at or below one third of the source pixel width so the
   generated 3× asset is downsampled rather than upscaled.
4. Regenerate native iOS files with `npx expo prebuild --platform ios
   --clean` or create a new EAS iOS build. Splash changes are native and do
   not ship through an over-the-air JavaScript update.
5. Test a release/dev build; Expo Go does not reliably represent the final
   native launch screen.

## Portfolio Signal

This codebase is strongest as evidence of mobile product ownership plus
platform thinking: auth, maps, user-generated content, gamification, Edge
Functions, data quality controls, and AI-assisted validation all support one
coherent real-world workflow.
