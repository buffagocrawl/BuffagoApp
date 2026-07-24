import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGENDARY_SHOWCASE_FIXTURES, getLegendaryShowcaseFixture, legendaryBenchmarkFixtures, mergeLegendaryMarkers, prepareLegendaryClusters } from '../lib/buffaverse/legendaryShowcase.js';
import { legendaryByRestaurant, projectLegendaryEvent, projectLegendaryFeed } from '../lib/buffaverse/legendaryProjection.js';

test('showcase fixtures cover the required product states', () => {
  const required = ['activeNearby','activeStatewide','oneHour','participationStarted','completion','pendingReward','paused','cancelled','expired','offline','stale','locationDenied','emptyLocal','multiple','clustered','longName','noImage','disabled'];
  for (const key of required) assert.ok(LEGENDARY_SHOWCASE_FIXTURES[key], `missing ${key}`);
});

test('showcase fixtures are deterministic and never write production data', () => {
  const first = getLegendaryShowcaseFixture('activeNearby');
  const second = getLegendaryShowcaseFixture('activeNearby');
  assert.deepEqual(first, second);
  assert.equal(Object.prototype.hasOwnProperty.call(first, 'event_instance_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(first, 'production'), false);
});

test('benchmark fixture sizes are exact and bounded', () => {
  for (const size of [0, 25, 100, 500]) assert.equal(legendaryBenchmarkFixtures(size).length, size);
});

test('legendary merge and clustering are bounded pure operations', () => {
  const restaurants = legendaryBenchmarkFixtures(500);
  const events = restaurants.slice(0, 100).map((restaurant) => ({ restaurantId: restaurant.id }));
  const markers = mergeLegendaryMarkers(restaurants, events);
  assert.equal(markers.length, 500);
  assert.equal(markers.filter((marker) => marker.legendary).length, 100);
  assert.ok(prepareLegendaryClusters(markers).length <= markers.length);
});

test('live feed projection exposes only bounded active Legendary events', () => {
  const now = Date.now();
  const active = {
    id: 'event-active',
    event_type_id: 'legendary_restaurant',
    lifecycle_status: 'active',
    geographic_scope: 'local',
    starts_at: new Date(now - 60_000).toISOString(),
    ends_at: new Date(now + 45 * 60_000).toISOString(),
    summary: 'A neighborhood favorite is having a moment.',
    display_metadata: {
      restaurant_id: 'restaurant-1',
      restaurant_name: 'Firebird Wings',
      reason_label: 'Locals keep coming back for the garlic-parm wings.',
      sponsorship_disclaimer: 'Buffago-curated event. Not sponsored.',
    },
  };
  const disabledType = { ...active, id: 'event-other', event_type_id: 'boss_battle' };
  const cancelled = { ...active, id: 'event-cancelled', lifecycle_status: 'cancelled' };

  const projected = projectLegendaryEvent(active);
  assert.equal(projected.restaurantId, 'restaurant-1');
  assert.equal(projected.restaurantName, 'Firebird Wings');
  assert.ok(projected.minutesRemaining >= 44 && projected.minutesRemaining <= 45);
  assert.equal(projectLegendaryEvent(disabledType), null);
  assert.equal(projectLegendaryEvent(cancelled), null);
  assert.deepEqual(projectLegendaryFeed([disabledType, cancelled]), []);
});

test('live feed projection remains deterministic and keyed by restaurant', () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({
    id: `event-${index}`,
    event_type_id: 'legendary_restaurant',
    lifecycle_status: 'active',
    geographic_scope: 'local',
    starts_at: '2026-07-24T12:00:00.000Z',
    ends_at: '2099-07-24T13:00:00.000Z',
    display_metadata: {
      restaurant_id: `restaurant-${index}`,
      restaurant_name: `Wing stop ${String(index).padStart(2, '0')}`,
    },
  }));
  const events = projectLegendaryFeed(rows, 25);
  assert.equal(events.length, 25);
  assert.equal(legendaryByRestaurant(events).size, 25);
});
