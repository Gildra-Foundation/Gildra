# Ассеты «Библиотеки WoW» — задание для Codex `image_gen`

Сущность: **library** (страницы `/library`, `/library/<набор>`, страница записи). Скилл `gildra-wow-material-design`,
рецепты `assets.md` §2–§9. Подготовлено 2026-10-26 сессией редизайна библиотеки (worktree `~/Gildra-library-design-20261026`).

## Общие правила (для каждого ассета)

- Инструмент: встроенный Codex `image_gen`, режим **generate**, `transparent_background: true`, **один ассет — один вызов**.
- Референсы — картинки из колонки «Input image», с ролью, указанной в промпте.
- Оригинал: **RGBA PNG** (настоящая альфа, углы холста прозрачные). Скопируй файл из `/home/debian/.codex/generated_images/<сессия>/`
  в путь «Native» ниже (каталоги уже созданы). Рядом сохрани точный промпт как `<имя>-prompt.txt`.
- Плохой результат — **новая генерация**, без ретуши, перекраски и вырезания фона. Нет настоящей прозрачности — стоп.
- После упаковки открой proof-PNG (голубой фон): без ореолов, концы/углы не растянуты, у рамки нет просветов.
- Порядок: **1 → 2 → 3 → 4**. Панель утверждается первой: она референс палитры для остальных.

Материал (одна фраза для всех четырёх, `{MATERIAL}`):

```text
Materials and palette: dark oiled walnut wood rails with aged warm bronze fittings and corner clasps shaped like brass book-corner caps, one small smooth cool arcane-blue crystal accent, deep ink-blue nearly black face; the quiet scholarly archive of a mage library, bookbinding elegance. No phoenix, no crimson, no velvet, no gold filigree.
```

Акцент сущности: `#c8a46a` (старая бронза). `accent-check.cjs`: pass, light #d7c19c, контраст 9.07 / 11.27; оттенок близок к
march-on-queldanas (3°) — поэтому материал явно другой: дерево + бронза + голубой кристалл вместо бархата, золота и перьев феникса.

Стиль (`{STYLE}`, уже вставлен в промпты ниже — `assets.md` §2).

Переменные для команд упаковки:

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
SKILL=/home/debian/.claude/skills/gildra-wow-material-design
REPO=/home/debian/Gildra-library-design-20261026
SRC=/home/debian/gildra-library-design-release-20261026/asset-sources
PROOF=/home/debian/gildra-library-design-release-20261026/proof
```

---

## 1. Материальная панель (9-slice) — `library` / `panel`

- Где на странице: табличка-подложка панели поиска и фильтров набора, плитки «Предметы и коллекции» и панели разделов на landing.
- Холст оригинала: портрет ≈1024×1280, RGBA. Итог после упаковки: 768×~960 WebP, < 100 КБ.
- Native: `/home/debian/gildra-library-design-release-20261026/asset-sources/panels/library-native.png`
- Input image 1 (палитра): `/home/debian/Gildra-library-design-20261026/apps/web/public/assets/wow/loading/archive.webp`
- Input image 2 (только форма/конструкция): `/home/debian/Gildra-library-design-20261026/apps/web/public/assets/wow/mythic/hub/controls/panels/den-of-nalorakk.webp`

```text
Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: the World of Warcraft library archive painting, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: an existing finished material panel used ONLY as the filled-panel shape and orthographic construction reference, not its theme.
Primary request: create a new tall physical text panel with its own World of Warcraft Library materials, quieter than the detailed art frame it supports.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and 91–97%, y3–9% and 91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no light source, no strong vignette. Very low contrast broad tone variation ONLY.
Style: deliberately hand-painted World of Warcraft game interface art, broad simplified confident brush shapes, clean readable silhouette, smooth stylized bevel planes, soft hand-painted lighting, low to moderate contrast, restrained saturation. Low microdetail. NOT photorealistic, NOT PBR, NOT a 3D render, NOT glossy AI wallpaper.
Avoid: grain, noise, speckles, scratches, tiny cracks, marble veins, dense engraving, repeated runes, arrays of gems, high-frequency texture, sharp white specular highlights, neon glare, collage.
No text, letters, numbers, logos, watermark, symbols pretending to be writing. No checkerboard painted into pixels.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel. No large central top or bottom decoration. Four corner details only.
Material/theme: dark oiled walnut wood rails with aged warm bronze fittings and corner clasps shaped like brass book-corner caps, one small smooth cool arcane-blue crystal accent at each corner, deep ink-blue nearly black face; the quiet scholarly archive of a mage library, bookbinding elegance. No phoenix, no crimson, no velvet, no gold filigree.
```

Упаковка и проверка:

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type panel \
  --in $SRC/panels/library-native.png \
  --out /assets/wow/library/controls/panels/library.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/panels/manifest.json \
  --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `library` / `button`

- Где: «Найти» в поиске landing, «Следующая страница» в списке набора, «Открыть набор» на плитках.
- Холст: широкий 3:1 (например 1536×512), силуэт ≈7:1, RGBA. Итог: 768×~130–145 WebP, < 80 КБ.
- Native: `/home/debian/gildra-library-design-release-20261026/asset-sources/buttons/library-native.png`
- Input image 1 (палитра): утверждённая панель `…/asset-sources/panels/library-native.png`
- Input image 2 (только форма): `/home/debian/Gildra-library-design-20261026/apps/web/public/assets/wow/mythic/hub/controls/buttons/den-of-nalorakk.webp`

```text
Use case: stylized-concept. Asset type: real raster UI button asset for the Gildra World of Warcraft Library page.
Input image 1: the approved Library material panel, used ONLY for palette and material identity.
Input image 2: an existing finished button, used ONLY as shape and construction reference, not its theme.
Create ONE elegant low horizontal World of Warcraft Library button, isolated on a genuinely transparent background.
Style: deliberately hand-painted World of Warcraft game interface art, broad simplified confident brush shapes, clean readable silhouette, smooth stylized bevel planes, soft hand-painted lighting, low to moderate contrast, restrained saturation. Low microdetail. NOT photorealistic, NOT PBR, NOT a 3D render, NOT glossy AI wallpaper.
Avoid: grain, noise, speckles, scratches, tiny cracks, marble veins, dense engraving, repeated runes, arrays of gems, high-frequency texture, sharp white specular highlights, neon glare, collage.
No text, letters, numbers, logos, watermark, symbols pretending to be writing. No checkerboard painted into pixels.
Materials and palette: dark oiled walnut wood rails with aged warm bronze fittings, end caps shaped like brass book-corner caps each holding one small smooth cool arcane-blue crystal, deep ink-blue nearly black face; the quiet scholarly archive of a mage library. No phoenix, no crimson, no velvet, no gold filigree.
Composition: very wide, low button with its whole silhouette visible and generous transparent margins, roughly 7:1 painted silhouette, centered on a wide 3:1 canvas. Compact distinct end caps occupy only the outermost 10–12 percent on each side. The central 75 percent must be blank, very dark, nearly opaque and visually quiet to hold readable live HTML text. Its thin straight top and bottom rails must be constant-height uninterrupted lines across the entire middle 75 percent: no central crest, no diamonds, no emblem or rising ornament in the middle, nothing that deforms when stretched by CSS nine-slicing. Rounded or organically chamfered corners. The face is filled opaque dark material; only the exterior is alpha transparent. No text, letters, logo, numbers, watermark, mockup, background scene or multiple buttons.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type button \
  --in $SRC/buttons/library-native.png \
  --out /assets/wow/library/controls/buttons/library.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/buttons/manifest.json \
  --proof $PROOF
```

---

## 3. Рамка иконки (квадрат с прозрачным окном) — `library-icon` / `skill`

- Где: крупная иконка записи в hero страницы записи и иконка набора на плитках landing. Цвет качества предмета
  остаётся данными: тонкая линия внутри окна и цвет названия; рамка — только материал.
- Холст: квадрат 1024×1024, окно x18–82 % / y18–82 % прозрачное, RGBA. Итог: 256×256 WebP + `window` в манифесте.
- Native: `/home/debian/gildra-library-design-release-20261026/asset-sources/frames/library-icon-native.png`
- Input image 1 (палитра): утверждённая панель `…/asset-sources/panels/library-native.png`
- Input image 2 (только форма): `/home/debian/Gildra-library-design-20261026/apps/web/public/assets/wow/mythic/pull-art/skills/den-of-nalorakk.webp`

```text
Use case: stylized-concept. Production raster UI asset for the Gildra World of Warcraft Library record page.
Input image 1: the approved Library material panel, used ONLY for palette and material identity.
Input image 2: an existing ability icon frame, used ONLY as shape and construction reference, not its theme.
Style: deliberately hand-painted World of Warcraft game interface art, broad simplified confident brush shapes, clean readable silhouette, smooth stylized bevel planes, soft hand-painted lighting, low to moderate contrast, restrained saturation. Low microdetail. NOT photorealistic, NOT PBR, NOT a 3D render, NOT glossy AI wallpaper.
Avoid: grain, noise, speckles, scratches, tiny cracks, marble veins, dense engraving, repeated runes, arrays of gems, high-frequency texture, sharp white specular highlights, neon glare, collage.
No text, letters, numbers, logos, watermark, symbols pretending to be writing. No checkerboard painted into pixels.
Single centered asset, front view, square canvas, actual transparent background, no cast shadow outside the asset.
A square item icon frame with softly rounded corners. ONE empty square window from x=18 to x=82 percent, y=18 to y=82 percent; the window is genuinely transparent, no picture inside. Broad continuous painted frame around all four sides, wide transparent margin outside. Theme accents confined to the four corners (brass book-corner caps, one tiny arcane-blue crystal at the top centre of the rail at most) so the icon stays unobscured. Theme: World of Warcraft Library: dark oiled walnut wood with aged warm bronze fittings, deep ink-blue inner bevel; scholarly archive of a mage library.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type skill \
  --in $SRC/frames/library-icon-native.png \
  --out /assets/wow/library/controls/frames/library-icon.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/frames/manifest.json \
  --proof $PROOF
```

---

## 4. Орнамент «перо» (растёт из нижней рейки) — `library-quill` / `ornament`

- Где: одна плитка «Предметы и коллекции» на landing и табличка-итог страницы набора (по одному на блок, `aria-hidden`).
- Холст: портрет ≈3:4 (например 768×1024), RGBA, ~12 px прозрачности под основанием. Итог: ширина 384 WebP, < 35 КБ.
- Native: `/home/debian/gildra-library-design-release-20261026/asset-sources/ornaments/library-quill-native.png`
- Input image 1 (палитра и настроение): утверждённая панель `…/asset-sources/panels/library-native.png`

```text
Use case: stylized-concept.
Asset type: Warcraft painterly interface ornament, isolated transparent cutout, intended to grow upward from the lower rail of a dark library panel.
Input image 1 is a reference ONLY for the Library palette and material mood; do NOT reproduce it.
Primary request: one graceful writing quill feather in muted ink-blue and pale parchment tones, rising from a compact small aged-bronze inkwell cap; one tiny cool arcane-blue glint near the feather tip.
Composition: a SINGLE tall simple ornament, upright, whole subject completely within the image. Compact single stem/root at bottom centre, the painted base near bottom centre; rest grows upward with a slight natural curve. Narrow base; broad simple readable top forms. Transparent padding around silhouette, only about 12 native pixels under the actual base. Portrait composition, approximately 3:4.
Style/medium: authentic soft hand-painted Warcraft game UI illustration, broad clean brush shapes, calm low-contrast shading, restrained saturation, simplified edges readable at 80px width. Gentle diffused lighting.
Scene/backdrop: actual transparent RGBA everywhere outside the one subject. No floor, no pot, no ground, no cast shadow, no background wash, no rectangular backing, no frame. No detached small decorations.
Constraints: no text, no letters, no numbers, no UI, no characters or faces, no border. Make one clean production cutout.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type ornament \
  --in $SRC/ornaments/library-quill-native.png \
  --out /assets/wow/library/controls/ornaments/library-quill.webp \
  --manifest $REPO/apps/web/public/assets/wow/library/controls/ornaments/manifest.json \
  --proof $PROOF
```

После упаковки орнамента вручную допиши в его запись манифеста: `"anchor": "right", "theme": "arcane", "duration": 1600, "delay": 300`.

---

## После генерации (делает Claude в сессии редизайна)

1. Проверить proof каждого ассета и срезы 9-slice (`assets.md` §5.1), при необходимости поправить `slices` в манифесте.
2. Дописать `SOURCE.md` в каждую папку `/assets/wow/library/controls/*/` (`assets.md` §8: режим, native SHA-256, референсы, итог, геометрия, полный промпт).
3. Подключить ассеты в код (панель, кнопки, рамка иконки, орнамент), проверить 1440/390, RU/EN, 4 темы, reduced motion/transparency, forced colors.
4. Собрать контакт-лист набора и сравнить с `references/images/asset-kits-*.jpg`.

Сцену не генерируем: фон библиотеки — существующий `/assets/wow/loading/archive.webp`.
