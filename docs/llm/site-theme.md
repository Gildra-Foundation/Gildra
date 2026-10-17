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
