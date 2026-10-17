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

Capture has a 1600ms deadline and shares lifecycle cancellation with the effect.
Routing proceeds underneath. Blocked resources/unsupported bitmap transfer use
the lightweight ice fallback. No screen recording permission or upload is used.

## Targeted proof

`SHARD_CONTROL=1 node apps/web/scripts/qa-page-shards.mjs` failed against v4 with
zero glyph pixels and zero source-image pixels on shards. The v5 pixel test
passed at 390/1440px: both text and image remain on moving fragments, the glyph
centroid moves, 1000 offscreen paragraphs are excluded (seven descendants remain),
the bitmap stays within 1024px, and abort/disposal checks pass.

Production-image performance comparison and live verification are recorded below
when completed. Dev-build traces were exploratory diagnostics and are not used
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
