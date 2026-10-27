# Ассеты «Вылазки» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **delves** · страницы `/wow/delves`, `/ru/wow/delves`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

## Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-mythic-design-20261027/asset-sources/<type>s/delves-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#c9a46e` — `accent-check.cjs` pass с предупреждением: оттенок в 5° от march-on-queldanas — материал явно другой (чернёное железо фонаря и пещерный камень, без бархата, золота и перьев).

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-mythic-design-20261027
SRC=/home/debian/gildra-mythic-design-20261027/asset-sources
PROOF=/home/debian/gildra-mythic-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

## 1. Материальная панель (9-slice) — `delves` / `panel`

| | |
| --- | --- |
| Где на сайте | табличка «Сезон 2» со списком вылазок; позже — карточки вылазок |
| Холст (выход) | портрет 4:5 → 1122×1402 |
| Итог | 768×~960 WebP, < 100 КБ |
| Native | `$SRC/panels/delves-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-mythic-design-20261027/apps/web/public/assets/wow/loading/dungeon.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one tall physical text panel (a plaque) in the Delves expedition material, for the Gildra World of Warcraft fan site, the Delves page. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; delve names, short facts and a button of live HTML sit on its face.
CANVAS: portrait 4:5 canvas; the panel fills it with a 3% empty transparent margin on every side.
GEOMETRY: four continuous straight thin rails of even thickness (about 5% of the width), an unbroken bottom rail, small corner clasps fully inside the corner squares (outer 10% x 10%). The centre from 12% to 88% in both directions is one solid opaque very dark face with a single broad, very soft tone shift — it is material, not a window. No decoration at the middle of any rail.
[KIT] Materials and palette: blackened riveted iron of a miner's lantern cage, rough grey cave-stone corner blocks, small warm candle-wax amber glass at the caps, deep charcoal-umber face; an expedition into the deep. Palette anchors: face #15110c, metal #4b4640, highlight #d8b47a, accent #c98a3c.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown from 360 to 1400 px wide with the rails scaled to about 0.16; 15 px light text must read on the face.
REFERENCES: Input image 1: World of Warcraft dungeon loading painting — use ONLY for palette, material and finish. Input image 2: finished panel of another kit — use ONLY for shape, rail thickness and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type panel --in $SRC/panels/delves-candidate-1.png --in $SRC/panels/delves-candidate-2.png --in $SRC/panels/delves-candidate-3.png
$NODE $PACK --repo $REPO --type panel --in $SRC/panels/delves-native.png \
  --out /assets/wow/delves/controls/panels/delves.webp \
  --manifest $REPO/apps/web/public/assets/wow/delves/controls/panels/manifest.json --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `delves` / `button`

| | |
| --- | --- |
| Где на сайте | «Вылазки сезона» в герое, позже «Открыть вылазку» |
| Холст (выход) | широкий 3:1 → 2172×724 |
| Итог | 768×~130 WebP, < 80 КБ |
| Native | `$SRC/buttons/delves-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-mythic-design-20261027/asset-sources/panels/delves-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/buttons-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one low horizontal game-interface button in the Delves expedition material, for the Gildra World of Warcraft fan site, the Delves page. Isolated object on a real transparent background (alpha).
USE: stretched horizontally by CSS nine-slice; a short live HTML label sits in the centre.
CANVAS: wide 3:1 landscape canvas; the button spans about 92% of the canvas width and about 42% of its height, centred, with at least 4% empty transparent margin on every side.
GEOMETRY: painted silhouette about 7:1. Compact end caps take only the outer 11% on each side; each cap is a small iron lantern bracket holding one warm amber candle-glass bead, set on a rough stone block. The middle 76% is a plain straight band: thin top and bottom rails of constant height and an opaque very dark calm face, with nothing on it — no central crest, gem, emblem, notch or bulge. Softly chamfered corners. The face is fully opaque; only the outside is transparent.
[KIT] Materials and palette: blackened riveted iron of a miner's lantern cage, rough grey cave-stone corner blocks, small warm candle-wax amber glass at the caps, deep charcoal-umber face; an expedition into the deep. Palette anchors: face #15110c, metal #4b4640, highlight #d8b47a, accent #c98a3c.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 68 px tall; the end caps must read as one clear motif at that size.
REFERENCES: Input image 1: approved Delves expedition panel — use ONLY for palette, material and finish. Input image 2: finished button of another kit — use ONLY for shape, proportions and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type button --in $SRC/buttons/delves-candidate-1.png --in $SRC/buttons/delves-candidate-2.png --in $SRC/buttons/delves-candidate-3.png
$NODE $PACK --repo $REPO --type button --in $SRC/buttons/delves-native.png \
  --out /assets/wow/delves/controls/buttons/delves.webp \
  --manifest $REPO/apps/web/public/assets/wow/delves/controls/buttons/manifest.json --proof $PROOF
```

---

## 3. Орнамент из нижней рейки — `delves` / `ornament`

| | |
| --- | --- |
| Где на сайте | вырастает из рейки таблички «Сезон 2» |
| Холст (выход) | портрет 3:4 → ~1086×1448 |
| Итог | ширина 384 WebP, < 35 КБ |
| Native | `$SRC/ornaments/delves-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-mythic-design-20261027/asset-sources/panels/delves-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/ornaments-ruby-life-pools.webp` |
| transparent_background | true |

```text
ASSET: one upright ornament — a cluster of three dripping wax candles on a short iron spike with a coil of rope — in the Delves expedition palette, for the Gildra World of Warcraft fan site, the Delves page. Isolated object on a real transparent background (alpha).
USE: grows up from the bottom rail of a plaque, overlapping its edge.
CANVAS: portrait 3:4 canvas; the subject fills about 85% of the height; only about 1% transparent margin under the base.
GEOMETRY: one compact stem or root at the bottom centre; three to five broad simple forms above it with a slight natural curve; nothing detached.
[KIT] Materials and palette: blackened riveted iron of a miner's lantern cage, rough grey cave-stone corner blocks, small warm candle-wax amber glass at the caps, deep charcoal-umber face; an expedition into the deep. Palette anchors: face #15110c, metal #4b4640, highlight #d8b47a, accent #c98a3c.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown about 96 px wide.
REFERENCES: Input image 1: approved Delves expedition panel — use ONLY for palette and mood. Input image 2: finished ornament of another kit — use ONLY for scale of forms and simplicity, not its plant or colours.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type ornament --in $SRC/ornaments/delves-candidate-1.png --in $SRC/ornaments/delves-candidate-2.png --in $SRC/ornaments/delves-candidate-3.png
$NODE $PACK --repo $REPO --type ornament --in $SRC/ornaments/delves-native.png \
  --out /assets/wow/delves/controls/ornaments/delves.webp \
  --manifest $REPO/apps/web/public/assets/wow/delves/controls/ornaments/manifest.json --proof $PROOF
```

---

## 4. Сцена героя (непрозрачная) — `hub` / `scene`

| | |
| --- | --- |
| Где на сайте | фон героя `/wow/delves` (сейчас `loading/dungeon.webp`) |
| Холст (выход) | 16:9 → 1672×941, без альфы |
| Итог | 1672×941 + 768 + mobile 640×1000 |
| Native | `$SRC/scenes/hub-native.png` |
| referenced_image_paths | 1. `/home/debian/.claude/skills/gildra-asset-imagegen/references/hub-gateway.webp` |
| transparent_background | false |

```text
ASSET: one opaque painted environment background for the hero of the Delves page on the Gildra World of Warcraft fan site.
SCENE: an original mouth of a deep cave delve in the Midnight lands: a rough stone tunnel descending into darkness, an expedition camp at the threshold with an iron lantern on a pole, rope ladders and wooden supports, a faint warm glow far below at the focal point.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 72% from the left and 38% from the top; the left half stays dark and quiet for a live HTML title; the lower third is calm floor, mist or shadow that content overlaps. One believable space with depth. No people, no creatures.
STYLE: painterly World of Warcraft environment art, broad confident brush shapes, low micro-detail, soft atmospheric depth.
LIGHT: key light from the upper left; warm candle and lantern amber against cool deep grey-blue cave shadow; moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
REFERENCES: Input image 1: an existing Gildra hero scene — use ONLY for painting style and level of detail, not its place or colours.
EXCLUDE: no interface, cards, borders or frames; no lettering, signs with writing, logos, watermarks; no price tags or numbers; no repeated patterns, decorative speckle, swarms of floating particles, multiple glowing rings, oversaturated colour.
```

```bash
$NODE $QA --repo $REPO --type scene --in $SRC/scenes/hub-candidate-1.png --in $SRC/scenes/hub-candidate-2.png --in $SRC/scenes/hub-candidate-3.png
$NODE $PACK --repo $REPO --type scene --in $SRC/scenes/hub-native.png --out /assets/wow/delves/hub.webp --proof $PROOF
# мобильный кроп: H — высота исходника, w = round(H*0.64), x = 0.72*ширина − w/2 (зажать в [0, ширина − w])
$NODE $PACK --repo $REPO --type scene-mobile --crop <x>,0,<w>,<H> --in $SRC/scenes/hub-native.png --out /assets/wow/delves/hub-mobile.webp
```

---

## После генерации (Claude-сессия страницы)

- `MaterialKit` + манифесты `/assets/wow/delves/controls/*` — заявка в область A (общие `materialKit.ts`/`materialAtlas.ts`); затем `DelveCatalogPage.tsx`: `kit` с `altar-of-fangs` на `delves`, сцена героя `hub.webp` (`art`/`<picture>`).
- Картины карточек вылазок сезона 2 (`the-ring-of-glory`, `gnarldor-isle`, `venomfall-deeps`) и рамка картины — только по официальному арту Blizzard (шаблон 10 `prompt-templates.md`); официальных кадров вылазок на диске нет — нужны от владельца. До них карточки не строятся, список остаётся на табличке.
- `SOURCE.md` в каждой папке `/assets/wow/delves/controls/*` и `/assets/wow/delves/` по `gildra-wow-material-design/assets.md` §8.
- Проверка 1440/390 RU/EN, 4 темы, reduced motion/transparency, forced colors.
