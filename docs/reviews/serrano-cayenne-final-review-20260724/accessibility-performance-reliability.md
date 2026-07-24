# Accessibility, performance, and reliability

Cayenne proved that the clean onboarding controls were discoverable to Maestro and that Android startup completed without a fatal error. Static selectors and UI hierarchy exist. No screen-reader session, contrast measurement, text scaling, reduced-motion run, keyboard/focus audit, small/large device matrix, or task-level accessibility audit was completed.

The smoke run completed, but the evidence does not contain reliable transition/startup timing metrics. Two later runs hit a Metro prewarm connection reset, classified as environment instability. Double taps, rapid navigation, offline, slow network, request cancellation, memory, and stale optimistic state remain unverified.

Result: accessibility/performance Not Scorable for release; tooling reliability P2 risk.
