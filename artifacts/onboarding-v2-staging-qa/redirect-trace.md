# Actual native onboarding/auth continuity trace

See `navigation-native.log` (adb logcat device clock, EDT), `actions.jsonl` (host UTC), `server-event-timeline.json` (server UTC). Device time drifted by tens of seconds; event order within each clock is reliable, clocks are not treated as perfectly synchronized. All accounts/venues/media are isolated synthetic data. IDs and identities are redacted.

## First fresh guest -> real signup -> upload

Native device sequence, PID 4214:

1. `10:36:02` `/home` -> `/onboarding`: expected fresh-data gate. Welcome/search/scores 8/7/6/9/result captured.
2. `10:38:11` Home deliberately placed underneath auth by V2 completion, then `10:38:12` `/auth/login`.
3. `10:38:31` real `SIGNED_IN`, `10:38:33` exactly one `/profile/wing-shots/submit`. Correct restaurant visible, no competing Home/Welcome/profile/preferences redirect.
4. Native scoped picker; wrong QA screenshot selection canceled before confirmation, corrected to synthetic grid, crop explicitly confirmed, anonymous attribution and consent selected, Submit pressed.
5. `10:40:57` upload success. Native under-review UI and real persisted `in_review` receipt, null rating ID, correct venue/account. No canonical rating/preview import.
6. `10:41:46` Done -> `/home`. Cold process PID 6322 restores real session -> `10:42:11` `/home`, no uploader/celebration/onboarding.

SQLite + server-verified receipt after first restart: completion key `buffago:onboarding_done_v3=1`, both legacy keys true, canonical local preview retained with 8/7/6/9, intent absent after destination acknowledgment, real nonanonymous session, exactly one onboarding photo. No credentials included.

## Signout/signin and defect

1. PID 6322 profile -> `10:43:38` `SIGNED_OUT` -> `10:43:40` guest Home. No `/onboarding`.
2. Password signin emits real `SIGNED_IN`. An initial image was captured too early while fields remained visible, excluded privately. Cold restart PID 7069 restored a real verified session to Home. This alone did not establish an immediate post-signin Home landing.
3. Later repeated signout/auth Explore/retry explicitly waited for Home before restart. Authentication succeeded but the no-intent return remained blank through a 45s UI poll. `android-31-stable-home-after-relogin.png` is **FAIL**, despite its intended-state filename. XML has underlying auth fields redacted. Cold restart recovery (32) was not counted as a pass for this landing.
4. Fixed login's no-intent Home navigation from modal `replace` to `dismissTo`. Duplicate listener guards and explicit Wing Shot route unchanged. Post-fix signin -> successful native Home poll at host **14:57:22Z**, Home screenshot **14:57:25Z** (33), before force-close. Real session receipt verified.
5. Post-fix force-close/restart -> signed-in Home (34); completion remains set, no pending intent or automatic uploader.

## Second fresh guest -> existing-account signin

Deliberate QA backup/app-data clear started a second fresh guest (not a product reset): PID 7393 `/home` -> `/onboarding`, rating 8/1/1/1, photo invitation -> Home underneath auth -> `/auth/login`.

`10:47:36` `SIGNED_IN` -> `10:47:39` one `/profile/wing-shots/submit`, correct synthetic venue. User explicitly closes uploader -> `10:48:08` Home. Cold process PID 8268 restores session -> `10:48:36` Home. Receipt verifies correct original account and zero additional submissions.

After the client fix, repeated the invitation from a deliberately reopened stored local preview. **QA explicitly issued `adb ... VIEW buffago://onboarding` after tapping Sign out**; that recorded `/onboarding` transition is not an automatic reset (the async SIGNED_OUT event arrived shortly after the explicit deep-link). After completion/CTA, native existing password signin returned once to the correct uploader:

- Host **14:59:21Z** (35), native PID 10067 `10:58:35` uploader.
- Explicit uploader close -> native `10:58:46` Home / host **14:59:32Z** screenshot (36).
- Cold process PID 10780 `10:59:14` Home / host **14:59:57Z** screenshot (37).
- Final receipt: verified same nonanonymous account, completion/compatibility keys true, local preview retained, no pending intent, exactly one in-review/null-rating upload, zero canonical ratings, private original denied to anonymous download.

## Bounds on the conclusion

Actual native email signup with confirmations off, password invitation handoff, cancellation and acknowledged/relogin cold restarts showed **no onboarding replay**. The ordinary-signin blank-screen defect was real and fixed, not relabeled a pass because restart worked. Auth listener/server timestamps and native UI support the exercised flows; no external OAuth or iOS claim is made. There was no verified delayed-email callback, alternate-account handoff or moderation approval in this campaign.
