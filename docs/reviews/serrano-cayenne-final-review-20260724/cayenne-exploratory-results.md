# Cayenne exploratory results

Run `20260724T154630-40893f12` at the unchanged starting commit passed the supported Android `smoke-auto` flow in production-readonly mode.

- Screen/route: clean onboarding startup
- Action: launch, wait for `app.root`, navigate onboarding forward and back
- Expected/actual: exactly one startup state, usable controls, no fatal error; matched
- Screenshots: eight PNGs under `artifacts/cayenne/runs/20260724T154630-40893f12/screenshots/`
- Hierarchy: `hierarchies/startup.xml` and `hierarchies/final.xml`
- Logs: logcat, Metro, Maestro raw output
- Reproducibility: one supported pass; two later concurrent retries were blocked by Metro bundle connection reset
- Severity: no confirmed app defect; environment reliability risk P2

The required broad unauthenticated/authenticated exploration was not supported by available selectors/session state. No dead-control, overlap, clipping, missing-image, or performance claim is made beyond the captured onboarding screens.
