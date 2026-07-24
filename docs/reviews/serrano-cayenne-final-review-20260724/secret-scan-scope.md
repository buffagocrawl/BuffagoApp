# Secret scan scope

Scanned: 1,082 tracked files; ignored/untracked names; reachable commits across local and remote-tracking refs, tags, merge commits, stash refs, and deleted generated bundles; existing web/mobile exports; Cayenne, Maestro, Serrano, logs, review reports, Supabase configuration/migrations, Expo/EAS config, native credential filenames, and GitHub workflows/PR evidence.

Tools: repository scanner `scripts/security/scan-secrets.mjs`; targeted redacting history scanner `Agents/Jalapeno/scripts/audit_secrets.py --history`; `git grep`/history metadata; targeted filename/config review; Expo export; connected GitHub PR/workflow evidence. Gitleaks, TruffleHog, and `gh` were unavailable.

No report contains a complete credential.
