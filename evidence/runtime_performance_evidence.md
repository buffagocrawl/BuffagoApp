# Runtime performance evidence

Thresholds defined before measurement:

- marker derivation: ≤5ms for 0/25/100/500 fixtures in Node benchmark;
- merge/dedup/cluster preparation: ≤10ms for 500 restaurants and ≤100 Legendary candidates;
- no query-per-marker or flag-fetch-per-marker call paths;
- countdown state is local to the experience and does not force the map fixture to rerender;
- bundle delta from the showcase: ≤250KB gzip-equivalent and no new production dependency.

Executable fixture and benchmark source: `crawl/lib/buffaverse/legendaryShowcase.js` and `crawl/scripts/benchmark-legendary.mjs`. Thirty-run local measurements passed the defined thresholds:

| Restaurants | Merge avg | Cluster avg | Query count | Flag fetches |
|---:|---:|---:|---:|---:|
| 0 | 0.002ms | 0.002ms | 1 | 1 |
| 25 | 0.004ms | 0.007ms | 1 | 1 |
| 100 | 0.015ms | 0.036ms | 1 | 1 |
| 500 | 0.036ms | 0.108ms | 1 | 1 |

These are deterministic pure-operation measurements, not device frame-rate measurements. No query-per-marker or flag-fetch-per-marker path exists in the fixture path. Physical-device frame rate and full production adapter render counts remain release conditions.
