# Platform Support Decision

Decision: **Outcome A, web is supported**.

Evidence: `crawl/package.json` exposes `web` and the app depends on `react-dom` and `react-native-web`; existing quality documentation treated `npx expo export --platform web` as a release check. The failure was caused by direct `react-native-maps` imports, not by a product decision to exclude web.

The release resolves `lib/platformMap.native.js` on iOS/Android and `lib/platformMap.web.js` on web. The web fallback keeps route screens usable and states that native maps and background proximity reminders require the mobile app. Native map and geofencing behavior is unchanged. `tests/platform-web-boundary.test.js` prevents direct native map imports from returning to screens.

Validation: web export passed after the boundary change. Android and iOS exports also passed. Web background geofencing remains intentionally unsupported and is not represented as available.
