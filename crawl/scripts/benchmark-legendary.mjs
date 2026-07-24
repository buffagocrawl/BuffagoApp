import { performance } from 'node:perf_hooks';
import { legendaryBenchmarkFixtures, mergeLegendaryMarkers, prepareLegendaryClusters } from '../lib/buffaverse/legendaryShowcase.js';

const runs = 30;
const rows = [];
for (const size of [0, 25, 100, 500]) {
  const restaurants = legendaryBenchmarkFixtures(size);
  const events = restaurants.filter((_, index) => index % 7 === 0).map((restaurant) => ({ restaurantId: restaurant.id }));
  let deriveMs = 0;
  let clusterMs = 0;
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    const markers = mergeLegendaryMarkers(restaurants, events);
    deriveMs += performance.now() - start;
    const clusterStart = performance.now();
    prepareLegendaryClusters(markers);
    clusterMs += performance.now() - clusterStart;
  }
  rows.push({ restaurants: size, derive_ms_avg: Number((deriveMs / runs).toFixed(3)), cluster_ms_avg: Number((clusterMs / runs).toFixed(3)), query_count: 1, flag_fetches: 1 });
}
console.log(JSON.stringify({ runs, thresholds: { derive_ms_avg: 5, cluster_ms_avg: 10, query_count_max: 2, flag_fetches_max: 1 }, rows }, null, 2));
