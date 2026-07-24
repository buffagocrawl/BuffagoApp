# Rendered experience evidence

The executable target is Expo Web route `/buffaverse/showcase`. The harness switches fixtures without production data and exposes a reduced-motion toggle. Required captures are the home hero-equivalent, map marker/cluster/selected callout, detail, participation, completion, share, empty, location-denied, offline, stale, paused, expired, disabled, long-name, and no-image states.

Fresh exports from checkpoint `a29b083` pass for all supported build targets:

- Web: `output/buffaverse-phase2-web-a29b083`, 3.75 MB JavaScript bundle
- Android: `output/buffaverse-phase2-android-a29b083`, 7.13 MB Hermes bundle
- iOS: `output/buffaverse-phase2-ios-a29b083`, 7.13 MB Hermes bundle

The exports include the showcase route and the disabled-by-default real Home,
Wingdex map, and restaurant-detail integrations. The in-app browser runtime is
unavailable in this environment, so screenshot pixels and browser interaction
are not claimed. The reproducible capture path is present and ready for a
browser-enabled runner.

Five-second rubric: identify the restaurant; explain why it is Legendary; find remaining time; name the one action; describe completion outcome. Pass requires all five without narration.
