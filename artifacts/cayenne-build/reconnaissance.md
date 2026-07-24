# Cayenne reconnaissance

## Existing capabilities

- Buffago lives in `crawl/` and is Expo SDK 54 / React Native 0.81 with Expo Router.
- Serrano is a Python orchestrator in `Agents/Serrano/serrano`; it already has run state, workers, evidence manifests, approval gates, and tests.
- Existing Node tests cover authentication, referrals, engagement, Buffaverse, migrations, and RLS contracts.
- Android SDK tools (`adb`, `emulator`), Java, Node, npm, and Python are detected on this machine.

## Gaps and risks

- Maestro is not detected; Playwright is not currently declared in the app package.
- No QA Supabase identity was present in the environment during reconnaissance.
- The worktree contains pre-existing user modifications; no existing file was reset or overwritten.
- Native execution requires a configured emulator, development build, and QA session adapter.

## Proposed ownership

- `Agents/Cayenne/cayenne`: contracts, lifecycle, fixture policy, Serrano adapter.
- `Agents/Cayenne/schemas`, `journeys`, `fixtures`: reviewed QA inputs.
- `scripts/cayenne`: Windows operator entry points.
- `Agents/Serrano/serrano/cayenne_integration.py`: Serrano boundary.
- `crawl/lib/cayenne*.ts`: guarded test mode and selector registry.

## Dependency map

Serrano request -> Cayenne contract validation -> runtime/artifacts -> result validation -> Serrano ingestion/decision -> Review Evidence consumer.

## Parallel plan

Contracts and safety were implemented first; runtime, fixtures, selectors, and Serrano ingestion are separable. Native journey execution and visual baselines remain gated by local tools and QA credentials.

