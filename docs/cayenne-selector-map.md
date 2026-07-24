# Cayenne selector map

| Selector | Current source / surface | Status |
|---|---|---|
| `app.root` | `crawl/app/_layout.tsx` | active |
| `app.loading` | `crawl/app/_layout.tsx` | active |
| `app.error` | `crawl/app/_layout.tsx` | active |
| `nav.home`, `nav.crawl`, `nav.wingdex`, `nav.leaderboard`, `nav.profile` | `crawl/app/(tabs)/_layout.tsx` | active |
| remaining registry entries | feature source files | reserved; validation prevents unknown references |

Reserved selectors are intentionally documented before all feature flows are enabled. A flow may not claim a reserved selector is present until the source instrumentation is added.
