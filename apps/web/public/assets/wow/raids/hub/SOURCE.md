# Raid hub environment art

Generated for Gildra on 2026-10-25 using the built-in `image_gen` tool (default built-in mode, two separate generation requests). These are original decorative environmental concepts, not official Blizzard screenshots, maps or boss portraits. Raid names and gameplay data remain the responsibility of the existing reviewed content sources.

## References and native sources

The existing Gildra `/assets/wow/mythic/dungeon-scenes/altar-of-fangs/scene.webp` and `/assets/wow/mythic/dungeon-scenes/the-blinding-vale/scene.webp` paintings were inspected before generation and supplied only as environmental painting style references. The new hub has its own cliffside serpent vault, jade mist and warm dusk composition; it does not use or modify the Mythic+ hub gateway image. Sporefall uses only the Vale as a style reference and depicts a quiet fungal forest, with no invented boss likeness.

Native tool outputs:

- Vault: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-908fe737-b107-412b-bafd-54d4ad7351e6.png`, 1672×941.
- Sporefall: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-2a933fb4-d11e-4c18-9026-0f2a17c2f9f6.png`, 1536×1024.

Byte-exact native copies are preserved at `/home/debian/gildra-raid-hub-release-20261025/asset-sources/raid-vault-native.png` and `sporefall-native.png`; encoding coordinates, sizes and hashes are also saved in `raid-art-encoding.json` alongside them.

## Encoding and composition

All derived assets use Sharp 0.35.5, WebP effort 6. Only crop/resize/encoding was performed after generation; no painting, compositing or synthetic detail was added.

| File | Dimensions | Quality | Bytes | Source crop x,y,w,h |
| --- | --- | --- | --- | --- |
| `vault.webp` | 1672×941 | 84 | 182306 | full vault |
| `vault-tablet.webp` | 768×760 | 82 | 92864 | 721,0,951,941 |
| `vault-mobile.webp` | 640×1000 | 82 | 81428 | 1030,0,602,941 |
| `venomous-abyss.webp` | 960×640 | 84 | 102190 | 472,60,1200,800 |
| `sporefall.webp` | 960×640 | 84 | 98034 | full forest |

The desktop vault has a quiet left half and the doorway on the right, near 77% width. The card crop keeps the same new illustration with a doorway focus around 69% width / 46% height. Sporefall's central clearing is near 57% width / 50% height.

`RaidHubBackdrop` chooses exactly one pre-encoded image with `picture`: mobile through 767px, tablet through 1023px, desktop otherwise. There is no parallel background preload or Next image optimizer request. The 660–1000px scene fades into the current theme's page background. Decorative layers have no pointer interaction and are hidden from assistive technology. Eighteen deterministic CSS motes (nine on phones) and a small gentle light pause in hidden tabs; site/OS reduced motion disables them, reduced transparency disables the atmospheric overlays, increased contrast dims the painting, and forced colours hides the backdrop. There is no JavaScript frame loop.

## SHA-256

| File | SHA-256 |
| --- | --- |
| `vault.webp` | `877508041e9c28c45edb9fbcaf4c80b68aabc395981df89a8397a9a38f967e32` |
| `vault-tablet.webp` | `ab7c570878b7d9804a03a698b5b37cee29a967b974ef65900a216671a954bffc` |
| `vault-mobile.webp` | `023a0c482858873d7b87b98457e7f9e1a1994e3afc18c1d40dd6f12ec628100c` |
| `venomous-abyss.webp` | `8cbc9b464b0bec278b78f44d23034593fea440e2f94d79e2708ec44d2e3605e3` |
| `sporefall.webp` | `0956cbe67082d06fcbd498e03766e74532160ad1db99f1a8df4cb942df8523f4` |
| `raid-vault-native.png` | `c9a559d8017e5f5f45eaa46f9fbd823b61dcacf06762efa904eb91731832e910` |
| `sporefall-native.png` | `d31843decffb69cc06bb81b02bf2fd6092388323380a940fb98ed3dfe32919fb` |

## Full vault generation prompt

Use case: stylized-concept.
Asset type: production website environmental background, opaque raster artwork only, not a website mockup.
Primary request: create a distinct, beautiful World of Warcraft painterly raid-hub environment inspired by the ancient troll serpent-vault of The Venomous Abyss. The two supplied existing Gildra paintings are STYLE REFERENCES ONLY for confident broad forms and Warcraft environmental painting. Create a NEW location and composition, not a remake of either reference.
Scene/backdrop: a vast ancient troll serpent-vault entrance built into a sweeping weathered mountain wall above a mist-filled ravine. The architecture has monumental, slightly irregular hand-hewn blue-grey and green stone, restrained aged bronze structural accents and a single broad serpent-headed lintel, with two simple curved fang-shaped pillars framing the doorway. A broad worn stone causeway leads toward the enormous vault. Behind the doorway soft emerald and jade mist suggests great subterranean depth, not an electric portal. Very distant layers of stone and jungle dissolve into warm dusk.
Composition/framing: wide landscape approximately 2048x1152. Place the one massive doorway focal point at x72% / y40%, in the RIGHT third. Keep all of the left 48% dark, quiet, open, with large soft layered ravine/cloud silhouettes and only sparse broad architectural edges at far left so real HTML can be overlaid. The right-side entrance silhouette must read clearly at card thumbnail size. Lower third is simple broad quiet shadowed stone and mist, not dense tiles. One believable continuous environment.
Style/medium: polished WoW painterly environmental concept art, broad confident brush shapes, chunky stylized materials, low microdetail, rich but restrained tonal variation, moderate local contrast, atmospheric depth. Not photorealistic, not a 3D render, not glossy AI wallpaper.
Lighting/mood: calm ominous wonder, soft jade atmosphere and a little warm bronze dusk light on the top right edges. Soft natural glow, no neon, no dramatic rays over text. Deep readable shadows without crushing the left half to featureless black. The doorway is luminous enough to be beautiful, but gentle.
Constraints: environment only; no characters, creatures or boss likeness. No typography, text, UI, cards, borders, ornamental frame, logo, watermark, runes resembling writing. No lava, slime rivers, bright acid-green liquid, arrays of gems, repeated neural patterns, dense tiny engravings, hundreds of blocks, high-frequency scratches, sharp microtexture, excessive particles, floating objects or multiple glowing rings. Do not include the Vale reference's giant flowers, yellow forest or seed pods. Do not recreate the Altar reference's exact tower, idol, staircase or composition.

## Full Sporefall generation prompt

Use case: stylized-concept.
Asset type: production website decorative environment illustration for a 3:2 raid archive card, opaque raster artwork only.
Primary request: paint a beautiful calm fantasy fungal forest of Harandar, associated with the Sporefall raid, in the same broad confident painterly World of Warcraft environment style as the supplied Gildra reference image. This is a decorative concept, not an official location screenshot or map. The supplied image is STYLE REFERENCE ONLY; create a new forest scene without its giant root bridges, bright flowers or seed-pod structures.
Scene/backdrop: an ancient quiet mushroom grove with a few very large rounded umbrella-like fungal caps growing from broad gnarled forest roots and dark earth. Soft desaturated sage-green undergrowth, warm muted amber gills catching gentle light, layered silhouettes of old trunks and more distant mushrooms disappearing into mist. A little curving clearing leads into the depth of the grove. The mushroom forms are organic and varied, with only a few larger clean silhouettes.
Composition/framing: landscape 3:2 approximately 1536x1024. Main open clearing in the central half, two or three major fungal silhouettes around the left and right edges. Leave the lower fifth quiet and dark for a real HTML overlay below. The scene should read clearly at 600 pixels wide. Environment only, no people, no creatures, no boss.
Style/medium: polished WoW painterly environmental concept art, stylized broad brush planes, low microdetail, restrained tonal variation, moderate contrast, soft depth, no photorealism or 3D render. Natural soft surfaces, not a dense repeated mushroom pattern.
Lighting/mood: tranquil mysterious twilight, desaturated green and amber palette, a small diffuse warm light in the far clearing, a few restrained soft bioluminescent hints beneath caps. No neon, no aggressive saturation, no harsh light rays.
Constraints: environment artwork only, no characters or boss likeness, no UI, cards, ornamental border, text, writing, runes, logos or watermark. No poison rivers, dense spore flecks, repetitive dots, high-frequency textures, intricate gills, hundreds of little mushrooms, overly sharp foliage, crystals, arrays of floating objects.

