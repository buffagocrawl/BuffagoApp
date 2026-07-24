# Rendered accessibility evidence

Automated target: Expo Web showcase semantic tree. Required checks are accessible hero/marker/button labels, header order, focus order, 44px-equivalent touch targets, countdown remaining-time semantics, mission label, live completion announcement, error/offline copy, non-color marker distinction, long-name wrapping, and reduced-motion behavior.

Status: implementation supplies labels, roles, selected state, live completion text, and reduced-motion control. Fixture/unit assertions and TypeScript pass, but automated browser output was not claimed because no browser runtime was available. Physical-device screen reader and frame-rate checks remain release conditions.
