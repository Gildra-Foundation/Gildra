# Ice material and source capture, 18 October 2026

User requested a fix for stylesheet text on fragments, more convincing ice,
and publication without losing transition fluidity.

The current production source cf0f347 is retained, including all auction fixes.
The rotation worker a98dc5d is outside the web-only release scope.

## Reproduction and fix

The actual homepage contains a noscript fallback for its written epigraph.
HTML scripting keeps that fallback out of view. Serializing the inert viewport
into an SVG image document changes its interpretation: escaped style markup
becomes visible text. A colour-only metadata probe of the actual immutable
production image found 1658 desktop and 3128 mobile pixels from that fallback.
The same probe marking only actual style elements found zero pixels, isolating
the noscript path. A minimal real snapshot/raster test failed with 692 marked
CSS glyph pixels before the fix, and passed after it.

The viewport copy now skips noscript and template nodes. The raster clone also
excludes nonvisual document metadata; actual stylesheet rules still come from
CSSOM. Its one injected stylesheet explicitly stays hidden. No homepage copy,
no-JavaScript fallback, routing, authentication or account data is changed.

## Ice material v7

Clear blue regions replace uniform white grain. Frost grows in feathered,
roughly 60-degree branches concentrated at edges, with smaller interior nuclei.
Fractures use thinner, paired dark/light rims. The fragments have blue undersides
and directional highlights instead of uniformly outlined polygons. A narrow
inward bevel refracts a few source pixels, baked once into the shared sheet.

The independent finite worker timer, 1024px raster cap, 18 cells, source bitmap,
phase durations, reduced-motion behavior, cancellation and idle cleanup remain.
No new dependency, live DOM per fragment, blur filter or per-frame refraction
pass is introduced. v6 is preserved at its immutable URL; v7 gets a new URL.

## Verification in progress

Source pixel checks and worker lifecycle checks passed. Initial baseline clock
measurements overlapped neighboring audit work at full server CPU: 11/12 passed,
one 755ms gap, and several capture fallbacks. This raw run is preserved and is
not suitable for a clean before/after headline. Matched immutable-image timing,
full route/character/theme QA and public verification will be recorded below.

Worker draw timestamps are not display FPS. CPU throttling is not a physical
phone, and no field RUM series or universal zero-lag guarantee is claimed.
