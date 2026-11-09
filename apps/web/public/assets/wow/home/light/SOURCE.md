# Hub media derivatives — 2026-11-09

These files only resize/encode existing approved site assets. No illustration, alpha retouch, recolouring, compositing or new raster generation.

- Den of Nalorakk panel/button: existing generated material kit, listed source paths and SHA-256 in manifest.json. Original source documentation remains beside the kit. WebP qualities 35/42; alpha quality 100. Native dimensions retained (768×964 / 768×125), so the shared measured 9-slice geometry is unchanged. Only the hub overrides the image variables.
- Ruby Life Pools: existing product floor map `/assets/wow/maps/ruby-life-pools-floor-1.png` (1002×668), displayed with the actual route stops and line in HTML/SVG. No pixels drawn or edited.
- Venomous Abyss: existing approved raid artwork `/assets/wow/raids/hub/venomous-abyss.webp` (960×640).
- Product previews: downsize to 384/768 px, AVIF quality 35 (effort 5), WebP fallback quality 45. Lazy, async, native picture/srcset. No enlargement.

Manifest records source/output SHA-256, dimensions, quality and byte sizes. Shared original assets and all reference-page kits are unchanged. The hub uses one kit to avoid downloading a second panel/button pair.

QA: both 768 px product previews pass `asset-qa.cjs --type scene` without warnings. The panel passes with the generic dark-rim warning; the button's generic 3:1 canvas preset rejects its existing 6.14:1 strip and warns about rim/fill. These are encodings of the existing measured 9-slice controls, not newly drawn buttons: native geometry is deliberately retained. Both output alpha channels are byte-identical to their approved sources. Rendered desktop/390 inspection confirms clean edges, unchanged silhouettes and readable HTML labels. Reports: `/tmp/hub/asset-qa3{,-panel,-button}.json`.
