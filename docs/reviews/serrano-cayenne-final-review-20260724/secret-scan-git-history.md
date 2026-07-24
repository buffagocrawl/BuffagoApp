# Git-history secret scan

Reachable history contains a confirmed Google API key exposure in a generated Expo web bundle.

- Finding: `SEC-001`
- Fingerprint: `AIza...j-Ck`
- First commit: `7f1efc7fe1642d9d3bf39fc2882fda820a71f5d4`
- Exposure: public repository, PR #3, then main ancestry
- Current tree: removed
- Active/revoked state: not independently verified
- History cleanup: recommended after verified revocation and coordination; not performed

Other high heuristic hits were the intentionally public Supabase anon JWT and a localhost Supabase development URL. They are documented false positives/public client configuration, not privileged secrets. Stash refs were included by `--all`; dangling-object coverage remains best-effort.
