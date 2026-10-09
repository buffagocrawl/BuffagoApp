# Preserved historical audit material

These four reports were preserved from generated QA output before safe cleanup on 2026-10-09. They describe earlier states and may contain obsolete conclusions and historical capture identifiers. Generated captures/logs/results were removed after conclusions were recorded; two locked Metro logs remain untouched. Screenshot links have been retired. The current acceptance record is [branch-consolidation-final-audit.md](../branch-consolidation-final-audit.md), with removal totals and preservation details in the [cleanup inventory](../qa-artifact-cleanup-inventory.md).

- `android-readiness-20261008.md`: original local client/environment investigation.
- `crawls-independent-qa-20261008.md`: independent route/layout review.
- `ui-independent-qa-20261008.md`: original five-tab review and corrections requested.
- `visual-polish-prior-report-20261008.md`: original failed V2 audit, superseded by the later report.

Three existing source scripts were preserved under `scripts/qa/`; `legacy-five-tabs.mjs` is a fixed-coordinate historical helper. Current native matrix harnesses remain under `scripts/`. Run environment inspection scripts from the crawl root; they suppress credential values.

Migration investigation conclusions are retained in the final audit: 24 mismatches (20 newline-only; four content differences), duplicate timestamp and 17 unmanifested older migrations. The investigation compared HEAD, local normalized bytes and manifest. It did not establish deployed bytes. No historical migration was repaired.
