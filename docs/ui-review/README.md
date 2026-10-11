# Buffago mobile UI review

Actual Expo development web components captured with Playwright Chromium at **390 × 844**, device scale 1, dark theme. Capture script: [ui-review-capture.py](../../crawl/scripts/ui-review-capture.py). Local Metro port 8087 uses the existing `BUFFAGO_NATIVE_VISUAL_QA=1` resolver and process-only Jury/Saved Destinations preview flags. Production flags and source defaults were not changed. All remote browser requests were blocked; no production account/data was used.

Screens use the same signed-in **QA Wing Explorer** local fixture account and fictitious Buffalo restaurants. Empty saved lists use a browser-local fixture response override. The Jury image is the app's existing development preview asset; it is not proof of production approved-photo delivery. No AI mockup or replacement design was generated. These are web previews, not native Android acceptance.

| Screenshot | Screen/state |
| --- | --- |
| [01-home.png](screenshots/01-home.png) | Home |
| [02-wingdex.png](screenshots/02-wingdex.png) | Wingdex / Discover |
| [03-journey.png](screenshots/03-journey.png) | Journey |
| [04-crawls.png](screenshots/04-crawls.png) | Crawls |
| [05-social.png](screenshots/05-social.png) | Social (actual fifth tab) |
| [06-wing-jury-voting.png](screenshots/06-wing-jury-voting.png) | Jury voting |
| [07-wing-jury-reveal.png](screenshots/07-wing-jury-reveal.png) | Restaurant reveal |
| [08-favorites-populated.png](screenshots/08-favorites-populated.png) | Favorites populated |
| [09-want-to-try-populated.png](screenshots/09-want-to-try-populated.png) | Want to Try populated |
| [10-home-wing-facts-jury.png](screenshots/10-home-wing-facts-jury.png) | Home Wing Facts panel |
| [11-journey-creator.png](screenshots/11-journey-creator.png) | Journey creator / challenges |
| [12-favorites-empty.png](screenshots/12-favorites-empty.png) | Favorites empty |
| [13-want-to-try-empty.png](screenshots/13-want-to-try-empty.png) | Want to Try empty |
| [14-wing-jury-reveal-actions.png](screenshots/14-wing-jury-reveal-actions.png) | Reveal lower actions, scrolled |

Actual bottom-navigation order is Home, Crawls, Wingdex, Social, Journey. Capture numbering follows the requested review grouping. Scrolled captures expose lower content without replacing the UI. [Capture report](capture-report.json) records URLs, visible text, page errors and document overflow; [file hashes](screenshot-hashes.json) identify accepted PNG bytes.

Review limitations: Home has a substantial blank area before its bottom navigation at this viewport. Long restaurant names and reveal actions need scrolling; the separate action capture makes this explicit. Web text/font/layout behavior may differ on Android. Fixture rewards/counts are deliberately illustrative. No redesign or unrelated cosmetic change was made. Live approved photo delivery, actual signed URLs, location permissions, native interactions and device safe areas still require separate acceptance. This UI review closes no Supabase deployment gate.
