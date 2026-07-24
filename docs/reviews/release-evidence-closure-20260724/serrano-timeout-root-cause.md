# Serrano Timeout Root Cause

Prior evidence recorded an external 120-second timeout for `run_serrano.py discover`. The workflow is a multi-wave sequence: three reviewers, PM synthesis, three strategic reviewers, PM refinement, three final reviewers, and PM final synthesis. The configured per-worker timeout is 900 seconds with one retry; the full workflow is therefore expected to exceed a 120-second caller limit.

The repository implementation already had bounded worker execution, retry, resumable state, per-worker artifacts, and failed-worker recording. It did not have a caller-level progress stream that could make a long run visibly distinguishable from a hang. The fresh run completed in 344 seconds. During that run, Windows subprocess reader threads emitted `UnicodeDecodeError` because `subprocess.run(..., text=True)` used the cp1252 default against UTF-8 output. That was repaired in `Agents/Serrano/serrano/codex_runner.py` with explicit UTF-8 and `errors="replace"`.

Fresh validation: `python .agents\skills\serrano\scripts\run_serrano.py discover` completed with run `2026-07-24T110924`, status `awaiting_approval`, phase `final_product_plan`, 12 completed workers, 0 failed workers. Serrano tests: 15 passed.

No evidence of deadlock, hidden input, or false completion was found. Partial outputs and state were preserved. The caller must allow more than 120 seconds or use resume/status polling.
