# Arcana

Original decorative fantasy interface assets; not official Blizzard media. Built-in image_gen, transparent_background: true. Sharp only trims, downsizes and encodes; no repainting, alpha repair or background removal.

Three independent candidates per asset. QA: /tmp/hub7/{panel,button}-qa.json. Contact sheets: /tmp/hub7/{frame,button}-candidates.png. All panel candidates passed; panel 1 has the quietest fine rail and reliable symmetry. Button 2 rejected for haze (7.8%); button 1 passed but has heavier caps; button 3 selected for slim caps and silhouette. No input references. Palette follows the owner brief: blue steel, obsidian, gold, amethyst.

## panel

Native: /home/debian/gildra-hub7-assets/asset-sources/panel-1.png

SHA-256: f7a33b9d2637c3f2060f6e71d33d1194672003b132eda91a6f9fd8c2c97e545e

Delivery: pack-asset.cjs --type panel; WebP re-encoded q48, alphaQuality 100. 768×954, 38520 bytes, SHA-256 054424649e130fd47db62a12006da3806e5fb298385bb17d0df469b0b38745e9.

Slices: [104, 104, 104, 104]. Manually enlarged corner/cap cuts to keep all gems and scrolls inside fixed slices. Shared CSS supplies hover sweep, focus rim, pressed transform and disabled state; no extra state downloads. Secondary links use token-based CSS with a fine gold edge. The registry icon frame fallback is Characters, unused by this hub (medallions use live SVG and CSS).

Exact prompt:

```text
ASSET: one elegant physical text plaque in the Arcana material, for WowArcana's World of Warcraft front page. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; live HTML text and artwork sit on its calm opaque face.
CANVAS: portrait 4:5 canvas, panel fills it with 3% transparent margin on every side.
GEOMETRY: four continuous straight THIN rails, even thickness about 3% of width. Unbroken bottom rail. Small precise corner clasps entirely inside outer 10% corner squares. Centre 12–88% is opaque very dark calm blue face with one broad soft tone shift. No ornament in middle of rails. Fine jewellery-grade craft.
[KIT] Materials and palette: dark blued steel and obsidian, fine antique gold filigree trim, tiny cut amethyst corner gems; elegant precise arcane craftsmanship. Palette anchors: face #0b1523, metal #6b583b, highlight #c9b580, accent #9784cf.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted
forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp
readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale.
Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation,
low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper
left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight,
lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: 360–1400 px wide, rails scaled to 0.16; 15px light text must read crisply.
EXCLUDE: lettering, runes, logos, animals, claws, bone, rough stone, chunky bevels, grain, central crests, background matte, checkerboard.

```

## button

Native: /home/debian/gildra-hub7-assets/asset-sources/button-3.png

SHA-256: fcb1375173ae9d58f29117a26996732bbc9d97c5de7390c93394597774f67698

Delivery: pack-asset.cjs --type button; WebP re-encoded q72, alphaQuality 100. 768×115, 7970 bytes, SHA-256 72318d48493a26d0789721e16cb3d198e085bb156903c675764a94ea0258a553.

Slices: [24, 88, 24, 88]. Manually enlarged corner/cap cuts to keep all gems and scrolls inside fixed slices. Shared CSS supplies hover sweep, focus rim, pressed transform and disabled state; no extra state downloads. Secondary links use token-based CSS with a fine gold edge. The registry icon frame fallback is Characters, unused by this hub (medallions use live SVG and CSS).

Exact prompt:

```text
ASSET: one low horizontal Arcana game-interface button for WowArcana. Isolated object on a real transparent background (alpha).
USE: CSS nine-slice horizontally stretched with short live HTML label in centre.
CANVAS: wide 3:1 landscape canvas. Button spans 92% canvas width and 42% height, centred, at least 4% empty transparent margin.
GEOMETRY: silhouette 7:1. Compact end caps outer 8% each, one tiny amethyst inset each. Middle 80% a plain straight band of constant height, thin gold upper and lower rails, opaque very dark calm blue steel face. Softly chamfered corners. Fine elegant jewellery craft; end caps modest, label area broad.
[KIT] Materials and palette: dark blued steel and obsidian, fine antique gold filigree trim, tiny cut amethyst gems. Palette anchors: face #0b1523, metal #6b583b, highlight #c9b580, accent #9784cf.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted
forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp
readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale.
Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation,
low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper
left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight,
lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: 56px tall, widths 160–360px; label area crisp and calm.
EXCLUDE: text, lettering, runes, logos, central crest or gem, animals, claws, bone, rough stone, chunky bevels, grain, background matte, checkerboard.

```


## Integration geometry

Plaques use the shared .18/.14 scale. The hub primary uses fixed 12px top/bottom and 28px cap border widths, 32px label inset, so ornaments stay compact at 160–360px. CSS supplies default/hover/pressed/focus states; no state textures.
