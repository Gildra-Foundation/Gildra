# Painted raid button assets

Created 2026-10-25 UTC with the built-in image_gen tool, one separate original generation per raid. Each current matching stylized frame was viewed and supplied only as a style/material reference. Existing raid frames and their provenance were not modified. These assets have blank dark filled button faces and transparent exteriors.

A subsequent localized built-in EDIT removed only the small central top/bottom crest ornaments from the Voidspire and Quel’Danas buttons, replacing them with straight matching rails. Their crystal/phoenix end caps and dark faces remain. This makes the middle nine-slice section stretch horizontally without elongating a central ornament. The other three button WebP files and all their native files remain byte-for-byte unchanged. Previous native generations and the earlier two WebP variants remain archived under `audit/pre-center-crest-removal/`; current and original generation prompts are recorded below.

Native outputs, complete prompts, modes, reference paths and SHA256 are archived under `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/`. Public `manifest.json` provides native/final dimensions, recommended top/right/bottom/left slices, proportional slice widths at 64px rendered height, and the dark-face center.

## Processing and stretching

Only transparent-margin cropping, proportional resize to 768px width, and WebP encoding were applied with sharp (quality 88, alphaQuality 100, effort 4). Margin detection used alpha >8 and 8 native pixels of padding, retaining the complete visible button while trimming effectively transparent canvas fringe. No production RGB/alpha painting or compositing was used. Every final asset is below 80KB, all outer corner samples have alpha0, and center faces are dark and filled.

Use CSS `border-image` with each supplied slice and `fill`, preserving the fixed ornament caps and stretching the plain center. `recommendedWidthAt64px` scales the source slice widths to a 64px-high rendered button; other heights can multiply by height/64. Keep text inside the dark center face with room for both caps. Central rail alpha bounds in Void are exactly constant across x30–70%; Sun varies only one pixel on top and zero on the bottom. The final contact sheet was visually inspected.

## venomous-abyss

- Current mode: built-in image_gen generation with per-raid style reference.
- Original style reference: `/home/debian/Gildra-raid-controls-20261025/apps/web/public/assets/wow/raids/hub/stylized/frames/venomous-abyss.webp`; SHA256 `c9dc7826087f2daa55b826b53d9b94df7acae23ce0b58eeb83bc91eb368847e5`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-27fb3b37-e14d-459a-9845-8e1ea8b53f97.png` (2172×724).
- Archived native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/venomous-abyss.png`; SHA256 `639a85b10abffc0b2c50123ca43a38b842ce8202312b6ef540459cf81889cad0`.
- Crop: `{"left":37,"top":180,"width":2100,"height":363}`.
- Current final: `/assets/wow/raids/hub/controls/buttons/venomous-abyss.webp` (768×133, 25892 bytes); SHA256 `dfc0bd9f6fccb939ec5afed65d84fe9949ab726323d5920a14642aa9920ed942`.
- CSS slice: `40 128 29 156 fill`.
- Slice widths at 64px rendered height: `{"top":19.25,"right":61.59,"bottom":13.95,"left":75.07}`.

Exact current prompt:

> Use case: stylized-concept. Asset type: ONE premium World of Warcraft hand-painted fantasy UI BUTTON background, with genuine transparent exterior. The supplied raid frame is a STYLE AND MATERIAL reference only; create a new matching button. Ancient troll temple gold/bronze and poison jade. Small sculpted cobra-hood end cap at the far left and restrained curved fang/temple joint at the far right, jade inset edging, broad golden bevels. The central face is very dark jade-green. Composition: one single extremely wide, shallow horizontal physical button, front-on orthographic view, width approximately SIX TIMES its height (6:1 object). Use a wide landscape canvas with generous transparent air above and below; the complete object fits inside every edge. The button should occupy about 90% of canvas width, and its height should be about 15% of canvas width. Keep the middle 70% of the button a smooth quiet blank dark opaque face for a readable text label to be added later. The center is FILLED DARK, not a transparent hole. All ornament is concentrated in the outermost 15% left and outermost 15% right cap; continuous simple top and bottom rails connect the caps. Broad clean hand-painted shapes, rounded or smoothly beveled material edges, stylized soft highlights, clearly visible crafted physical rim, beautiful rich but restrained game art. Smooth Warcraft-painted rendering matching the reference, no realistic grain, no PBR, no photoreal texture, no scratches or speckle fields. No letters, numbers, words, glyphs or runes, no text-like marks, no icons floating over the center, no scenery, no cursor, no UI mockup or other controls. One button only. Actual alpha transparency outside the object, no checkerboard painting, no glow fog rectangle, no drop shadow filling the canvas.

## the-voidspire

- Current mode: built-in image_gen EDIT / localized center-crest removal.
- Original style reference: `/home/debian/Gildra-raid-controls-20261025/apps/web/public/assets/wow/raids/hub/stylized/frames/the-voidspire.webp`; SHA256 `07ffd0c0bd01cacb8582678712b88bf5713a3ea8e6980af625b0da4656c58dd0`.
- Immediate edit target: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/the-voidspire.png`; SHA256 `afa37fb3b6f7d1888c3f46833bfc724a46d36800fe91b324c530f560a5c28d31`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-ebd8dfbd-ff01-4aed-b338-e514e56ec6b9.png` (2172×724).
- Archived native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/the-voidspire-center-clean.png`; SHA256 `0dfcd599192c887bcc7c03d1ad39febe71d3d97115af441b74ce9ec054f9dfff`.
- Crop: `{"left":15,"top":129,"width":2143,"height":454}`.
- Current final: `/assets/wow/raids/hub/controls/buttons/the-voidspire.webp` (768×163, 25742 bytes); SHA256 `32f227904445bf5299a1804daf67c6fa13d372537f409d80861652a2fd8812e7`.
- CSS slice: `54 192 48 192 fill`.
- Slice widths at 64px rendered height: `{"top":21.2,"right":75.39,"bottom":18.85,"left":75.39}`.

Exact current prompt:

> Use case: precise-object-edit. EDIT the supplied existing wide Warcraft-painted button. Make ONLY a localized change in the horizontal center of its top and bottom rails: remove the small centered diamond/crest ornaments completely and replace those tiny raised areas with clean straight uninterrupted horizontal rail segments matching the existing adjacent rail material, cross-section, color and edge highlights. The middle sixty percent must have plain straight constant-height top and bottom rails so it can stretch horizontally. Preserve the existing end caps exactly, including every crystal/phoenix shape and ornament at both far ends; preserve their position, size, colors and composition. Preserve the exact long low overall layout, dark quiet opaque center face, original transparent exterior, original canvas dimensions and margins. Do not redesign, re-render new end ornaments, shift the button, add any new symbols or letters, or add any centered detail. Keep smooth broad Warcraft-painted materials. No new texture or grain. The dark face stays filled and blank. All outside background remains genuine alpha transparency. This is the obsidian/violet crystal button: remove the central TOP and BOTTOM dark diamond stone pieces; continue the adjacent flat charcoal stone rail and thin violet inner rim straight across the entire central section. Keep the original violet crystal end caps unchanged.

Original generation history:

- Native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/the-voidspire.png`; SHA256 `afa37fb3b6f7d1888c3f46833bfc724a46d36800fe91b324c530f560a5c28d31`.
- Previous WebP SHA256: `d7d84dc5a559f1e41255f774f6132324ce0d5b420330e6115b17aa6c1265ac87` (archived outside runtime).

Original generation prompt:

> Use case: stylized-concept. Asset type: ONE premium World of Warcraft hand-painted fantasy UI BUTTON background, with genuine transparent exterior. The supplied raid frame is a STYLE AND MATERIAL reference only; create a new matching button. Dark charcoal obsidian metal and smooth violet crystal. Compact angular violet crystal clusters integrated into the far left and far right end caps, smooth darkmetal bevels with a thin violet inner rim. The central face is almost-black cool violet. Composition: one single extremely wide, shallow horizontal physical button, front-on orthographic view, width approximately SIX TIMES its height (6:1 object). Use a wide landscape canvas with generous transparent air above and below; the complete object fits inside every edge. The button should occupy about 90% of canvas width, and its height should be about 15% of canvas width. Keep the middle 70% of the button a smooth quiet blank dark opaque face for a readable text label to be added later. The center is FILLED DARK, not a transparent hole. All ornament is concentrated in the outermost 15% left and outermost 15% right cap; continuous simple top and bottom rails connect the caps. Broad clean hand-painted shapes, rounded or smoothly beveled material edges, stylized soft highlights, clearly visible crafted physical rim, beautiful rich but restrained game art. Smooth Warcraft-painted rendering matching the reference, no realistic grain, no PBR, no photoreal texture, no scratches or speckle fields. No letters, numbers, words, glyphs or runes, no text-like marks, no icons floating over the center, no scenery, no cursor, no UI mockup or other controls. One button only. Actual alpha transparency outside the object, no checkerboard painting, no glow fog rectangle, no drop shadow filling the canvas.

## the-dreamrift

- Current mode: built-in image_gen generation with per-raid style reference.
- Original style reference: `/home/debian/Gildra-raid-controls-20261025/apps/web/public/assets/wow/raids/hub/stylized/frames/the-dreamrift.webp`; SHA256 `396f7cfa737940b10a8e84e8d317039820bd731abf75db9ad2320b3de3e07c3d`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-e60f1927-1af2-4c41-94a7-8d5f40b7920a.png` (2172×724).
- Archived native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/the-dreamrift.png`; SHA256 `edaa8784536db8cab3839a9288547a012b70397caedee605c40f3c4fca6c5e62`.
- Crop: `{"left":14,"top":148,"width":2142,"height":417}`.
- Current final: `/assets/wow/raids/hub/controls/buttons/the-dreamrift.webp` (768×150, 36664 bytes); SHA256 `2d836bd16c22ef5522bf769d6a0b1c8ad28824f3a748d03d186d20c3c1974213`.
- CSS slice: `48 190 39 190 fill`.
- Slice widths at 64px rendered height: `{"top":20.48,"right":81.07,"bottom":16.64,"left":81.07}`.

Exact current prompt:

> Use case: stylized-concept. Asset type: ONE premium World of Warcraft hand-painted fantasy UI BUTTON background, with genuine transparent exterior. The supplied raid frame is a STYLE AND MATERIAL reference only; create a new matching button. Smooth ivory heartwood vines and soft dream green. Two simple curling ivory vine end caps with a few broad green leaves at the far left and far right, gently curved pale bevel rails. The central face is very dark forest green. Composition: one single extremely wide, shallow horizontal physical button, front-on orthographic view, width approximately SIX TIMES its height (6:1 object). Use a wide landscape canvas with generous transparent air above and below; the complete object fits inside every edge. The button should occupy about 90% of canvas width, and its height should be about 15% of canvas width. Keep the middle 70% of the button a smooth quiet blank dark opaque face for a readable text label to be added later. The center is FILLED DARK, not a transparent hole. All ornament is concentrated in the outermost 15% left and outermost 15% right cap; continuous simple top and bottom rails connect the caps. Broad clean hand-painted shapes, rounded or smoothly beveled material edges, stylized soft highlights, clearly visible crafted physical rim, beautiful rich but restrained game art. Smooth Warcraft-painted rendering matching the reference, no realistic grain, no PBR, no photoreal texture, no scratches or speckle fields. No letters, numbers, words, glyphs or runes, no text-like marks, no icons floating over the center, no scenery, no cursor, no UI mockup or other controls. One button only. Actual alpha transparency outside the object, no checkerboard painting, no glow fog rectangle, no drop shadow filling the canvas.

## march-on-queldanas

- Current mode: built-in image_gen EDIT / localized center-crest removal.
- Original style reference: `/home/debian/Gildra-raid-controls-20261025/apps/web/public/assets/wow/raids/hub/stylized/frames/march-on-queldanas.webp`; SHA256 `a91211e2e07c863f169b1200b4dc4781c33d564df6bf6a9773e0ed927e987b04`.
- Immediate edit target: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/march-on-queldanas.png`; SHA256 `2af735768a4756f9f366aca33d921afe0034da6edd32e67ed54dd36238208992`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-589a49d1-2b8b-42cc-a59c-4931742e4715.png` (2172×724).
- Archived native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/march-on-queldanas-center-clean.png`; SHA256 `cbde1ee356496609229752878bb39ebf650e54a38cb19b18c1776bb58d77e54b`.
- Crop: `{"left":13,"top":131,"width":2148,"height":419}`.
- Current final: `/assets/wow/raids/hub/controls/buttons/march-on-queldanas.webp` (768×150, 27566 bytes); SHA256 `a74dfcc9b67d795194ea43fc695e962818842ee28222c5ab42ae82ba00d91360`.
- CSS slice: `51 156 36 156 fill`.
- Slice widths at 64px rendered height: `{"top":21.76,"right":66.56,"bottom":15.36,"left":66.56}`.

Exact current prompt:

> Use case: precise-object-edit. EDIT the supplied existing wide Warcraft-painted button. Make ONLY a localized change in the horizontal center of its top and bottom rails: remove the small centered diamond/crest ornaments completely and replace those tiny raised areas with clean straight uninterrupted horizontal rail segments matching the existing adjacent rail material, cross-section, color and edge highlights. The middle sixty percent must have plain straight constant-height top and bottom rails so it can stretch horizontally. Preserve the existing end caps exactly, including every crystal/phoenix shape and ornament at both far ends; preserve their position, size, colors and composition. Preserve the exact long low overall layout, dark quiet opaque center face, original transparent exterior, original canvas dimensions and margins. Do not redesign, re-render new end ornaments, shift the button, add any new symbols or letters, or add any centered detail. Keep smooth broad Warcraft-painted materials. No new texture or grain. The dark face stays filled and blank. All outside background remains genuine alpha transparency. This is the crimson and gold phoenix button: remove the small central TOP and BOTTOM gold/red pointed crest and replace each with the same straight gold/crimson parallel edging seen beside it. Keep the original phoenix-wing end caps unchanged.

Original generation history:

- Native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/march-on-queldanas.png`; SHA256 `2af735768a4756f9f366aca33d921afe0034da6edd32e67ed54dd36238208992`.
- Previous WebP SHA256: `9723c9eb560287c48dbb3f018dd28d9bd0c0f56e25cd55fc901e7e7205ceeef3` (archived outside runtime).

Original generation prompt:

> Use case: stylized-concept. Asset type: ONE premium World of Warcraft hand-painted fantasy UI BUTTON background, with genuine transparent exterior. The supplied raid frame is a STYLE AND MATERIAL reference only; create a new matching button. Blood elf warm gold and rich crimson. Compact sweeping phoenix-wing curls integrated into the far left and far right end caps, broad warm golden bevel rails and quiet crimson enamel accents. The central face is very dark burgundy. Composition: one single extremely wide, shallow horizontal physical button, front-on orthographic view, width approximately SIX TIMES its height (6:1 object). Use a wide landscape canvas with generous transparent air above and below; the complete object fits inside every edge. The button should occupy about 90% of canvas width, and its height should be about 15% of canvas width. Keep the middle 70% of the button a smooth quiet blank dark opaque face for a readable text label to be added later. The center is FILLED DARK, not a transparent hole. All ornament is concentrated in the outermost 15% left and outermost 15% right cap; continuous simple top and bottom rails connect the caps. Broad clean hand-painted shapes, rounded or smoothly beveled material edges, stylized soft highlights, clearly visible crafted physical rim, beautiful rich but restrained game art. Smooth Warcraft-painted rendering matching the reference, no realistic grain, no PBR, no photoreal texture, no scratches or speckle fields. No letters, numbers, words, glyphs or runes, no text-like marks, no icons floating over the center, no scenery, no cursor, no UI mockup or other controls. One button only. Actual alpha transparency outside the object, no checkerboard painting, no glow fog rectangle, no drop shadow filling the canvas.

## sporefall

- Current mode: built-in image_gen generation with per-raid style reference.
- Original style reference: `/home/debian/Gildra-raid-controls-20261025/apps/web/public/assets/wow/raids/hub/stylized/frames/sporefall.webp`; SHA256 `a46b507f4b8228c8ece9f82257b69bbd6c719200a85ac8ec0dcba23df376e798`.
- Generated native: `/home/debian/.codex/generated_images/01a17422-caef-70d2-91ba-ad027be761b1/exec-8d705ebe-1ff2-4c30-bd2b-27c633e4edfc.png` (2176×722).
- Archived native: `/home/debian/gildra-raid-controls-release-20261025/asset-sources/buttons/native/sporefall.png`; SHA256 `b262050414a0f8deed230554ca6d9396d8b0b9466c87f13da2fba5c771721bb1`.
- Crop: `{"left":20,"top":169,"width":2130,"height":382}`.
- Current final: `/assets/wow/raids/hub/controls/buttons/sporefall.webp` (768×138, 40562 bytes); SHA256 `2c1eea88f4dee0ce7f5668014f1bf65bf3d9ee7ce8a203a2939a2fcbe93a3d4a`.
- CSS slice: `29 146 36 146 fill`.
- Slice widths at 64px rendered height: `{"top":13.45,"right":67.71,"bottom":16.7,"left":67.71}`.

Exact current prompt:

> Use case: stylized-concept. Asset type: ONE premium World of Warcraft hand-painted fantasy UI BUTTON background, with genuine transparent exterior. The supplied raid frame is a STYLE AND MATERIAL reference only; create a new matching button. Warm smooth stylized brown wood, amber mushrooms and soft moss. Compact mushroom shelf groups at the far left and far right end caps, broad simple twisted wood rails, a little painted moss. The central face is very dark warm brown. Composition: one single extremely wide, shallow horizontal physical button, front-on orthographic view, width approximately SIX TIMES its height (6:1 object). Use a wide landscape canvas with generous transparent air above and below; the complete object fits inside every edge. The button should occupy about 90% of canvas width, and its height should be about 15% of canvas width. Keep the middle 70% of the button a smooth quiet blank dark opaque face for a readable text label to be added later. The center is FILLED DARK, not a transparent hole. All ornament is concentrated in the outermost 15% left and outermost 15% right cap; continuous simple top and bottom rails connect the caps. Broad clean hand-painted shapes, rounded or smoothly beveled material edges, stylized soft highlights, clearly visible crafted physical rim, beautiful rich but restrained game art. Smooth Warcraft-painted rendering matching the reference, no realistic grain, no PBR, no photoreal texture, no scratches or speckle fields. No letters, numbers, words, glyphs or runes, no text-like marks, no icons floating over the center, no scenery, no cursor, no UI mockup or other controls. One button only. Actual alpha transparency outside the object, no checkerboard painting, no glow fog rectangle, no drop shadow filling the canvas.
