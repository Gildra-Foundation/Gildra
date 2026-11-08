# Icecrown grimoire — provenance

Generated 2026-11-08 using Codex built-in `image_gen.imagegen`, with `transparent_background: true`. Original art: dark frost-rimed leather, saronite fittings, cold blue crystals and ivory pages. No lettering, logos or rune writing in the raster. Live HTML supplies both localized titles.

Exact prompts: CODEX-PROMPTS.md. Specification: spec.json. Native PNGs, exact prompt text and all six candidates: `/home/debian/gildra-home-book-20261108/asset-sources/` (outside public). Winners: cover-native.png and folio-native.png, both candidate 3. Candidates 1/2 retained under rejected/ with selection reasons. QA reports: cover-qa.json and folio-qa.json in the same source directory. All six passed alpha QA; folio candidates 1/2 had fill warnings; selected candidates have no warnings.

Packed with gildra-wow-material-design/scripts/pack-asset.cjs, type cutout. Cover widths 320/640/1024; folio fits 1440×960. No enlargement, recolouring, retouching, alpha repair or compositing. AVIF deliveries encoded with Sharp quality 55, effort 6 from packed WebP. Geometry, native hashes, delivery hashes and bytes: manifest.json.

Proof: `/tmp/home/proof/{cover-320,cover-640,cover-1024,folio}-cutout-proof.png`. Reviewed over dark and cyan: transparent exterior, clean silhouette and no matte. Warmest bevel highlights are restrained; body material remains cold blue. Reused original Icecrown backdrop, snowfall, typefaces, opening/closing/lift mechanics and keyboard/focus handling. Folio shared with the phone book; lazy loading retained.

## Phone leaves — coordinator review

Two crops of the accepted folio native preserve the entire central hinge: x=0,y=0,w=800,h=1024 (left) and x=736,y=0,w=800,h=1024 (right). Packed as cutout WebP, width720, no enlargement/retouch/recolour; hashes, crop geometry and bytes in manifest.json. This reuses the same generated native and its alpha QA; no new artwork generation. Each leaf is contained and centred in its own horizontal scroll slot. Live text remains HTML.
