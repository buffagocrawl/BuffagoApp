# Security prevention controls

Present:

- `.env` and credential-file ignore coverage
- placeholder-only environment examples
- tracked-tree/staged redacting scanner
- PR/main CI gate
- generated Expo-output rejection
- public-vs-server configuration guidance
- Cayenne/Serrano redaction and production mutation gates

Remaining:

- verify GitHub secret alert and branch protection
- run an established full-history scanner in CI/on incident response
- centralize application log redaction and test OAuth/push-token cases
- fail builds if privileged variables enter client bundles
- scan generated binaries/source maps before publishing
- complete key split/proxy/restrictions, live RLS, and rotation proof
