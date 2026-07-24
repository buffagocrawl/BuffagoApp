# Generated Artifact Investigation

## Finding

Before remediation, 149 Expo-export files were tracked in:

- `crawl/output/`
- `output/buffaverse-web-correction/`

The repository already ignored `.expo/`, `dist/`, and `web-build/`, but not the
custom `output/` destinations. No package or CI script established a source-code
need for these files. The secret-bearing export was committed manually in
`7f1efc7` with other phase-2 evidence.

## Decision

These two Expo export directories should **not remain tracked**. They should be
created during CI/deployment and, when evidence retention is needed, stored as
access-controlled CI artifacts with explicit retention. Static web output is
necessarily public after deployment; removing it from Git does not make a
client key confidential.

Root `output/launch-video/` and `output/pics/` were not changed because they are
separate media artifacts and unrelated to the Expo export.

## Changes

- Added precise ignore rules for the two Expo-output roots.
- Removed their 149 files from the Git index while leaving local files intact.
- Added a scanner rule that rejects these paths if tracked again.
- Added CI scanning on pull requests and pushes to `main`.

No source map files were tracked in the identified exports.
