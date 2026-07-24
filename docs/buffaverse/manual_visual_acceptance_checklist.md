# Buffaverse manual visual acceptance checklist

Use development fixtures only; do not inspect database internals.

## Phase 2 — Legendary Restaurants

- Reach: development showcase route `/buffaverse/showcase`; then Home, Wingdex map, restaurant detail, and Ratings.
- Verify: live, low-density, completed, expired, loading, empty, error, offline, and disabled states; primary CTA opens the restaurant/event; back returns to the prior surface; map marker and deep link land on the same restaurant.
- Inspect: large text, reduced motion, no fabricated participant/popularity/sponsor claims, completion shows a pending reward reference only, sharing preserves disclaimer, notification opens the event when manually configured.

## Phase 3 — Restaurant Boss Battles

- Reach: development showcase route `/buffaverse/boss-battles`; then Home, map marker, restaurant detail, and event deep link.
- Verify: live, cold-start, completed, expired, loading, empty, error, offline, and disabled states; CTA joins/opens the mission; back navigation is reversible; personal and community counts are clearly labeled and never invented.
- Inspect: large text, reduced motion, bounded map markers, deep links, duplicate taps, completion idempotency, pending reward reference, sharing disclaimer, notification opens, and no provider delivery claim.

## Cross-phase

- Verify auth cold start, offline recovery, map performance, no duplicate markers/participation/completion/reward references, and that all production surfaces remain disabled.
