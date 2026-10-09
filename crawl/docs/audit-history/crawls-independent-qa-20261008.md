# Independent Crawls QA — October 8, 2026

Reviewed independently from implementation. Scope: Crawls source, recommendation
eligibility, actual fixture browser captures, and approved left phone design.
This review does not establish native Maps behavior, live transactions, backend
authorization, or production release readiness.

## Evidence reviewed

- Approved source: `crawl/design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4.png`, left phone, as extracted in `crawls-reference-crop.png`.
- Final dark captures: `screenshots/crawls-320-fixture.png`, `crawls-360-fixture.png`, `crawls-390-fixture.png`, `crawls-430-fixture.png`, and `crawls-320-font130-fixture.png`.
- `crawls-side-by-side.png` and `screenshots/visual-report-routes-all.json`.
- Light capture: `light/crawls-390-fixture.png` and its fixture report.
- `app/(tabs)/routes/index.jsx`, `components/RoutePreview.jsx`, `lib/routePreview.js`, `tests/route-preview.test.mjs`, and `tests/crawls-details-render.test.mjs`.

Paths for captures/comparisons above are relative to this review directory;
application/test paths are relative to `crawl/`.

## Findings corrected during review

1. Opening route details could read `activeProgressByRoute` before initialization
   when `active` became nonnull. The derivation now follows the state declaration.
   The actual transpiled component hook render regression exercises this condition
   and checks the Resume Crawl action label.
2. Recommendation initially admitted routes without stops. Final helper requires
   stops and finite available first-stop distance, preserving existing featured
   eligibility, ordering and upstream transportation/status filtering. Active and
   completed routes are excluded; the selected recommendation is removed from
   the ordinary list.
3. Initial 320px/130% rendering orphaned the final letter in Crawls and overlaid
   preview caption text on a stop marker. Final capture has an intact header,
   wrapped Create action and a normal-flow caption below the preview.
4. Status controls initially clipped My Crawls on narrow phones. Final core three
   controls are all visible; Not started remains available in the secondary
   horizontal filter row. No Saved functionality was invented.
5. Initial captures sometimes omitted transportation text despite loaded tags.
   Final display resolves current transportation tags and all four final default
   captures show Walking for the fixture recommendation and active crawl.

## Final visual and functional disposition

**No major missing Route Explorer composition remains in the reviewed browser
scope.** The prominent stop preview, compact route information and circular action
now precede a separate list containing distinct active/completed crawls. Active
Resume is prominent at 390px/430px and remains available by scrolling on smaller
or enlarged-text views. The harness reports successful Resume center hit-testing
at 320, 360, 390 and 430px, plus successful detail opening. Progress has a bounded
7px parent and cannot occupy the following action's layout.

The preview uses validated existing stop coordinates and retains stop numbers
when malformed coordinates are omitted. Dashed lines show stop order, explicitly
labeled as a schematic rather than road directions. Missing coordinates have an
honest fallback. No invented route time, roadway geometry, restaurant image, total
route distance or native decorative map SDK was introduced. Displayed distance is
explicitly to the first stop. No new photo loader or private media source appears
in this Crawls change; this is source evidence, not live-media authorization proof.

The Create action opens the supported route suggestion workflow, with a clear
proposal notice and Submit suggestion action. Existing route details, completed
history, map entry and start/resume/storage handlers remain. Persistence/backend
completion are not demonstrated by screenshots or hit-testing alone.

Remaining visual differences are material but do not recreate the previous
missing recommendation structure: a grid schematic replaces unavailable road
geometry; approved restaurant thumbnail/strip media is absent; the extra retained
transportation filter row and larger route information produce lower density;
header typography, badge fills, completed-date treatment, active-first order and
navigation scale differ. Horizontal secondary-filter scrolling is intentional.
Enlarged-text content scrolls. Light390 has readable distinct surfaces and actions.
No pixel-perfect or numerical fidelity claim is supported.

The final fixture report records no startup errors or horizontal viewport overflow.
The full Node log reports 581 tests, 577 passed, two known migration failures and
two skips. That count is automated evidence, not successful live transactions.
Native/client limitations and unchanged migration issues remain separate release
blockers in the root readiness report. Independent review found no additional
blocking Crawls issue after the corrections above.

No commit, push, merge, deployment, cloud build submission or production-data
modification was performed by this reviewer.
