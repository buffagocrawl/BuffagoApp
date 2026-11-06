# Merge readiness and limited pilot — PR #54

Reviewed November 5, 2026 on `feature/noon-community-spotlights`. The starting working tree was clean. No applicable AGENTS.md exists in the repository ancestors or the affected Jalapeno/spotlight/tests and workflow paths. Existing agent-specific instructions elsewhere were not applied to unrelated directories. Only spotlight implementation, regression tests and review documentation were changed.

**Recommendation:** ready for merge approval once the final commit's Community spotlight, recovery, and secret/public-config workflows pass. This is approval to merge disabled code, not authorization to publish. The next action after an approved merge is the main-branch read-only plan; publishing activation needs separate authorization.

The accepted initial pool is **15/53 verified restaurant locations**, with 30 unresolved, eight unavailable and zero deferred (61 otherwise-eligible photos). No 23-location requirement remains. These are current source/identity eligibility counts, not guaranteed successful future publications.

## Review findings and fixes

| Requirement | Review result and evidence |
| --- | --- |
| App score and threshold | `score()` in `spotlight/core.py` matches Wingdex `sumWeight/count` in `crawl/app/(tabs)/ratings/index.jsx`: null weight counts as zero and every rating contributes to count. Eligibility uses the unrounded average strictly greater than 80, with no invented minimum count; corrupt/out-of-range inputs fail closed. Caption rounds display only. |
| Photo approval, consent, attribution | Existing approval/recorded approver, consent timestamp and `wing-shots-v1`, non-withdrawn owner, moderation/wing approval or recorded override, abuse exclusions, processed asset and strictly positive Wing Jury majority are required. Required named credit is preserved; anonymous/opted-out users receive community credit. Sources only use GET/HEAD. |
| Rotation | Photo ID, destination ID and normalized complete physical address are excluded for 30 elapsed days after publication. Duplicate destination records at the same normalized address cannot evade rotation. Unresolved outcomes stay reserved without expiration. The series has its own ledger and cooldown. |
| Restaurant mention | Automatic/manual evidence binds name, street/unit, city, state and ZIP to official exact-location evidence. Reviewed aliases bind the original source identity and exact official host, and never supply handles or change addresses. Contradictions, ambiguous chains and conflicting accounts fail closed. |
| Schedule | Cron remains unchanged. Both UTC offsets are gated by America/New_York: 12:00 through strictly before 13:00 on Monday, Wednesday, Friday, Saturday and Sunday. DST transition fixtures pass. :00/:20/:40 recover the same dated state; delayed runs outside the slot are rejected. GitHub delivery is best effort. |
| Durable concurrency | Separate workflow concurrency plus atomic private claims, immutable state revisions, durable POST intents and write-readback checks protect concurrent attempts. Run-date binding prevents replay on another date. **Fixed:** prior ownership now checks `/actions/runs/{run}/attempts/{attempt}`, rather than the latest run status, so a completed attempt can release ownership during a same-run rerun without accepting an active or wrong-workflow/branch attempt. |
| Bounded conservative recovery | Three ordinary attempts per date and at most 12 claims; pending intents can only reconcile through reads. Unknown create responses are never recreated; unknown publish responses are never blindly retried. A known PUBLISHED container can reconcile success with conservative observation-time cooldown. Uncertain outcomes can require operator investigation; never clear reservations or replay POSTs to silence alerts. |
| Safe skips | Empty/unverified pools persist `no_eligible_candidate` / `no_verified_candidate` with aggregate verification counts, without weakening rules. **Fixed:** select and persist these terminal skips before Meta validation, so exhausted pools are accurately reported even when publishing credentials need attention. No Meta client, media signing or generated output upload is needed for a skip. |
| Last-moment validation | Before the final publish POST, re-read consent/moderation/ownership, score/count, attribution, asset availability and source image hash. New runtime regressions prove withdrawn consent, score drop to 80, attribution change and image replacement prevent the final publish POST. |
| Evening Reels | No evening scheduler, publisher, windows, claims or cooldown changes. The only shared-code PR delta is the existing overridable GET/HEAD table allowlist; the default Reel allowlist remains unchanged. Existing Reel publication/analytics and legacy publisher regressions pass. |

## Meta readiness — read-only

Required repository secret names are all present: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_LONG_LIVED_ACCESS_TOKEN, META_APP_SECRET, INSTAGRAM_BUSINESS_ACCOUNT_ID and FACEBOOK_PAGE_ID. Required pinned variables are populated: `META_GRAPH_API_VERSION=v25.0`, expected Instagram username `buffago`, expected Page name `Buffago`. `COMMUNITY_SPOTLIGHT_ENABLED=false` was read back. Secret contents were never retrieved, printed or compared.

The local authorized Meta token is stale: GET `/app` returns HTTP 401 / Meta 190 / subcode 460 (session invalidated by password change or security action). It is not the basis for deployment readiness. Local Supabase credentials remain sufficient for the private read-only preview. Refresh the local Meta credential securely before relying on future local diagnostics; this does not require a repository credential change.

The repository-backed [GET-only diagnostic run 42104396700](https://github.com/buffagocrawl/BuffagoApp/actions/runs/42104396700) passed using the actual GitHub repository secrets. The credential validation step confirms:

- Valid same-app USER token and app-secret proof, with token/data-access expiration outside the validator's 24-hour rejection boundary.
- Instagram **@buffago**, Facebook Page **Buffago**, and their configured ID linkage match the pinned expected identity.
- Grants: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_manage_posts`.
- Versioned Graph requests at pinned **v25.0** succeed; the existing adapter rejects a differing returned `facebook-api-version` header. Meta's documentation endpoint was rate-limited during this review, so live versioned requests are the operational evidence rather than a claimed documentation/EOL lookup.
- Instagram content-publishing quota endpoint is accessible. This is permission/access evidence, not a guarantee that future shared-account quota will remain available.
- Account-wide views capability probe also passed. All credential/account probes used **GET only**, with `publication_attempted=false`.

No media container, Meta media upload, publication, test post or credential rotation occurred. The workflow was explicitly dispatched with `mode=diagnostic`; its dashboard-feed publisher condition was false. No analytics/source records were written by this diagnostic.

## Private preview

Regenerated ignored local artifacts at `.tmp/spotlight-pilot-preview/{photo.jpg,caption.txt,verification-report.json}`. Default read-only mode; all 53 location results reused the private cache, with no cache writes or signed media URLs. No public artifacts were uploaded.

Visually inspected the 1080×1350 JPEG: the complete source photo fits the upper canvas with side margins; 83.00/100 and 2 ratings are readable without overlap. The caption identifies **Tomaselli's at Rosario**, **17 Rosario Dr, Providence, RI 02909**, and verified **@tomasellisrestaurant**, with factual description, **Photo: BuffaGo community**, hashtags `#BuffaGo #ChickenWings #WingLovers #Foodie #WingSpot`, and a download/try/rate CTA with link-in-bio language.

A fresh source read confirms average 83.0/count 2; recorded approval/approver and `wing-shots-v1` consent; accepted moderator/wing-verification overrides; positive Wing Jury majority; and the contributor's **anonymous** attribution preference. Community credit is correct for that preference.

**Tagging is a caption @mention only.** The image container receives `image_url` and `caption`; no `user_tags` field or photo-tag coordinates are sent. No live notification, rendered Instagram mention, or photo tag is claimed.

## Validation and pilot limits

Local regression: **367 passed, 2 skipped**, covering spotlight source/identity/rotation/DST/recovery, new fixes, guessing Reel publication and analytics, read-only credentials and existing photo publishers. The two skips require local FFmpeg/Tesseract integration tools; recovery CI installs these tools. `git diff --check` passes. Final-head CI run IDs/results are recorded in the PR description and must be green before merge approval; older-head or diagnostic success is not a substitute for final-head CI.

Fifteen locations are accepted for this pilot. At five scheduled days per week, there are about 21–22 slots per 30-day period but at most 15 distinct-location publications before cooldown; safe skips are therefore expected even if all 15 stay eligible. Multiple photos for one restaurant do not add location capacity. Consent withdrawal, score changes, asset availability, evidence expiry or unresolved outcomes can reduce the pool further. Do not reduce thresholds, repeat early or guess mentions to fill slots. Monitor the private ledger and health counts, especially after the first authorized post and any skip/uncertain outcome.

## Approval boundary

1. Obtain merge approval with final-head CI green; retain the flag false.
2. After the approved merge, run the **main-branch read-only plan** and review its current eligible/verified counts plus the private preview and read-only Meta readiness.
3. Obtain **separate publishing activation authorization**. Keep the unchanged five-day noon schedule and enable only when authorized; rollback is the false flag.
4. During the pilot, inspect the actual media ID/private state after each authorized run. Resolve uncertainty privately without resetting claims or replaying POSTs. GET-only checks and mocks do not prove a future live publication will succeed.
