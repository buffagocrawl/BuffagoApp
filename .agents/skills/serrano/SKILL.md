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

Natural-language routing:

- map natural-language requests onto the supported commands above
- examples: `$serrano show latest status`, `$serrano resume the latest run`, `$serrano approve current run`, `$serrano run security review for 2026-07-11T110717-c87cb76f`
- free-text is used only to infer the supported command and run id; Serrano's current orchestrator does not accept arbitrary custom scope text

Execution rule:

- prefer `Agents/Serrano/.venv/Scripts/python.exe` when it exists; otherwise use `python`
- launch `.agents/skills/serrano/scripts/run_serrano.py` and pass the requested command or natural-language request through unchanged
- do not implement product changes during discovery
- require explicit approval before build
- preserve Serrano's own run state, resume behavior, approval gate, and concurrency controls
- after execution, summarize the run id, status, current phase, approval state, and key artifact paths for the user
