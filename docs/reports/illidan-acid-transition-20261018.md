# Illidan: fel corrosion transition, 18 October 2026

Status: release prepared following the explicit 18 October request to publish
the Illidan transition. Local production build verified; frozen image and public
verification are required before publication is reported. No push.
The isolated worktree starts from currently published base `027b17302e5686e3d3d06bf1e337e7fdaccc9168`.

## Result and bounds

The outgoing page acquires small fel stains. Once the destination and transient
page bitmap are ready, the stains open into irregular holes, merge and consume
the source page. The remaining islands retain the actual outgoing pixels. Wet
green rims, a dark eroded lip and a bounded set of bubbles follow the front.

One inert viewport copy, one canvas (maximum edge1024), one reusable256px arrival
field, two reused small RGBA buffers and interpolated vector contours. Distance
fronts, warping, noise, area ranks and local gradients are prepared in the worker.
There are no per-pit DOM trees, new runtime dependencies, blur filters or
per-frame readbacks. The only frame timer runs in the worker and accounts for its
draw cost; no catch-up queue. No animation work remains while holding for a route
or after completion. The selected worker expires after60s idle.

Phase durations are300ms seeding,220ms hold and1080ms dissolution. The existing
2300ms capture bound,12s overall guard, cancellation, motion controls and private
bitmap cleanup remain. A failed/unsupported worker or capture uses a simple CSS
fade. Worker initialization has its own1500ms watchdog, so a stalled script does
not leave the program waiting for the overall guard. Only the selected material
warms after critical loading. Keep `fel-renderer-v1.js` immutable once published.

## Final lab evidence

No per-theme field FPS/INP or physical-device measurements were collected. All
figures below are Chromium156 lab observations, not physical display FPS.
The CPU4 setting throttles the parent target; it is not a physical phone GPU.
The old image0c2e481/source027b173 ran on an isolated local bridge with dummy auth,
no real backend, no production data/env/network. The new standalone build used
matching dummy auth/no-backend settings. No browser/build overlapped timing runs.

| Width / parent CPU | Old/new click median ms | Old/new navigation-to-idle median ms | Old/new maximum-longtask median ms |
| --- | ---: | ---: | ---: |
| 1440 / 1 | 29.6 / 19.0 | 1450 / 1880 | 153 / 192 |
| 390 / 4 | 97.5 / 84.3 | 1663 / 2191 | 138 / 153 |

These are three contexts per profile, with raw ranges in comparison.json. New
corrosion intentionally takes longer than the old diagonal CSS rift. Preparing
real outgoing pixels adds work: the maximum-longtask median is higher. The click
medians did not regress in this small sample; this does not establish whole-site
responsiveness or prove a causal performance improvement.

| Worker profile | Median draw p95 ms | Minimum draws during330ms busy parent | Worst gap during stall ms |
| --- | ---: | ---: | ---: |
| 1440 | 2.8 | 9 | 41.5 |
| 390 | 2.0 | 10 | 34.0 |

All six final worker cases passed the original five-draw/<120ms pacing gate and
predeclared median draw-p95<=5ms limit. Instrumentation adds timestamps only;
pixel readbacks are performed separately. The rejected384px contour prototype
exceeded the cost budget (desktop median5.1ms); it was not published and the
threshold was not waived. Its SHA/costs are retained in rejected-384-contour.json.

Pixel probes at1440/390 retain exact source colours outside the advancing front,
show increasing transparent areas and finish with a fully clear canvas. Browser
navigation6/6 and controls5/5 passed: RU/EN,320/768 plus390/1024 resize, delayed
route holds the source, Escape clears it, late route recovers, reduced motion,
unavailable worker, delayed worker script and unavailable capture.

All four themes, scene/chrome/reload, history, same-page anchors/filters, cross-tab
synchronization, music/mute,320-1440 layouts and hydration checks passed. The
legacy all-theme test expected a200ms *main-page* cracking stage for Illidan. That
assertion describes the old generic effect and is inappropriate for asynchronous
seeded corrosion. Only Illidan now checks its seed/release labels and bounded
worker/snapshot; the original crack timing assertion remains on the other three
themes. Fel pixels and real worker cadence have dedicated strict tests. The first
legacy assertion failure is preserved in initial-legacy-fel-cracks-failure.log.

Arthas retains the exact v7 asset and capture implementation. Its four original
worker-clock regression cases passed unchanged. The full production build
compiled766 pages and TypeScript; scoped ESLint and worker syntax checks passed.
Existing Sentry setup/Pages-directory notices are unrelated baseline warnings.

## Preview and reproducibility

`.artifacts/fel/illidan-acid-demo.webm` is a compact recording of the actual local
production app returning from privacy to the Illidan homepage. It uses normal
phase durations and confirms old content ready/source DOM hidden. The recorded
JPEG frames were encoded with their original capture timestamps. Capture rate
and encoding overhead make the clip a visual preview, not an FPS benchmark.
The earlier static screenshots use explicitly stretched QA phases for inspection.

Application changes are in CanvasPageTransition.tsx, canvasTransition.module.css,
felMaterial.ts and the new public worker. The deployment checkpoint is prepared from
`feature/illidan-acid-transition-20261018`. Evidence, raw lab reports, comparison,
source hashes, harnesses, rejected case and screenshots are under
`apps/web/.artifacts/fel/`; generic theme and ice reports remain in their usual
`.artifacts/site-theme` and `.artifacts/transition-fluidity` folders.

Before any later publication, preserve the then-current production source,
review and bind the exact working-tree files to the release, create the required
immutable release checkpoint under the applicable authorization, acquire the
production/service/edge leases, retain the current immutable rollback image and
re-run public smoke/asset checks. Publication evidence will be appended after public verification.
