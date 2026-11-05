# Ассеты «Тир-листы — тонкий кит» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **tier-lists** · страницы /tier-lists. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

## Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-slim-assets-20261105/asset-sources/<type>s/tier-lists-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#cf9a6a` — pass; оттенок в 1° от sporefall — материал другой: окисленная бронза и медь, без дерева, корней и грибов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-slim-assets-20261105
SRC=/home/debian/gildra-slim-assets-20261105/asset-sources
PROOF=/home/debian/gildra-slim-assets-20261105/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

## 1. Табличка (9-slice) — `tier-lists` / `panel`

| | |
| --- | --- |
| Где на сайте | формы, фильтры, карточки |
| Холст (выход) | портрет 4:5 → 1122×1402 |
| Итог | 768×~960 WebP, < 100 КБ |
| Native | `$SRC/panels/tier-lists-native.png` |
| referenced_image_paths | 1. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one tall physical text panel (a plaque) in the Ranking Hall material, for the Gildra World of Warcraft fan site, the World of Warcraft tier list page. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; search fields, filters, tables and short lists of live HTML sit on its face.
CANVAS: portrait 4:5 canvas; the panel fills it with a 3% empty transparent margin on every side.
GEOMETRY: four continuous straight thin rails of even thickness (about 5% of the width), an unbroken bottom rail, small corner clasps fully inside the corner squares (outer 10% x 10%). The centre from 12% to 88% in both directions is one solid opaque very dark face with a single broad, very soft tone shift — it is material, not a window. No decoration at the middle of any rail.
[KIT] Materials and palette: dark oxidised bronze with thin brushed-copper rails, small ember-garnet enamel studs, deep umber face; a tournament ranking board, crisp metal rather than wood, roots or mushrooms; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #140e0a, metal #5b4632, highlight #e2b98c, accent #b5523a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown from 360 to 1400 px wide with the rails scaled to about 0.16; 15 px light text must read on the face.
REFERENCES: Input image 1: finished panel of a neighbouring kit — use ONLY for palette, material and finish. Input image 2: finished panel of another kit — use ONLY for shape, rail thickness and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type panel --in $SRC/panels/tier-lists-candidate-1.png --in $SRC/panels/tier-lists-candidate-2.png --in $SRC/panels/tier-lists-candidate-3.png
$NODE $PACK --repo $REPO --type panel --in $SRC/panels/tier-lists-native.png \
  --out /assets/wow/slim/tier-lists/controls/panels/tier-lists.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/tier-lists/controls/panels/manifest.json --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `tier-lists` / `button`

| | |
| --- | --- |
| Где на сайте | основные действия страницы |
| Холст (выход) | широкий 3:1 → 2172×724 |
| Итог | 768×~130 WebP, < 80 КБ |
| Native | `$SRC/buttons/tier-lists-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-slim-assets-20261105/asset-sources/panels/tier-lists-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/buttons-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one low horizontal game-interface button in the Ranking Hall material, for the Gildra World of Warcraft fan site, the World of Warcraft tier list page. Isolated object on a real transparent background (alpha).
USE: stretched horizontally by CSS nine-slice; a short live HTML label sits in the centre.
CANVAS: wide 3:1 landscape canvas; the button spans about 92% of the canvas width and about 42% of its height, centred, with at least 4% empty transparent margin on every side.
GEOMETRY: painted silhouette about 7:1. Compact end caps take only the outer 11% on each side; each cap is a small flat copper tip holding one tiny ember-garnet enamel stud. The middle 76% is a plain straight band: thin top and bottom rails of constant height and an opaque very dark calm face, with nothing on it — no central crest, gem, emblem, notch or bulge. Softly chamfered corners. The face is fully opaque; only the outside is transparent.
[KIT] Materials and palette: dark oxidised bronze with thin brushed-copper rails, small ember-garnet enamel studs, deep umber face; a tournament ranking board, crisp metal rather than wood, roots or mushrooms; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #140e0a, metal #5b4632, highlight #e2b98c, accent #b5523a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 68 px tall; the end caps must read as one clear motif at that size.
REFERENCES: Input image 1: approved Ranking Hall panel — use ONLY for palette, material and finish. Input image 2: finished button of another kit — use ONLY for shape, proportions and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type button --in $SRC/buttons/tier-lists-candidate-1.png --in $SRC/buttons/tier-lists-candidate-2.png --in $SRC/buttons/tier-lists-candidate-3.png
$NODE $PACK --repo $REPO --type button --in $SRC/buttons/tier-lists-native.png \
  --out /assets/wow/slim/tier-lists/controls/buttons/tier-lists.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/tier-lists/controls/buttons/manifest.json --proof $PROOF
```

---

## 3. Рамка иконки — `tier-lists-icon` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки записей, специализаций, портреты |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/tier-lists-icon-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-slim-assets-20261105/asset-sources/panels/tier-lists-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the Ranking Hall material, for the Gildra World of Warcraft fan site, the World of Warcraft tier list page. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a class specialization icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (four small brushed-copper corner tips) so the icon is never covered.
[KIT] Materials and palette: dark oxidised bronze with thin brushed-copper rails, small ember-garnet enamel studs, deep umber face; a tournament ranking board, crisp metal rather than wood, roots or mushrooms; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #140e0a, metal #5b4632, highlight #e2b98c, accent #b5523a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 40–96 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved Ranking Hall panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/tier-lists-icon-candidate-1.png --in $SRC/frames/tier-lists-icon-candidate-2.png --in $SRC/frames/tier-lists-icon-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/tier-lists-icon-native.png \
  --out /assets/wow/slim/tier-lists/controls/frames/tier-lists-icon.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/tier-lists/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

## После генерации (Claude-сессия страницы)

- Упаковка и подключение — Claude-сессия (координатор).
