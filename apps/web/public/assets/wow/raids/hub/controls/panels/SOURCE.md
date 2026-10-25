# Raid hub material text panels

Generated on 2026-10-25 with the built-in `image_gen` tool in default built-in mode, five separate new transparent-background generation requests. The existing five approved Warcraft art frames were inspected and supplied only as style, palette and material references. Their files and compositions remain unchanged.

These are original decorative game-style supporting text panels, not official extracted Blizzard assets. They extend each art frame's identity below the image: jade stone/gold; dark void metal/violet crystal; ivory heartwood/green; crimson velvet/gold; umber wood/moss/amber fungus. Each has a broad filled material face, a clear physical edge and sparse corner accents. They contain no text or gameplay data.

## Final encoding and recommended nine-slice values

Sharp0.35.5 cropped only the transparent exterior (nontrivial alpha threshold>8), resized proportionally and added8px transparent exterior padding. WebP effort6 /alphaQuality100; quality shown below. No painting, recoloring, flattening, alpha replacement or other post-generation visual edit was performed. The generated interior material and outline alpha were preserved.

All five files are768px wide and individually below100000 bytes, totaling365470 bytes.

| File | Dimensions | WebP quality | Bytes | Recommended slice: top right bottom left |
| --- | --- | --- | --- | --- |
| `venomous-abyss.webp` | 768×959 | 82 | 62406 | 168 144 144 144 |
| `the-voidspire.webp` | 768×942 | 82 | 48454 | 136 112 136 112 |
| `the-dreamrift.webp` | 768×945 | 82 | 97748 | 160 128 160 128 |
| `march-on-queldanas.webp` | 768×939 | 82 | 58826 | 160 144 160 144 |
| `sporefall.webp` | 768×947 | 80 | 98036 | 136 128 136 128 |

Slice numbers are source-image pixels at the final768px asset width, including the8px transparent padding. They conservatively retain the full corner motifs while leaving long, quiet middle rails and a broad continuous center to stretch. Use nine-slice `fill` and `stretch`, rather than treating the panel as a single stretched bitmap. A rendered border width around22–28px on desktop /18–22px on phones is a suitable starting point; actual layout and text padding belong to the consuming component.

The exterior is genuinely transparent. The generator's filled central face has near-opaque alpha251–254/255 rather than exact255 throughout; there are no transparent center holes. Preserve that native matte, and use a solid themed underfill clipped to the CSS padding box for strictly opaque combined text material, while keeping the exterior corners transparent. Do not replace the material with a blurred shadow or fade it away.

## Validation and source preservation

Native copies, complete prompt TXT files and `panel-encoding.json` are saved at `/home/debian/gildra-raid-controls-release-20261025/asset-sources/panels/`.

Checks, current-reference SHA comparisons, center/exterior alpha statistics and deterministic nine-slice proofs at330×820 and640×640 are saved at `/home/debian/gildra-raid-controls-checks-20261025/panels/`. Those PNG proofs are QA artifacts, not extra production assets. This task changed assets and this provenance document only; no TypeScript, CSS, existing art/frame raster, combat data or routes were edited.

## Native sources, references, hashes and full prompts

### venomous-abyss

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-796930ef-20ae-43a9-9a04-bce1f48d5e41.png`.
- Native copy: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/panels/venomous-abyss-native.png`; 1122×1402, 1847113 bytes.
- Native SHA-256: `770cd75a6c5ba658a503b6e24268f3a06840c49e508e5857ed1a5dd5b03b8516`.
- Reference: `apps/web/public/assets/wow/raids/hub/stylized/frames/venomous-abyss.webp`; SHA-256 `c9dc7826087f2daa55b826b53d9b94df7acae23ce0b58eeb83bc91eb368847e5`.
- Safe alpha crop (alpha>8): x42,y39,w1040,h1304; then proportional resize to752px wide and8px transparent padding on all sides.
- Final SHA-256: `7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3`.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Primary request: create a new tall rectangular physical material tablet for website text, related to the supplied approved Warcraft art frame. The supplied frame is a STYLE/PALETTE/MATERIAL REFERENCE only; do NOT edit it or recreate a second loud picture frame. This is a quieter supporting panel to sit below it.
Composition/framing: portrait canvas approximately1024x1280, straight-on orthographic front view, four nearly straight consistent THIN rails, restrained softly beveled corners. Entire physical panel fits inside the canvas with3% genuinely transparent exterior padding. Physical edge occupies roughly x3–9% and91–97%, top/bottom y3–9% and91–97%. Sparse corner details stay fully INSIDE those edge rails. The central x12–88%/y12–88% area is one broad calm continuous OPAQUE material face.
CRITICAL CENTER: this panel is FILLED, not an empty picture frame. The center MUST be completely opaque dark material, a real quiet surface on which bright HTML text will be readable. Do not cut a transparent hole. No scenery, painting or light source in the center. The surface is clearly colored material, not pure black or a blurred shadow. Very low contrast broad tonal variation, no strong vignette.
Style/medium: hand-painted Warcraft game interface material, broad clean planes, simple carved/beveled shape language, quiet painterly edge highlights. NOT photorealistic, NOT PBR, NOT realistic grain, no microtexture, dense scratches, tiny cracks, noise, intricate runes, gem arrays or glossy 3D render.
Constraints: genuine transparent alpha ONLY outside the physical panel. OPAQUE filled face and rails. No text, letters, numbers, symbols pretending to be writing, logos, watermark, checkerboard painting, cards/UI mockup, extra objects, characters, creatures or boss. No drop-shadow cloud or blurred floating black rectangle. Preserve wide safe space for text; no corner decoration reaches into the center.
Material/theme: ancient troll jade-stone text tablet. Filled center is a quiet deep desaturated JADE/GREEN-SLATE stone plane, not black; thin warm aged-GOLD/bronze fillets and clean chamfered jade-stone rails. Two restrained angular corner clasps with a tiny serpent-curve suggestion in the rail only, no large serpent head or crest. Broad smooth stone face, no speckles or marble veins. Match the reference jade/gold identity while remaining calmer and thinner.

### the-voidspire

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-bbe02609-ff62-408c-85f5-93a79291f2ec.png`.
- Native copy: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/panels/the-voidspire-native.png`; 1122×1402, 1784329 bytes.
- Native SHA-256: `5650aaf7c2d4cbd1f4d624ce841eb8b46991ce79cb3cedb6dad497645b86cfda`.
- Reference: `apps/web/public/assets/wow/raids/hub/stylized/frames/the-voidspire.webp`; SHA-256 `07ffd0c0bd01cacb8582678712b88bf5713a3ea8e6980af625b0da4656c58dd0`.
- Safe alpha crop (alpha>8): x30,y37,w1065,h1311; then proportional resize to752px wide and8px transparent padding on all sides.
- Final SHA-256: `65486a6bc69f39ffc4b93dd4721c8d51ebb186c5b8f345998a5252cad5ebcfff`.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Primary request: create a new tall rectangular physical material tablet for website text, related to the supplied approved Warcraft art frame. The supplied frame is a STYLE/PALETTE/MATERIAL REFERENCE only; do NOT edit it or recreate a second loud picture frame. This is a quieter supporting panel to sit below it.
Composition/framing: portrait canvas approximately1024x1280, straight-on orthographic front view, four nearly straight consistent THIN rails, restrained softly beveled corners. Entire physical panel fits inside the canvas with3% genuinely transparent exterior padding. Physical edge occupies roughly x3–9% and91–97%, top/bottom y3–9% and91–97%. Sparse corner details stay fully INSIDE those edge rails. The central x12–88%/y12–88% area is one broad calm continuous OPAQUE material face.
CRITICAL CENTER: this panel is FILLED, not an empty picture frame. The center MUST be completely opaque dark material, a real quiet surface on which bright HTML text will be readable. Do not cut a transparent hole. No scenery, painting or light source in the center. The surface is clearly colored material, not pure black or a blurred shadow. Very low contrast broad tonal variation, no strong vignette.
Style/medium: hand-painted Warcraft game interface material, broad clean planes, simple carved/beveled shape language, quiet painterly edge highlights. NOT photorealistic, NOT PBR, NOT realistic grain, no microtexture, dense scratches, tiny cracks, noise, intricate runes, gem arrays or glossy 3D render.
Constraints: genuine transparent alpha ONLY outside the physical panel. OPAQUE filled face and rails. No text, letters, numbers, symbols pretending to be writing, logos, watermark, checkerboard painting, cards/UI mockup, extra objects, characters, creatures or boss. No drop-shadow cloud or blurred floating black rectangle. Preserve wide safe space for text; no corner decoration reaches into the center.
Material/theme: Voidspire supporting text tablet. Filled center is a quiet deep PLUM/SLATE darkmetal plane, not black; thin dark obsidian-metal bevel rails with a narrow restrained VIOLET inner edge. Two small simple violet crystal corner insets, no giant shards or top crest. Center remains broad opaque flat metal with only very soft broad painterly tones, no fractures or noise. Match the reference angular void identity but with much thinner quieter rails.

### the-dreamrift

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-71ad1a5c-b870-49f7-964d-6c56107a6d51.png`.
- Native copy: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/panels/the-dreamrift-native.png`; 1122×1402, 2057577 bytes.
- Native SHA-256: `e89b78668c384c89458eee3b164a7cabfe63be4f02ee6b6e02bc893dbc179128`.
- Reference: `apps/web/public/assets/wow/raids/hub/stylized/frames/the-dreamrift.webp`; SHA-256 `396f7cfa737940b10a8e84e8d317039820bd731abf75db9ad2320b3de3e07c3d`.
- Safe alpha crop (alpha>8): x25,y25,w1072,h1325; then proportional resize to752px wide and8px transparent padding on all sides.
- Final SHA-256: `8c0772a03133108c25931dcce56d01ca4761daaca938c991bc945b2a292af62a`.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Primary request: create a new tall rectangular physical material tablet for website text, related to the supplied approved Warcraft art frame. The supplied frame is a STYLE/PALETTE/MATERIAL REFERENCE only; do NOT edit it or recreate a second loud picture frame. This is a quieter supporting panel to sit below it.
Composition/framing: portrait canvas approximately1024x1280, straight-on orthographic front view, four nearly straight consistent THIN rails, restrained softly beveled corners. Entire physical panel fits inside the canvas with3% genuinely transparent exterior padding. Physical edge occupies roughly x3–9% and91–97%, top/bottom y3–9% and91–97%. Sparse corner details stay fully INSIDE those edge rails. The central x12–88%/y12–88% area is one broad calm continuous OPAQUE material face.
CRITICAL CENTER: this panel is FILLED, not an empty picture frame. The center MUST be completely opaque dark material, a real quiet surface on which bright HTML text will be readable. Do not cut a transparent hole. No scenery, painting or light source in the center. The surface is clearly colored material, not pure black or a blurred shadow. Very low contrast broad tonal variation, no strong vignette.
Style/medium: hand-painted Warcraft game interface material, broad clean planes, simple carved/beveled shape language, quiet painterly edge highlights. NOT photorealistic, NOT PBR, NOT realistic grain, no microtexture, dense scratches, tiny cracks, noise, intricate runes, gem arrays or glossy 3D render.
Constraints: genuine transparent alpha ONLY outside the physical panel. OPAQUE filled face and rails. No text, letters, numbers, symbols pretending to be writing, logos, watermark, checkerboard painting, cards/UI mockup, extra objects, characters, creatures or boss. No drop-shadow cloud or blurred floating black rectangle. Preserve wide safe space for text; no corner decoration reaches into the center.
Material/theme: Dreamrift supporting text tablet. Filled center is a quiet deep desaturated EMERALD/FOREST-GREEN stained-wood plane, not black. Thin pale IVORY HEARTWOOD rails curve very gently around the rectangle, with one or two broad leaf forms restrained inside the top-left/bottom-right rail corners. Soft clean pale wood bevels, no dense root braids or tiny grain. Center is an opaque broad smooth wood face with very subtle broad tonal variation. Match the reference ivory-wood/green identity with thinner rails.

### march-on-queldanas

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-78420790-0657-4195-9bc2-da784b1bc33d.png`.
- Native copy: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/panels/march-on-queldanas-native.png`; 1122×1402, 1795978 bytes.
- Native SHA-256: `58e2753aa2ae7fe3c47370f0476cd4d51ea2505aef0697b9fac47e6b7b4d657c`.
- Reference: `apps/web/public/assets/wow/raids/hub/stylized/frames/march-on-queldanas.webp`; SHA-256 `a91211e2e07c863f169b1200b4dc4781c33d564df6bf6a9773e0ed927e987b04`.
- Safe alpha crop (alpha>8): x21,y16,w1081,h1327; then proportional resize to752px wide and8px transparent padding on all sides.
- Final SHA-256: `e5bb415dcff498cb3693d55e6744c2da85273fd3f80fdabc7a9e7bccd705001f`.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Primary request: create a new tall rectangular physical material tablet for website text, related to the supplied approved Warcraft art frame. The supplied frame is a STYLE/PALETTE/MATERIAL REFERENCE only; do NOT edit it or recreate a second loud picture frame. This is a quieter supporting panel to sit below it.
Composition/framing: portrait canvas approximately1024x1280, straight-on orthographic front view, four nearly straight consistent THIN rails, restrained softly beveled corners. Entire physical panel fits inside the canvas with3% genuinely transparent exterior padding. Physical edge occupies roughly x3–9% and91–97%, top/bottom y3–9% and91–97%. Sparse corner details stay fully INSIDE those edge rails. The central x12–88%/y12–88% area is one broad calm continuous OPAQUE material face.
CRITICAL CENTER: this panel is FILLED, not an empty picture frame. The center MUST be completely opaque dark material, a real quiet surface on which bright HTML text will be readable. Do not cut a transparent hole. No scenery, painting or light source in the center. The surface is clearly colored material, not pure black or a blurred shadow. Very low contrast broad tonal variation, no strong vignette.
Style/medium: hand-painted Warcraft game interface material, broad clean planes, simple carved/beveled shape language, quiet painterly edge highlights. NOT photorealistic, NOT PBR, NOT realistic grain, no microtexture, dense scratches, tiny cracks, noise, intricate runes, gem arrays or glossy 3D render.
Constraints: genuine transparent alpha ONLY outside the physical panel. OPAQUE filled face and rails. No text, letters, numbers, symbols pretending to be writing, logos, watermark, checkerboard painting, cards/UI mockup, extra objects, characters, creatures or boss. No drop-shadow cloud or blurred floating black rectangle. Preserve wide safe space for text; no corner decoration reaches into the center.
Material/theme: blood-elf Sunwell supporting text tablet. Filled center is a quiet dark CRIMSON/BURGUNDY velvet material plane, not black, smooth with only broad restrained shading, NO fabric grain, folds or wrinkles. Thin elegant warm GOLD rails and a slim crimson enamel inset. Sparse small swept gold leaf/feather corner tips stay within rails, no bird crest and no gem arrays. Match the reference red/gold phoenix elegance in a quieter functional material surface.

### sporefall

- Tool output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-f970cf74-6eb0-42e3-9fe3-6994df764d17.png`.
- Native copy: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/panels/sporefall-native.png`; 1122×1402, 1950980 bytes.
- Native SHA-256: `9fd6869b9f04f372d037a5407b4a32659784348bb35a9dad7e002060d33f497e`.
- Reference: `apps/web/public/assets/wow/raids/hub/stylized/frames/sporefall.webp`; SHA-256 `a46b507f4b8228c8ece9f82257b69bbd6c719200a85ac8ec0dcba23df376e798`.
- Safe alpha crop (alpha>8): x33,y47,w1057,h1308; then proportional resize to752px wide and8px transparent padding on all sides.
- Final SHA-256: `5a2dc8e31a5131170903745b4d4ed41aaadcd65a2f73143aeab65622d5dd1656`.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Primary request: create a new tall rectangular physical material tablet for website text, related to the supplied approved Warcraft art frame. The supplied frame is a STYLE/PALETTE/MATERIAL REFERENCE only; do NOT edit it or recreate a second loud picture frame. This is a quieter supporting panel to sit below it.
Composition/framing: portrait canvas approximately1024x1280, straight-on orthographic front view, four nearly straight consistent THIN rails, restrained softly beveled corners. Entire physical panel fits inside the canvas with3% genuinely transparent exterior padding. Physical edge occupies roughly x3–9% and91–97%, top/bottom y3–9% and91–97%. Sparse corner details stay fully INSIDE those edge rails. The central x12–88%/y12–88% area is one broad calm continuous OPAQUE material face.
CRITICAL CENTER: this panel is FILLED, not an empty picture frame. The center MUST be completely opaque dark material, a real quiet surface on which bright HTML text will be readable. Do not cut a transparent hole. No scenery, painting or light source in the center. The surface is clearly colored material, not pure black or a blurred shadow. Very low contrast broad tonal variation, no strong vignette.
Style/medium: hand-painted Warcraft game interface material, broad clean planes, simple carved/beveled shape language, quiet painterly edge highlights. NOT photorealistic, NOT PBR, NOT realistic grain, no microtexture, dense scratches, tiny cracks, noise, intricate runes, gem arrays or glossy 3D render.
Constraints: genuine transparent alpha ONLY outside the physical panel. OPAQUE filled face and rails. No text, letters, numbers, symbols pretending to be writing, logos, watermark, checkerboard painting, cards/UI mockup, extra objects, characters, creatures or boss. No drop-shadow cloud or blurred floating black rectangle. Preserve wide safe space for text; no corner decoration reaches into the center.
Material/theme: Sporefall supporting text tablet. Filled center is a quiet deep warm UMBER/BROWN wooden face, not black, formed as one broad smooth continuous wood plane with almost no grain. Thin dark-brown rootwood rails, a little broad SAGE/MOSS-GREEN edging, and two tiny warm AMBER mushroom shelves tucked into the lower-left and upper-right rail corners. Keep mushrooms small and out of text space. No dense moss, leaves, knots, cracks or root tangles. Match the reference wood/moss/amber identity in a quiet practical text panel.


