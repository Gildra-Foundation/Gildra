# Ассеты «Библиотека WoW» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **library** · страницы `/library`, `/library/<набор>`, страница записи (+ `/ru`). Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

## Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-library-assets-20261027/asset-sources/<type>s/library-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → рамка 3D**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#c8a46a` — `accent-check.cjs` pass (light #d7c19c, 9.07/11.27). Оттенок в 3° от march-on-queldanas, поэтому материал явно другой: дерево + бронза + голубой кристалл, без бархата, золотой филиграни и перьев феникса.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-design-system-20261027
SRC=/home/debian/gildra-library-assets-20261027/asset-sources
PROOF=/home/debian/gildra-library-assets-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

## 1. Материальная панель (9-slice) — `library` / `panel`

| | |
| --- | --- |
| Где на сайте | подложка панели поиска и фильтров набора, плитки «Предметы и коллекции», панели разделов landing |
| Холст (выход) | портрет 4:5 → 1122×1402 |
| Итог | 768×~960 WebP, < 100 КБ |
| Native | `$SRC/panels/library-native.png` |
| referenced_image_paths | 1. `/home/debian/.claude/skills/gildra-asset-imagegen/references/loading-archive.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one tall physical text panel (a plaque) in the Library material, for the Gildra World of Warcraft fan site, the World of Warcraft Library pages. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; search fields, filter controls and short lists of live HTML sit on its face.
CANVAS: portrait 4:5 canvas; the panel fills it with a 3% empty transparent margin on every side.
GEOMETRY: four continuous straight thin rails of even thickness (about 5% of the width), an unbroken bottom rail, small corner clasps fully inside the corner squares (outer 10% x 10%). The centre from 12% to 88% in both directions is one solid opaque very dark face with a single broad, very soft tone shift — it is material, not a window. No decoration at the middle of any rail.
[KIT] Materials and palette: dark oiled walnut wood rails, aged warm bronze fittings, brass book-corner caps, one small cool arcane-blue crystal in each corner clasp, deep ink-blue face; the quiet archive of a mage library, bookbinding elegance. Palette anchors: face #0b1220, metal #5a4228, highlight #d9b98a, accent #6fa8d8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown from 360 to 1400 px wide with the rails scaled to about 0.16; 15 px light text must read on the face.
REFERENCES: Input image 1: World of Warcraft library archive painting — use ONLY for palette, material and finish. Input image 2: finished panel of another kit — use ONLY for shape, rail thickness and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type panel --in $SRC/panels/library-candidate-1.png --in $SRC/panels/library-candidate-2.png --in $SRC/panels/library-candidate-3.png
$NODE $PACK --repo $REPO --type panel --in $SRC/panels/library-native.png \
  --out /assets/wow/library/controls/panels/library.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/panels/manifest.json --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `library` / `button`

| | |
| --- | --- |
| Где на сайте | «Найти», «Следующая страница», «Открыть набор» |
| Холст (выход) | широкий 3:1 → 2172×724 |
| Итог | 768×~130 WebP, < 80 КБ |
| Native | `$SRC/buttons/library-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-library-assets-20261027/asset-sources/panels/library-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/buttons-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one low horizontal game-interface button in the Library material, for the Gildra World of Warcraft fan site, the World of Warcraft Library pages. Isolated object on a real transparent background (alpha).
USE: stretched horizontally by CSS nine-slice; a short live HTML label sits in the centre.
CANVAS: wide 3:1 landscape canvas; the button spans about 92% of the canvas width and about 42% of its height, centred, with at least 4% empty transparent margin on every side.
GEOMETRY: painted silhouette about 7:1. Compact end caps take only the outer 11% on each side; each cap is a brass book-corner cap holding one small smooth arcane-blue crystal. The middle 76% is a plain straight band: thin top and bottom rails of constant height and an opaque very dark calm face, with nothing on it — no central crest, gem, emblem, notch or bulge. Softly chamfered corners. The face is fully opaque; only the outside is transparent.
[KIT] Materials and palette: dark oiled walnut wood rails, aged warm bronze fittings, brass book-corner caps, one small cool arcane-blue crystal in each corner clasp, deep ink-blue face; the quiet archive of a mage library, bookbinding elegance. Palette anchors: face #0b1220, metal #5a4228, highlight #d9b98a, accent #6fa8d8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 68 px tall; the end caps must read as one clear motif at that size.
REFERENCES: Input image 1: approved Library panel — use ONLY for palette, material and finish. Input image 2: finished button of another kit — use ONLY for shape, proportions and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type button --in $SRC/buttons/library-candidate-1.png --in $SRC/buttons/library-candidate-2.png --in $SRC/buttons/library-candidate-3.png
$NODE $PACK --repo $REPO --type button --in $SRC/buttons/library-native.png \
  --out /assets/wow/library/controls/buttons/library.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/buttons/manifest.json --proof $PROOF
```

---

## 3. Рамка иконки записи — `library-icon` / `skill`

| | |
| --- | --- |
| Где на сайте | крупная иконка записи в герое страницы записи, иконки наборов на плитках landing; цвет качества — данными |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/library-icon-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-library-assets-20261027/asset-sources/panels/library-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the Library material, for the Gildra World of Warcraft fan site, the World of Warcraft Library pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (an item, spell or collection icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (four brass book-corner caps; at most one tiny arcane-blue crystal at the top centre of the rail) so the icon is never covered.
[KIT] Materials and palette: dark oiled walnut wood rails, aged warm bronze fittings, brass book-corner caps, one small cool arcane-blue crystal in each corner clasp, deep ink-blue face; the quiet archive of a mage library, bookbinding elegance. Palette anchors: face #0b1220, metal #5a4228, highlight #d9b98a, accent #6fa8d8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 56–96 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved Library panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/library-icon-candidate-1.png --in $SRC/frames/library-icon-candidate-2.png --in $SRC/frames/library-icon-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/library-icon-native.png \
  --out /assets/wow/library/controls/frames/library-icon.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

## 4. Орнамент «перо» — `library-quill` / `ornament`

| | |
| --- | --- |
| Где на сайте | одна плитка «Предметы и коллекции» на landing и табличка-итог страницы набора (по одному на блок) |
| Холст (выход) | портрет 3:4 → ~1086×1448 |
| Итог | ширина 384 WebP, < 35 КБ |
| Native | `$SRC/ornaments/library-quill-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-library-assets-20261027/asset-sources/panels/library-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/ornaments-ruby-life-pools.webp` |
| transparent_background | true |

```text
ASSET: one upright ornament — one writing quill feather in muted ink-blue and pale parchment tones rising from a small aged-bronze inkwell cap, with one tiny cool arcane-blue glint near the tip — in the Library palette, for the Gildra World of Warcraft fan site, the World of Warcraft Library pages. Isolated object on a real transparent background (alpha).
USE: grows up from the bottom rail of a plaque, overlapping its edge.
CANVAS: portrait 3:4 canvas; the subject fills about 85% of the height; only about 1% transparent margin under the base.
GEOMETRY: one compact stem or root at the bottom centre; three to five broad simple forms above it with a slight natural curve; nothing detached.
[KIT] Materials and palette: dark oiled walnut wood rails, aged warm bronze fittings, brass book-corner caps, one small cool arcane-blue crystal in each corner clasp, deep ink-blue face; the quiet archive of a mage library, bookbinding elegance. Palette anchors: face #0b1220, metal #5a4228, highlight #d9b98a, accent #6fa8d8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown about 96 px wide.
REFERENCES: Input image 1: approved Library panel — use ONLY for palette and mood. Input image 2: finished ornament of another kit — use ONLY for scale of forms and simplicity, not its plant or colours.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type ornament --in $SRC/ornaments/library-quill-candidate-1.png --in $SRC/ornaments/library-quill-candidate-2.png --in $SRC/ornaments/library-quill-candidate-3.png
$NODE $PACK --repo $REPO --type ornament --in $SRC/ornaments/library-quill-native.png \
  --out /assets/wow/library/controls/ornaments/library-quill.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/ornaments/manifest.json --proof $PROOF
```

После упаковки орнамента допиши в его запись манифеста: `"anchor": "right", "theme": "arcane", "duration": 1600, "delay": 300`.

---

## 5. Рамка 3D-модели (прозрачное окно) — `library-model` / `frame`

Добавлено 2026-10-27 сессией области E (страница записи с 3D: маунты, комплекты трансмогрификации). До этой рамки 3D стоит в табличке кита den-of-nalorakk (`components/library/libraryKit.ts`).

| | |
| --- | --- |
| Где на сайте | рамка вокруг 3D-модели на странице записи (`/library/mounts/…`, `/library/transmog-sets/…`); окно — квадрат, в нём живой canvas |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 1024×1024 WebP + измеренное окно (`pack-asset.cjs --type frame`), < 120 КБ |
| Native | `$SRC/frames/library-model-native.png` |
| referenced_image_paths | 1. `$SRC/panels/library-native.png` (утверждённая панель)<br>2. `/home/debian/Gildra-library-unify-20261027/apps/web/public/assets/wow/mythic/ruby-sanctuary/map-frame.webp` |
| transparent_background | true |

```text
ASSET: one empty square picture frame in the Library material, for the Gildra World of Warcraft fan site, the World of Warcraft Library pages. Isolated object on a real transparent background (alpha).
USE: laid over a live 3D model viewer; the model shows through the window, the viewer's small controls sit inside the lower part of the window.
CANVAS: square 1:1 canvas; the frame's outer edge sits 3% inside the canvas on every side.
GEOMETRY: four connected beams of even width (about 6% of the canvas), the bottom beam complete and plain. One single small crest at the top centre that stays above 12% of the canvas height, paired small brass book-corner caps in the four corners. The window spans x 10–90%, y 13–90%, nearly square with softly rounded inner corners and a clean continuous inner edge. The window and the outside are fully transparent.
[KIT] Materials and palette: dark oiled walnut wood rails, aged warm bronze fittings, brass book-corner caps, one small cool arcane-blue crystal in each corner clasp, deep ink-blue face; the quiet archive of a mage library, bookbinding elegance. Palette anchors: face #0b1220, metal #5a4228, highlight #d9b98a, accent #6fa8d8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 320–720 px wide; beams and crest must read at 320 px.
REFERENCES: Input image 1: the approved Library panel — use ONLY for palette, material and finish. Input image 2: finished frame of another kit — use ONLY for construction and window shape, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type frame --in $SRC/frames/library-model-candidate-1.png --in $SRC/frames/library-model-candidate-2.png --in $SRC/frames/library-model-candidate-3.png
$NODE $PACK --repo $REPO --type frame --in $SRC/frames/library-model-native.png \
  --out /assets/wow/library/controls/frames/library-model.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/frames/manifest.json --proof $PROOF
```

---

## После генерации (Claude-сессия страницы)

- Проверить proof и срезы 9-slice (`gildra-wow-material-design/assets.md` §5.1), поправить `slices` в манифесте.
- `SOURCE.md` в каждой папке `/assets/wow/library/controls/*` (§8, + QA-отчёт победителя).
- Подключить: панель/кнопки через тот же контракт, что `components/wow/shared/materialAtlas` (переменные `--mythic-panel-*`, `--mythic-button-*`), рамку иконки — как `auctionIconFrameStyle()`; орнамент — `MythicHubOrnaments`.
- Сцену не генерируем: фон библиотеки — существующий `/assets/wow/loading/archive.webp`.
- Проверка 1440/390 RU/EN, 4 темы, reduced motion/transparency, forced colors; контакт-лист кита.
- Кит `library` в общий тип `MaterialKit` (`components/wow/shared/material/materialKit.ts`) добавляет область A (общий файл); затем в `components/library/libraryKit.ts` заменить `den-of-nalorakk` на `library`, рамку 3D подключить в `components/database/entityDetail.module.css` (`.model`/`.modelStage`) по измеренному окну.
