# Raid hub painted ornament sprites

Generated 2026-10-25 with the built-in `image_gen` tool in default built-in mode, seven separate transparent-background generation requests. These are original decorative game-style cutouts, not official extracted Blizzard assets or boss portraits.

The seven final WebP files total 212670 bytes. All have real alpha transparency, including a fully transparent exterior margin. Alpha and SHA checks are saved in `/home/debian/gildra-raid-stylized-checks-20261025/ornament-alpha.json`.

## References

Every supplied reference was viewed before use.

- `spore-tall`: existing Gildra `/assets/wow/raids/hub/sporefall.webp`, used only for its broad Warcraft painting style and sage/amber palette.
- `spore-shelf` and `spore-buds`: the newly generated `spore-tall` native PNG, used only to match painting style and palette while changing the silhouette.
- `jade-vine` and `void-crystals`: the corresponding existing `/assets/wow/raids/hub/frames/venomous-abyss.webp` and `the-voidspire.webp`, used only for palette/motif, not frame structure or surface texture.
- `dream-shoot` and `sun-feather`: `spore-tall` native for the painted sprite finish; corresponding existing `the-dreamrift.webp` and `march-on-queldanas.webp` frames for palette only.

No original frame or scene raster was edited by this ornament work.

## Encoding and final assets

Sharp 0.35.5 extracted the nonzero-alpha bounding box, resized proportionally inside 352×416, added 16px transparent padding on each side, and encoded WebP quality84 / alphaQuality100 / effort6. Generated alpha was preserved. No post-generation painting, recoloring or compositing was applied.

| File | Dimensions | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `spore-tall.webp` | 384×372 | 37174 | `4b6fdcb4a8eb07830daacaa43d0ca8cdd978f26d2fb6d27c0e0d79dd227aa304` |
| `spore-shelf.webp` | 384×382 | 32040 | `6a95bd4241d1cae046fb0fec19d0632606f123bb200980aa7b3eba6f81bfa71a` |
| `spore-buds.webp` | 384×381 | 26430 | `fa8499cfac8c8227b3d08ac2bf7642703f7ce7a79f7033cf45d0a3de53c37bbf` |
| `jade-vine.webp` | 384×375 | 28070 | `14cdadc3b2720bdadd7ad884bfed0ed503288916664f5b541e47cd097ac303ba` |
| `void-crystals.webp` | 384×387 | 26182 | `f667e11aef3ecf7e68fd681c4d20e8ec87f8f67b09a4fc20a90221f2fecb8997` |
| `dream-shoot.webp` | 384×382 | 33972 | `1c67f1292ee3dbd022ad79dace23d61b9eb6334d3aca150ebb16312063fbb39d` |
| `sun-feather.webp` | 384×410 | 28802 | `fa39d42fb0f0e8b8bf5e30a99db1dd09f43b810c80b398a7a97c95847de33de8` |

The server-rendered `RaidHubOrnaments` uses the seven pre-encoded WebP assets through unoptimized Next Image elements, so no additional image-optimizer variant is requested. Images are lazy loaded and decoded asynchronously. Their bounded 132×112px desktop /84×80px phone slots remain within a reserved footer gutter, below actual links. Decorative wrappers are aria-hidden and pointer-transparent.

## Motion integration

Each piece exposes `data-raid-ornament-piece`, an inner `data-growth` element, and the real image. The shared raid motion observer supplies per-piece `data-raid-ornament-ready` after actual load/decode, `data-raid-ornament-revealed=true` on its first viewport intersection, and `data-raid-ornament-active` while visible and eligible for motion. This makes growth begin when the actual footer ornament is seen, rather than when a tall card's top first enters the viewport.

Growth is finite and has one iteration. Sporefall has three different silhouettes, with1600/1500/1400ms durations and400/650/900ms delays, so the last finishes at2300ms. Other themes have different transforms: jade vine curl, void crystal reveal/glint, dream leaf unfold and phoenix feather reveal. Inner ambient motion is subtle, uses only transform/opacity, and plays only while the piece is active. Hover/focus pauses only ambient motion. `data-raid-ornament-grown` preserves the full static growth layer after completion or preference settlement; `data-raid-ornament-settled` does the same on interaction. These hooks prevent a later shrink/replay. No JavaScript animation frame loop is used.

Base server/no-JS decoration is fully grown and static. Only `@media(scripting:enabled)` with normal motion/transparency prepares hidden, not-yet-ready pieces; the real text and controls are never hidden. Site/OS reduced motion, reduced transparency and the no-IO static fallback leave fully grown static cutouts. Forced colours hides decorative ornaments.

## Native sources and crops

Byte-exact PNG copies, complete prompt TXT files and `encoding.json` are preserved at `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/`.

### spore-tall

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-9a67fa41-9cde-417d-afd4-0de9be6778d9.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/spore-tall-native.png`.
- Native dimensions: 1254×1254; 1686925 bytes.
- Native SHA-256: `a824649ca6986bec6750487b8472668add7a59d8a071c045d8ab2bddd4904fb4`.
- Exact nonzero-alpha crop: x0, y35, width1234, height1193.

### spore-shelf

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-87dcc70a-8b60-4399-b74b-4f6eed45423a.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/spore-shelf-native.png`.
- Native dimensions: 1254×1254; 1558189 bytes.
- Native SHA-256: `69ed054c23a8bd2ad3d270901ccb9b963c1f718ce8380cc02781b59024d1c98c`.
- Exact nonzero-alpha crop: x0, y9, width1253, height1245.

### spore-buds

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-29cb461f-a2d5-4f4c-8d1e-b8747c814703.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/spore-buds-native.png`.
- Native dimensions: 1254×1254; 1177970 bytes.
- Native SHA-256: `60c56c4908051e912939af5b6ba7e629507955bc6463eda2a2cd55147708c539`.
- Exact nonzero-alpha crop: x0, y31, width1234, height1223.

### jade-vine

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-a2abf5de-e266-4c19-943e-7918f2cea382.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/jade-vine-native.png`.
- Native dimensions: 1254×1254; 1271364 bytes.
- Native SHA-256: `f2c0a9ee4545f28ea64be3d12b4091caa83cf3bd142c82dec5ed30035840ed56`.
- Exact nonzero-alpha crop: x0, y31, width1238, height1206.

### void-crystals

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-a9f4831a-b104-4284-a3f3-3c890a03542e.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/void-crystals-native.png`.
- Native dimensions: 1254×1254; 1322995 bytes.
- Native SHA-256: `4aeaf6e7ddbb5dc4a7a1b2122209be2cb5db25cc30f43764e62c7996b519a372`.
- Exact nonzero-alpha crop: x0, y28, width1214, height1226.

### dream-shoot

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-ec066aed-4e9a-44d3-aafb-1d2d6cc688ed.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/dream-shoot-native.png`.
- Native dimensions: 1254×1254; 1424987 bytes.
- Native SHA-256: `784356802b6f092455e3a3f0d135aad9df1784574c616e3115a52678dd0c2bb8`.
- Exact nonzero-alpha crop: x0, y19, width1224, height1217.

### sun-feather

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-80466e29-5bce-457a-9ca6-22164dbd4fc4.png`.
- Native copy: `/home/debian/gildra-raid-stylized-release-20261025/asset-sources/ornaments/sun-feather-native.png`.
- Native dimensions: 1254×1254; 1120531 bytes.
- Native SHA-256: `41172125304330f43eb907042fee78ff46ba8f807b14cb66c1d50adb1066e890`.
- Exact nonzero-alpha crop: x47, y13, width1145, height1230.

## Full generation prompts

### spore-tall

Use case: stylized-concept.
Asset type: one isolated transparent fantasy game decorative sprite for a real website, not an interface mockup.
Primary request: create ONE beautiful hand-painted Warcraft-like mushroom cluster, with one large slightly tilted umbrella cap and two smaller companion caps, growing together from one compact dark root base. This is the tall left-corner Sporefall ornament. Use the supplied forest ONLY as a palette and painterly style reference; do not depict its environment.
Subject/material: chunky curved ivory-umber stems, broad desaturated sage/olive caps, soft warm amber undersides, a few simple moss shapes at the base. The large cap leans gently inward to the right. Clear recognizable organic silhouette at 120px display size. Three mushrooms total, not a field. Broad forms and big gill bands, no tiny surface pattern.
Composition: square canvas about1024x1024, complete cluster centered and fully inside canvas with transparent padding, upright view at slight three-quarter angle. Root base near bottom. Object only, no ground plane, no background, no rectangular frame.
Style/medium: polished stylized hand-painted fantasy game asset with confident broad brush planes, smooth simplified forms and restrained edge highlights. Low surface detail and low texture. NOT photorealistic, NOT PBR, NOT realistic bark/moss grain, NOT a 3D render or glossy stock icon. Match the readable large shapes of World of Warcraft painting.
Lighting: soft warm amber beneath caps with gentle cool green shadow, no bright glow halo.
Constraints: genuinely transparent alpha background everywhere outside the object. No checkerboard painting, background scene, drop shadow on a ground plane, letters/UI/logos/watermarks, characters, insects, eyes, faces, scattered particles, dotted patterns or dense small mushrooms.

### spore-shelf

Use case: stylized-concept. Asset type: one isolated transparent fantasy game decorative sprite for a real website, not UI.
Use the supplied already approved mushroom sprite ONLY as a reference for broad hand-painted Warcraft forms and sage/amber palette. Make a DIFFERENT silhouette and arrangement.
Style: polished stylized hand-painted game asset, broad painterly planes, chunky organic forms, low microdetail, clear at100px. No PBR or photorealism, realistic grain, 3D rendering, glossy icon effects or dense texture.
Composition: square canvas, one compact complete object isolated with generous transparent padding. Slight three-quarter front view. No environment, ground plane, cast ground shadow or rectangular frame. Genuine transparent alpha outside object, no checkerboard painting, text/UI/logos/watermark, characters, faces, insects or particles.
Primary request: a low, wide cluster of THREE overlapping fan-shaped shelf mushrooms growing from a small crooked umber root stump. Rounded layered amber and cinnamon shelves with desaturated olive-green upper rims and warm soft undersides. Wide horizontal silhouette, shorter than it is wide, dark compact root base nearbottom. A few broad moss patches only; no tiny leaves or dotted cap patterns. Not tall umbrella mushrooms; these are distinct low layered fungal fans for a right-bottom corner.

### spore-buds

Use case: stylized-concept. Asset type: one isolated transparent fantasy game decorative sprite for a real website, not UI.
Use the supplied already approved mushroom sprite ONLY as a reference for broad hand-painted Warcraft forms and sage/amber palette. Make a DIFFERENT silhouette and arrangement.
Style: polished stylized hand-painted game asset, broad painterly planes, chunky organic forms, low microdetail, clear at100px. No PBR or photorealism, realistic grain, 3D rendering, glossy icon effects or dense texture.
Composition: square canvas, one compact complete object isolated with generous transparent padding. Slight three-quarter front view. No environment, ground plane, cast ground shadow or rectangular frame. Genuine transparent alpha outside object, no checkerboard painting, text/UI/logos/watermark, characters, faces, insects or particles.
Primary request: a small young cluster of TWO plump bell-shaped mushroom buds emerging from one curved dark root with two broad curled sage leaves. One taller narrow pale-umber stem with a rounded closed olive cap, one shorter tiny cap leaning inward. A little soft honey-amber undercap edge, no glowing halo. Upright delicate but chunky silhouette, notably simpler and smaller than the reference cluster; no giant open umbrella cap. Root base compact and fully visible. No additional mushrooms, leaves or environmental details.

### jade-vine

Use case: stylized-concept.
Asset type: ONE isolated transparent fantasy game ornament sprite for a real website.
Primary request: an elegant small ancient troll jade-vine ornament: one broad curling vine shaped in a gentle S around a small carved jade serpent coil, with two broad deep-green leaves and a single understated aged-bronze clasp near the compact root base. The serpent is a simple decorative carved-stone motif, not a living creature or boss portrait. Upright flowing silhouette that leans inward to the right; strong large shapes readable at120px.
Input images: the supplied existing frame is ONLY a palette/motif reference (jade, dark aged bronze, serpent curve), not the style to copy. Do NOT make a frame or rectangular border.
Style: unmistakably stylized hand-painted Warcraft game asset, broad smooth brush planes, clean simplified foliage, chunky carved jade, restrained warm edge highlights. Little surface texture. NOT photorealistic, NOT PBR, NOT 3D render, no realistic grain, detailed scales, tiny carvings or shiny gem arrays.
Composition: square canvas approximately1024x1024, one complete isolated object centered with transparent padding. Root/base atbottom, slight three-quarter view, all tips fully visible.
Lighting: soft jade green with a little muted bronze warmth; no bright neon or surrounding glow cloud.
Constraints: genuinely transparent alpha everywhere outside the ornament. No background, scenery, ground plane, cast ground shadow, frame, checkerboard painting, UI, lettering, logos, watermark, particles, people or extra objects.

### void-crystals

Use case: stylized-concept.
Asset type: ONE isolated transparent fantasy game decorative cutout for a real website.
Primary request: a small beautiful cluster of THREE chunky faceted void crystals emerging from one compact dark obsidian base: one tall crystal leaning gently inward to the left, two shorter side shards. Deep plum and midnight-violet body, broad lavender facet highlights and a little soft pale-purple light INSIDE the crystal. Strong angular silhouette readable at100px.
The supplied existing frame is ONLY a palette reference for obsidian and violet; do not reproduce its frame, ornaments or gritty material.
Style/medium: stylized hand-painted Warcraft game asset, large clean polygonal painterly facets, confident broad planes, low detail, no texture grain. NOT realistic gemstones, not PBR or 3D render, not glass photography. Keep facets simple, no dense internal cracks.
Composition: square approximately1024x1024; one complete centered cluster with generous transparent padding, all tips visible, base nearbottom. Front/slight three-quarter view. No ground plane or cast ground shadow.
Constraints: genuinely transparent alpha outside object. No ambient glow cloud, background, environment, border/frame, checkerboard painting, UI, text/logos/watermarks, particles, floating shards, gem arrays, tiny engravings, creatures or faces.

### dream-shoot

Use case: stylized-concept.
Asset type: ONE isolated transparent fantasy game decorative sprite for a real website.
Primary request: one graceful young dream-forest shoot, a pale ivory-heartwood curling root stem with THREE broad emerald/sage leaves: one larger unfurling crescent leaf above and two smaller rounded leaves below, plus one little closed leaf tip. It should feel alive and gently unfolding, with a clean flowing upright silhouette leaning slightly inward to the left, compact root base atbottom.
Input references: firstimage supplies ONLY the broad stylized hand-painted Warcraft asset finish, not mushroom subject; secondimage supplies ONLY pale heartwood/emerald palette of the Dreamrift, not its rectangular frame. Do not include mushrooms or a frame.
Style: confident broad painterly planes, chunky simplified leaves and stem, clean large leaf veins only, smooth muted highlights, a little cool dreamgreen inner light. Very low texture and microdetail. No photorealism, PBR, realistic bark grain, 3D render, intricate vines or dense leaf sprays.
Composition: square approximately1024x1024, complete isolated shoot centered with transparent padding, all leaf tips withincanvas, slight three-quarter front view, base nearbottom.
Constraints: genuine transparent alpha outside object. No background, environment, ground plane/cast shadow, surrounding glow cloud, checkerboard painting, frame/border, UI/text/logos/watermark, flowers, particles, characters or faces.

### sun-feather

Use case: stylized-concept.
Asset type: ONE isolated transparent fantasy game ornament sprite for a real website.
Primary request: one elegant large phoenix feather with a gentle S-curve, broad flowing GOLD and muted amber vanes around a slim dark-crimson spine, and a small understated blood-elf gold leaf clasp at the bottom. The feather is a decorative physical fantasy object, not a living bird. Long graceful silhouette leaning inward to the left, with five or six broad sweeping feather lobes, not hundreds of thin strands. Readable and beautiful at120px.
Input references: firstimage supplies ONLY broad stylized painterly Warcraft asset finish, not mushrooms; secondimage supplies ONLY warm gold/crimson blood-elf palette and elegant curves, not rectangular frame architecture.
Style: hand-painted Warcraft game asset with broad smooth painterly planes and restrained warm edge highlights, quiet shadows, little surface detail. Not photorealistic, PBR, shiny 3D metal, realistic fine feather strands or a glossy icon. Keep the form simple and dignified.
Composition: square approximately1024x1024, one complete isolated feather centered with transparent padding, all tips visible, bottom quill atbottom. Slight three-quarter frontal view.
Constraints: genuine transparent alpha outside object. No background/scenery/groundplane/castshadow, glow cloud, flame or particles, checkerboard painting, UI/letters/logos/watermark, fullbird, face, eyes, gem arrays, extra objects or rectangular frame.


