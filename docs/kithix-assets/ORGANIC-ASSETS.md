# Kithix organic material kit

Original loading artwork remains unchanged. Four new decorative UI assets use dark wine/charcoal chitin, broad crimson organic lobes, coral nodules and coiled tendrils. No official art was repainted; the loading reference supplied only palette and organic motifs.

| Type | Public path | Size | Bytes | Geometry |
| --- | --- | --- | --- | --- |
| panel | `/assets/wow/raids/hub/controls/panels/kithix-organic.webp` | 768×967 | 69228 | [256, 256, 256, 240] |
| button | `/assets/wow/raids/hub/controls/buttons/kithix-organic.webp` | 768×164 | 18910 | [56, 189, 37, 163] |
| frame | `/assets/wow/raids/hub/stylized/frames/kithix-organic.webp` | 960×640 | 77800 | {'left': 86, 'top': 113, 'right': 860, 'bottom': 578} |
| ornament | `/assets/wow/raids/hub/stylized/ornaments/kithix-organic-roots.webp` | 384×547 | 34658 | rootPadding12;rootX198 |

Three independent built-in image_gen candidates were generated per type, in panel/button/frame/ornament order. Selected panel2,button2,frame1,ornament3. All selected natives pass QA; softness warnings on panel/button reflect broad painted planes, frame symmetry warning reflects intentionally varied corners. Ornament has no warnings.

Panel automated slices were rejected and manually tuned to256/256/256/240. Cyan/live-text proofs include narrow320×160 panel and56/68px buttons. Frame cyan/magenta coverage passes280/420/640px. Sharp only trims, downsizes and encodes; original alpha retained.

Full prompts, twelve native candidates, QA, proofs and encoding reports: `/home/debian/gildra-kithix-organic-20261104/`. Full geometry and SHA-256: `assets.json`; asset audit: `asset-audit.json`. All prior raster bytes and unrelated manifest entries verified unchanged.

Site accent#d28a91: root checked light/base8.51 and light/bg10.3. Similar red hue to Ruby Life Pools; organic chitin differs from its gold/stone material.
