# Generated physical-book materials

Generated on September 25, 2026 with the built-in image_gen tool at the user's request. These are new decorative material assets, not replacements for the supplied Arthas / Illidan artwork. The PNGs are exact copies of the generated originals. The application serves optimized variants through Next Image and uses nine-sliced endcaps, a repeating fore-edge, and a separate paper surface; it never stretches a whole book image over the page height.

Final files:

- `outer-realm-backdrop-v1.png` — 1672 × 941; shared cold ruined-sanctum environment behind the book on login, account roster and live character profile. The broad quiet center preserves contrast; ice-blue ruins and subdued fel-green stone fill the side margins.
- `folio-binding-v1.png` — 1536 × 1024; brass corners, leather cover, top/bottom page blocks.
- `folio-vellum-v1.png` — 1254 × 1254; quiet parchment surface.
- `folio-fore-edge-v1.png` — 1024 × 1536; layered page-edge and shadow sprite, mirrored on the right.

CSS masks feather decorative layers only, never content or controls. The generated PNGs retain their original alpha. No separate model or API changes are part of this redesign.

## Shared outer-realm background

```text
Wide website background for a dark-fantasy character profile presented as an open parchment book. A monumental ancient ruined stone sanctuary fades into deep shadow, cold mist and distant fractured arches. Subtle ice-blue moonlit ruins toward the left edge and restrained muted fel-green reflected light on weathered stone toward the right edge. Environment only: no people, characters, statues, book, interface, text, logo or watermark. Very wide landscape with a calm nearly-black center for legible UI, detailed environmental silhouettes near the outer edges, no hard vertical split. Cold blue-grey night, restrained low-intensity green, painterly realism, premium hand-painted environment concept art. Keep the entire image low-contrast enough to sit behind page content.
```

## Final generation prompts

### Material 1

```text
Use case: stylized-concept.
Asset type: production raster texture for the physical frame of a fantasy MMORPG character website. Not a screenshot or UI mockup.
Primary request: a beautifully crafted OPEN WARCRAFT-STYLE ANCIENT SPELLBOOK seen exactly from above, perfectly facing the viewer. Two completely blank warm honey parchment pages in a heavy dark brown leather binding. A genuinely transparent background outside the book silhouette.
Composition: wide 3:2 image. Book nearly fills the image with modest transparent padding. The central 75% must be extremely quiet blank pale warm parchment (#dbc08a), suitable for brown text. The two pages have a shallow shaded central crease, subtly curved surface and warm highlights. Outer left and right fore-edges show many uneven stacked vellum pages with fine frayed fibres, gently scalloped natural contours, creased worn leather underneath. Aged dark brass corner protectors and narrow hand-tooled leather strips around the outside only. The same fine layers along top and bottom. This is a reusable 9-slice web frame: keep rich ornaments within the outermost 12% on each side and corners. Outer long side edges reasonably vertical, but handmade, not geometric bars. Smooth physical soft cast shadows taper to real transparency outside. Paper itself opaque, no checkerboard painted into the image.
Style: premium hand-painted World of Warcraft spellbook and world map interface, tactile materials, exquisite painterly detail, old gold and sepia, carved gothic craftsmanship, dimensional but legible. Softer edges blend to the dark world behind.
Lighting: restrained diffuse amber from above-left, dark ambient occlusion beneath page stacks, graceful soft highlights on brass, no glow.
Constraints: no letters, runes, text, symbols on the pages, no characters, no interface controls, no gemstones, no skull face centerpiece, no outer rectangular background, no desk, no watermark, no cropped book. Preserve genuine transparent alpha outside all edges.
```

### Material 2

```text
Use case: stylized-concept.
Asset type: seamless tileable material texture for the writable surface of an ancient Warcraft-style fantasy spellbook website.
Primary request: fill the ENTIRE square with quiet warm golden-ivory vellum parchment. Average warm tan color approximately #dfc38c, very fine cloudy fibers and subtle natural aging, gentle hand-painted game texture matching luxurious old book pages. Low contrast, legible dark brown text will be placed on top by code.
Composition: perfectly flat orthographic material sample, 1024x1024 square, seamless on all four edges, even illumination. No vignette, no borders, no shadows, no corners, no paper outline, no folds, no central book crease, no objects, no letters, no symbols, no stains that look like markings, no UI. The sheet extends beyond all four sides; NOT a book illustration. Rich tactile but subtle texture, avoid loud yellow or orange, no transparency needed.
```

### Material 3

```text
Use case: stylized-concept.
Asset type: a VERTICALLY TILEABLE game UI border sprite for the LEFT outer edge of a huge open medieval Warcraft-like spellbook.
Primary request: one continuous tall vertical strip, fills image from top to bottom, with dark hand-tooled brown leather underneath a thick stack of uneven aged vellum page edges, transitioning toward a calm golden-ivory blank page surface on the RIGHT. Camera directly overhead. Same thickness top to bottom, softly irregular handmade paper contours. The book continues above and below the image: NO corners, NO top or bottom book borders, NO clasps, NO metal bands, NO end caps. Top and bottom of the strip match so it can repeat seamlessly.
Composition: tall portrait 2:3. LEFT quarter genuinely transparent with soft cast shadow fading into alpha. Middle half shows dark leather at far left then many fine layered cream parchment fore-edges with tiny natural tears, fibers, warm occlusion and dimensional shading. RIGHT quarter transitions to plain warm parchment #dfc38c; rightmost boundary fades softly into genuine transparency, so it can overlap an existing paper surface without a straight seam.
Style: premium hand-painted World of Warcraft atlas/spellbook UI material, muted amber, brown, aged pale ochre, extremely tactile detailed edges, smooth soft shadows, no hard rectangular outline.
Constraints: actual transparent alpha outside the strip; no opaque background, no checkerboard painted in, no text, no symbols, no image of a whole book, no central spine, no horizontal features; a practical repeating border sprite only.
```
