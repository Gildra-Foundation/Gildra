# Ассеты «Forever — тонкий кит раздела» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **forever** · страницы `/wow/forever/**` (+ `/ru`): хаб, классы и изменения, профессии, герой-кнопки всех страниц раздела. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

## Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-forever-platform-assets-20261111/asset-sources/<type>s/forever-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент**, сцены — в любой момент. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#9cc0a0` — `accent-check.cjs` pass (light #bad3c0); оттенок в 18° от the-dreamrift — материал явно другой: олово и латунь дорожного футляра для карт, без слоновой кости, лоз и живого дерева; отличие от library (орех + синий кристалл) и den-of-nalorakk (сланцевый камень + когти) — металл без дерева и камня, зелёная эмаль.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/.t3/worktrees/Gildra-atlas/codex-forever-platform-release-20261111
SRC=/home/debian/gildra-forever-platform-assets-20261111/asset-sources
PROOF=/home/debian/gildra-forever-platform-assets-20261111/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

## 1. Табличка (9-slice) — `forever` / `panel`

| | |
| --- | --- |
| Где на сайте | карточки разделов хаба, карточки классов, плитки профессий, табличка фильтров изменений, CTA; подземелья и рейды Forever вместо заимствованных den-of-nalorakk/kings-rest |
| Холст (выход) | портрет 4:5 → 1122×1402 |
| Итог | 768×~960 WebP, < 100 КБ |
| Native | `$SRC/panels/forever-native.png` |
| referenced_image_paths | 1. `/home/debian/.t3/worktrees/Gildra-atlas/codex-forever-platform-release-20261111/apps/web/public/assets/wow/slim/library/controls/panels/library.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one tall physical text panel (a plaque) in the Forever Wayfarer material, for the Gildra World of Warcraft fan site, the World of Warcraft: Forever section pages. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; headings, short facts, filters and short lists of live HTML sit on its face.
CANVAS: portrait 4:5 canvas; the panel fills it with a 3% empty transparent margin on every side.
GEOMETRY: four continuous straight thin rails of even thickness (about 5% of the width), an unbroken bottom rail, small corner clasps fully inside the corner squares (outer 10% x 10%). The centre from 12% to 88% in both directions is one solid opaque very dark face with a single broad, very soft tone shift — it is material, not a window. No decoration at the middle of any rail.
[KIT] Materials and palette: weathered brushed pewter rails with hammered antique-brass fittings, compact brass compass-rose caps each holding one tiny round pine-green enamel stone, deep pine-charcoal face; an old-world traveller's map case, worn and honest, clean straight construction rather than vines, claws or crystals; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #0c1512, metal #4f5552, highlight #d8c8a0, accent #5f9a76.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown from 360 to 1400 px wide with the rails scaled to about 0.16; 15 px light text must read on the face.
REFERENCES: Input image 1: finished slim panel of the neighbouring Library kit — use ONLY for its slim rail thickness, shallow relief and matte finish, not its walnut wood, colours or blue crystals; the palette comes only from the hex anchors above. Input image 2: finished panel of another kit — use ONLY for shape and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type panel --in $SRC/panels/forever-candidate-1.png --in $SRC/panels/forever-candidate-2.png --in $SRC/panels/forever-candidate-3.png
$NODE $PACK --repo $REPO --type panel --in $SRC/panels/forever-native.png \
  --out /assets/wow/slim/forever/controls/panels/forever.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/forever/controls/panels/manifest.json --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `forever` / `button`

| | |
| --- | --- |
| Где на сайте | кнопки героя всех страниц Forever, «Открыть», «Калькулятор талантов», «Сбросить фильтры», пагинация-«далее» |
| Холст (выход) | широкий 3:1 → 2172×724 |
| Итог | 768×~130 WebP, < 80 КБ |
| Native | `$SRC/buttons/forever-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-forever-platform-assets-20261111/asset-sources/panels/forever-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/buttons-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one low horizontal game-interface button in the Forever Wayfarer material, for the Gildra World of Warcraft fan site, the World of Warcraft: Forever section pages. Isolated object on a real transparent background (alpha).
USE: stretched horizontally by CSS nine-slice; a short live HTML label sits in the centre.
CANVAS: wide 3:1 landscape canvas; the button spans about 92% of the canvas width and about 42% of its height, centred, with at least 4% empty transparent margin on every side.
GEOMETRY: painted silhouette about 7:1. Compact end caps take only the outer 11% on each side; each cap is a compact flat brass compass-rose boss holding one tiny round pine-green enamel stone. The middle 76% is a plain straight band: thin top and bottom rails of constant height and an opaque very dark calm face, with nothing on it — no central crest, gem, emblem, notch or bulge. Softly chamfered corners. The face is fully opaque; only the outside is transparent.
[KIT] Materials and palette: weathered brushed pewter rails with hammered antique-brass fittings, compact brass compass-rose caps each holding one tiny round pine-green enamel stone, deep pine-charcoal face; an old-world traveller's map case, worn and honest, clean straight construction rather than vines, claws or crystals; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #0c1512, metal #4f5552, highlight #d8c8a0, accent #5f9a76.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 68 px tall; the end caps must read as one clear motif at that size.
REFERENCES: Input image 1: approved Forever Wayfarer panel — use ONLY for palette, material and finish. Input image 2: finished button of another kit — use ONLY for shape, proportions and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type button --in $SRC/buttons/forever-candidate-1.png --in $SRC/buttons/forever-candidate-2.png --in $SRC/buttons/forever-candidate-3.png
$NODE $PACK --repo $REPO --type button --in $SRC/buttons/forever-native.png \
  --out /assets/wow/slim/forever/controls/buttons/forever.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/forever/controls/buttons/manifest.json --proof $PROOF
```

---

## 3. Рамка иконки — `forever-icon` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки классов (64), профессий (52), инструментов хаба (52), крупная иконка записи библиотеки Forever (96) |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/forever-icon-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-forever-platform-assets-20261111/asset-sources/panels/forever-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the Forever Wayfarer material, for the Gildra World of Warcraft fan site, the World of Warcraft: Forever section pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a class, profession, item or spell icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (four small flat brass corner tips; at most one tiny pine-green enamel dot at the top centre of the rail) so the icon is never covered.
[KIT] Materials and palette: weathered brushed pewter rails with hammered antique-brass fittings, compact brass compass-rose caps each holding one tiny round pine-green enamel stone, deep pine-charcoal face; an old-world traveller's map case, worn and honest, clean straight construction rather than vines, claws or crystals; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #0c1512, metal #4f5552, highlight #d8c8a0, accent #5f9a76.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 40–96 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved Forever Wayfarer panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/forever-icon-candidate-1.png --in $SRC/frames/forever-icon-candidate-2.png --in $SRC/frames/forever-icon-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/forever-icon-native.png \
  --out /assets/wow/slim/forever/controls/frames/forever-icon.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/forever/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

## 4. Орнамент «сосновая ветвь» — `forever-pine` / `ornament`

| | |
| --- | --- |
| Где на сайте | одна на страницу: CTA-табличка хаба и табличка-итог хаба профессий |
| Холст (выход) | портрет 3:4 → ~1086×1448 |
| Итог | ширина 384 WebP, < 35 КБ |
| Native | `$SRC/ornaments/forever-pine-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-forever-platform-assets-20261111/asset-sources/panels/forever-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/ornaments-ruby-life-pools.webp` |
| transparent_background | true |

```text
ASSET: one upright ornament — one short evergreen pine sprig: a dark bronze twig rising from a compact base, three broad simple tufts of pine-green needles and one small warm-brown pine cone — in the Forever Wayfarer palette, for the Gildra World of Warcraft fan site, the World of Warcraft: Forever section pages. Isolated object on a real transparent background (alpha).
USE: grows up from the bottom rail of a plaque, overlapping its edge.
CANVAS: portrait 3:4 canvas; the subject fills about 85% of the height; only about 1% transparent margin under the base.
GEOMETRY: one compact stem or root at the bottom centre; three to five broad simple forms above it with a slight natural curve; nothing detached.
[KIT] Materials and palette: weathered brushed pewter rails with hammered antique-brass fittings, compact brass compass-rose caps each holding one tiny round pine-green enamel stone, deep pine-charcoal face; an old-world traveller's map case, worn and honest, clean straight construction rather than vines, claws or crystals; slim low-relief construction: thin flat rails, shallow bevels, compact flush end caps and clasps, minimal depth and bulk, light and elegant rather than heavy. Palette anchors: face #0c1512, metal #4f5552, highlight #d8c8a0, accent #5f9a76.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown about 96 px wide.
REFERENCES: Input image 1: approved Forever Wayfarer panel — use ONLY for palette and mood. Input image 2: finished ornament of another kit — use ONLY for scale of forms and simplicity, not its plant or colours.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type ornament --in $SRC/ornaments/forever-pine-candidate-1.png --in $SRC/ornaments/forever-pine-candidate-2.png --in $SRC/ornaments/forever-pine-candidate-3.png
$NODE $PACK --repo $REPO --type ornament --in $SRC/ornaments/forever-pine-native.png \
  --out /assets/wow/slim/forever/controls/ornaments/forever-pine.webp \
  --manifest $REPO/apps/web/public/assets/wow/slim/forever/controls/ornaments/manifest.json --proof $PROOF
```

После упаковки допиши в запись манифеста: `"anchor": "right", "theme": "pollen", "duration": 1500, "delay": 300`.

---

## После генерации (Claude-сессия страницы)

- Упаковка, proof, `slices`, `SOURCE.md` в каждой папке `/assets/wow/slim/forever/controls/*` — координатор (Codex) по `gildra-wow-material-design/assets.md` §5–§8.
- Подключение: `forever` в `SectionKit` и таблицу `kits` (`components/wow/shared/material/sectionKits.ts`, accent `#9cc0a0`), затем `npm run design:lock -- --base <кандидат>` — M+/мета/рейды не меняются.
- Сцены — раздел «Сцены» ниже (шаблон 2026-11-06, без референсов).

---

## Сцены (непрозрачные фоны героя) — шаблон 2026-11-06

Блоки STYLE / COMPOSITION / DISPLAY / EXCLUDE — дословно из `docs/backgrounds-20261106/CODEX-PROMPTS.md` (утверждённая владельцем серия фонов), меняются только SCENE, LIGHT, палитра и точка фокуса. `transparent_background: false`, **без `referenced_image_paths`** — как в серии 2026-11-06: официальные медиа Blizzard не подаются на вход, а старые сцены тянули стиль назад. Нативный выход 16:9 → 1672×941; упаковка только кодирует (без апскейла). Порядок: после кита (сцены от кита не зависят и могут идти параллельно).

### 5. Сцена `forever`

| | |
| --- | --- |
| Где на сайте | сцена `forever` в `lib/atlas/scenes.ts`: хаб `/wow/forever`, подземелья и рейды Forever, `/wow/forever/classes`, `/wow/forever/changes` |
| Холст (выход) | широкий 16:9 → 1672×941, без альфы |
| Итог | `/assets/wow/loading/forever-old-road-20261111.webp` (1672) + `-768.webp`; портрет телефона `-portrait.webp` — `npm run art:portraits` по фокусу `70% 38%` |
| Native | `$SRC/scenes/forever-native.png` (кандидаты `forever-candidate-{1,2,3}.png`) |
| referenced_image_paths | — (намеренно пусто) |
| transparent_background | false |

```text
ASSET: one opaque painted environment background for the hero of the World of Warcraft: Forever (the classic world of Azeroth to level 60, new dungeons, raids and tools) page on the Gildra World of Warcraft fan site.
SCENE: the old road of the Eastern Kingdoms at dawn: a broad worn cobbled road climbs out of a pine-forested river valley toward a weathered grey stone gatehouse arch with a slate roof and a single tall wooden watchtower beside it on a green hill; at the focal point warm morning light pours through the open arch; beyond the hill a calm sea, and far across it the faint blue coast of a second continent; a tall blank standing waystone (smooth, no carvings) by the roadside; low stone walls, wildflowers and long grass in the calm foreground; the left side is a dark mass of old pine trees and a mossy rock outcrop.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 38% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; warm low dawn gold through the arch and on the road against cool blue-green morning shadow in the pines; thin mist in the valley. Palette anchors: shadow #0f1714, stone #6c6a5c, light #f2d9a0, accent #7fae8c. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

```bash
$NODE $QA --repo $REPO --type scene --in $SRC/scenes/forever-candidate-1.png --in $SRC/scenes/forever-candidate-2.png --in $SRC/scenes/forever-candidate-3.png
$NODE $PACK --repo $REPO --type scene --in $SRC/scenes/forever-native.png --out /assets/wow/loading/forever-old-road-20261111.webp --proof $PROOF
```

Выбор глазами в 1440 и 390: левые 40 % самые тёмные, фокус читается у 70 %, низ спокойный, нет фигур, надписей и «оплавленной» архитектуры. Затем запись в `lib/atlas/scenes.ts` (`position: "70% 38%"`, `og: [0.7, 0.38]`), `npm run art:portraits` и плейсхолдер, раздел в `/assets/wow/loading/SOURCE.md` (или `docs/forever-platform-assets/SOURCE.md`).

### 6. Сцена `forever-crafts`

| | |
| --- | --- |
| Где на сайте | сцена `foreverCrafts` в `lib/atlas/scenes.ts`: `/wow/forever/professions`, `/wow/forever/professions/<slug>` |
| Холст (выход) | широкий 16:9 → 1672×941, без альфы |
| Итог | `/assets/wow/loading/forever-crafthall-20261111.webp` (1672) + `-768.webp`; портрет телефона `-portrait.webp` — `npm run art:portraits` по фокусу `70% 40%` |
| Native | `$SRC/scenes/forever-crafts-native.png` (кандидаты `forever-crafts-candidate-{1,2,3}.png`) |
| referenced_image_paths | — (намеренно пусто) |
| transparent_background | false |

```text
ASSET: one opaque painted environment background for the hero of the World of Warcraft: Forever professions (recipes for every crafting and gathering profession) page on the Gildra World of Warcraft fan site.
SCENE: an old-world artisans' hall carved into a mountain: massive rounded dwarven stone arches and heavy timber beams; at the focal point a great stone forge with a glowing hearth, a heavy iron anvil and a quenching trough; to its right an alchemist's oak bench with a copper still and a few glass flasks, a loom with a bolt of cloth, tanned hides stretched on a wooden frame, sacks of herbs and an open crate of raw ore; tools hang in neat rows on the walls; the left side is a shadowed stone wall with one plain hanging cloth and a stack of crates.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; warm orange forge glow and a shaft of daylight from a high opening on the upper left against cool slate-grey stone shadow. Palette anchors: shadow #14110f, stone #5e564c, light #f3c27e, accent #c2733c. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

```bash
$NODE $QA --repo $REPO --type scene --in $SRC/scenes/forever-crafts-candidate-1.png --in $SRC/scenes/forever-crafts-candidate-2.png --in $SRC/scenes/forever-crafts-candidate-3.png
$NODE $PACK --repo $REPO --type scene --in $SRC/scenes/forever-crafts-native.png --out /assets/wow/loading/forever-crafthall-20261111.webp --proof $PROOF
```

Выбор глазами в 1440 и 390: левые 40 % самые тёмные, фокус читается у 70 %, низ спокойный, нет фигур, надписей и «оплавленной» архитектуры. Затем запись в `lib/atlas/scenes.ts` (`position: "70% 40%"`, `og: [0.7, 0.4]`), `npm run art:portraits` и плейсхолдер, раздел в `/assets/wow/loading/SOURCE.md` (или `docs/forever-platform-assets/SOURCE.md`).

---

## Запрещено генерировать в этой задаче

Иконки заклинаний, талантов, предметов, классов и профессий; портреты; карты подземелий; логотипы и медальон Forever; любые надписи. Всё это — нативные медиа из данных (`lib/games/wow/assets.ts` / Forever-резолвер DATA).

## Итог: 6 ассетов × 3 кандидата = 18 вызовов `image_gen`

| # | Ассет | type | native | public |
|---|---|---|---|---|
| 1 | Табличка | `panel` | `$SRC/panels/forever-native.png` | `/assets/wow/slim/forever/controls/panels/forever.webp` |
| 2 | Кнопка | `button` | `$SRC/buttons/forever-native.png` | `/assets/wow/slim/forever/controls/buttons/forever.webp` |
| 3 | Рамка иконки | `skill` | `$SRC/frames/forever-icon-native.png` | `/assets/wow/slim/forever/controls/frames/forever-icon.webp` |
| 4 | Сосновая ветвь | `ornament` | `$SRC/ornaments/forever-pine-native.png` | `/assets/wow/slim/forever/controls/ornaments/forever-pine.webp` |
| 5 | Сцена хаба | `scene` | `$SRC/scenes/forever-native.png` | `/assets/wow/loading/forever-old-road-20261111.webp (+-768, -portrait)` |
| 6 | Сцена ремёсел | `scene` | `$SRC/scenes/forever-crafts-native.png` | `/assets/wow/loading/forever-crafthall-20261111.webp (+-768, -portrait)` |

Машиночитаемо: `assets.spec.json` рядом. Кит собран `build-prompts.py` из `forever.spec.json` (одна правка: строка REFERENCES панели уточнена, чтобы библиотечная панель не задавала палитру).

