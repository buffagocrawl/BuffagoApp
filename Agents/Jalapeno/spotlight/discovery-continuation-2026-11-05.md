# PR #54 discovery continuation — 2026-11-05

Historical discovery snapshot. The [merge-readiness review](merge-readiness-2026-11-05.md) accepts 15 verified locations for the initial pilot; the earlier 23-location target is no longer a merge or pilot gate.

Publishing remains disabled: repository variable `COMMUNITY_SPOTLIGHT_ENABLED=false` was read back through GitHub. No merge, publication, test post, source-record mutation, or daily publication reservation was performed.

## Coverage

Six bounded writable preview runs advanced the existing private append-only verification cache. Each run retained the existing 32-request/90-second discovery limits; cached failures were reused and deferred results were not cached. Final read-only preview reused cached results for all 53 distinct otherwise-eligible restaurant locations (61 eligible photos):

| Outcome | Locations |
| --- | ---: |
| Verified | 9 |
| Unresolved | 39 |
| Unavailable | 5 |
| Deferred | 0 |

Verified coverage is **9/53 (17.0%)**, 14 below the requested 23. All formerly deferred locations now have an outcome. This is identity-verification coverage among the current consent/moderation/score/cooldown eligible pool, not a promise of 9 consecutive successful publications. Asset availability and eligibility are rechecked at publication time.

Twenty additional official website hints bring the registry to 24. Hints do not authorize tags. No manual handle mappings or verification rules were changed. An inaccessible Zupko's domain was investigated but omitted from the final hints because its official content could not be verified.

## Evidence blockers

Final primary reasons: 27 official-brand-unconfirmed, 10 HTTP 403, 3 location mismatches, and one each cross-host redirect, HTTP 202, unavailable website, and HTTP 404. Some unresolved results contain multiple failure reasons; primary reason is the last observed failure, not an exhaustive diagnosis. The five unavailable results are Southwood Bar, Stack House, Beachland Tavern, Duff's Famous Wings, and Porky's Cafe.

- Wild Wing Cafe: the official Chesapeake page lists **Unit 120**, while the source address says **#20**. Do not equate these units or borrow the linked account. [Official location](https://www.wildwingcafe.com/location/chesapeake-va).
- The Redding Roadhouse: official content and the source street address say Redding, but the source's separate city field says **Wilton, CT**. Strict location verification correctly rejects this contradiction. [Official site](https://www.thereddingroadhouse.com/).
- Windward Tavern: the bounded static location-page response does not supply the required complete address. Keep unresolved. [Location page](https://www.windwardtavern.com/location).
- Stack House: official content currently identifies Kingston, while this source location is Providence. The fetcher also received HTTP 403. [Official site](https://stackhouseus.com/).
- Southwood Bar: bounded fetch receives HTTP 403; browser-accessible official content also uses West Deptford where the source says Woodbury. No city equivalence was assumed. [Official site](https://southwoodbar.com/).
- J Timothy's Tavern, Yellow King Brews, Hard Hat Tavern, The Bando and several location-suffixed chain names fail the existing exact brand gate despite plausible official website hints. No aliases were invented and no name gate was relaxed. Chain-wide footers/search snippets cannot establish branch-specific accounts.
- Chicken or the Egg's official page reports Beach Haven closed early for the season until 2027; it also contains multiple locations. This remains unresolved and needs operator review before any future selection. [Official site](https://letschegg.com/).

## Private preview and validation

Final read-only artifacts: `.tmp/spotlight-continuation-final/{photo.jpg,caption.txt,verification-report.json}`. All 53 verification results were cache hits; cache writes were false. Private photos, captions and per-location reports remain ignored and are not uploaded to public CI artifacts.

Visually reviewed the regenerated 1080×1350 JPEG: the wing photo is contained with side margins; score **83.00/100** and **2 ratings** are readable with adequate contrast, without overlapping text. Caption identifies Tomaselli's at Rosario, its full Providence address, and verified **@tomasellisrestaurant**, followed by credit and the download/try/rate CTA. The handle is backed by exact-location official-site evidence. This review does not verify how Instagram will render a future live mention.

Local workflow-equivalent tests: **299 passed, 2 skipped** (local media integration tools unavailable); `git diff --check` passed. Previously cancelled Guess the Wing Spot recovery run **42055393606** was rerun successfully, including CI's installed FFmpeg/Tesseract environment. Community spotlight checks and secret/public-config scan also passed on pre-continuation head `7e609b1`. Check the latest PR head's CI before merge; older-head results do not prove the pushed head.

## Remaining activation steps

1. Resolve identity/location contradictions through separately authorized source-owner review or exact-location official evidence; do not alter source data as part of this PR continuation. Seek more qualifying locations before claiming 23-location coverage.
2. Review the private preview and require all latest-head PR checks to pass, then obtain approval to merge.
3. After merge, run the main workflow's read-only plan and validate existing secrets, pinned Meta API version, expected Page/Instagram identity and permissions.
4. Obtain separate authorization to enable `COMMUNITY_SPOTLIGHT_ENABLED`; retain false until then. No test publication is needed for these checks.
5. After authorized activation, inspect the first scheduled publication's actual media ID and private recovery state. Investigate uncertain outcomes without clearing reservations or replaying POSTs blindly.
