# Ассеты «Аукцион» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **auction** · страницы `/wow/auction`, `/ru/wow/auction`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

## Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-auction-assets-20261027/asset-sources/<type>s/auction-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#d0995a` — `accent-check.cjs` pass (light #dcba92, 8.82/10.79). Оттенок в 3° от sporefall, поэтому материал явно другой: железо + медные монеты + изумрудная эмаль, без дерева, мха и грибов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-design-system-20261027
SRC=/home/debian/gildra-auction-assets-20261027/asset-sources
PROOF=/home/debian/gildra-auction-assets-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

## 1. Материальная панель (9-slice) — `auction` / `panel`

| | |
| --- | --- |
| Где на сайте | табличка поиска, табличка результатов, состояния «выберите рынок» / ошибка |
| Холст (выход) | портрет 4:5 → 1122×1402 |
| Итог | 768×~960 WebP, < 100 КБ |
| Native | `$SRC/panels/auction-native.png` |
| referenced_image_paths | 1. `/home/debian/.claude/skills/gildra-asset-imagegen/references/loading-tools.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one tall physical text panel (a plaque) in the Auction House material, for the Gildra World of Warcraft fan site, the Auction House page. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; search fields, item lists with prices and status messages of live HTML sit on its face.
CANVAS: portrait 4:5 canvas; the panel fills it with a 3% empty transparent margin on every side.
GEOMETRY: four continuous straight thin rails of even thickness (about 5% of the width), an unbroken bottom rail, small corner clasps fully inside the corner squares (outer 10% x 10%). The centre from 12% to 88% in both directions is one solid opaque very dark face with a single broad, very soft tone shift — it is material, not a window. No decoration at the middle of any rail.
[KIT] Materials and palette: riveted dark gunmetal iron rails, warm copper-gold coin bosses at the corners, small emerald-green enamel accents of a goblin trading house, deep bottle-green ledger face; mercantile and sturdy. Palette anchors: face #0a1712, metal #4a4c4e, highlight #e0b277, accent #3f9a6a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown from 360 to 1400 px wide with the rails scaled to about 0.16; 15 px light text must read on the face.
REFERENCES: Input image 1: World of Warcraft trader's workshop painting — use ONLY for palette, material and finish. Input image 2: finished panel of another kit — use ONLY for shape, rail thickness and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type panel --in $SRC/panels/auction-candidate-1.png --in $SRC/panels/auction-candidate-2.png --in $SRC/panels/auction-candidate-3.png
$NODE $PACK --repo $REPO --type panel --in $SRC/panels/auction-native.png \
  --out /assets/wow/auction/controls/panels/auction.webp \
  --manifest $REPO/apps/web/public/assets/wow/auction/controls/panels/manifest.json --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `auction` / `button`

| | |
| --- | --- |
| Где на сайте | «Найти предмет», «Показать лоты», «Назад/Далее», «Повторить» |
| Холст (выход) | широкий 3:1 → 2172×724 |
| Итог | 768×~130 WebP, < 80 КБ |
| Native | `$SRC/buttons/auction-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-auction-assets-20261027/asset-sources/panels/auction-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/buttons-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one low horizontal game-interface button in the Auction House material, for the Gildra World of Warcraft fan site, the Auction House page. Isolated object on a real transparent background (alpha).
USE: stretched horizontally by CSS nine-slice; a short live HTML label sits in the centre.
CANVAS: wide 3:1 landscape canvas; the button spans about 92% of the canvas width and about 42% of its height, centred, with at least 4% empty transparent margin on every side.
GEOMETRY: painted silhouette about 7:1. Compact end caps take only the outer 11% on each side; each cap is a short stack of copper-gold coins held by an iron bracket with one small emerald enamel stud. The middle 76% is a plain straight band: thin top and bottom rails of constant height and an opaque very dark calm face, with nothing on it — no central crest, gem, emblem, notch or bulge. Softly chamfered corners. The face is fully opaque; only the outside is transparent.
[KIT] Materials and palette: riveted dark gunmetal iron rails, warm copper-gold coin bosses at the corners, small emerald-green enamel accents of a goblin trading house, deep bottle-green ledger face; mercantile and sturdy. Palette anchors: face #0a1712, metal #4a4c4e, highlight #e0b277, accent #3f9a6a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 68 px tall; the end caps must read as one clear motif at that size.
REFERENCES: Input image 1: approved Auction House panel — use ONLY for palette, material and finish. Input image 2: finished button of another kit — use ONLY for shape, proportions and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type button --in $SRC/buttons/auction-candidate-1.png --in $SRC/buttons/auction-candidate-2.png --in $SRC/buttons/auction-candidate-3.png
$NODE $PACK --repo $REPO --type button --in $SRC/buttons/auction-native.png \
  --out /assets/wow/auction/controls/buttons/auction.webp \
  --manifest $REPO/apps/web/public/assets/wow/auction/controls/buttons/manifest.json --proof $PROOF
```

---

## 3. Рамка иконки предмета — `auction-icon` / `skill`

| | |
| --- | --- |
| Где на сайте | иконка каждого лота (52 px); цвет качества — данными (линия и цвет имени), не в рамке |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/auction-icon-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-auction-assets-20261027/asset-sources/panels/auction-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the Auction House material, for the Gildra World of Warcraft fan site, the Auction House page. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (an item icon in an auction listing); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (four copper-gold coin rivets, thin emerald enamel inlay along the iron rails) so the icon is never covered.
[KIT] Materials and palette: riveted dark gunmetal iron rails, warm copper-gold coin bosses at the corners, small emerald-green enamel accents of a goblin trading house, deep bottle-green ledger face; mercantile and sturdy. Palette anchors: face #0a1712, metal #4a4c4e, highlight #e0b277, accent #3f9a6a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 40–56 px (usually 52 px); the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved Auction House panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/auction-icon-candidate-1.png --in $SRC/frames/auction-icon-candidate-2.png --in $SRC/frames/auction-icon-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/auction-icon-native.png \
  --out /assets/wow/auction/controls/frames/auction-icon.webp \
  --manifest $REPO/apps/web/public/assets/wow/auction/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

## 4. Сцена героя (непрозрачная) — `hall` / `scene`

| | |
| --- | --- |
| Где на сайте | фон героя `/wow/auction` (сейчас временно `loading/tools.webp`) |
| Холст (выход) | 16:9 → 1672×941, без альфы |
| Итог | 1672×941 + 768 + mobile 640×1000 |
| Native | `$SRC/scenes/hall-native.png` |
| referenced_image_paths | 1. `/home/debian/.claude/skills/gildra-asset-imagegen/references/hub-gateway.webp` |
| transparent_background | false |

```text
ASSET: one opaque painted environment background for the hero of the Auction House page on the Gildra World of Warcraft fan site.
SCENE: an original grand auction hall of a goblin trading house: a high iron-and-stone gallery; at the focal point a big brass balance scale in front of a tall arched counting window glowing warm gold; stacked crates and coin chests at the sides, plain green banners without any marks, lanterns along the upper balconies.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 72% from the left and 38% from the top; the left half stays dark and quiet for a live HTML title; the lower third is calm floor, mist or shadow that content overlaps. One believable space with depth. No people, no creatures.
STYLE: painterly World of Warcraft environment art, broad confident brush shapes, low micro-detail, soft atmospheric depth.
LIGHT: key light from the upper left; warm lantern gold against cool deep bottle-green shadows, evening trade hall; moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
REFERENCES: Input image 1: an existing Gildra hero scene — use ONLY for painting style and level of detail, not its place or colours.
EXCLUDE: no interface, cards, borders or frames; no lettering, signs with writing, logos, watermarks; no price tags or numbers; no repeated patterns, decorative speckle, swarms of floating particles, multiple glowing rings, oversaturated colour.
```

```bash
$NODE $QA --repo $REPO --type scene --in $SRC/scenes/hall-candidate-1.png --in $SRC/scenes/hall-candidate-2.png --in $SRC/scenes/hall-candidate-3.png
$NODE $PACK --repo $REPO --type scene --in $SRC/scenes/hall-native.png --out /assets/wow/auction/hall.webp --proof $PROOF
# мобильный кроп: H — высота исходника, w = round(H*0.64), x = 0.72*ширина − w/2 (зажать в [0, ширина − w])
$NODE $PACK --repo $REPO --type scene-mobile --crop <x>,0,<w>,<H> --in $SRC/scenes/hall-native.png --out /assets/wow/auction/hall-mobile.webp
```

---

## После генерации (Claude-сессия страницы)

- `components/wow/auction/auctionKit.ts`: переключить с `kings-rest` на манифесты `/assets/wow/auction/controls/*`, акцент `#d0995a` в таблицу тем.
- `AuctionBackdrop.tsx`: `<picture>` `hall-mobile.webp` / `hall-768.webp` / `hall.webp`.
- `SOURCE.md` в каждой папке `/assets/wow/auction/controls/*` и `/assets/wow/auction/` по `gildra-wow-material-design/assets.md` §8 (+ QA-отчёт победителя).
- Проверка 1440/390 RU/EN, 4 темы, reduced motion/transparency, forced colors; контакт-лист кита рядом с `references/kit-sheet-dungeons.jpg`.
