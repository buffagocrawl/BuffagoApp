# Cayenne selector registry

`registry.json` is the single source of truth for selector IDs used by Cayenne flows. Prefer React Native `testID` and `accessibilityLabel`; do not use coordinates for product assertions. Every new selector must be added here and mapped to a source file/flow in `docs/cayenne-selector-map.md`.
