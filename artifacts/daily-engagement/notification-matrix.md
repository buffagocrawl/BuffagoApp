# Notification Matrix

| Type | Purpose / eligibility | Suppression / dedupe / rate | Permission & preference | Deep link / fallback | Analytics | Copy data / privacy | Flag / tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Streak at risk | Help a 2+ day streak when today remains incomplete; early evening local | Recheck completion; once per local day; quiet hours; expiry at local midnight | OS allowed + `streak_at_risk` | `buffago://engagement/today` → home daily card; home fallback | queued/suppressed/sent/failure/open, streak_at_risk | Streak length only; no guilt | `streak_at_risk_push=false`; migration/deep-link tests |
| Comeback | Encouraging fresh start only if future evidence supports it | Separate preference/dedupe/rate; currently not queued | OS + `comeback` | engagement today; home fallback | standard pipeline | No prior-loss shaming | `comeback_push=false`; contract only |
| Friend rating | Confirmed friend commits an eligible visible rating | Unique rating key; block/removal/privacy/deletion recheck; quiet hours; 3-day expiry | OS + `friend_activity` | rating history item; home fallback | standard + friend-rating opened | Dispatcher uses generic safe copy; no presence/exact location | `friend_rating_push=false`; SQL/deep-link tests |
| Crawl proximity | Continue next incomplete active crawl stop | One stop/24h; one crawl reminder/4h; precise foreground accuracy; hysteresis; source recheck; 2h expiry; quiet hours | OS + category; background location separately required for region monitoring | crawl + destination context; home fallback | proximity entered/sent/open + standard | Crawl/destination IDs only; no coordinates/trail | `crawl_proximity_push=false`, `background_geofencing=false`; proximity/SQL tests |

Product announcements were not implemented because no approved existing production category was established.

Initial copy:

- At risk: “Your wing streak is still alive” / “One rating, battle vote, or crawl stop keeps it going.”
- Friend rating: “Fresh wing intel from a friend” / “A friend rated a wing spot. See what made the plate.”
- Proximity: “Your next crawl stop is nearby” / “Continue your Buffalo Wing Crawl when you’re ready.”
- Comeback direction only: “Fresh wings, fresh start.” It is not queued.
