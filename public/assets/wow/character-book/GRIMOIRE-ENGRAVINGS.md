# Chapter engravings — 2026-09-26

Generated with the built-in imagegen tool (not the CLI). Final atlas:
`public/assets/wow/character-book/grimoire-engravings-v1.png`.
Source: `/home/debian/.codex/generated_images/01a0a571-6e23-7c62-9ad5-a3f11da099cd/exec-913369ec-5bce-4877-a9e3-8383e304409d.png`.

The 1536×1024 RGBA source is copied intact; its alpha is preserved. Six cells
in a 3×2 sheet: armory, talents, rotation / logs, history, compass. Runtime uses
Next Image's optimized 640px derivative (320px at 2×) via `physicalBookMaterials`; CSS selects
each cell without six independent image downloads. Images are decorative only,
aria-hidden and pointer-inert. Real item/spell icons, labels, numbers and character
data are never baked into the artwork. Small ink accents use multiply blending
on the existing parchment; the sheet does not replace the page background.

## Initial prompt

Use case: stylized-concept. Asset type: production decorative sprite atlas for an antique Warcraft character grimoire website. Create ONE transparent PNG atlas, landscape aspect ratio 3:2, exactly 3 equal columns by 2 equal rows, SIX isolated illustrations centered precisely in the six equal cells with generous empty transparent margins. Top row left: heraldic round shield with crossed broad swords and small laurel. Top row center: arcane constellation diagram with a small faceted gem and branching flourishes. Top row right: two crossed curved blades with a swirling combat flourish. Bottom row left: feather quill beside a tiny inkwell and an unfurled scroll. Bottom row center: antique hourglass between short laurel branches. Bottom row right: ornate cartographer's compass rose, eight-pointed, surrounded by delicate circular measuring lines. Style: old World of Warcraft quest-book marginalia, intricate but confidently hand-drawn sepia copperplate engraving, worn brown ink, warm muted antique gold linework, subtle imperfect hand hatching. Flat ink illustration printed on parchment, NOT realistic objects sitting on a page, NOT glossy 3D, no drop shadows. The PNG background including spaces within linework must be genuinely transparent, no paper, no tiles, no painted checkerboard, no frame boxes. Each design occupies only central 72% of its cell, all six remain separated. Consistent line weight, readable small at 90 pixels. No text, letters, numbers, labels, runes, logo or watermark. This is a usable UI decoration atlas, not a screenshot or book mockup.

## Final refinement prompt

Edit this sprite atlas only to make it usable on parchment. Preserve EXACTLY the six objects, their 3-by-2 cell positions, scale, fine engraving lines, and canvas size. REMOVE the entire brown backdrop, haze and all rectangular background pixels. The resulting PNG must have a genuinely transparent alpha background everywhere outside the objects and in the gaps between their fine lines. Remove glossy cream highlights: convert the objects themselves to flat dark sepia ink copperplate engraving, with sparse muted antique-gold accents, not 3D gilded objects. No paper background, no white backdrop, no colored backdrop, no gradients, no drop shadows, no additional frames or text. These are ink drawings to be overlaid on a website's existing light parchment; a dark rectangular background would be incorrect. Deliver transparent PNG.
