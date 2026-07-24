# Maestro authoring

Use registry IDs, visible text only for Android system dialogs, and conditional commands for dialogs that may not appear. Each flow declares tags, screenshots meaningful checkpoints, assertions, and cleanup. Credentials are environment variables supplied by the runner, never literals in YAML. Start with `cayenne/flows/bootstrap` and compose suites from it.
