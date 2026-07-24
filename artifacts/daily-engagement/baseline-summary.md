# Baseline Summary

Baseline: **49.9/100**.

The strongest starting point was server-side XP ledger idempotency and a meaningful-action streak already under development. The weakest areas were the total absence of push infrastructure, device/token lifecycle, provider delivery, delivery-time authorization, notification deep links, quiet hours, location privacy controls, remote kill switches, and operational visibility.

Material defects included caller-controlled timezone and occurrence time, no timezone-change policy, true-by-default reminder fields that could be mistaken for push consent, no multi-installation model, no outbox, no provider retries or token invalidation, no notification rate limits, no friend/privacy recheck, no proximity hysteresis/cooldown, no notification routing, and no push analytics.
