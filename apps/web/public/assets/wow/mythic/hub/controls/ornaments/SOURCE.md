# Mythic+ hub — individual growing rail ornaments

Generated 2026-10-25T21:27:44.694605+00:00. Built-in `image_gen`, generate mode, `transparent_background: true`.

Eight distinct, separate calls. Existing dungeon scenes were palette/material references only; no scene pixels were changed. All images are new game-interface illustration cutouts, not photographs or data.

## Deliverables and encoding

Each final WebP is 384 px wide and under 35,000 bytes. Only Sharp alpha-bounds trim, proportional resize, 12 px transparent extension and WebP encoding were applied. Native files, full per-asset prompts, reference SHA-256, encoding evidence and source paths are retained at `/home/debian/gildra-mythic-material-release-20261025/asset-sources/ornaments/`.

`manifest.json` records final byte/SHA-256, actual alpha32 bounds, transparent rows below the painted base (`rootPadding`) and its real x position (`rootX`). Base padding includes any partially transparent antialiasing after resize. Runtime compensation and transform origins use those measurements rather than the image rectangle.

No floor, pot, cast-shadow rectangle or garden strip is present. The consuming component is `components/wow/mythic/hub/MythicHubOrnaments.tsx`; each piece anchors to its panel lower rail.

## Assets

| Dungeon | Asset | Native PNG SHA-256 | Reference |
|---|---|---|---|
| ruby-life-pools | `ruby-life-pools.webp` | `2910896c8444ee052ec55c11bdcdc85918946db6fc913e1286138dc8e249ef3e` | `/assets/wow/mythic/ruby-sanctuary/sanctuary-768.webp` |
| altar-of-fangs | `altar-of-fangs.webp` | `36343d4dfaac6a65e9fd04b616688b6b2a6502912d8b5169d8ef0124a4f8d798` | `/assets/wow/mythic/dungeon-scenes/altar-of-fangs/scene-768.webp` |
| murder-row | `murder-row.webp` | `b915bbe6f12b90adb8ffb01d33f9d40fecfcbdf52d747fca0e206676c1d1584f` | `/assets/wow/mythic/dungeon-scenes/murder-row/scene-768.webp` |
| den-of-nalorakk | `den-of-nalorakk.webp` | `cc26277d335237fea3a28f3028bdf3c0e4e352717d0a74c668f494769b835114` | `/assets/wow/mythic/dungeon-scenes/den-of-nalorakk/scene-768.webp` |
| the-blinding-vale | `the-blinding-vale.webp` | `833d3487731be571d69553be2d0cbb8c188d83feb1d1e5c2b8bf0b683b0944b1` | `/assets/wow/mythic/dungeon-scenes/the-blinding-vale/scene-768.webp` |
| voidscar-arena | `voidscar-arena.webp` | `504f4d0aa2f03590804cb539e8b711c22f45287713c43287c7a46f9b9947307a` | `/assets/wow/mythic/dungeon-scenes/voidscar-arena/scene-768.webp` |
| kings-rest | `kings-rest.webp` | `e2b0bc029bfaee3197f859d12086fab0b3363a511c543314f084841cf4870dd7` | `/assets/wow/mythic/dungeon-scenes/kings-rest/scene-768.webp` |
| temple-of-sethraliss | `temple-of-sethraliss.webp` | `858a04ecff8db758f46ad892837eaabc5fda6d993d532d770c92cd26f336f067` | `/assets/wow/mythic/dungeon-scenes/temple-of-sethraliss/scene-768.webp` |

## Complete prompt set

### ruby-life-pools

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one graceful crimson autumn sapling with three broad red-gold leaves and one tiny ruby water droplet cupped near the tip; a single dark bronze stem rising from a compact base.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### altar-of-fangs

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one ritual vine with two broad muted olive leaves curling gently around one simple tall dark-stone fang; a single narrow bottom base, no altar or stone platform.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### murder-row

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one plum-purple arcane lily with a single simple three-petal blossom and two broad muted leaves on a warm antique gold stem; elegant elven silhouette.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### den-of-nalorakk

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one blue-green broad-leaved fern shoot from a cold bear shrine, with three large simple frosted leaves; restrained icy blue edge, dark stone-grey compact root.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### the-blinding-vale

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one pale warm ivory pollen flower with a simple luminous closed-to-open bell bloom and three soft sage-green leaves on a slender woody stalk; faint gold inside flower only.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### voidscar-arena

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one upward violet crystal shoot with three broad smooth crystal facets growing from a narrow dark obsidian root; muted blue-violet planes, no lightning or floating shards.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### kings-rest

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one regal muted golden lotus bud with three broad gold petals surrounding a tiny teal wisp and two smooth dark teal leaves; compact antique-gold stem.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```

### temple-of-sethraliss

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark dungeon panel.
Input image 1 is a reference ONLY for dungeon palette and material mood; do NOT reproduce the scene.
Primary request: one bronze and muted turquoise papyrus-like leaf shoot with a gentle S-shaped serpentine silhouette and two broad pointed leaves; no animal head, no eyes, simple temple ornament.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
Avoid: grain, noise, microdetails, engraved veins, tiny particles, sharp white highlights, dramatic contrast, shiny photoreal rendering, repeating patterns, detached small decorations, collage, checkerboard painted into pixels.
```
