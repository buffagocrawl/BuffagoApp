# Official-brand investigation â€” PR #54, 2026-11-05

Historical discovery snapshot. The [merge-readiness review](merge-readiness-2026-11-05.md) accepts 15 verified locations for the initial pilot; the earlier 23-location target is no longer a merge or pilot gate.

This supersedes the coverage totals in the earlier discovery-continuation report. Publishing remains disabled (`COMMUNITY_SPOTLIGHT_ENABLED=false`). No source-record changes, manual handle mappings, publication, or merge occurred.

## Result

Investigated all **27** previous `official_brand_unconfirmed` cases. Many bounded search responses led to unrelated dictionaries, entertainment, retail or software sites; those were correctly rejected, rather than legitimate restaurant pages rejected by name matching. Added **11** website hints (35 total) and **11** destination/official-host-bound brand alias rules with official evidence URLs. No general fuzzy matching or location-suffix stripping was introduced.

All **18** destinations with changed hints or aliases received fresh private-cache verification. The other nine retain valid cached failures because no supportable alias or new official-site hint was established. Their public discovery was investigated separately in bounded requests; no unrelated result was promoted to official evidence.

Three bounded writable preview runs finished the rechecks, including one initially deferred restaurant. A final read-only preview reused all **53** cache records and performed no cache writes. Private cache history was retained rather than deleted. Coverage among 61 eligible photos / 53 eligible locations is now **15 verified, 30 unresolved, 8 unavailable, 0 deferred** (28.3% verified). This adds six verified locations and remains eight below the earlier target of 23. Of the original 27, six now verify, 18 remain unresolved and three are unavailable; only nine still have primary reason `official_brand_unconfirmed`.

## Newly verified

- **Nine-Eleven Tavern** â€” @nineeleventavern; [exact-location official evidence](https://www.nineeleventavern.com/).
- **J Timothy's Tavern** â€” @jtimothys; [exact-location official evidence](https://jtimothys.com/).
- **Taco Mac Duluth** â€” @tacomacofficial; [exact-location official evidence](https://tacomac.com/locations/3543-peachtree-industrial-blvd-duluth-ga-30096/).
- **Sharky's Wings & Raw Bar** â€” @sharkyswingsclifton; [exact-location official evidence](https://www.sharkyswingsnj.com/east/).
- **The Blind Rhino - Bridgeport** â€” @blindrhinobar; [exact-location official evidence](https://www.theblindrhino.com/location/black-rock/).
- **The Bando** â€” @thebando_atl; [exact-location official evidence](https://www.thebandoatl.com/).

## Safety and cache behavior

Aliases are bound to the destination UUID, unchanged original source name, address, city, state, and exact official hostname (www/non-www equivalent only). Reviewed variants are accepted only in the homepage brand gate and official location-page/Restaurant JSON-LD name checks. Alias entries contain no handles. Exact street/unit/city/state/ZIP matching, source-city consistency, chain ambiguity and conflicting-handle rejection remain intact. Brand aliases cannot supply a missing address or copy a homepage account onto a location without an explicit profile link there.

Alias contents participate in the destination fingerprint, invalidating affected cached failures while leaving unrelated caches usable. Seed changes retain their existing fingerprint invalidation behavior. Regression tests cover cached failure â†’ fresh verification â†’ cache reuse, mismatched source identities and official hosts, malformed rules, contradictory source cities, wrong addresses, multi-location ambiguity, conflicting accounts and exact-location JSON-LD.

## All 27 dispositions

A primary reason is the last observed failure, not proof that all prior gates passed on every fetched page. Website hints identify where to investigate; they do not authorize tags.

| Restaurant | Current outcome | Primary reason | Website hint / reviewed evidence |
| --- | --- | --- | --- |
| Las Chidas | unavailable | `website_http_403` | [Official-site hint](https://laschidascapecod.com/) |
| Randy's Wooster Street Pizza | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| Zupko's Tavern | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| Paddy's Pizza | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| Nine-Eleven Tavern | verified | `verified_exact_location` | [Official-site hint](https://www.nineeleventavern.com/) |
| Yellow King Brews | unresolved | `location_mismatch` | [Official-site hint](https://www.yellowkingbrews.com/) |
| Dan's Pizza "In the Mont" | unavailable | `website_unavailable` | [Official-site hint](https://dans-pizza.co/in-the-mont/) |
| J Timothy's Tavern | verified | `verified_exact_location` | [Official-site hint](https://jtimothys.com/) |
| Zaddy's KC | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| Adolf's Old First Ward Tavern | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| Taco Mac Duluth | verified | `verified_exact_location` | [Official-site hint](https://tacomac.com/locations/3543-peachtree-industrial-blvd-duluth-ga-30096/) |
| 30 Burgers & Brews | unresolved | `location_mismatch` | [Official-site hint](https://www.30burgers.com/new-website/locations/30-burgers-new-brunswick) |
| Gridiron Sports Bar | unavailable | `website_unavailable` | [Official-site hint](https://gridironsportsbar.com/) |
| Chicken or the Egg Beach Haven | unresolved | `chain_ambiguity` | [Official-site hint](https://letschegg.com/) |
| Nicky's Place Bar & Pizza | unresolved | `location_mismatch` | [Official-site hint](https://www.nickysplacect.com/) |
| Riverside Cafe | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| Sharky's Wings & Raw Bar | verified | `verified_exact_location` | [Official-site hint](https://www.sharkyswingsnj.com/east/) |
| Duffy's Sports Grill | unresolved | `location_mismatch` | [Official-site hint](https://www.duffysmvp.com/) |
| Archie Moore's - Wallingford | unresolved | `location_mismatch` | [Official-site hint](https://www.archiemoores.com/) |
| FishBurger | unresolved | `location_mismatch` | [Official-site hint](https://fishburgerusa.com/) |
| The Blind Rhino - Bridgeport | verified | `verified_exact_location` | [Official-site hint](https://www.theblindrhino.com/location/black-rock/) |
| Hard Hat Tavern | unresolved | `official_brand_unconfirmed` | [Official-site hint](https://www.hardhatcafect.com/durham/) |
| Buff's Pub | unresolved | `no_instagram_link` | [Official-site hint](https://buffspub.com/) |
| The Bando | verified | `verified_exact_location` | [Official-site hint](https://www.thebandoatl.com/) |
| Champs Cheesesteaks And Hoagies | unresolved | `official_brand_unconfirmed` | No verified official-site hint |
| E.B's Restaurant | unresolved | `location_mismatch` | [Official-site hint](https://www.ebsrestaurant.com/) |
| CHEESSTEAKS | unresolved | `official_brand_unconfirmed` | No verified official-site hint |

## Remaining blockers

- **Yellow King:** official site says 920 S Colony **Rd**, source says 920 S Colony **St**. The alias solves the brand spelling only; the street contradiction remains rejected.
- **FishBurger:** the official Oakland Park block supplies the street/city/state but not the required ZIP; its broader site also describes multiple locations. Do not infer the ZIP or reuse a global account.
- **E.B's:** official static text gives street/city/state without a qualifying complete ZIP-bearing location block or profile link. The EB's alias does not fix missing evidence.
- **30 Burgers:** the official location block spells out New Jersey rather than matching the verifier's two-letter state form; no qualifying profile link was established. Do not claim this as a verified Instagram identity.
- **Nicky's, Duffy's, Archie Moore's:** fetched pages did not produce a qualifying exact-location address/account pair. Brand recognition alone is insufficient; directory/footer accounts are not branch verification.
- **Chicken or the Egg:** official homepage includes multiple locations/accounts and reports Beach Haven closed early for the season until 2027. Chain ambiguity remains blocked.
- **Buff's Pub:** official site profile links use HTTP rather than the HTTPS profile URLs accepted by the verifier. No handle was inferred or guessed and the existing URL policy was preserved.
- **Hard Hat:** homepage has no usable brand metadata, while the Durham route is a loading shell. No alias can turn missing official content into location evidence.
- **CHEESSTEAKS:** homepage is a static shell with no brand metadata. A product page naming the brand cannot substitute for the required official homepage identity and exact-location account evidence.
- **Randy's, Zupko's, Paddy's, Zaddy's, Adolf's, Riverside Cafe, Champs:** current bounded discovery has no qualifying official homepage/location evidence; search matches and third-party/social-directory claims were not treated as authoritative account proof. Champs' directory candidate explicitly says it is not the official website; no alias was added for it.
- **Las Chidas, Dan's Pizza, Gridiron:** new hints expose HTTP 403/unavailable sites rather than brand mismatches. They fail closed.
- Previously documented Wild Wing Cafe unit, Redding Roadhouse city, Stack House location and other unavailable-site blockers remain unchanged.

## Private preview and validation

Regenerated `.tmp/spotlight-alias-final/photo.jpg`, `caption.txt` and `verification-report.json` remain ignored and private. Visually reviewed the 1080Ã—1350 image: complete contained wing photo, readable 83.00/100 score and 2-rating count, no overlap. Caption includes Tomaselli's exact Providence address and verified **@tomasellisrestaurant**, attribution and download/try/rate CTA. This is a private preview, not live Instagram mention rendering evidence.

Local relevant tests: **318 passed, 2 skipped** (local media-tool integration unavailable). `git diff --check` passes. Latest-head GitHub CI must pass before any merge; see PR checks for final run results.

Activation still requires evidence/coverage review, approved merge, main-branch read-only plan and Meta credential/account/permission checks, followed by separate authorization to enable publishing. Keep the flag false until then.
