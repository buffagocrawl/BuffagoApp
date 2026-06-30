# BuffaGo

BuffaGo is a gamified mobile app for discovering, rating, and tracking chicken
wing spots through curated real-world "wing crawls."

The project combines consumer mobile UX, Supabase-backed data workflows,
location-aware routing, gamification, and an AI-assisted restaurant intake flow
called Wingman.

## Product

BuffaGo turns local food exploration into a lightweight game:

- Browse curated multi-stop wing crawls.
- Rate wings across crispiness, sauce, meat, and overall quality.
- Earn XP, maintain streaks, and track progress.
- Compare ratings and leaderboards.
- Use guest mode or Supabase Auth-backed accounts.
- Submit new restaurants through AI-assisted validation.

## Architecture

```text
Expo / React Native app
  -> Expo Router screens and shared components
  -> Supabase client with RLS-backed data access
  -> Google Maps and Directions for route experiences
  -> Supabase Edge Functions for privileged workflows
       -> Wingman restaurant intake
       -> account deletion
  -> OpenAI and Google Places used server-side in Edge Functions
  -> Jalapeno content decision engine and long-term content memory
```

## Prompt Library

Jalapeno now keeps its Buffago brand and prompt guidance in standalone markdown files under `prompt_library/` so future agents can reuse the same source of truth without embedding prompt text in code.

The library is versioned and loaded dynamically at runtime by the Jalapeno agent and its validation flow.

Jalapeno's content decision engine also reuses that library for candidate generation, caption cleanup, quality review, and image prompt guidance.

## AI And Data Quality

Wingman is the highest-signal platform component. It takes messy user input,
normalizes it into structured restaurant data, checks existing destinations,
uses Google Places for verification, applies confidence-based decisioning, and
prevents low-quality inserts from reaching the core dataset.

## Security Notes

- `EXPO_PUBLIC_*` values are bundled into the mobile app and must be treated as public.
- Supabase anon keys are acceptable in client code only with strong Row Level Security policies.
- OpenAI keys, Google Places server keys, and Supabase service role keys must stay in Supabase Edge Function secrets.
- Generated native folders, local env files, IDE state, and Supabase local state should not be committed.

## Status

- Android: active Google Play testing.
- iOS: in progress.
- Current focus: AI-assisted intake, route quality, social loops, and gamification.

## Portfolio Positioning

- Built a location-aware consumer mobile app with Expo, Supabase, Google Maps, and gamified progression systems.
- Designed an AI-assisted data intake pipeline that converts unstructured restaurant submissions into validated structured records.
- Implemented a mobile architecture that separates public client configuration from privileged backend and Edge Function secrets.
- Modeled a real-world workflow around discovery, rating, progress, leaderboards, and user-generated data quality.
