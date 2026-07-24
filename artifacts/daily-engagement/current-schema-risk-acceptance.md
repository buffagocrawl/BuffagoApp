# Current-schema risk acceptance

Date: 2026-07-24

The product owner accepted the following boundary for the daily-engagement release:

- Historical baseline recovery was attempted. Eighteen object families mapped to 35 prerequisite checks.
- Four object families reached authoritative historical confidence; fourteen object families have current-production evidence only.
- `limited_time_events` historical ownership remains unresolved. Its review baseline remains inactive.
- The application will support the current Buffago production schema rather than claim greenfield database recreation.
- No authoritative pre-engagement database baseline is available. Buffago cannot currently be recreated completely from an empty database using repository migrations alone.
- Historical Platform Baseline v1 recovery is unresolved and inactive. Existing foundation artifacts remain preserved as evidence for future platform remediation.
- Empty-database provisioning and full disaster-recovery reconstruction remain separate platform debt. That debt does not authorize unsafe production mutation.
- No deleted historical definitions are being searched for in this run. The speculative baseline review SQL is not activated, and no placeholder schema objects are created.
- This document does not claim that the database-foundation gate passed.
- All engagement functionality remains controlled through feature flags and requires human approval before production rollout.

The supported release contract is **Buffago Current Supported Schema Contract v1**. It is a compatibility contract, not a provisioning baseline.
