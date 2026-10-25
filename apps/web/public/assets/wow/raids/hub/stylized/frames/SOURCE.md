# Warcraft hand-painted style edits of the original raid frames

Created 2026-10-25 UTC with the built-in image_gen tool in EDIT / style-transfer mode. Each edit used that raid’s current original `hub/frames/{slug}.webp` as the explicit local edit target after it was visually inspected. None used the discarded replacement frame designs. The approved original compositions, rail structure, silhouettes and ornament placement are retained, with broad painted forms and stylized bevels replacing realistic grain and PBR microtexture. Original frame files and original provenance are preserved.

Native edited outputs:1536×1024 RGBA. Final siblings:960×640 WebP encoded by sharp at quality88 / alphaQuality100 / effort4. Only proportional resizing and encoding were applied; no alpha extraction, cutout repainting or raster compositing was used for production assets. Both the center and all four outer-corner samples have genuine alpha0 in all five final files.

## Measured fit and edge contact

`raidHubFrames.ts` measures each final edited WebP’s connected transparent aperture at alpha≤32. It expands that contour four native960px pixels beneath the rail, then simplifies within0.75 native pixels. CSS uses each frame’s own normalized contour polygon and measured window, rather than a generic corner radius. Sixty raster cases compare the real encoded alpha with the actual runtime helper CSS at widths246,270,280,320,354,384,512,654,720,960,1200,1536: zero uncovered aperture pixels and zero exterior leakage.

The frame’s visible edge was also inspected over a bright opaque cyan proof layer, which reveals any baked opaque black/gray gutters that alpha-only checks could overlook. The all-five contact sheet and a March upper-inner-rim zoom show the opening meeting the physical rim directly, with no opaque matte band. Proof compositing is analysis-only and is not used in the website’s image assets. The separate March scene PNG had transparent top rows; that source-scene issue is handled independently by the scene presentation and is not a reason to shift the frame’s true aperture.

Release evidence: `/home/debian/gildra-raid-stylized-release-20261025/frames/inputs.json`, `native/`, `geometry.json`, `edge-profiles.json`, `all-frame-edge-proof.png`, `march-inner-edge-zoom.png`, `coverage-verification.json`. The separate read-only `verify-frame-coverage.cjs` imports the actual helper CSS and independently flood-fills the actual final raster alpha; run it with `node --experimental-strip-types --no-warnings`. `measure-edited-frames.cjs` records the derivation.

## venomous-abyss

- Mode: built-in image_gen EDIT / style-transfer.
- Original edit target: `/home/debian/Gildra-raid-stylized-20261025/apps/web/public/assets/wow/raids/hub/frames/venomous-abyss.webp`.
- Original SHA256: `ffd7dd47ec9526e2ea9299f1271af810a70933d777ef09d303799f62852988c8`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-740bc437-bc03-4f72-be65-c6b48ead7f31.png`.
- Archived native: `/home/debian/gildra-raid-stylized-release-20261025/frames/native/venomous-abyss.png`; SHA256 `c741d8e994c1ecea2e31e8885a9ee4ab1220926210c8cd2f2b7e7708b186fd73`.
- Final: `/assets/wow/raids/hub/stylized/frames/venomous-abyss.webp` (87526bytes); SHA256 `c9dc7826087f2daa55b826b53d9b94df7acae23ce0b58eeb83bc91eb368847e5`.
- Measured window: `{"left":121,"top":121,"right":839,"bottom":532}`; 172 contour vertices.

Exact edit prompt:

> Use case: style-transfer. EDIT the supplied transparent raid frame itself. The reference is the approved final composition. Preserve its exact overall silhouette, all four rails, rail thickness, all corner and centered ornament shapes/positions, exact inner-window shape, exterior margins, and straight-on 3:2 composition. Do not redesign, add, remove, crop or rearrange structural elements. Change ONLY rendering style/surface treatment to a Warcraft hand-painted interface game asset: broad clean painted shapes, smooth stylized bevel planes, clear soft hand-painted lighting, simplified large readable material forms and subtle tonal changes. Noticeably stylized and painted World of Warcraft art, not photorealistic or PBR; no microscopic granular texture, gritty detail, scattered sharp scratches, tiny noisy flecks or photographic surface grain. Keep the original large centered bronze cobra crest, upper corner fangs, angular bronze slabs and jade poison inset channels exactly where they are. Paint smooth broad bronze bevel planes and a few controlled patina shapes; no speckled oxidized PBR texture. CRITICAL alpha/cutout: both exterior and the entire inner aperture remain genuinely transparent. Transparency begins immediately at the visible inner rim of the physical frame. Do not add any opaque black/gray/brown matte, gutter, internal shadow band or translucent dark strip in the opening. No scene, fill, fog, particles or background inside. Keep all original approved shape and composition tightly. The supplied image is the exact EDIT TARGET, not a loose inspiration reference.

## the-voidspire

- Mode: built-in image_gen EDIT / style-transfer.
- Original edit target: `/home/debian/Gildra-raid-stylized-20261025/apps/web/public/assets/wow/raids/hub/frames/the-voidspire.webp`.
- Original SHA256: `372cfdf11002b7444d3aa926f17e0af2c615fd96471deba18b8b13c520cbb8fe`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-c96ba124-b76b-4e5a-a5bd-c86f0ed6e3b7.png`.
- Archived native: `/home/debian/gildra-raid-stylized-release-20261025/frames/native/the-voidspire.png`; SHA256 `32274481f96be04d09db3813987ddd3cb54d350fd7d141916eb4f60267a7e035`.
- Final: `/assets/wow/raids/hub/stylized/frames/the-voidspire.webp` (89404bytes); SHA256 `07ffd0c0bd01cacb8582678712b88bf5713a3ea8e6980af625b0da4656c58dd0`.
- Measured window: `{"left":121,"top":149,"right":839,"bottom":540}`; 235 contour vertices.

Exact edit prompt:

> Use case: style-transfer. EDIT the supplied transparent raid frame itself. The reference is the approved final composition. Preserve its exact overall silhouette, all four rails, rail thickness, all corner and centered ornament shapes/positions, exact inner-window shape, exterior margins, and straight-on 3:2 composition. Do not redesign, add, remove, crop or rearrange structural elements. Change ONLY rendering style/surface treatment to a Warcraft hand-painted interface game asset: broad clean painted shapes, smooth stylized bevel planes, clear soft hand-painted lighting, simplified large readable material forms and subtle tonal changes. Noticeably stylized and painted World of Warcraft art, not photorealistic or PBR; no microscopic granular texture, gritty detail, scattered sharp scratches, tiny noisy flecks or photographic surface grain. Keep the exact original obsidian-shard outer silhouette, all angular corner projections, centered rift-spire crest and violet edge channels. These shapes are approved and must not be removed or redesigned. Paint them as smooth stylized charcoal stone facets with clean broad bevels and restrained painted violet glow, without noisy cracks or granular rock. CRITICAL alpha/cutout: both exterior and the entire inner aperture remain genuinely transparent. Transparency begins immediately at the visible inner rim of the physical frame. Do not add any opaque black/gray/brown matte, gutter, internal shadow band or translucent dark strip in the opening. No scene, fill, fog, particles or background inside. Keep all original approved shape and composition tightly. The supplied image is the exact EDIT TARGET, not a loose inspiration reference.

## the-dreamrift

- Mode: built-in image_gen EDIT / style-transfer.
- Original edit target: `/home/debian/Gildra-raid-stylized-20261025/apps/web/public/assets/wow/raids/hub/frames/the-dreamrift.webp`.
- Original SHA256: `935c14542bb6ad0069af26e50ae471b65632206ff11555323bd00cb9e8a9f567`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-f164fbf8-33ff-4e04-9c18-baf62d2baeee.png`.
- Archived native: `/home/debian/gildra-raid-stylized-release-20261025/frames/native/the-dreamrift.png`; SHA256 `06360800d8035285a4bffe17d5dd3dae142f6ae64b00efc74f6e83d897eb0400`.
- Final: `/assets/wow/raids/hub/stylized/frames/the-dreamrift.webp` (133984bytes); SHA256 `396f7cfa737940b10a8e84e8d317039820bd731abf75db9ad2320b3de3e07c3d`.
- Measured window: `{"left":138,"top":121,"right":823,"bottom":529}`; 392 contour vertices.

Exact edit prompt:

> Use case: style-transfer. EDIT the supplied transparent raid frame itself. The reference is the approved final composition. Preserve its exact overall silhouette, all four rails, rail thickness, all corner and centered ornament shapes/positions, exact inner-window shape, exterior margins, and straight-on 3:2 composition. Do not redesign, add, remove, crop or rearrange structural elements. Change ONLY rendering style/surface treatment to a Warcraft hand-painted interface game asset: broad clean painted shapes, smooth stylized bevel planes, clear soft hand-painted lighting, simplified large readable material forms and subtle tonal changes. Noticeably stylized and painted World of Warcraft art, not photorealistic or PBR; no microscopic granular texture, gritty detail, scattered sharp scratches, tiny noisy flecks or photographic surface grain. Keep the original exact intertwined pale roots, all curled branch crowns, crescent top-center leaf and small leaf positions. Keep its organic inner-window outline. Paint broad ivory heartwood forms, a few smooth sweeping wood-grain strokes and soft sage/emerald accents; remove microbark and tiny texture flecks. CRITICAL alpha/cutout: both exterior and the entire inner aperture remain genuinely transparent. Transparency begins immediately at the visible inner rim of the physical frame. Do not add any opaque black/gray/brown matte, gutter, internal shadow band or translucent dark strip in the opening. No scene, fill, fog, particles or background inside. Keep all original approved shape and composition tightly. The supplied image is the exact EDIT TARGET, not a loose inspiration reference.

## march-on-queldanas

- Mode: built-in image_gen EDIT / style-transfer.
- Original edit target: `/home/debian/Gildra-raid-stylized-20261025/apps/web/public/assets/wow/raids/hub/frames/march-on-queldanas.webp`.
- Original SHA256: `56a656cd805107042748ca2cac61772a13364dfcd0dbe26d8037f093c0119a9b`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-8c4a80a9-7afd-42ed-b500-c5efbdd66bd3.png`.
- Archived native: `/home/debian/gildra-raid-stylized-release-20261025/frames/native/march-on-queldanas.png`; SHA256 `9fb9078713f0442b16a3137790edc15babba13de4dce9c093b2f9ce9f1daee2f`.
- Final: `/assets/wow/raids/hub/stylized/frames/march-on-queldanas.webp` (106572bytes); SHA256 `a91211e2e07c863f169b1200b4dc4781c33d564df6bf6a9773e0ed927e987b04`.
- Measured window: `{"left":107,"top":124,"right":854,"bottom":516}`; 149 contour vertices.

Exact edit prompt:

> Use case: style-transfer. EDIT the supplied transparent raid frame itself. The reference is the approved final composition. Preserve its exact overall silhouette, all four rails, rail thickness, all corner and centered ornament shapes/positions, exact inner-window shape, exterior margins, and straight-on 3:2 composition. Do not redesign, add, remove, crop or rearrange structural elements. Change ONLY rendering style/surface treatment to a Warcraft hand-painted interface game asset: broad clean painted shapes, smooth stylized bevel planes, clear soft hand-painted lighting, simplified large readable material forms and subtle tonal changes. Noticeably stylized and painted World of Warcraft art, not photorealistic or PBR; no microscopic granular texture, gritty detail, scattered sharp scratches, tiny noisy flecks or photographic surface grain. Keep the exact original blood-elf gold/bronze rails, pointed sun-ray corners, crimson enamel surfaces and the large centered phoenix-wing crest. All silhouette and ornament positions remain locked. Paint smooth broad golden bevel planes, clean crimson shapes and restrained warm edge highlights, without realistic metal grain or scratch fields. CRITICAL alpha/cutout: both exterior and the entire inner aperture remain genuinely transparent. Transparency begins immediately at the visible inner rim of the physical frame. Do not add any opaque black/gray/brown matte, gutter, internal shadow band or translucent dark strip in the opening. No scene, fill, fog, particles or background inside. Keep all original approved shape and composition tightly. The supplied image is the exact EDIT TARGET, not a loose inspiration reference.

## sporefall

- Mode: built-in image_gen EDIT / style-transfer.
- Original edit target: `/home/debian/Gildra-raid-polish-20261025/apps/web/public/assets/wow/raids/hub/frames/sporefall.webp`.
- Original SHA256: `d26587d5cbd34ac9a670f4b19e482503b52411487977f052c452b077c7f2fa97`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-39801e8b-8810-42e6-93d7-c6b4b35eb157.png`.
- Archived native: `/home/debian/gildra-raid-stylized-release-20261025/frames/native/sporefall.png`; SHA256 `e717d1a1709c9ba509a82b2e9af3cf59a64f24d89f60bd44c0b3c918ae98f2e9`.
- Final: `/assets/wow/raids/hub/stylized/frames/sporefall.webp` (126068bytes); SHA256 `a46b507f4b8228c8ece9f82257b69bbd6c719200a85ac8ec0dcba23df376e798`.
- Measured window: `{"left":120,"top":112,"right":856,"bottom":532}`; 548 contour vertices.

Exact edit prompt:

> Use case: style-transfer. EDIT the supplied transparent raid frame itself. The reference is the approved final composition: preserve its exact overall rectangular silhouette, rail width, twisting-root arrangement, all ornament positions, upper-right and lower-left mushroom groups, inner-window shape, outer margins and straight-on 3:2 framing. Do not redesign or replace the frame, do not add or remove structural pieces. Change ONLY the rendering style and surface treatment to a Warcraft hand-painted game asset: broad clean painted forms, smooth stylized bevels, simplified readable wood grain with only a few deliberate curved strokes, chunky softly painted moss masses, smooth amber mushroom caps with clean hand-painted edges and restrained warm highlights. Keep the original earthy brown / moss green / amber palette and the same shapes, but remove the realistic PBR bark detail, photographic microtexture, granular noise, tiny flecks and gritty scratched surfaces. Make it look like a polished World of Warcraft interface illustration, noticeably painted and stylized, not photorealistic. Preserve genuine transparency everywhere it already exists: transparent inner window and transparent exterior. CRITICAL: the aperture must be transparent immediately at the visible inner edge of the wooden rail, with no opaque black matte, brown gutter, inner-shadow strip, ambient shadow band, glow or fog inside the opening. Leave no scene or colored fill in the opening. Keep the complete original frame fully inside the canvas; no cropping, no perspective, no text, no new decorations. The supplied image is the edit target, not a loose inspiration reference.
