# `$serrano`

Use this skill to run Buffago's Serrano product-management orchestration system.

Default behavior:

- run discovery only
- stop at the approval gate
- preserve artifacts under `Agents/Serrano/runs/<run-id>/`

Supported commands:

- `$serrano`
- `$serrano status`
- `$serrano resume <run-id>`
- `$serrano discover`
- `$serrano approve <run-id>`
- `$serrano build <run-id>`
- `$serrano security <run-id>`
- `$serrano release <run-id>`
- `$serrano full`

Execution rule:

- launch `python .agents/skills/serrano/scripts/run_serrano.py ...`
- do not implement product changes during discovery
- require explicit approval before build

