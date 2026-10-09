# Generated QA artifact cleanup inventory

Inspected and safely cleaned 2026-10-09. Branch: `feat/wingdex-gallery-zoom-voting`. Original inventory/planning tables below are historical snapshots; final removal and remaining-file results follow the dry run. Conclusions are preserved in [final audit](branch-consolidation-final-audit.md) and [handoff](codex-handoff.md). No test/build/native QA rerun.

## Repository QA trees

Paths below are relative to `C:/Users/Brand/repo/BuffagoApp/crawl`. Before cleanup, Git inspection confirmed these four trees were **untracked and ignored**, with no tracked files inside them. Existing `.gitignore` entries cover regeneration and the remaining active logs.

| Tree | Files | Bytes | Contents / cleanup classification |
|---|---:|---:|---|
| `artifacts/consolidation-native/` | 373 | 93,227,464 | 175 PNG native captures/contact sheets, 157 XML dumps, 30 JSON results/evidence, 6 logs; 3 MJS helpers and 2 PowerShell launchers need preservation review |
| `artifacts/operation-ui-overhaul/` | 234 | 34,978,159 | 168 PNG, 3 XML, 22 JSON, 35 logs, 1 TXT; 3 archived report copies and 2 inspection scripts |
| `artifacts/visual-polish-v2/` | 419 | 81,606,838 | 277 PNG, 93 XML, 16 JSON, 30 logs, 1 TXT; 1 archived report copy and 1 historical MJS helper |
| `artifacts/wingdex-photos/` | 42 | 19,553,245 | 18 PNG, 14 XML, 2 JSON, 8 logs: gallery/device/contract evidence |
| **Total, including source copies** | **1,068** | **229,365,706** | Do not delete whole trees until source preservation prerequisites below are resolved |

No videos, HTML reports, ZIP exports or Python files were found in these four trees. PNGs here are test evidence, not application image assets. XML files are emulator accessibility captures. Logs/results include failed and interrupted attempts; preserve their conclusions, not fabricated success.

### Native evidence grouping

All following folders are under `artifacts/consolidation-native/`:

| Group | Files | Purpose |
|---|---:|---|
| Eight width/font folders | 152 | Top-level five-tab, radius and map matrix evidence |
| `gallery/` | 40 | Earlier native viewer checks |
| `gallery-final-smoke/`, `gallery-final-fixed/`, `gallery-final-stable/` | 43 | Original target defect, interrupted attempt, authoritative final smoke |
| `targeted-flows/` | 28 | Home/Social/background and superseded Crawl assertion |
| `resume-phase/` | 2 | Visual Resume board; launcher image is not list-return proof |
| `map-details-reproduction/`, `map-details-fixed/` | 20 | Selector failure and authoritative successful focused closure |
| Six `image-faults*` folders | 79 | Image-delay/failure/expiry/retry captures, raw results, redacted HTTP evidence and independent visual review; includes launch script/logs |
| Root files | 9 | Startup PNG, four Metro logs, three MJS helpers and Metro launcher |

Key conclusions required before evidence removal are already recorded: XML full-loading assertion BLOCKED despite visual/HTTP FIXTURE PASS; Resume board accessibility idle BLOCKED; physical pinch/live persistence/iOS/deployed privacy BLOCKED. Preserve those distinctions after capture links become historical references.

## Source/report preservation prerequisites

These are **not disposable screenshots/logs**. Next cleanup task must review/move any unique source into permanent locations before removing the containing tree. No source was moved in this documentation phase.

| Artifact | Existing permanent counterpart | Inspection finding / next action |
|---|---|---|
| Three `operation-ui-overhaul` Markdown reports | `docs/audit-history/android-readiness-20261008.md`, `crawls-independent-qa-20261008.md`, `ui-independent-qa-20261008.md` | Hash-identical copies confirmed; preserve permanent reports |
| `visual-polish-v2/prior-report.md` | `docs/audit-history/visual-polish-prior-report-20261008.md` | Hash-identical copy confirmed |
| `crawls-final/inspect-android-env.cjs`, `inspect-eas-env.cjs` | Same filenames under `scripts/qa/` | Hash-identical copies confirmed; preserve scripts |
| `visual-polish-v2/retest/five-tabs.mjs` | `scripts/qa/legacy-five-tabs.mjs` | Diff inspected: permanent copy adds output-directory creation; original is superseded |
| `consolidation-native/flows.mjs` | `scripts/qa/native-consolidation-flows.mjs` | Permanent harness expanded by later focused fixes; files differ. Review substantive diff before deleting original source copy |
| `consolidation-native/gallery.mjs` | `scripts/native-wingdex-gallery-qa.mjs` | Permanent harness expanded by later smoke fixes; files differ. Review substantive diff before deleting original source copy |
| `consolidation-native/matrix.mjs` | `scripts/native-v2-closure.mjs` | Files differ; do not assume duplicate from filename/header. Preserve unique matrix behavior if any |
| `consolidation-native/metro-launch.ps1` | No exact permanent counterpart established | Preserve useful recovery launcher or document reproducible replacement before deletion |
| `consolidation-native/image-faults/metro-launch.ps1` | Handoff currently references this path for recovery | Preserve/move launcher and update recovery reference before deleting containing evidence directory |

Permanent QA scripts, tests, fixtures, documentation and migrations must remain. In particular preserve `scripts/qa/native-image-server.mjs`, `native-image-faults.mjs`, and development fixture/release guards. Do not print launcher environment values or signed URLs while reviewing.

## Other outputs and exclusions

| Location | Tracking/inspection | Action classification |
|---|---|---|
| `dist/` | Ignored/untracked; 44 files, 14,712,204 bytes (1 HTML, 1 JSON, 22 PNG, 19 TTF, 1 JS) | Generated web export, not an HTML QA report. Ownership/need not re-established here; retain unless task-specific generation is confirmed |
| `artifacts/qa-image-regression/` | Exists, zero files | Empty directory; no evidence to remove |
| `artifacts/customization-tournament/` | 12 tracked deliverables, including PDF/PNG/HTML, Markdown, JSON and `generate.py` | Unrelated source/deliverables; preserve all |
| `assets/`, design references, source image directories | Application assets/source material | Preserve, including mascot/logo images reused by fixture server |
| `tests/fixtures/`, permanent scripts/tests | Source fixtures/test infrastructure | Preserve; ignored `approvedPhoto.local.json` may contain historical signed URLs, do not expose or treat as generated screenshot |
| `docs/` and `docs/audit-history/` | Documentation, much currently untracked | Preserve; being untracked does not make a file disposable |
| `android/` build trees, `.expo/`, dependency caches | Existing native/cache infrastructure; task-exclusive ownership not established | Preserve; no indiscriminate cache/build cleanup |
| Sibling Jalapeno/growth-command-center/deployment files and other user backups | Outside current QA cleanup scope | Preserve all unrelated work |

No root-level `.log`, `.png`, `.mp4`, `.webm`, `.html` or `.zip` files were found. Emulator-side temporary files were not inventoried through ADB in this documentation phase; do not claim device cleanup. No broad scan of unrelated sibling assets/caches was performed.

## Task outputs outside the repository

Under `C:/Users/Brand/AppData/Local/Temp/`:

| Directory | Files | Bytes | Classification |
|---|---:|---:|---|
| `buffago-consolidation-20261009-091259/` | 82 | 12,118,590 | Recovery snapshot confirmed present; **preserve**, never treat as disposable QA output |
| `buffago-consolidation-hermes/` | 101 | 42,153,582 | Generated export candidate, subject to exact ownership/path confirmation |
| `buffago-consolidation-final-hermes/` | 58 | 26,904,810 | Generated export candidate |
| `buffago-consolidation-verified-hermes/` | 58 | 26,905,598 | Generated export candidate |
| `buffago-consolidation-closure-hermes/` | 58 | 26,906,142 | Latest earlier Android/iOS export evidence; conclusions preserved |

Thirteen matching task logs found: `buffago-consolidation-{android-build,client-final,closure-hermes,docker,final-hermes,final-lint,final-tests,full-tests,hermes,lint,migration,security-scan,verified-hermes}.log`. No `buffago-final-hermes*` entry found in this inventory. Delete only exact verified task-owned paths in a later scope; never use a broad Temp wildcard. Temporary fault server/Metro 8085 were stopped during the completed image phase; existing Metro 8083/unknown 8081 were preserved. Inventory does not authorize stopping other processes.

## Original cleanup plan (completed within safe scope)

The cleanup used a hashed explicit-file dry-run manifest, checked resolved absolute containment and reparse points, preserved source contents first, and removed verified files through native PowerShell literal paths. Empty directories were removed only after confirming they contained no entries; no broad recursive deletion. No `git clean`, history changes, migrations, application assets, source fixtures or unrelated-file deletion. Recovery snapshot preserved; verification blockers remain unresolved.

Historical gallery readiness documents an earlier removal of 301 exports/log files. That earlier operation is separate from this inventory and does not establish current cleanup completion.

## Cleanup dry run — 2026-10-09

Reconfirmed original 1,068-file scope. Current bytes increased by 188 to 229,365,894 because an active Metro log changed; this is not a new QA file.

| Classification | Files | Bytes | Planned handling |
|---|---:|---:|---|
| DELETE repository generated evidence | 1,054 | 229,287,230 | Explicit hashed file manifest; PNG/XML/JSON/log/TXT only |
| PRESERVE source/report contents | 12 | 54,902 | Five exact copies preserved in scripts/qa; six existing identical counterparts; one reviewed helper superseded by directory-creation fix |
| REVIEW active locked Metro logs | 2 | 23,762 at dry run | Leave untouched; no stopping running Metro |
| DELETE external task exports | 275 | 122,870,132 | Four explicitly named Temp export trees, no reparse points |
| DELETE external task logs | 13 | 1,022,100 | Thirteen exact task-owned paths |
| REVIEW dist export | 44 | 14,712,204 | Ownership still ambiguous; leave untouched |

No tracked deletion candidates, no source fixtures in the candidate trees, and no unrelated files selected. Six hundred two pre-existing non-document source files were hashed for preservation verification. Application/test searches found no deleted QA evidence used as a runtime fixture. Permanent QA scripts reference these paths as output destinations or optional comparison/contact-sheet inputs; recreate evidence through authorized QA before using those utilities. No script functionality changed.

Five exact source copies now exist at `scripts/qa/archive/consolidation-{flows,gallery,matrix}-20261009.mjs`, `scripts/qa/metro-native-fixture.ps1` and `scripts/qa/metro-image-fault-fixture.ps1`. Archived scripts are historical reference, not a new framework. The image-fault recovery launcher reference in the handoff was updated. Markdown links to disposable evidence were retired before deletion; recorded test conclusions and BLOCKED distinctions were preserved.

## Final cleanup result — 2026-10-09

PASS within explicitly selected scope. **Removed 1,354 original-path files / 353,234,364 bytes:** 1,054 repository generated files, 12 original source/report copies after preservation, 275 external export files and 13 external task logs. **Tracked removals: 0. Repository ignored/untracked removals: 1,066.** Source contents were preserved before removal (five exact new copies, six existing identical counterparts, one superseding helper). Those bytes are not a net disk-space estimate.

The 12-source snapshot table above describes original files; seven permanent counterparts already existed. Three historical helpers and two launchers now live under scripts/qa, with archive README. Four report counterparts remain under docs/audit-history; capture links in the prior V2 report were retired without changing conclusions.

Remaining selected generated files: exactly two active Metro logs, metro-fresh-stderr.log and metro-fresh-stdout.log in artifacts/consolidation-native. Their measured size during verification was 24,780 bytes and can grow. The other three selected repository trees and four external export trees are absent. All thirteen selected external logs are absent. Leave locked files untouched; no process was stopped.

REVIEW retained: dist (44 files / 14,712,204 bytes). PROTECTED retained: 82 recovery-snapshot files, 12 tracked tournament deliverables, source assets/design references/fixtures/test infrastructure/migrations/configuration/documentation, caches and unrelated files. No claim of zero generated artifacts across the repository or emulator.

Existing ignore entries remain sufficient and contain no application/fixture files after source preservation; no ignore changes. Final status is 43 dirty tracked / 117 untracked entries, zero tracked deletions; ignored active logs additional. All 602 pre-existing non-document source files match baseline hashes. Git diff --check passed (existing LF/CRLF conversion warnings only). No tests/builds rerun. Conclusions and BLOCKED/FAIL distinctions are unchanged.

No broad cleanup command, recursive indiscriminate deletion, staging, branch change, commit, deployment or production/database operation. An active-file lock, PowerShell parameter incompatibility, missing python executable and intentionally revised document hash caused safe preparatory stops; corrected before any deletion. Temporary manifest/ledger files created for this cleanup are removed after final verification; recovery snapshot is not a cleanup candidate.

Documentation reference check: 27 local links across affected reports checked, zero missing targets and zero Markdown links to deleted evidence. Seventy-four evidence links were retired; the preserved prior V2 report now links to its permanent docs/audit-history copy. Remaining artifact paths are historical identifiers or regenerated harness output locations, not live evidence links.
