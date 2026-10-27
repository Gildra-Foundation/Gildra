# Ассеты рейдов и логов — задание для Codex image_gen (gildra-asset-imagegen)

Область D (рейды и логова), 2026-10-27. Пять рамок навыков рейдов, сцена Sporefall и кит логов. Страницы уже работают на существующих китах; эти ассеты заменяют временные. Блоки ниже собраны build-prompts.py — по одному на кит.


## Ассеты «Логова и мировые боссы» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **lairs** · страницы `/wow/lairs`, `/wow/lairs/[slug]`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

### Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-raids-design-20261027/asset-sources/<type>s/lairs-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#5aa7c8` — `accent-check.cjs` pass; оттенок в 10° от den-of-nalorakk — поэтому материал другой: бронза с ракушками и перламутр вместо сланцевого камня и медвежьих когтей.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-raids-design-20261027
SRC=/home/debian/gildra-raids-design-20261027/asset-sources
PROOF=/home/debian/gildra-raids-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

### 1. Материальная панель (9-slice) — `lairs` / `panel`

| | |
| --- | --- |
| Где на сайте | таблички карточек логова и мировых боссов, «Награды и расписание», способности, сложности, добыча |
| Холст (выход) | портрет 4:5 → 1122×1402 |
| Итог | 768×~960 WebP, < 100 КБ |
| Native | `$SRC/panels/lairs-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/lairs/bosses/nymrissa.jpg`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/panels-den-of-nalorakk.webp` |
| transparent_background | true |

```text
ASSET: one tall physical text panel (a plaque) in the Lairs material, for the Gildra World of Warcraft fan site, the Lairs and world bosses pages. Isolated object on a real transparent background (alpha).
USE: stretched in both directions by CSS nine-slice; boss facts, ability lists and loot tables of live HTML sit on its face.
CANVAS: portrait 4:5 canvas; the panel fills it with a 3% empty transparent margin on every side.
GEOMETRY: four continuous straight thin rails of even thickness (about 5% of the width), an unbroken bottom rail, small corner clasps fully inside the corner squares (outer 10% x 10%). The centre from 12% to 88% in both directions is one solid opaque very dark face with a single broad, very soft tone shift — it is material, not a window. No decoration at the middle of any rail.
[KIT] Materials and palette: barnacle-crusted sea-green bronze rails, nacre mother-of-pearl shell caps at the corners, deep kelp-dark teal face; a tidal grotto, wet and luminous only at the edges. Palette anchors: face #08161a, metal #3f6a5c, highlight #d8e6d0, accent #5aa7c8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown from 360 to 1400 px wide with the rails scaled to about 0.16; 15 px light text must read on the face.
REFERENCES: Input image 1: Nymrissa Wavecaller official artwork — use ONLY for palette, material and finish. Input image 2: finished panel of another kit — use ONLY for shape, rail thickness and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type panel --in $SRC/panels/lairs-candidate-1.png --in $SRC/panels/lairs-candidate-2.png --in $SRC/panels/lairs-candidate-3.png
$NODE $PACK --repo $REPO --type panel --in $SRC/panels/lairs-native.png \
  --out /assets/wow/lairs/controls/panels/lairs.webp \
  --manifest $REPO/apps/web/public/assets/wow/lairs/controls/panels/manifest.json --proof $PROOF
```

---

### 2. Кнопка (9-slice) — `lairs` / `button`

| | |
| --- | --- |
| Где на сайте | «Логово сезона», «Мировые боссы», «Открыть гайд», «Гайд» |
| Холст (выход) | широкий 3:1 → 2172×724 |
| Итог | 768×~130 WebP, < 80 КБ |
| Native | `$SRC/buttons/lairs-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-raids-design-20261027/asset-sources/panels/lairs-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/buttons-ruby-life-pools.webp` |
| transparent_background | true |

```text
ASSET: one low horizontal game-interface button in the Lairs material, for the Gildra World of Warcraft fan site, the Lairs and world bosses pages. Isolated object on a real transparent background (alpha).
USE: stretched horizontally by CSS nine-slice; a short live HTML label sits in the centre.
CANVAS: wide 3:1 landscape canvas; the button spans about 92% of the canvas width and about 42% of its height, centred, with at least 4% empty transparent margin on every side.
GEOMETRY: painted silhouette about 7:1. Compact end caps take only the outer 11% on each side; two nacre shell caps, the left one slightly larger. The middle 76% is a plain straight band: thin top and bottom rails of constant height and an opaque very dark calm face, with nothing on it — no central crest, gem, emblem, notch or bulge. Softly chamfered corners. The face is fully opaque; only the outside is transparent.
[KIT] Materials and palette: barnacle-crusted sea-green bronze rails, nacre mother-of-pearl shell caps at the corners, deep kelp-dark teal face; a tidal grotto, wet and luminous only at the edges. Palette anchors: face #08161a, metal #3f6a5c, highlight #d8e6d0, accent #5aa7c8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 68 px tall; the end caps must read as one clear motif at that size.
REFERENCES: Input image 1: approved Lairs panel — use ONLY for palette, material and finish. Input image 2: finished button of another kit — use ONLY for shape, proportions and construction, not its colours or motifs.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type button --in $SRC/buttons/lairs-candidate-1.png --in $SRC/buttons/lairs-candidate-2.png --in $SRC/buttons/lairs-candidate-3.png
$NODE $PACK --repo $REPO --type button --in $SRC/buttons/lairs-native.png \
  --out /assets/wow/lairs/controls/buttons/lairs.webp \
  --manifest $REPO/apps/web/public/assets/wow/lairs/controls/buttons/manifest.json --proof $PROOF
```

---

### 3. Рамка навыка — `lairs-skill` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки способностей на страницах логова и мировых боссов |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/lairs-skill-native.png` |
| referenced_image_paths | 1. `/home/debian/gildra-raids-design-20261027/asset-sources/panels/lairs-native.png`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the Lairs material, for the Gildra World of Warcraft fan site, the Lairs and world bosses pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a boss ability icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (four small nacre shell caps) so the icon is never covered.
[KIT] Materials and palette: barnacle-crusted sea-green bronze rails, nacre mother-of-pearl shell caps at the corners, deep kelp-dark teal face; a tidal grotto, wet and luminous only at the edges. Palette anchors: face #08161a, metal #3f6a5c, highlight #d8e6d0, accent #5aa7c8.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 44–56 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved Lairs panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/lairs-skill-candidate-1.png --in $SRC/frames/lairs-skill-candidate-2.png --in $SRC/frames/lairs-skill-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/lairs-skill-native.png \
  --out /assets/wow/lairs/controls/frames/lairs-skill.webp \
  --manifest $REPO/apps/web/public/assets/wow/lairs/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

### 4. Сцена героя — `lairs-scene` / `scene`

| | |
| --- | --- |
| Где на сайте | фон героя /wow/lairs (сейчас — портрет Nymrissa) |
| Холст (выход) | 16:9 → 1672×941, без альфы |
| Итог | 1672×941 + 768 + mobile 640×1000 |
| Native | `$SRC/scenes/lairs-scene-native.png` |
| referenced_image_paths | 1. `/home/debian/.claude/skills/gildra-asset-imagegen/references/hub-gateway.webp` |
| transparent_background | false |

```text
ASSET: one opaque painted environment background for the hero of the Lairs and world bosses pages on the Gildra World of Warcraft fan site.
SCENE: a flooded tidal grotto beneath the Coiled Isle: luminous blue water falling in thin threads on the right, wet barnacled stone arches, a calm dark pool on the left half for headline text
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 72% from the left and 38% from the top; the left half stays dark and quiet for a live HTML title; the lower third is calm floor, mist or shadow that content overlaps. One believable space with depth. No people, no creatures.
STYLE: painterly World of Warcraft environment art, broad confident brush shapes, low micro-detail, soft atmospheric depth.
LIGHT: key light from the upper left; cold luminous blue water light, quiet and deep; moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
REFERENCES: Input image 1: an existing Gildra hero scene — use ONLY for painting style and level of detail, not its place or colours.
EXCLUDE: no interface, cards, borders or frames; no lettering, signs with writing, logos, watermarks; no price tags or numbers; no repeated patterns, decorative speckle, swarms of floating particles, multiple glowing rings, oversaturated colour.
```

```bash
$NODE $QA --repo $REPO --type scene --in $SRC/scenes/lairs-scene-candidate-1.png --in $SRC/scenes/lairs-scene-candidate-2.png --in $SRC/scenes/lairs-scene-candidate-3.png
$NODE $PACK --repo $REPO --type scene --in $SRC/scenes/lairs-scene-native.png --out /assets/wow/lairs/lairs-scene.webp --proof $PROOF
# мобильный кроп: H — высота исходника, w = round(H*0.64), x = 0.72*ширина − w/2 (зажать в [0, ширина − w])
$NODE $PACK --repo $REPO --type scene-mobile --crop <x>,0,<w>,<H> --in $SRC/scenes/lairs-scene-native.png --out /assets/wow/lairs/lairs-scene-mobile.webp
```

---

### После генерации (Claude-сессия страницы)

- Рамка картины (frame) билдером не поддерживается: для карточек логова пока рамка Venomous Abyss (`RaidFramedArt`); свою — по `prompt-templates.md` «Рамка картины».
- Подключить: `kit` в `components/wow/raid/lairs/LairsHub.tsx` и `LairBossGuide.tsx` — новый кит через тот же контракт `--mythic-panel-*`/`--mythic-button-*` (см. `raidMaterial.tsx`).
- Проверка 1440/390 RU/EN, 4 темы, reduced motion/transparency, forced colors.


## Ассеты «Рейд The Venomous Abyss» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **venomous-abyss** · страницы `/wow/raids/venomous-abyss`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

### Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-raids-design-20261027/asset-sources/<type>s/venomous-abyss-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#74c8a8` — Живой рейдовый кит; hex приглушены по style-bible §5 для новых рейдовых ассетов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-raids-design-20261027
SRC=/home/debian/gildra-raids-design-20261027/asset-sources
PROOF=/home/debian/gildra-raids-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

### 1. Рамка навыка The Venomous Abyss — `venomous-abyss-skill` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки способностей на страницах рейда The Venomous Abyss и его боссов (сейчас — ближайший кит M+ через raidIconFrameStyle) |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/venomous-abyss-skill-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/raids/hub/controls/panels/venomous-abyss.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the The Venomous Abyss material, for the Gildra World of Warcraft fan site, the The Venomous Abyss raid pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a boss ability icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (two small cobra-hood caps at the top corners, plain bronze at the bottom corners) so the icon is never covered.
[KIT] Materials and palette: jade-green stone, old bronze, cobra-hood caps, poison channels kept as thin lines. Palette anchors: face #08281a, metal #80551a, highlight #f0d69a, accent #c99a3a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 44–56 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved The Venomous Abyss panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/venomous-abyss-skill-candidate-1.png --in $SRC/frames/venomous-abyss-skill-candidate-2.png --in $SRC/frames/venomous-abyss-skill-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/venomous-abyss-skill-native.png \
  --out /assets/wow/raids/hub/controls/frames/venomous-abyss-skill.webp \
  --manifest $REPO/apps/web/public/assets/wow/raids/hub/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

### После генерации (Claude-сессия страницы)

- Подключить рамку: в `components/wow/raid/raidMaterial.tsx` `raidIconFrameStyle()` брать рамку рейда из нового манифеста вместо ближайшего кита M+.
- Проверка 1440/390 RU/EN, 4 темы, forced colors.


## Ассеты «Рейд The Voidspire» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **the-voidspire** · страницы `/wow/raids/the-voidspire`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

### Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-raids-design-20261027/asset-sources/<type>s/the-voidspire-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#b39ade` — Живой рейдовый кит; hex приглушены по style-bible §5 для новых рейдовых ассетов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-raids-design-20261027
SRC=/home/debian/gildra-raids-design-20261027/asset-sources
PROOF=/home/debian/gildra-raids-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

### 1. Рамка навыка The Voidspire — `the-voidspire-skill` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки способностей на страницах рейда The Voidspire и его боссов (сейчас — ближайший кит M+ через raidIconFrameStyle) |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/the-voidspire-skill-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/raids/hub/controls/panels/the-voidspire.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the The Voidspire material, for the Gildra World of Warcraft fan site, the The Voidspire raid pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a boss ability icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (one small crystal shard in each corner) so the icon is never covered.
[KIT] Materials and palette: obsidian black metal, violet void rifts as thin seams, small crystal shards. Palette anchors: face #190e34, metal #471e98, highlight #d9a8f0, accent #7a2fc4.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 44–56 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved The Voidspire panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/the-voidspire-skill-candidate-1.png --in $SRC/frames/the-voidspire-skill-candidate-2.png --in $SRC/frames/the-voidspire-skill-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/the-voidspire-skill-native.png \
  --out /assets/wow/raids/hub/controls/frames/the-voidspire-skill.webp \
  --manifest $REPO/apps/web/public/assets/wow/raids/hub/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

### После генерации (Claude-сессия страницы)

- Подключить рамку: в `components/wow/raid/raidMaterial.tsx` `raidIconFrameStyle()` брать рамку рейда из нового манифеста вместо ближайшего кита M+.
- Проверка 1440/390 RU/EN, 4 темы, forced colors.


## Ассеты «Рейд The Dreamrift» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **the-dreamrift** · страницы `/wow/raids/the-dreamrift`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

### Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-raids-design-20261027/asset-sources/<type>s/the-dreamrift-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#8fc8a6` — Живой рейдовый кит; hex приглушены по style-bible §5 для новых рейдовых ассетов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-raids-design-20261027
SRC=/home/debian/gildra-raids-design-20261027/asset-sources
PROOF=/home/debian/gildra-raids-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

### 1. Рамка навыка The Dreamrift — `the-dreamrift-skill` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки способностей на страницах рейда The Dreamrift и его боссов (сейчас — ближайший кит M+ через raidIconFrameStyle) |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/the-dreamrift-skill-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/raids/hub/controls/panels/the-dreamrift.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the The Dreamrift material, for the Gildra World of Warcraft fan site, the The Dreamrift raid pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a boss ability icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (a short curled vine leaf in each corner) so the icon is never covered.
[KIT] Materials and palette: ivory heartwood, green vines, pale dream-light. Palette anchors: face #162c15, metal #bea36b, highlight #f0e6c8, accent #8a9238.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 44–56 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved The Dreamrift panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/the-dreamrift-skill-candidate-1.png --in $SRC/frames/the-dreamrift-skill-candidate-2.png --in $SRC/frames/the-dreamrift-skill-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/the-dreamrift-skill-native.png \
  --out /assets/wow/raids/hub/controls/frames/the-dreamrift-skill.webp \
  --manifest $REPO/apps/web/public/assets/wow/raids/hub/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

### После генерации (Claude-сессия страницы)

- Подключить рамку: в `components/wow/raid/raidMaterial.tsx` `raidIconFrameStyle()` брать рамку рейда из нового манифеста вместо ближайшего кита M+.
- Проверка 1440/390 RU/EN, 4 темы, forced colors.


## Ассеты «Рейд March on Quel'Danas» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **march-on-queldanas** · страницы `/wow/raids/march-on-queldanas`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

### Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-raids-design-20261027/asset-sources/<type>s/march-on-queldanas-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#e1bd73` — Живой рейдовый кит; hex приглушены по style-bible §5 для новых рейдовых ассетов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-raids-design-20261027
SRC=/home/debian/gildra-raids-design-20261027/asset-sources
PROOF=/home/debian/gildra-raids-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

### 1. Рамка навыка March on Quel'Danas — `march-on-queldanas-skill` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки способностей на страницах рейда March on Quel'Danas и его боссов (сейчас — ближайший кит M+ через raidIconFrameStyle) |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/march-on-queldanas-skill-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/raids/hub/controls/panels/march-on-queldanas.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the March on Quel'Danas material, for the Gildra World of Warcraft fan site, the March on Quel'Danas raid pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a boss ability icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (a small phoenix-feather tip at each corner) so the icon is never covered.
[KIT] Materials and palette: crimson velvet face, sun-gold, phoenix-feather caps. Palette anchors: face #1a0a0c, metal #c06d1e, highlight #f0d69a, accent #c86a28.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 44–56 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved March on Quel'Danas panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/march-on-queldanas-skill-candidate-1.png --in $SRC/frames/march-on-queldanas-skill-candidate-2.png --in $SRC/frames/march-on-queldanas-skill-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/march-on-queldanas-skill-native.png \
  --out /assets/wow/raids/hub/controls/frames/march-on-queldanas-skill.webp \
  --manifest $REPO/apps/web/public/assets/wow/raids/hub/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

### После генерации (Claude-сессия страницы)

- Подключить рамку: в `components/wow/raid/raidMaterial.tsx` `raidIconFrameStyle()` брать рамку рейда из нового манифеста вместо ближайшего кита M+.
- Проверка 1440/390 RU/EN, 4 темы, forced colors.


## Ассеты «Рейд Sporefall» — задание для Codex `image_gen` (по скиллу gildra-asset-imagegen)

Кит **sporefall** · страницы `/wow/raids/sporefall`. Собрано `build-prompts.py` из `style-bible.md` (блоки дословно) — исполнитель ничего не дописывает. Правила и приёмка — `~/.claude/skills/gildra-asset-imagegen/SKILL.md`.

### Как исполнять (Codex)

1. Для каждого ассета — **три** отдельных вызова `image_gen.imagegen` с одним и тем же промптом и параметрами из таблицы; `transparent_background: true` для всех, кроме сцены. Размер не передаётся — пропорция уже в промпте.
2. Кандидатов скопировать из `/home/debian/.codex/generated_images/<сессия>/` в `/home/debian/gildra-raids-design-20261027/asset-sources/<type>s/sporefall-candidate-{1,2,3}.png`.
3. Выбрать скриптом: `$NODE $QA --repo $REPO --type <type> --in …-candidate-1.png --in …-2.png --in …-3.png` — первый без FAIL; переименовать в `<kit>-native.png`, рядом `<kit>-prompt.txt` (промпт как есть) и `<kit>-qa.json` (`--json`). Все три FAIL — ещё раунд, мелкий дефект удачного — edit-режим (`prompt-templates.md`, «Правка удачного кандидата»).
4. Порядок: **панель → кнопка → рамка иконки → орнамент → сцена**. Панель утверждается первой: она Input image 1 для остальных.
5. Упаковка — команда под ассетом; открыть proof (голубой фон). Ретушь, перекраска, вырезание фона — запрещены.

Акцент сайта `#caa078` — Живой рейдовый кит; hex приглушены по style-bible §5 для новых рейдовых ассетов.

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
QA=/home/debian/.claude/skills/gildra-asset-imagegen/scripts/asset-qa.cjs
PACK=/home/debian/.claude/skills/gildra-wow-material-design/scripts/pack-asset.cjs
REPO=/home/debian/Gildra-raids-design-20261027
SRC=/home/debian/gildra-raids-design-20261027/asset-sources
PROOF=/home/debian/gildra-raids-design-20261027/proof
REF=/home/debian/.claude/skills/gildra-asset-imagegen/references
```

---

### 1. Рамка навыка Sporefall — `sporefall-skill` / `skill`

| | |
| --- | --- |
| Где на сайте | иконки способностей на страницах рейда Sporefall и его боссов (сейчас — ближайший кит M+ через raidIconFrameStyle) |
| Холст (выход) | квадрат 1:1 → 1254×1254 |
| Итог | 256×256 WebP + window, < 40 КБ |
| Native | `$SRC/frames/sporefall-skill-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/raids/hub/controls/panels/sporefall.webp`<br>2. `/home/debian/.claude/skills/gildra-asset-imagegen/references/pull-art-skills-kings-rest.webp` |
| transparent_background | true |

```text
ASSET: one square icon frame in the Sporefall material, for the Gildra World of Warcraft fan site, the Sporefall raid pages. Isolated object on a real transparent background (alpha).
USE: placed over a game icon (a boss ability icon); the icon shows through the window.
CANVAS: square canvas; the frame spans about 84% of it, centred, with an even transparent margin.
GEOMETRY: one empty square window from 18% to 82% in both directions with softly rounded corners, fully transparent, nothing inside. A broad continuous frame around all four sides; small accents only in the four corners (a tiny amber mushroom cap in each corner) so the icon is never covered.
[KIT] Materials and palette: umber wood, moss, amber mushroom caps. Palette anchors: face #331e10, metal #8b5a0e, highlight #f0d69a, accent #c98a2a.
[STYLE] Hand-painted fantasy game interface art in the World of Warcraft tradition: painted texture over clean sculpted forms, matte materials, three clear value steps on every bevel (lit top plane, mid face, shadowed underside), crisp readable silhouette, clean painted edge highlights, broad confident brush strokes visible only at large scale. Few large forms; ornament concentrated at corners and end caps; calm surfaces in between. Restrained saturation, low-to-moderate contrast, colour harmony limited to the kit palette. Original design, not a copy of any existing game asset.
[LIGHT] Straight-on orthographic front view, no perspective tilt, perfectly level. One soft key light from the upper left (10 o'clock) with a warm tint, a faint cool fill from the lower right; top bevels catch a thin warm highlight, lower bevels fall into a soft cool shadow. No cast shadow, glow, smoke or particles outside the object.
DISPLAY: shown 44–56 px; the frame must read as one clean ring of material at 48 px.
REFERENCES: Input image 1: approved Sporefall panel — use ONLY for palette and material. Input image 2: finished icon frame of another kit — use ONLY for shape and window proportion.
[EXCLUDE] No text, letters, numbers, runes that read as writing, logos, faction emblems, watermarks, signatures. No people, faces or creatures. No photorealism, no 3D render look, no glossy plastic, no neon glow, no lens flare. No grain, speckle noise, scratches, cracks, marble veins or dense engraving. No checkerboard, no background colour, no floor, no cast shadow. Only one object.
```

```bash
$NODE $QA --repo $REPO --type skill --in $SRC/frames/sporefall-skill-candidate-1.png --in $SRC/frames/sporefall-skill-candidate-2.png --in $SRC/frames/sporefall-skill-candidate-3.png
$NODE $PACK --repo $REPO --type skill --in $SRC/frames/sporefall-skill-native.png \
  --out /assets/wow/raids/hub/controls/frames/sporefall-skill.webp \
  --manifest $REPO/apps/web/public/assets/wow/raids/hub/controls/frames/manifest.json --manifest-group skills --proof $PROOF
```

---

### 2. Сцена героя Sporefall — `sporefall-scene` / `scene`

| | |
| --- | --- |
| Где на сайте | фон героя /wow/raids/sporefall и /wow/raids/sporefall/rotmire (сейчас — карточная картина 960×640) |
| Холст (выход) | 16:9 → 1672×941, без альфы |
| Итог | 1672×941 + 768 + mobile 640×1000 |
| Native | `$SRC/scenes/sporefall-scene-native.png` |
| referenced_image_paths | 1. `/home/debian/Gildra-raids-design-20261027/apps/web/public/assets/wow/raids/hub/sporefall.webp` |
| transparent_background | false |

```text
ASSET: one opaque painted environment background for the hero of the Sporefall raid pages on the Gildra World of Warcraft fan site.
SCENE: a vast fungal marsh in Harandar at dusk: giant amber-capped mushrooms and mossy roots on the right, a dark sunken raid entrance under the largest cap, drifting faint spores; the left half calm and dark for headline text
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 72% from the left and 38% from the top; the left half stays dark and quiet for a live HTML title; the lower third is calm floor, mist or shadow that content overlaps. One believable space with depth. No people, no creatures.
STYLE: painterly World of Warcraft environment art, broad confident brush shapes, low micro-detail, soft atmospheric depth.
LIGHT: key light from the upper left; warm amber dusk light through spores, humid and still; moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
REFERENCES: Input image 1: an existing Gildra hero scene — use ONLY for painting style and level of detail, not its place or colours.
EXCLUDE: no interface, cards, borders or frames; no lettering, signs with writing, logos, watermarks; no price tags or numbers; no repeated patterns, decorative speckle, swarms of floating particles, multiple glowing rings, oversaturated colour.
```

```bash
$NODE $QA --repo $REPO --type scene --in $SRC/scenes/sporefall-scene-candidate-1.png --in $SRC/scenes/sporefall-scene-candidate-2.png --in $SRC/scenes/sporefall-scene-candidate-3.png
$NODE $PACK --repo $REPO --type scene --in $SRC/scenes/sporefall-scene-native.png --out /assets/wow/raids/hub/sporefall-scene.webp --proof $PROOF
# мобильный кроп: H — высота исходника, w = round(H*0.64), x = 0.72*ширина − w/2 (зажать в [0, ширина − w])
$NODE $PACK --repo $REPO --type scene-mobile --crop <x>,0,<w>,<H> --in $SRC/scenes/sporefall-scene-native.png --out /assets/wow/raids/hub/sporefall-scene-mobile.webp
```

---

### После генерации (Claude-сессия страницы)

- Подключить рамку: в `components/wow/raid/raidMaterial.tsx` `raidIconFrameStyle()` брать рамку рейда из нового манифеста вместо ближайшего кита M+.
- Сцену — `art` в `SporefallPage.tsx` (и мобильный кроп).
