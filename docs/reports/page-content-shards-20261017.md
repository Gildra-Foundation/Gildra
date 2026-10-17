# Outgoing page content on ice shards — 17 October 2026

The new renderer samples one bounded outgoing-page texture, so page text and
images break along the shared cracks and travel with the ice. Frost is translucent
enough to retain this content. The previous atlas-scope fix remains intact.

The first computed-style prototype was rejected after measuring its preparation
cost. The implementation reuses loaded CSS, filters unrelated selectors, embeds
visible images/loaded font faces, and yields between short preparation tasks.
One temporary viewport serializer tree is discarded after a single rasterization;
no DOM or full-size image is allocated per shard. The worker uses the existing
1024px cap, finite frame queue and idle termination. Public static asset caching
is bounded; private images/page contents are never cached by the module.

Capture has a 2300ms deadline and shares lifecycle cancellation with the effect.
Routing proceeds underneath. Blocked resources/unsupported bitmap transfer use
the lightweight ice fallback. No screen recording permission or upload is used.

## Targeted proof

`SHARD_CONTROL=1 node apps/web/scripts/qa-page-shards.mjs` failed against v4 with
zero glyph pixels and zero source-image pixels on shards. The v5 pixel test
passed at 390/1440px: both text and image remain on moving fragments, the glyph
centroid moves, 1000 offscreen paragraphs are excluded (seven descendants remain),
the bitmap stays within 1024px, and abort/disposal checks pass.

Production-image performance comparison and live verification are recorded below. Dev-build traces were exploratory diagnostics and are not used
as a production performance claim.

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


## Published final image and verification

Published on `gildra.net` at 21:26:56 UTC, 17 October 2026:

- Frozen application source: `cf238c65af828eb2e32b0b439508899a057a0e52`.
- Motion correction: `7777427736885d0e91a2c0f7218b530fcbc6bb17`, initial implementation `1a6747bb`.
- Image: `sha256:0dc322024c2fa63ae4d9910c30f428c4ffcc4637a14b0cd67a1c81bd0f055151`.
- Release: `page-content-shards-20261017-cf238c6-r1`.
- Rollback: previous immutable web image `sha256:5e3b54a3b328de682aaf2071bb0c0b91b0558cac51703c8b81fa6d4d92e4b277` and byte-exact prior manifest.

The web-only release retains published auction source `a1f93cb` and master docs
`07f5159c`; the rotation worker remains `sha256:a98dc5d17aa74f0261123c110e73201f7b2cf06b5813ed7fa1674e96220a9d70`.
All nine other containers retained their identities/start times/restart counts.
No database/schema changes. Health/origin routes/API readiness passed; the
120-second observation found zero web restarts/runtime errors.

The final image, with no injected implementation, passed all four themes,
390/1440/2560px ice phases, delayed routes/Escape, sound/mute, history,
preferences, RU/EN and reduced motion. Eight localhost Auth.js/70-character
fixture journeys passed: RU/EN × desktop/mobile × scroll0/3000, actual roster →
header Gildra → home, geometry delta0px and outgoing DOM hidden while worker
content is ready. These are explicitly synthetic local records, not live users.

Public checks separately passed all themes/material and eight anonymous
character-entry → Gildra → home journeys with source pixels ready on shards,
zero geometry drift and zero page errors. Eight public asset hashes/byte lengths,
including v5 renderer and both raster-helper files, match the exact image.
The final report commit changes documentation only; the running source stays cf238c6.

## Performance evidence and limits

Both immutable images ran sequentially in isolated localhost containers without
production environment/data/network. Identical Chromium156.0.8078.4/headless-shell
Site Isolation setting, viewport1440×900/CPU1 and390×844/parentCPU4, 4Mbps down,
1Mbps up, latency80ms, three independent contexts per route/profile. Other browser
QA/builds did not overlap this comparison. Workers/helpers keep natural scheduling.

All12 final-image cold journeys carried content: capture501–1235ms, within the
normal1240ms freeze+crack duration, no page errors/timeouts, no synchronous PNG
exports, one snapshot/canvas and at most328 transition descendants.

Medians in milliseconds, current production v4 → final v5:

| Profile/source | Click | Long-task blocking | Max task | Max RAF gap |
| --- | ---: | ---: | ---: | ---: |
| Desktop/home | 35.4 → 32.9 | 719 → 688 | 297 → 305 | 402 → 355.1 |
| Desktop/raids | 23 → 35.7 | 66 → 212 | 116 → 137 | 285.1 → 436.4 |
| Mobile/home | 122 → 116.4 | 207 → 306 | 184 → 189 | 209.1 → 211.5 |
| Mobile/raids | 102.3 → 111.8 | 243 → 234 | 155 → 158 | 309 → 298.2 |

This feature has nonzero preparation cost: desktop raids blocking/frame gap and
mobile home blocking increased in this sample. It is not a general speed-up or
zero-lag guarantee. Reviewed desktop trace separates parent PID25592 and helper
PID25586: SVG layout/raster runs in the helper; the longest parent app call is83ms
versus70ms baseline, with no new several-hundred-ms synchronous SVG raster task.
Profiler setup itself is115ms versus120ms baseline. Parent painting totals29ms
versus41ms; style totals228ms versus99ms remain bounded, yielding work.
The original per-element computed-style and direct main-thread raster approaches
were rejected. Field INP/FPS and physical phone performance are not measured.

A blocked/shared-thread helper, missing/oversized resource, capture deadline or
cancellation keeps the inexpensive ice fallback. Unpainted lazy images/protected
canvases may be omitted; snapshot resolution is intentionally limited to1024px.
This prioritizes responsiveness over a perfect screenshot on every browser.

Private immutable evidence is archived in
`/opt/gildra/releases/page-content-shards-20261017-cf238c6-r1/`:
source17-path binding, source archive manifest, exact candidate QA, pixel proof,
performance review, public roster/theme/material/assets, motion-public binding,
observation, guarded operation/plan and chained ledger. Raw lab traces/reports
remain in the worktree `.artifacts/site-performance/` and the private release root.
