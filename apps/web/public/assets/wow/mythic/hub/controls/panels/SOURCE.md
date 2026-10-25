# Mythic+ hub material panels and painted continuation

Generated on 2026-10-25 using the default built-in `image_gen` tool: eight separate transparent-background panel requests and one opaque continuation request. These are original decorative game-style illustrations, not official Blizzard screenshots. Existing dungeon art/map frames, all detail pages and the original gateway/768/mobile paintings remain unchanged.

Panels are real filled physical materials with a near-opaque dark face, unbroken straight lower rails and sparse individual corners; their external alpha is genuinely transparent. No gameplay data or visible text is baked into an asset. A solid themed CSS padding-box underfill is required below the preserved native alpha (center alpha243–254/255); never flatten the outside corners.

## Delivery and geometry

Sharp0.35.5 encoding only: alpha>8 bounding-box crop, proportional resize to752px wide,8px genuinely transparent padding, WebP alphaQuality100/effort6. No painting, masking, recoloring, compositing or alpha replacement after generation. All8assets are768px wide and under100000bytes each.

Use `manifest.json` root.entries values: URL path, actual width/height, native-pixel slices [top,right,bottom,left], measured native-pixel railInset, bytes and SHA256. Slices conservatively retain the corner motifs, leaving long straight quiet strips for CSS nine-slice fill/stretch. Suggested consuming scale is .18desktop/.14mobile. railInset selects the final bright physical straight lower fillet, measured from canvas bottom over central40–60% width; it is not merely the outer transparent padding. Raw row luma/alpha measurements and executable code are preserved under the release asset-sources directory.

| Slug | Dimensions | Slices t,r,b,l | Rail inset | Bytes | WebP quality |
| --- | --- | --- | --- | --- | --- |
| ruby-life-pools | 768×959 | 160,152,160,152 | 26 | 92906 | 82 |
| altar-of-fangs | 768×967 | 160,152,160,152 | 29 | 72204 | 82 |
| murder-row | 768×958 | 168,152,168,152 | 37 | 68956 | 82 |
| den-of-nalorakk | 768×964 | 160,160,160,160 | 32 | 64244 | 82 |
| the-blinding-vale | 768×954 | 160,152,160,152 | 29 | 97580 | 56 |
| voidscar-arena | 768×954 | 160,152,160,152 | 40 | 79084 | 82 |
| kings-rest | 768×942 | 160,160,160,160 | 39 | 46416 | 82 |
| temple-of-sethraliss | 768×962 | 160,152,160,152 | 30 | 45020 | 82 |

Native copies, exact full prompts, encoding records, alpha/rail measurements and generator mode/input references are preserved at `/home/debian/gildra-mythic-material-release-20261025/asset-sources/`. Source checks are engineering evidence, not new production assets. All eight outputs were visually inspected.

## Panel native sources and full prompts

### ruby-life-pools

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-fa6a15e2-4df2-499e-b634-e115ac8d7925.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/ruby-life-pools-native.png
- Native SHA256: e14aca78eef90863a364b8a115f0b820836ae6cbadf689d2a874449284d928b2
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/ruby-sanctuary/map-frame.webp; SHA256 5680205f1ad0413d096344c8b2410530745b8976afaaf5e4020e19fed4fbcba8.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":21,"top":17,"width":1081,"height":1355}.
- Center alpha: 247–252; outer painted inset 21; bright lower fillet inset 26.
- Final SHA256: 18ab01afdf52e1650b415e22f7d261da45a5fd7ae7280fe10d3c6c08c7fd67c7.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: Ruby Life Pools red-dragon sanctuary. Broad flat filled center of very dark desaturated burgundy/red-slate. Thin antique gold rails backed by charcoal stone, soft simple sweeping dragonflight corner clasps, one tiny non-glowing ruby inset confined to each upper corner. Quiet red/charcoal/gold, no dragon or large crest.

### altar-of-fangs

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-bd8adfa8-915b-4fac-afc9-3b45fad5a18c.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/altar-of-fangs-native.png
- Native SHA256: 3b07d2210a2d68de5a95d29d7b657487d9a13ff4b344c4ff4dfcc26bdd2143ab
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/altar-of-fangs/map-frame.webp; SHA256 325b349ab85efe3631d868b6ac0b08cd6e40ac2d4a0a7f197ce7549ee07b004e.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":33,"top":19,"width":1056,"height":1335}.
- Center alpha: 252–254; outer painted inset 23; bright lower fillet inset 29.
- Final SHA256: 0af3943a0e178af2fbd6f50f57c7da745fce090c1ee302e9cef5305e559b9a0f.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: Altar of Fangs troll ritual temple. Broad flat filled center of very dark desaturated jade/olive stone. Thin aged bronze and dark stone rails; two simple broad ivory fang-shaped corner clasps fully inside the edge band. Muted green jade/bronze/ivory, no skull, statue or central crest.

### murder-row

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-dfeb79e2-d723-4fe7-bcba-68158031392b.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/murder-row-native.png
- Native SHA256: 11d3e5c8b533f0d02e3bd5e02f5c77024541f0a3c4579892e84bf06b49baf49c
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/murder-row/map-frame.webp; SHA256 9f2f50f28a726812d9575face0668c38fb11658777ce31085b9f417f3b43bdf7.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":12,"top":4,"width":1098,"height":1375}.
- Center alpha: 251–253; outer painted inset 32; bright lower fillet inset 37.
- Final SHA256: 191f816ea7431d15bd565355fe08be19a47f6195732b35c99e5a7911f24683ec.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: Murder Row elegant sinister blood-elven district. Broad flat filled center of very dark desaturated aubergine/plum material. Thin warm antique gold rails with subdued deep wine-red inlays, four graceful elven pointed-sweep corner clasps. Restrained plum/wine/gold, no big gem or central crest.

### den-of-nalorakk

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-693178f3-fc79-413a-afc6-8861fd388d95.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/den-of-nalorakk-native.png
- Native SHA256: e27ef7de11846f6dbfdbcb9286928233183cf3dd41db9f4f6effc151c144a774
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/den-of-nalorakk/map-frame.webp; SHA256 92be88f12f6b7220da600c9201af20fc5f25e1a78f007c4e57fc9e19df3c27c4.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":33,"top":25,"width":1055,"height":1330}.
- Center alpha: 252–254; outer painted inset 18; bright lower fillet inset 32.
- Final SHA256: 305f79f0cf8c038ef640990f4e94aaf57a3552520449c16af75c4cf433de105b.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: Den of Nalorakk cold Amani bear-stone sanctuary. Broad flat filled center of deep blue-grey slate stone, smooth and quiet. Thin bronze and cyan-grey stone rails, simple blocky broad paw-like clasps in corners with no detailed toes. A little matte icy teal inlay, no snow piled over text, no bear head or big crest.

### the-blinding-vale

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-6a14f1aa-fcf4-466c-83c6-f5924f8212cd.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/the-blinding-vale-native.png
- Native SHA256: 617ee73184e1243d0329a717081b96b3f6d49da4db3fcd088d9de9d203468338
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/the-blinding-vale/map-frame.webp; SHA256 ee2750b6ad5167b1d634a615b2f733bae2523d6d9288d735cadc3c0debe31179.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":21,"top":17,"width":1082,"height":1349}.
- Center alpha: 243–253; outer painted inset 20; bright lower fillet inset 29.
- Final SHA256: a38b0be9eec0fd7d0ec867159e47c1bd8d7f3e36db4495f50274a91b27a120dd.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: The Blinding Vale living root sanctuary. Broad flat filled center of very dark desaturated olive/green heartwood, almost charcoal olive. Thin ivory-worn wood and aged gold rails, a few broad gently curved roots at the four corners, one large simple muted olive leaf in each corner within its edge band. No grain, veins, twig carpet, flowers or central crest.

### voidscar-arena

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-baaec2f8-f07b-427b-a9b4-903480707a83.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/voidscar-arena-native.png
- Native SHA256: 1dd32d8e0f505f97bb0b52dc3c8c4c3aba22b341f6868f6036992c65b858a80d
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/voidscar-arena/map-frame.webp; SHA256 2012ebd3d9025d63fef237e0e7c17df1c20c03f2d9b455206035ed8339a3cdb4.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":28,"top":28,"width":1066,"height":1329}.
- Center alpha: 247–253; outer painted inset 33; bright lower fillet inset 40.
- Final SHA256: 8738b668ad8856ab0b32f563d3c4e1a213e42676ed87a7d5a73572f81583f2bb.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: Voidscar Arena mysterious void-metal arena. Broad flat filled center of deep desaturated violet-charcoal metal. Thin blackened bronze rails with a restrained violet stone inset, simple angular sweeping corner clasps with soft broad beveled edges. No vivid neon, spikes reaching into center, galaxy texture or big crest.

### kings-rest

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-4fa00dec-4d94-4ee4-940c-db2cb472f0a0.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/kings-rest-native.png
- Native SHA256: f5e00df4390f0bea152a28f3b09ceee8450f125c1e2e45cb01b25849c150a8a1
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/kings-rest/map-frame.webp; SHA256 9144dbeec61fc99115ac2e33e53a3098382d838f94dee9e67f85ff5b39229c72.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":17,"top":17,"width":1088,"height":1340}.
- Center alpha: 252–254; outer painted inset 26; bright lower fillet inset 39.
- Final SHA256: 8cb82815e2f8e283ae54b016605b60f7cc07db4a41a31ab107b03c1e213332c5.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: King's Rest Zandalari royal tomb. Broad flat filled center of very dark desaturated teal slate. Thin muted antique gold rails, large simple stepped geometric corner clasps, small dark teal rectangular insets confined to corners. No masks, faces, repeated zigzags or central crest.

### temple-of-sethraliss

- Mode: default built-in image_gen; transparent_background:true.
- Native tool output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-7bf35050-ffa3-4106-b509-4bd7e67dd0b6.png
- Native copy: /home/debian/gildra-mythic-material-release-20261025/asset-sources/panels/temple-of-sethraliss-native.png
- Native SHA256: 4d7ba7ec0df06a5b4d43d245c9e364224d18b77c34a22070759a067c1de073b6
- Input1 style/material reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/dungeon-scenes/temple-of-sethraliss/map-frame.webp; SHA256 70c3cf27099439ac615b354f8461d7dcd5f9105dbc946a8ea18c31477e5a756c.
- Input2 filled-panel geometry/style reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp; SHA256 7d3176de10605b7e15f058b52fa59f4dedd280714bf215499acfd390fec1d1c3.
- Alpha>8 crop: {"left":33,"top":23,"width":1056,"height":1328}.
- Center alpha: 252–254; outer painted inset 21; bright lower fillet inset 30.
- Final SHA256: 3f422a09d8945c8ff687099356c23a60a9f45ba9d584283e6f4a7453aecee754.

Full prompt:

Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: specific dungeon frame, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: finished supporting material panel used ONLY as the filled-panel shape and orthographic construction reference, not its green theme.
Primary request: create a new tall physical text panel with its own dungeon materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and91–97%, y3–9% and91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no painting, no light source, no strong vignette. Material must be visibly tinted but dark. Very low contrast broad tone variation ONLY. Smooth simple material with no grain, noise, speckling, scratches, tiny cracks, microtexture, marble veins, dense engraving, repeated runes or gem arrays.
Style: confident hand-painted Warcraft game interface craftsmanship with broad clean planes and quiet soft edge highlights. Not photorealistic, not PBR, not glossy 3D, not high contrast. Clear physical silhouette, no blurred drop-shadow cloud pretending to be a panel.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel; filled face/rails are opaque. No text, letters, numbers, symbols pretending to be writing, logos, watermark, fake checkerboard, UI mockup, extra objects, characters or creatures. Keep huge clear safe space for text. No large central top or bottom decoration. Four corner details only.
Material/theme: Temple of Sethraliss desert serpent temple. Broad flat filled center of deep desaturated turquoise/teal-brown slate. Thin sand-worn bronze rails with subdued turquoise patina, restrained broad smooth serpent-curve corner clasps. No actual snake heads, scales, sandy grain, carvings or central crest.

## Full-page continuation

The approved hero gateway remains byte-exact. `../../continuation.webp`, `../../continuation-tablet.webp` and `../../continuation-mobile.webp` derive from one separately generated coherent lower mountain ravine painting. The browser selects one continuation crop plus one hero crop, with no duplicate variant preload. This new painting is an individual below-fold image, not a second giant portal or repeated hero scene.

- continuation.webp: 971×1619, 150108bytes; SHA256 e9cb97a2feeeebe58f1674e43cf213355609873218886bfe94d3bcd0422f4ea9.
- continuation-tablet.webp: 768×1280, 99310bytes; SHA256 09641bbe11e5007457f32103659547464a178e338aa2b4775d0419ef7055eac1.
- continuation-mobile.webp: 576×1600, 78334bytes; SHA256 1147296bce0491e20ebc106f3532e59e77b4d68d09fcbede87d8a400bb8f0086.

Mode: default built-in image_gen, transparent_background:false. Reference: /home/debian/Gildra-mythic-material-20261025/apps/web/public/assets/wow/mythic/hub/gateway.webp; SHA256 f8bf4ff6c9993d0e10dc1b064c7090546fde08c19b6c511e0f9e76e26317d36b. Native output: /home/debian/.codex/generated_images/01a17401-deb7-7c00-a6e3-bd1cd23ed7ca/exec-bb19de66-ee58-41c1-b9d9-1554404db2d7.png; native SHA256 687ff484b8372c4caee72cb9b326d5012b53d2e1fab4fea9f580855b4ab96136; exact copy /home/debian/gildra-mythic-material-release-20261025/asset-sources/continuation/continuation-native.png.

Sharp encoding: desktop original971×1619 width unchanged, quality82; tablet center-cover768×1280, quality80; mobile center-cover576×1600, quality80; effort6 throughout. Only resize/crop/encoding, no generated image edits.

The consuming component uses responsive pictures, a slow small portal bloom, sparse rain/motes and two soft viewport mist layers. The painted backdrop is static. Intersection, document visibility, OS/site/local reduced motion, reduced transparency and forced colours gate every animation; no frame loop. No-JavaScript mode keeps all real page content readable with static artwork.

Full continuation prompt:

Use case: stylized-concept.
Asset type: real painted lower continuation artwork for a production fantasy website, not a mock webpage.
Input image: approved current Gildra Mythic+ hub gateway artwork, style/location reference ONLY. Keep its original file unchanged; generate a new separate lower environment continuing its cold blue stone mountain valley and ancient terrace downwards.
Scene: the view descending below that gateway terrace into a broad quiet slate-blue stone ravine with distant mountains layered in atmospheric blue mist, enormous simple worn rock planes at the far left and right, a few distant broken stone pillars near the far edges. A lower damp stone terrace and a quiet dark meandering path recede toward the deep mist. The upper part is gently hazy to blend under the original terrace, middle and lower parts have broad visible material shapes but low contrast and little detail, suitable beneath real webpage cards and a footer. Soft cool indirect light, extremely sparse aged bronze traces on edge architecture. One coherent continuous believable valley, no repeated scenes or tiling.
Composition: tall full-page environment approximately 1200x2000, painted side architecture around a broad calm open center. Keep the same blue hour/slate blue/desaturated teal and muted aged gold language as the reference. Avoid a bright horizon; maintain moderate dark readable atmosphere. This is an extended lower location, NOT another hero focal point.
Style: polished hand-painted Warcraft environmental art, confident broad forms, low micro-detail, very soft atmospheric depth and restrained bloom. No photorealistic textures, no noisy grain, no AI pattern carpet, no detailed rubble or dense foliage.
Constraints: NO second portal, arch gateway, glowing ring, castle, giant statue, person, creature, object cluster, conspicuous light source, neon, picture frame, interface, cards, borders, letters, words, runes, logos or watermark. No black void; real calm environment remains visible from top to bottom. Only opaque raster artwork.
