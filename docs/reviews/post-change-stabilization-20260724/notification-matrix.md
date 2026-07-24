# Notification test matrix

| Type | Trigger / audience | Deep link | Code/contract result | Device result |
|---|---|---|---|---|
| Streak reminder / at-risk | qualifying-state scheduler / opted-in user | home daily engagement | SQL suppression/dedupe contracts pass | Pending |
| Mission completion | server completion / user | home | reward and notification boundaries reviewed | Pending |
| Referral accepted/qualified | trusted referral lifecycle | referrals | referral SQL/idempotency contracts pass | Pending |
| Friend request/activity | social event / permitted recipient | friends activity | deep-link parser pass | Pending |
| Crawl reminder / nearby | crawl/geofence | crawl | proximity/deep-link contracts pass | Pending |
| Buffaverse unlock/progress | default-off server boundary | no production route contract established | Buffaverse notification contract pass | Pending |
| Passport/badge/reward | server milestone | destination requires live confirmation | source only | Pending |

Permission states, invalid-token cleanup, provider delivery, foreground/background/terminated behavior, time zones, and real deep-link opens remain unvalidated because no supported device/provider session was available.
