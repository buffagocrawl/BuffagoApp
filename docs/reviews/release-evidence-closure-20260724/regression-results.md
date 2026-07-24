# Regression Results

Unified command: `cd crawl; node ./scripts/release-smoke.mjs`

Result: **PASS**.

- JavaScript tests: 116/116 passed.
- TypeScript: passed.
- Lint: 0 errors, 104 warnings.
- Migration integrity: passed; 18 root migrations, 0 legacy archives.
- Expo Doctor: 18/18 passed.
- Expo web export: passed; 1,609 modules bundled.
- Serrano tests: 15 passed.
- Supabase/referral/streak/notification/Buffaverse/auth/account-deletion contract coverage: included in the 116-test suite and passed.
- Android/iOS native build/device validation: unavailable, not passed.
- Secret scan: no live secret scan result was claimed; credentials were not exposed or recorded.

The export reported the existing Android status-bar/splash color conflict warning.
