# The Voidspire — extended page scene

The owner requested the existing upper painting continued downward into one coherent full-page environment. This is a decorative environmental outpaint, not a gameplay map or encounter data.

- Tool: built-in image_gen.imagegen edit; referenced image is the existing scene; transparent_background:false. One image generated.
- Input (unchanged): `/home/debian/Gildra-voidspire-materials-20261026/apps/web/public/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp`,1920×734, SHA-256 `5d06ad30fa5e42cd77b6f5a541426115cb53e23f76c266fbc3cb316545979c6c`.
- Exact full prompt: `/home/debian/gildra-voidspire-readability-20261026/prompts/scene-extended.txt`, SHA-256 `9fe6e72f7367ff104b0e478cb3c1d9c3d3866e8473360e0b12e580944323c5d3`; request JSON in the same external prompts directory.
- Untouched tool native: `/home/debian/gildra-voidspire-readability-20261026/native/scene-extended.png`,887×1774, SHA-256 `cfc644a8e1badfa8447e7e26597a24733a89d53166602a6e81952b5e8279cfae`. Native is byte-identical to tool output `/home/debian/.codex/generated_images/01a17779-35bb-7ed2-901f-1475e1d73bcc/exec-dfc22e18-384b-41e5-8e64-8a4330373a77.png`.
- Delivery: `/assets/wow/raids/voidspire-page/scene-extended.webp`,887×1774,204048 bytes, SHA-256 `881d314d67a7c2c7ff9123485498ed2e27ee301221f64525d11a260c13793b5f`.
- Packaging: native887×1774 dimensions preserved; WebPq84 effort6; no upscaling, crop, manual composite, painting, recolour or alpha edit. Native dimensions are preserved; no upscaling was performed. Original scene was not overwritten.

The full upper composition is visually retained near the top; tower, main eye, banner and side cliffs remain in corresponding positions. Built-in editing regenerated some fine details: the native upper339px compared to a proportional original resize has Pearson0.9152, mean absolute channel error11.42/255. It is deliberately not claimed pixel-identical. No manual restoration/compositing was performed.

The newly painted lower area continues the foreground into layered obsidian terraces, void ravines, violet haze and subdued cyan crystals, with readable dark terrain down to the bottom. Visual review found no hard horizontal join, mirrored/repeated tiling, stretched architecture or abrupt black fade. The generator's new terrain is decorative interpretation, not verified navigable route geometry.

Geometry in manifest.json records the approximate original top band (339.1 delivery pixels), decorative eye centre(535.00,101.00px; normalized0.60315671,0.05693348), and suggested hero focus. Rendering must preserve aspect ratio; root owns background integration and final page QA.
