# Regression review

Final gate at `c4d2b4b`:

| Check | Result |
|---|---|
| JavaScript suite | PASS, 120/120 |
| TypeScript | PASS |
| Lint | PASS gate: 0 errors, 104 warnings |
| Migration integrity | PASS, 18 root migrations |
| Expo Doctor | PASS, 18/18 |
| Web export | PASS, 1,613 modules |
| Android runtime smoke | PASS preserved run; later retries environment-blocked |
| iOS build/runtime | BLOCKED on Windows |
| Android production build/export | Not run; dev-client emulator evidence only |
| Live Supabase/RLS | Contract PASS; live BLOCKED |
| Repository secret scan | PASS, 1,082 tracked files |
| Full-history targeted scan | Historical Google key confirmed; expected anon JWT/local DB false positives |

Known warning: Android status-bar background conflicts with splash background. No test was weakened and no production migration was applied.
