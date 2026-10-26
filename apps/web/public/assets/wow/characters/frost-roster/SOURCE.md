# Frost roster material assets

Original decorative hand-painted game-style artwork generated for Gildra on 2026-10-26; these are not official Blizzard screenshots or game data. Official class icons and character portraits remain separate live media. Text, numbers and controls are HTML.

Method: built-in `image_gen`, one asset per call, `transparent_background: true`. Selected native RGBA PNGs retain their generated alpha. Sharp performs only alpha-bounds trimming, proportional resizing, transparent padding and WebP encoding. No repainting, recoloring, background removal or alpha repair.

Native PNGs, full exact prompts, geometry radii and reviewed cyan/dark/small-size proofs are retained outside the public bundle at `/home/debian/gildra-character-frost-release-20261026/asset-sources/`. Every source, prompt and delivery SHA-256 is recorded in `manifest.json`.

## card

- Native: `card-native.png`, 1774×887, SHA-256 `c1f13d22bec3e0ffaad5a898fe0c527c8b2d79a5327e63a949281e75a5d35ebc`.
- Prompt: `card-prompt.txt`; generated without a raster reference, using the approved Frost login cold steel and glacial blue material description.
- Delivery: alpha bounds crop x155/y139/w1467/h601, proportional width 944 plus 8px transparent padding, WebP q82 alpha100. Final 960×403, 26,526 bytes; SHA-256 `c2f56cc4548db6d36e6ac060d45b8861264420536fbe33302fb5bff6a88d28da`.
- Nine-slice `[104,104,104,104]`, continuous straight rails, filled dark material center alpha min253. Corner slices enlarged from the automatic proposal after visual inspection to contain all four clasps. Use `border-image` with `fill`; never stretch the entire image. Scale .22 desktop or .17 compact, or increase consistently for stronger corners.

## portraitRing

- Native: `portrait-ring-native.png`, 1254×1254, SHA-256 `980781df570d05a3361e1c226e7411c6d6e3895708407c394167f2e483b984f2`.
- Prompt: `portrait-ring-prompt.txt`; generated without a raster reference from the same cold steel and glacial blue material description.
- Delivery: alpha crop x105/y111/w1045/h1028, proportional fit160² plus16px transparent padding, then1px top/2px bottom transparent padding to square192². WebP q84 alpha100, 8,474 bytes; SHA-256 `2d86780a3463003518166317c07880c239a4b0c36fdd346dc61cd4fe13f777c7`.
- Measured center `[96,95]`, transparent inner boundary radius40.5–52.25px, four small steel tips project inward. Put the official class icon **behind** the ring, clipped to a circle of radius55px, covering the aperture with2px bleed under the inner lip. CSS insets left/right21.354167%, top20.833333%, bottom21.875%, radius50%. `clearRadius:40` is entirely alpha-transparent. Keep the ring square and undistorted; use `object-fit:contain`.

## heraldry

- Native: `heraldry-native.png`, 1254×1254, SHA-256 `6eaa547cb1199eef3760f1c39749e7dcda011991fe19b04cd2d9f7cbbb50585e`.
- Prompt: `heraldry-prompt.txt`; generated without a raster reference. Decorative closed helmet, shield and crossed frozen blades, not an official heraldic symbol or character portrait.
- Delivery: alpha crop x161/y127/w933/h917, proportional fit224² plus16px transparent padding, then2px top/bottom transparent padding to square256². WebP q84 alpha100, 19,574 bytes; SHA-256 `33f5ee45480ffdc27c337f7f29df45f713c840e20e54ea5ce69434f1b7ff98e4`.

## Verification

- Final corners alpha0; all complete silhouettes have transparent exterior padding. Ring center is transparent, card center opaque. No text, logos, painted checkerboard or clipped edges.
- Reviewed `asset-sources/proof/final-assets-proof.png`: dark and cyan backgrounds, magenta icon disk behind ring, 78px ring and96px heraldry, live HTML cards400×180/.22 and320×180/.17.
- Three WebPs total54,574 bytes. Exact dimensions, hashes, source coordinates and aperture CSS are in `manifest.json`.
