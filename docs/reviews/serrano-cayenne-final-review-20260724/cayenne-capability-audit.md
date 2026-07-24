# Cayenne capability audit

Cayenne has two implementations. `Agents/Cayenne/` is a versioned contract runtime whose execution adapter always returns `inconclusive`. The active Android runtime is `cayenne/`, invoked by `scripts/cayenne/*.ps1`. Serrano's `Agents/Serrano/serrano/cayenne_integration.py` imports the older implementation, so direct automatic consumption of the active runtime is incomplete.

| Capability | Supported | Command | Evidence format | Limitation |
|---|---:|---|---|---|
| Location/config | Yes | `cayenne/`, `cayenne/config/environments.json` | JSON/YAML | Duplicate older runtime exists |
| Maestro | Yes | `maestro test <flow>` via `run_runtime.py` | JUnit, commands, PNG, logs | Android only |
| Android emulator | Yes | `run.ps1 -Suite smoke` | result JSON, PNG, XML, logcat | Requires installed AVD/dev client/Metro |
| Physical Android | Conditional | `-DeviceId <id>` | Same | Not exercised this cycle |
| iOS | No active adapter | None | None | Windows; schemas only mention iOS in old runtime |
| Web UI | No active driver | None | Export evidence only | No browser navigation adapter |
| Screenshots | Yes | runtime/ADB/Maestro | PNG | Android runtime only |
| UI hierarchy | Yes | ADB `uiautomator dump` | XML | Android only |
| App logs | Yes | ADB logcat/Metro/Maestro | Redacted text | Redaction is pattern-based |
| Navigation | Partial | smoke/exploratory flows | Assertions/screenshots | Only selectors currently implemented |
| Deep links | Bootstrap dev-client URL only | Android lifecycle | Runtime JSON | Product notification/referral deep links absent |
| Reset state | Yes | `-ResetApp`, reset flow | Screenshot/result | Not used against production |
| Switch accounts | No proven adapter | QA auth flow only | None this cycle | Needs disposable QA users |
| Authentication | QA email conditional | `smoke-authenticated` | Result JSON | OAuth unsupported; credentials absent |
| Supabase scripts | Safety/config awareness only | runner safety gate | JSON | No DB assertions/fixtures implemented |
| Machine-readable result | Yes | `result.json` | Contract v1.0 JSON | Two incompatible result contracts |
| Serrano direct consumption | Partial | `--SerranoReview` | `serrano/response.json` | Serrano Python integration points to older runtime |
| App state cleanup | Yes | owned PID manifest/cleanup | JSON | A timed caller can interrupt before result finalization |

Integration disposition: confirmed tooling defect, P2. Acceptance criteria are one canonical contract, active-runtime invocation from Serrano, bounded caller behavior, and an ingestion test using an active-runtime result. It was not repaired because the current Serrano run is awaiting owner approval and the defect does not invalidate preserved Cayenne evidence.
