# History Cleanup Plan

## Recommendation

**History cleanup recommended**, after rotation and team coordination.

Rotation/revocation is mandatory and is the only step that can make the leaked
value unusable. Rewriting history cannot make a previously public key
trustworthy. Cleanup is still worthwhile because the generated artifact is
large, the key remains in at least 15 commits, and future scanners will continue
to flag it.

Rewriting can disrupt collaborators, open branches, and local clones. GitHub
caches, PR refs, forks, Actions artifacts, and existing clones may retain old
blobs.

## Proposed procedure (do not execute until approved)

1. Confirm the old key is disabled and the replacement is deployed.
2. Freeze merges and notify all collaborators.
3. Make a recoverable mirror backup in a controlled location.
4. Install `git-filter-repo` outside production dependencies.
5. Build a replacement-text file locally that maps the complete compromised
   value to a non-secret marker. Never commit or paste that mapping.
6. In a fresh owner-controlled mirror, run:

   ```text
   git filter-repo --replace-text <local-redacted-mapping-file>
   ```

   Optionally remove the two generated directories from all history with
   `--path ... --invert-paths` after confirming no release dependency.
7. Re-run a full history scanner and compare refs.
8. Force-push only with explicit owner approval and branch-protection planning.
9. Recreate tags as required, invalidate artifacts/caches where possible, and
   instruct collaborators to reclone or carefully reset.
10. Verify GitHub alert state only after the old key is revoked.

No history rewrite or force push was performed during this investigation.
