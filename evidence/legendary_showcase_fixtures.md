# Legendary showcase fixtures

`crawl/lib/buffaverse/legendaryShowcase.js` contains deterministic, development/test-only fixtures for active nearby/statewide, one-hour, started, completed, pending reward, paused, cancelled, expired, offline, stale, location denied, empty, multiple, clustered, long-name, large-text-compatible, reduced-motion-compatible, no-image, and disabled states. The route `/buffaverse/showcase` is guarded by `__DEV__` or test mode and the fixture module performs no database access or writes.

