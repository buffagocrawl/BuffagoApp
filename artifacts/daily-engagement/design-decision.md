# Design Decision

Buffago does **not** reward an app open.

The chosen model separates a lightweight daily status check from the meaningful daily wing streak:

- App open/session restoration asks the server for today’s state and retries safely.
- A day qualifies only after a committed rating, verified Wing Battle vote, completed crawl stop backed by a crawl rating, or completed server mission.
- Daily mission XP is visible and claimed through the existing mission receipt/XP ledger path. No parallel coin or XP source is introduced.
- The activity streak advances automatically with the first qualifying action of the server-resolved local day. Repeated actions can progress missions but cannot advance the streak twice.
- A missed day restarts the streak at one on the next qualifying action. No shame copy, paid freeze, or manipulative recovery is added. Comeback push remains default-off pending evidence.

This is stronger than login XP because it rewards Buffago’s actual value loop—rating, exploring, battling, and crawling—without training empty opens. It is stronger than a separate check-in currency because it avoids another economy and exploit surface. It is clearer than forcing a claim modal on launch: status lives in the home journey card and the user gets a useful CTA.

Server time is authoritative. PostgreSQL IANA zones handle DST. The first valid timezone is pinned; a new zone must be reported consistently for 24 hours before becoming effective. This tolerates travel with a bounded delay and prevents repeated flips from creating extra local days. Unknown zones use UTC.

Offline UI may show cached state as last known. It never says a reward is permanently granted until RPC confirmation. Foreground/session restoration retries one in-flight check; database uniqueness makes retries and multiple devices safe.

## Database compatibility decision

The product owner intentionally accepted the unresolved historical baseline debt. Buffago Current Supported Schema Contract v1 is the supported release boundary. It is generated from current-production metadata and release migrations, checks only release dependencies, and makes no historical claim. Reconciliation is forward-only, never edits the migration ledger, never drops shared objects, and fails closed on incompatible definitions.
