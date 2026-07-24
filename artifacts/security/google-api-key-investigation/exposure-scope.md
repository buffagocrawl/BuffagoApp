# GitHub Exposure Scope

- **VERIFIED:** repository `buffagocrawl/BuffagoApp` is public.
- **VERIFIED:** alert value exists in current local `main` and `origin/main`
  before remediation.
- **VERIFIED:** the first value-bearing commit is `7f1efc7`; 15 locally reachable
  commits contain the blob.
- **VERIFIED:** the commit entered `main` through PR #3.
- **VERIFIED:** no local tag contains the introduction commit.
- **VERIFIED:** public repository UI reported zero forks.
- **VERIFIED:** public repository UI showed no releases.
- **UNKNOWN:** GitHub Actions artifact contents and retention.
- **UNKNOWN:** private forks, clones, caches, downloaded archives, and GitHub
  internal caches.
- **BLOCKED:** alert API metadata and authenticated Actions artifact enumeration;
  GitHub CLI is unavailable and the connected app does not expose secret alerts.

The alert points to a current tracked file, not only a historical orphaned blob.
Removing it from the next tree does not revoke it and does not remove historical
or PR access.
