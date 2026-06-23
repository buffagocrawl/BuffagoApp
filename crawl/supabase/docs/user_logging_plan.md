# Buffago User Logging Plan

Buffago needs one practical, consistent event stream. The goal is not to track everything forever. The goal is to answer: who came back, what did they try, where did they get stuck, what made them rate/crawl/share, and what broke?

## Core Table: `user_events`

Recommended MVP table:

```sql
create table public.user_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  user_id uuid null,
  anonymous_id text null,
  session_id uuid not null,
  event_name text not null,
  screen text null,
  platform text null,
  app_version text null,
  state_id integer null,
  route_id uuid null,
  crawl_id uuid null,
  destination_id uuid null,
  metadata jsonb not null default '{}'::jsonb
);

create index user_events_occurred_at_idx on public.user_events (occurred_at desc);
create index user_events_user_time_idx on public.user_events (user_id, occurred_at desc);
create index user_events_session_time_idx on public.user_events (session_id, occurred_at);
create index user_events_event_time_idx on public.user_events (event_name, occurred_at desc);
create index user_events_destination_time_idx on public.user_events (destination_id, occurred_at desc) where destination_id is not null;
create index user_events_route_time_idx on public.user_events (route_id, occurred_at desc) where route_id is not null;
```

RLS recommendation:

- Authenticated users may insert events only for their own `user_id`.
- Guests may insert events with `user_id is null` and an `anonymous_id`.
- Clients should not read raw `user_events`.
- Admin/service role can read raw events.
- Agents should read only sanitized views with aggregation thresholds.

## Event Naming Conventions

Use lowercase snake case:

- Noun + action: `restaurant_search_submitted`, `rating_completed`.
- Start/complete/abandon pairs where there is a funnel: `rating_started`, `rating_completed`, `rating_abandoned`.
- View events end with `_viewed`: `restaurant_profile_viewed`, `leaderboard_viewed`.
- Error events end with `_failed` or `_error`: `api_request_failed`, `screen_load_failed`.
- Empty state events end with `_empty`: `restaurant_search_empty`.

Keep event names stable. Put details in `metadata`, not in event names.

## Required Fields

Every event should include:

- `event_name`
- `session_id`
- `occurred_at`
- `screen`
- `platform`
- `app_version`
- one of `user_id` or `anonymous_id`

Context fields when available:

- `state_id`
- `route_id`
- `crawl_id`
- `destination_id`

## Optional Metadata

Use `metadata` for non-sensitive details:

- `query_length`, not raw search query by default.
- `result_count`
- `duration_ms`
- `step_name`
- `source`
- `sort`
- `filter_count`
- `error_code`
- `http_status`
- `api_name`
- `distance_miles_bucket`
- `rating_dimensions_present`

Avoid storing:

- raw precise location unless strictly needed
- full search text unless there is explicit product need
- email, phone, name, auth tokens
- full third-party API responses
- raw AI prompts/responses

## Event Coverage

### App and Session

- `app_opened`: app launched or foregrounded.
- `session_started`: new app session ID created.
- `session_ended`: best-effort event when app backgrounds.

Example metadata: `{ "entry_screen": "home" }`.

### Onboarding

- `onboarding_started`
- `onboarding_step_viewed`
- `onboarding_state_selected`
- `onboarding_destination_selected`
- `onboarding_custom_destination_started`
- `onboarding_account_prompt_viewed`
- `onboarding_completed`
- `onboarding_skipped`
- `onboarding_abandoned`

Example metadata: `{ "step": "state", "step_index": 2 }`.

### State Selection

- `state_picker_opened`
- `state_selected`
- `location_state_detected`
- `location_permission_prompted`
- `location_permission_denied`

Example metadata: `{ "source": "gps" }`.

### Restaurant Discovery

- `restaurant_search_submitted`
- `restaurant_search_results_viewed`
- `restaurant_search_empty`
- `restaurant_profile_viewed`
- `restaurant_added_started`
- `restaurant_suggestion_submitted`
- `wingman_intake_started`
- `wingman_intake_completed`
- `wingman_intake_failed`
- `wingman_manual_review_queued`

Example metadata: `{ "query_length": 14, "result_count": 3, "source": "wingman" }`.

### Directions and Map

- `map_opened`
- `directions_tapped`
- `external_maps_opened`
- `route_preview_viewed`
- `route_stop_viewed`

Example metadata: `{ "map_provider": "apple_maps", "distance_miles_bucket": "5_10" }`.

### Rating Funnel

- `rating_started`
- `rating_step_completed`
- `rating_completed`
- `rating_abandoned`
- `rating_validation_failed`

Example metadata: `{ "source": "crawl", "step": "overall", "wings_eaten": 6 }`.

### Crawl Funnel

- `crawl_preview_viewed`
- `crawl_started`
- `crawl_resumed`
- `crawl_step_viewed`
- `crawl_step_completed`
- `crawl_completed`
- `crawl_abandoned`
- `crawl_detached_from_user`

Example metadata: `{ "stop_order": 2, "total_stops": 5, "is_solo": true }`.

### Wing Battle

- `wing_battle_viewed`
- `wing_battle_started`
- `wing_battle_vote_submitted`
- `wing_battle_completed`

Example metadata: `{ "battle_id": 4, "choice": 1 }`.

### Leaderboards and Social

- `leaderboard_viewed`
- `leaderboard_scope_changed`
- `social_feed_viewed`
- `profile_viewed`
- `profile_updated`
- `badge_earned`

Example metadata: `{ "scope": "state", "metric": "ratings" }`.

### Share and Referral

- `share_sheet_opened`
- `share_completed`
- `referral_link_created`
- `referral_link_opened`
- `invite_sent`

Example metadata: `{ "share_target": "native", "content_type": "crawl" }`.

### Errors, Empty States, Slow Screens

- `screen_load_started`
- `screen_load_slow`
- `screen_load_failed`
- `api_request_failed`
- `empty_state_viewed`
- `permission_blocked`

Example metadata: `{ "api_name": "supabase.destinations", "duration_ms": 3200, "http_status": 500 }`.

## TypeScript Insert Helper

```ts
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

type BuffagoEvent = {
  eventName: string;
  screen?: string;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId: string;
  stateId?: number | null;
  routeId?: string | null;
  crawlId?: string | null;
  destinationId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function trackEvent(event: BuffagoEvent) {
  const payload = {
    event_name: event.eventName,
    screen: event.screen ?? null,
    user_id: event.userId ?? null,
    anonymous_id: event.anonymousId ?? null,
    session_id: event.sessionId,
    state_id: event.stateId ?? null,
    route_id: event.routeId ?? null,
    crawl_id: event.crawlId ?? null,
    destination_id: event.destinationId ?? null,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? null,
    metadata: event.metadata ?? {},
  };

  const { error } = await supabase.from('user_events').insert(payload);
  if (error && __DEV__) {
    console.warn('trackEvent failed', error.message);
  }
}
```

## Example Buffago Flow Events

Home open:

```ts
trackEvent({
  eventName: 'app_opened',
  screen: 'home',
  userId,
  anonymousId,
  sessionId,
});
```

Restaurant search:

```ts
trackEvent({
  eventName: 'restaurant_search_submitted',
  screen: 'ratings',
  userId,
  anonymousId,
  sessionId,
  stateId,
  metadata: { query_length: query.trim().length, source: 'ratings_tab' },
});
```

Restaurant viewed:

```ts
trackEvent({
  eventName: 'restaurant_profile_viewed',
  screen: 'ratings',
  userId,
  anonymousId,
  sessionId,
  destinationId,
  stateId,
  metadata: { source: 'search_results' },
});
```

Crawl started:

```ts
trackEvent({
  eventName: 'crawl_started',
  screen: 'home',
  userId,
  anonymousId,
  sessionId,
  routeId,
  crawlId,
  metadata: { is_solo: true, source: 'nearest_crawl_card' },
});
```

Rating completed:

```ts
trackEvent({
  eventName: 'rating_completed',
  screen: 'crawl',
  userId,
  anonymousId,
  sessionId,
  destinationId,
  crawlId,
  routeId,
  metadata: {
    source: 'crawl_stop',
    has_flavor_vibe: flavorVibe.length > 0,
    would_order_again: wouldOrderAgain,
  },
});
```

Slow screen:

```ts
trackEvent({
  eventName: 'screen_load_slow',
  screen: 'leaderboards',
  userId,
  anonymousId,
  sessionId,
  metadata: { duration_ms: elapsedMs, threshold_ms: 2500 },
});
```

## Practical Rollout

1. Add table, RLS, and indexes.
2. Add `trackEvent` helper.
3. Add session/anonymous ID storage.
4. Instrument app open, screen load slow/fail, onboarding, search, restaurant view, rating, crawl start/completion, leaderboard view.
5. Build daily analytics views.
6. Add agent-safe aggregate views after event volume is stable.

