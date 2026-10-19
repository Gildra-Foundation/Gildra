# Site theme and page transitions

Owner direction, 17 October 2026: the character selected on the homepage sets the
site theme, including page transitions. This replaces the earlier requirement
for a fixed amber accent on all inner pages. Page structure, data colours,
typography and the contents book remain as described in `atlas-theme.md`.

`SiteTheme` is mounted in `app/root-document.tsx`, above the navigator and route
shell. The existing `gildra-home-theme` cookie/storage key is retained. A head
script applies the saved theme before paint on direct visits and language
reloads. Cookies take priority over localStorage, matching the homepage server's
art preload. The provider synchronizes other tabs and supports blocked storage.
`HomeTheme` adapts the server's initial art/quote to the shared preference without
owning a second selection state.

`app/styles/site-theme.css` maps the character palette to atlas tokens in every
`.gildra-atlas` and `[data-atlas-scope]`, including portalled toolbars/dialogs.
Arthas uses frost blue; Illidan, Garek and Varok follow the homepage's violet,
green and coral palettes. Fel particles and transition light retain their green.
Class, role, item-quality and status colours are unchanged.

`ThemedPageTransition` captures an inert copy of visible outgoing route content,
the shared toolbar and any open contents dialog. Offscreen subtrees are pruned;
scripts/media are omitted, canvases are copied when permitted, input values are
cleared, and IDs/SVG references are namespaced per fragment. No snapshot, canvas loop or animation is
kept while idle. No screenshot service or external animation dependency is used.

- Arthas: 820 ms of edge-grown crystalline frost, 420 ms of spreading fractures,
  then 18–20 irregular frozen shards fall/rotate over the loaded destination in
  740 ms, accompanied by small ice chips. A short synthesized ice crack
  follows the existing explicit scene-sound choice and volume; it is silent by
  default and releases its AudioContext afterwards.
- Illidan: a diagonal fel rift.
- Garek: a circle of light.
- Varok: rising embers and a burning edge.

Routing starts immediately beneath the effect. The old screen stays frozen if
the destination is still loading. Escape, resize, unmount and the 12-second
watchdog clear the fragments, timers and audio. Reduced motion (OS or the site's
choice) skips snapshots, shattering and sound. A new navigation replaces the
previous effect. Existing path identity excludes filters, anchors, language-only
changes, hub aliases, downloads and external/new-tab links. Explicit
`data-no-book-transition` is respected on capture and on route commit.
Programmatic navigations without a captured source get an arrival effect.
Phase clocks start after capture. The crack phase receives a rendered frame and
the complete crack duration before fragments can leave, including instant cached navigations. The
transition host stays transparent despite legacy shell background rules, so gaps
between fragments expose the actual destination.

## Verification

From `apps/web`:

```sh
node scripts/test-ice-fracture.mjs
node scripts/test-site-theme.mjs
node scripts/test-route-transition-policy.mjs
node scripts/check-atlas-tokens.mjs
node scripts/qa-site-theme.mjs --serve
# Against an already running preview:
node scripts/qa-ice-material.mjs
```

Browser QA uses the installed Playwright and its Chromium. Set `CHROMIUM_PATH`
when using an existing browser executable; omit `--serve` and set `BASE_URL` to
test a running preview. Add `--production` after `--serve` to use an existing
production build instead of the development server. Evidence is saved under
`.artifacts/site-theme/`.
The journey covers all four selections, scene/chrome/effect persistence,
reloads, history, opt-out, filters/anchors, RU/EN, 320–1440 px, delayed navigation,
Escape, cross-tab synchronization and system/site reduced motion. It also
checks minimum crack duration, transparent fragment gaps, default silence and
AudioContext cleanup when sound is enabled.

## Local delivery boundary

Worktree: `/home/debian/Gildra-theme-transitions-20261017`, branch
`feature/site-theme-transitions-20261017`, based on locally available
`origin/master` (`358a14e`). No commit, push or deployment was requested.
The shared coordination state was readable and had no active claims, but was
read-only in this sandbox. Isolated development was registered in
`/home/debian/gildra-theme-work-state`; production and shared data were untouched.

## Delivery evidence (17 October 2026)

- Full Next.js 16.3.8 production build passed, including TypeScript and all
  766 prerendered pages. The final transparent overlay is included.
- `test-site-theme.mjs`, the existing route-policy suite, atlas token checks,
  scoped ESLint and `git diff --check` passed.
- Chromium production QA passed for all four themes and all listed navigation,
  language, viewport, delay, cancellation, cross-tab, sound and motion scenarios.
  After the last CSS background fix, the complete browser journey passed again
  in a fresh local preview, including the transparent-gap regression assertion.
- The saved `arthas-shattering.png` was visually inspected: the outgoing frozen
  homepage breaks into fragments, exposing the destination page between them.
- React Doctor checked the changed code and the three new modules. Its score
  service was unreachable. Two advisory warnings were reviewed and accepted:
  theme context values are rebuilt on infrequent preference updates; snapshot
  style writes target detached clones and cannot cause live-page layout thrash.
- Local checks used the already installed Node 24.21.0 runtime at
  `/tmp/gildra-audit-python/playwright/driver/node`, since the system Node symlink
  points to an inaccessible directory in this sandbox. No dependencies were
  installed or changed. Build-generated agent files and type-config edits were
  removed/restored; they are not part of the feature.

No commit, push, production deployment, database change or service restart was
performed. Review the isolated working-tree diff before publication.

## Production publication

The user subsequently authorized deployment. Published and verified on
17 October 2026: see [production evidence](../reports/site-theme-deployment-20261017.md).
The installed source `a052e488c7fc03800014368cdad6758c0ffc49b9` incorporates the
newer production auction fixes. Web only was replaced; all public transition
checks and a two-minute health observation passed. The deployment source is
committed locally; future web releases must include it. No remote push occurred.


## Realistic frost revision (17 October 2026)

`iceFracture.ts` clips a deterministic Voronoi sheet and gives neighbouring
shards the same jagged boundaries. Fractures advance from a pressure point,
follow those boundaries and sprout smaller hairlines. Each fragment rotates
about its own centre, with staggered release and downward acceleration.
`iceFrost.ts` draws a translucent, grainy ice sheet with feathered crystals once
per navigation. A small, irregular distance mask advances from all edges during
the frost phase; only this finite phase uses requestAnimationFrame.
The resulting texture and fracture highlights stay attached to the outgoing
content as it breaks up. Blob URLs avoid the browser's CSS-variable size limit
for noisy transparent images and are all revoked on completion/cancellation.
The audio delay follows the longer frost phase; existing sound consent applies.

Geometry tests verify full viewport coverage without holes/overlaps, common
fracture edges and bounds at mobile/desktop sizes. `qa-ice-material.mjs` uses
controlled browser time to check increasing frost coverage, edge-first growth,
texture decoding (390/1440/2560 px), and release/cancellation cleanup, and saves
screenshots of each stage. Normal-time `qa-site-theme.mjs` retains the full
navigation/theme/sound/reduced-motion regression journey.

The realistic frost refinement is now published and publicly verified. See
[revision deployment evidence](../reports/realistic-frost-deployment-20261017.md).
Future web releases must include application commit `99634f6` as well as the
original global-theme commit `a052e48`.


## Performance refinement (17 October 2026)

`ThemedPageTransition` now re-exports `CanvasPageTransition`. One inert viewport
copy is made by `transitionSnapshot.ts`: offscreen descendants are omitted before
cloning, canvas pixels copy directly without PNG/base64 conversion, and input/
textarea values are removed. No copy of the page is made for each shard.
`iceMaterial.ts` keeps at most one worker frame in flight and coalesces newer
frames. The versioned worker asset `assets/motion/ice-renderer-v3.js` generates
and caches one bounded frost material away from the UI thread, paints growing
frost/branching fractures, then moves lightweight bitmap ice fragments. The old
page fades behind the thickened ice. The finite main-thread RAF only advances
phase/progress; no pixel loops, texture encoding or fragment DOM trees remain
on the navigation gesture. The canvas resolution is capped at 1024 px on its
longest side, independent of device pixel ratio. The worker rests while idle
and terminates after 60 seconds; cancellation drops its active canvas.
Unsupported/blocked workers use a small gradient/fracture fallback.

The worker warms after document loading and browser idle, only for the selected
Arthas theme with motion enabled. It does not compete with critical page assets.
Other theme effects, motion preferences, cancellation and sound consent retain
the existing behaviour. Future worker changes must use a new versioned asset URL
to respect long-lived asset caches.

The homepage uses compressed `chronicle-cover-v3` AVIF/WebP variants with the
same artwork, dimensions, transparency and responsive sizes. The 640px AVIF is
75,733 bytes instead of 138,779. The original v2 assets remain for other uses;
`generate-book-cover-variants.mjs` reproduces the new delivery variants.

`qa-ice-renderer.mjs` checks progressive pixel coverage on a black background,
crack/shatter rendering, latest-frame coalescing, cleanup and worker fallback.
`qa-ice-material.mjs` checks integration/phase timing and a single snapshot on
390/1440/2560px. `qa-site-performance.mjs` records repeatable desktop/mobile load
and transition observations (three runs each), CDP traces, long tasks, DOM size,
canvas/clone operations and network resource sizes. These are lab observations,
not aggregated real-user INP or CrUX.


The performance refinement is published and publicly verified. See
[performance measurements and release evidence](../reports/site-performance-20261017.md).
Future web releases must retain `e75ab13` and the integrated production auction
changes from `82528e43`. The release image is
`sha256:14f9a715fd5ea392e7576183cedaf9dcbcf23039b2884ef867873856346d445b`.
Public all-theme/material checks passed; 120-second observation found zero web
restarts/runtime errors and nine other containers unchanged.


## Character-list navigation and ice v4 (17 October 2026)

The v4 renderer is `assets/motion/ice-renderer-v4.js`: uneven pressure-point
fragments, branching hairlines, varied dendritic frost, cached sheet reflection,
bevels and falling/rotating/foreshortened faces. The bounded worker/canvas and
single-snapshot performance architecture remain unchanged; v3 is retained for
immutable-cache compatibility.

`transitionSnapshot.ts` carries the source `.workspace-content` scope classes on
its own viewport. Home arrival removes `.gildra-atlas` from the live gate, so the
outgoing copy must retain this scope independently to preserve tokens/fonts and
avoid reflowing the frozen character list. Keep this when changing route scopes.
`qa-character-transitions.mjs` verifies actual roster → Gildra → home navigation
on RU/EN, mobile/desktop and a deeply scrolled list. Authenticated data is an
explicit localhost-only fixture; public verification uses anonymous entry.

Published combined source `17c1411` preserves frost fix `71d1e30` and production
auction `2950e8e`/docs `95f5cda`. See
[regression and release evidence](../reports/frost-characters-20261017.md).
Future web releases must preserve this source; future worker changes must use a
new versioned asset URL.

## Page content on ice shards (v5, published 17 October 2026)

`ice-renderer-v5.js` accepts one transferable outgoing-page `ImageBitmap`. Its
broken sheet combines those pixels with translucent frost, reflections and the
shared cracks. All cells sample bounded crops of this one sheet; text/images
rotate with their fragment. During release the inert DOM is hidden only after
the worker is painting content-bearing shards. Old v3/v4 assets stay immutable.

`pageRaster.ts` serializes the existing viewport-limited snapshot with its real
CSS ancestry. It retains relevant loaded CSS, embeds visible images and loaded
font faces, and rasterizes once at a longest edge of 1024px independently of DPR.
CSS preparation yields in short tasks. There is no per-shard DOM tree, synchronous
`toDataURL`, screen-capture permission or server upload. Only same-origin static
assets can enter a bounded 4M-character/24-entry cache; private images and page
contents are transient. Aborted/late bitmaps close and worker disposal closes its
page bitmap. A 2300ms capture deadline bounds the hold before release; unavailable
resources retain the inexpensive ice effect. Escape/resize/re-navigation/unmount
and reduced motion abort capture as well as rendering.

`qa-page-shards.mjs` is a red-capable pixel test: v4 has no outgoing glyph/image
pixels; v5 carries both on moving shards at 390/1440px. A 1000-paragraph offscreen
fixture retains only seven snapshot descendants. `VERIFY_PAGE_SHARDS=1` additionally
checks real character-list → Gildra → home journeys with the outgoing DOM hidden
and worker content ready. See the corresponding report for release verification.

The final raster stage uses an ephemeral, sandboxed static helper with a private
MessagePort. Before receiving page data it must demonstrate that its event loop
can run in parallel with the parent; shared-thread/blocked helpers use the light
ice fallback. This avoids the measured synchronous SVG raster cost in the UI
context. The helper only decodes an inert SVG image and returns a bitmap: no DOM
insertion, storage or network upload. It clears the image after transfer and is
removed after 15 seconds idle. Main CSS preparation still yields in short tasks.

Headless-shell tests explicitly use `--site-per-process` for both old and new
images, matching normal Chrome Site Isolation. This is recorded as a lab setting,
not a guarantee for every browser; runtime parallelism is checked independently.
The helper is also tested with production CSP `frame-ancestors self` and
`X-Frame-Options: SAMEORIGIN`.

Cold-source correction: capture source stylesheet references, ancestry and loaded
fonts before router changes; reuse parsed immutable CSS by sheet/URL. Warm only
already loaded public asset bytes after the host handshake. The capture no
longer queries computed styles for every element/pseudo-element, and does not
re-encode images on the UI thread. Resource timing plus a bounded public URL
index identifies CSS images already used by the page. The snapshot pins decoded
images to currentSrc and excludes unpainted lazy images from closed menus.

The first combined44df image was rejected: only3/12 cold-network cases produced
content before the old deadline. Its12 storage errors came from QA preference
init scripts running inside the opaque sandbox, not from the helper itself.
The four relevant harnesses now initialize preferences only in the top frame.
Original rejected reports are retained. Final image/live proof is required after
this correction; labelled injected prototypes alone do not qualify as a release.


The corrected v5 implementation is published and publicly verified from frozen
source `cf238c65af828eb2e32b0b439508899a057a0e52`, preserving auction `a1f93cb`
and master `07f5159c`. Current web image:
`sha256:0dc322024c2fa63ae4d9910c30f428c4ffcc4637a14b0cd67a1c81bd0f055151`.
Future web releases must retain this source. Rotation worker remains a98dc5d.
See [actual source pixels, performance and publication evidence](../reports/page-content-shards-20261017.md).
Exact-image cold content readiness12/12; local authenticated fixture8/8 and public
anonymous entry8/8 preserve geometry and hide outgoing DOM while content-bearing
shards draw. Alltheme/material/reduced motion checks and public8 asset hashes
pass;120-second observation:0errors/restarts,9 protected containers unchanged.
Preparation overhead is nonzero, documented in the report; avoid claiming a
universal speed-up or guaranteed FPS. Shared-thread/blocked helpers retain fallback.


## Independent animation clock (v6, published 17 October2026)

The current renderer is `ice-renderer-v6.js`. The dedicated worker owns a finite
~60Hz elapsed-time clock (one pending timer, no catch-up/idle loop). Freezing and
cracking run without a UI frame request; the page receives phase/progress summaries
at most once per120ms plus boundaries, and completion. An earlier native worker
RAF implementation still paced with owner rendering and was rejected. The UI
cancels hidden-tab animation/capture and skips transitions while hidden.
The broken sheet is one immutable ImageBitmap; its lifetime ends at disposal.
The1024px texture cap and existing source-content/atlas-scope protections remain.
Backdrop sampling is disabled only inside the inert still copy. Fragment opacity
settles smoothly; no per-fragment DOM or full-screen blur filter is introduced.

Published source `79cfd7f1bbf573b19182085b4b5b8a0322ada20a`, image `sha256:f0ff29842ac89c7081dafe54ba163054b2f1b36ca80e38a850b261b3dc585881`.
Future web releases must retain this source. The rotation worker remainsa98dc5d.
See [frame-stall regression and publication evidence](../reports/transition-fluidity-20261017.md).
Twelve matched330ms UI-stall cases passed; four cold source-content checks,
local roster8/8 and public anonymous entry8/8 retained geometry. Alltheme/material
and public clock4/4 passed;120s observation0errors/restarts,9 protected unchanged.
Worker timestamps are not physical display FPS; preserve this measurement limit.


## One owner per navigation (18 October 2026)

The 18 October review recorded the character effect and React's document View
Transition running together: frost froze while React held the old snapshot (up to
500 ms for images), the destination flashed for 100–450 ms, then the frozen page
returned and shattered. Clicks reached the hidden page for 1.4–3.3 s.

`routeTransitionKind(from, to)` (routeTransitionPolicy.ts, unit-tested) now decides:
`still` (language, filters, anchors), `scene` (the homepage is entered or left: the
selected character's full effect) or `page` (between atlas pages: quick hand-over).
`AtlasFrameShell` no longer renders `<ViewTransition>`, and
`app/styles/view-transitions.css` is removed, so React never starts a document
transition on route commits. Programmatic navigations get the quick hand-over; a
planned scene change keeps its effect through server redirects.

The quick hand-over dims a slow leaving page after 120 ms, slides the new page in
from its direction (300 ms, opacity .35→1), sets `data-route-arrived` so the hero,
sections and cards arrive in their existing cascade (it never ran before), counts
hero numbers, and grows a tapped card picture into the page scene with one fixed
image (`playMorphArt` in `@gildra/atlas-ui/morph`, `data-morph-art` →
`data-morph-scene`). The character effect is skippable: while it plays the host
takes the pointer, a tap reveals the page (or arrives with the quick hand-over if
the route has not committed yet), and the inert copy can no longer pass clicks
to the invisible destination. Browser QA waits for `[data-book-route-frame][data-route-ready]`.
