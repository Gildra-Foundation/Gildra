# Ассеты «Аукциона» — задание для Codex `image_gen`

Сущность: **auction** (страницы `/wow/auction`, `/ru/wow/auction`). Скилл `gildra-wow-material-design`, рецепты `assets.md` §2–§9.
Подготовлено 2026-10-27 сессией редизайна аукциона и меты (worktree `~/Gildra-auction-meta-20261027`,
ветка `feat/auction-meta-redesign-20261027`). До появления этих файлов страница носит готовый кит King's Rest
(`components/wow/auction/auctionKit.ts`) — заглушек нет. Мета Mythic+ новых ассетов не требует (киты подземелий M+).

## Общие правила (для каждого ассета)

- Инструмент: встроенный Codex `image_gen`, режим **generate**, `transparent_background: true` (кроме сцены), **один ассет — один вызов**.
- Оригинал: **RGBA PNG** с настоящей альфой (углы холста прозрачные). Скопируй файл из `/home/debian/.codex/generated_images/<сессия>/`
  в путь «Native» ниже (каталоги уже созданы), рядом сохрани точный промпт как `<имя>-prompt.txt`.
- Плохой результат — **новая генерация**, без ретуши, перекраски и вырезания фона. Нет настоящей прозрачности — стоп.
- После упаковки открой proof-PNG (голубой фон): без ореолов, концы/углы не растянуты, у рамки нет просветов.
- Порядок: **1 (панель) → 2 → 3 → 4**. Панель утверждается первой: она референс палитры для остальных.

Материал (`{MATERIAL}`, одна фраза для всех):

```text
Materials and palette: riveted dark gunmetal iron rails with warm copper-gold coin bosses at the corners, small polished emerald-green enamel accents of a goblin trading company, deep bottle-green nearly black ledger face; the busy counting-house of a fantasy auction hall, mercantile and sturdy. No wood, no moss, no mushrooms, no ruby, no velvet, no feathers.
```

Акцент сущности: `#d0995a` (медное золото монет). `accent-check.cjs`: pass, light #dcba92, контраст 8.82 / 10.79;
оттенок близок к sporefall (3°), поэтому материал явно другой: железо + медные монеты + изумрудная эмаль вместо дерева, мха и грибов.

Переменные для команд упаковки:

```bash
NODE=/home/debian/.local/node-v22.23.2/bin/node
SKILL=/home/debian/.claude/skills/gildra-wow-material-design
REPO=/home/debian/Gildra-auction-meta-20261027
SRC=/home/debian/gildra-auction-meta-redesign-20261027/asset-sources
PROOF=/home/debian/gildra-auction-meta-redesign-20261027/proof
```

---

## 1. Материальная панель (9-slice) — `auction` / `panel`

- Где: табличка поиска, табличка результатов, состояния «выберите рынок»/ошибка.
- Холст ≈1024×1280 RGBA → итог 768×~960 WebP, < 100 КБ.
- Native: `$SRC/panels/auction-native.png`
- Input image 1 (палитра и материал): `/home/debian/Gildra-auction-meta-20261027/apps/web/public/assets/wow/loading/tools.webp`
- Input image 2 (только форма/конструкция): `/home/debian/Gildra-auction-meta-20261027/apps/web/public/assets/wow/mythic/hub/controls/panels/kings-rest.webp`

```text
Use case: stylized-concept.
Asset type: one real fantasy game MATERIAL TEXT PANEL raster asset for CSS nine-slice scaling, not a webpage mockup.
Input image 1: a World of Warcraft trader's workshop painting, used ONLY for palette, craftsmanship and material identity. Do not edit or replace it.
Input image 2: an existing finished material panel used ONLY as the filled-panel shape and orthographic construction reference, not its theme.
Primary request: create a new tall physical text panel with its own World of Warcraft Auction House materials, quiet enough to hold long lists of item names and prices.
Composition: portrait canvas approximately 1024x1280, straight-on orthographic front view. Four continuous nearly straight THIN physical edge rails of even thickness, an unbroken bottom rail, restrained softly beveled corners. Fit the entire physical panel inside the canvas with 3% genuinely transparent exterior padding. Edge bands around x3–9% and 91–97%, y3–9% and 91–97%. Sparse simple corner clasps remain fully inside those bands. Central x12–88%/y12–88% is one broad nearly opaque FILLED continuous dark material face.
CRITICAL CENTER: solid physical material, not an empty picture frame. Completely opaque dark calm flat center for bright readable HTML text. No transparent hole, no scenery, no light source, no strong vignette. Very low contrast broad tone variation ONLY.
Style: deliberately hand-painted World of Warcraft game interface art, broad simplified confident brush shapes, clean readable silhouette, smooth stylized bevel planes, soft hand-painted lighting, low to moderate contrast, restrained saturation. Low microdetail. NOT photorealistic, NOT PBR, NOT a 3D render, NOT glossy AI wallpaper.
Avoid: grain, noise, speckles, scratches, tiny cracks, marble veins, dense engraving, repeated runes, arrays of gems, high-frequency texture, sharp white specular highlights, neon glare, collage.
No text, letters, numbers, logos, watermark, symbols pretending to be writing. No checkerboard painted into pixels.
Constraints: genuine transparent alpha ONLY OUTSIDE the physical panel. No large central top or bottom decoration. Four corner details only.
Material/theme: riveted dark gunmetal iron rails with one warm copper-gold coin boss in each corner clasp, small polished emerald-green enamel accents of a goblin trading company, deep bottle-green nearly black ledger face; the busy counting-house of a fantasy auction hall, mercantile and sturdy. No wood, no moss, no mushrooms, no ruby, no velvet, no feathers.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type panel \
  --in $SRC/panels/auction-native.png \
  --out /assets/wow/auction/controls/panels/auction.webp \
  --manifest $REPO/apps/web/public/assets/wow/auction/controls/panels/manifest.json \
  --proof $PROOF
```

---

## 2. Кнопка (9-slice) — `auction` / `button`

- Где: «Найти предмет» в герое, «Показать лоты», «Назад/Далее», «Повторить».
- Холст 3:1 (например 1536×512), силуэт ≈7:1, RGBA → итог 768×~130–145 WebP, < 80 КБ.
- Native: `$SRC/buttons/auction-native.png`
- Input image 1 (палитра): утверждённая панель `$SRC/panels/auction-native.png`
- Input image 2 (только форма): `/home/debian/Gildra-auction-meta-20261027/apps/web/public/assets/wow/mythic/hub/controls/buttons/kings-rest.webp`

```text
Use case: stylized-concept. Asset type: real raster UI button asset for the Gildra World of Warcraft Auction House page.
Input image 1: the approved Auction House material panel, used ONLY for palette and material identity.
Input image 2: an existing finished button, used ONLY as shape and construction reference, not its theme.
Create ONE elegant low horizontal World of Warcraft Auction House button, isolated on a genuinely transparent background.
Style: deliberately hand-painted World of Warcraft game interface art, broad simplified confident brush shapes, clean readable silhouette, smooth stylized bevel planes, soft hand-painted lighting, low to moderate contrast, restrained saturation. Low microdetail. NOT photorealistic, NOT PBR, NOT a 3D render, NOT glossy AI wallpaper.
Avoid: grain, noise, speckles, scratches, tiny cracks, marble veins, dense engraving, repeated runes, arrays of gems, high-frequency texture, sharp white specular highlights, neon glare, collage.
No text, letters, numbers, logos, watermark, symbols pretending to be writing. No checkerboard painted into pixels.
Materials and palette: riveted dark gunmetal iron rails, end caps shaped like stacked copper-gold coins clasped by iron brackets with one small emerald-green enamel accent, deep bottle-green nearly black face; a goblin trading company's counting-house. No wood, no moss, no ruby, no velvet, no feathers.
Composition: very wide, low button with its whole silhouette visible and generous transparent margins, roughly 7:1 painted silhouette, centered on a wide 3:1 canvas. Compact distinct end caps occupy only the outermost 10–12 percent on each side. The central 75 percent must be blank, very dark, nearly opaque and visually quiet to hold readable live HTML text. Its thin straight top and bottom rails must be constant-height uninterrupted lines across the entire middle 75 percent: no central crest, no diamonds, no emblem or rising ornament in the middle, nothing that deforms when stretched by CSS nine-slicing. Rounded or organically chamfered corners. The face is filled opaque dark material; only the exterior is alpha transparent. No text, letters, logo, numbers, watermark, mockup, background scene or multiple buttons.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type button \
  --in $SRC/buttons/auction-native.png \
  --out /assets/wow/auction/controls/buttons/auction.webp \
  --manifest $REPO/apps/web/public/assets/wow/auction/controls/buttons/manifest.json \
  --proof $PROOF
```

---

## 3. Рамка иконки предмета (квадрат с окном) — `auction` / `skill`

- Где: иконка каждого лота (52 px) в списке. Цвет качества предмета остаётся данными (тонкая линия в окне и цвет имени).
- Холст 1024×1024, окно x18–82 % / y18–82 % прозрачное, RGBA → итог 256×256 WebP + `window` в манифесте.
- Native: `$SRC/frames/auction-native.png`
- Input image 1 (палитра): `$SRC/panels/auction-native.png`
- Input image 2 (только форма): `/home/debian/Gildra-auction-meta-20261027/apps/web/public/assets/wow/mythic/pull-art/skills/kings-rest.webp`

```text
Use case: stylized-concept. Production raster UI asset for the Gildra World of Warcraft Auction House listing rows.
Input image 1: the approved Auction House material panel, used ONLY for palette and material identity.
Input image 2: an existing ability icon frame, used ONLY as shape and construction reference, not its theme.
Style: deliberately hand-painted World of Warcraft game interface art, broad simplified confident brush shapes, clean readable silhouette, smooth stylized bevel planes, soft hand-painted lighting, low to moderate contrast, restrained saturation. Low microdetail. NOT photorealistic, NOT PBR, NOT a 3D render, NOT glossy AI wallpaper.
Avoid: grain, noise, speckles, scratches, tiny cracks, marble veins, dense engraving, repeated runes, arrays of gems, high-frequency texture, sharp white specular highlights, neon glare, collage.
No text, letters, numbers, logos, watermark, symbols pretending to be writing. No checkerboard painted into pixels.
Single centered asset, front view, square canvas, actual transparent background, no cast shadow outside the asset.
A square item icon frame with softly rounded corners. ONE empty square window from x=18 to x=82 percent, y=18 to y=82 percent; window is genuinely transparent, no picture inside. Broad continuous painted frame around all four sides, wide transparent margin outside. Theme accents confined to corners and edges so the icon stays unobscured: four small copper-gold coin rivets in the corners and thin emerald-green enamel inlays along the gunmetal iron rails. Theme: World of Warcraft Auction House: riveted dark gunmetal iron, copper-gold coins, emerald enamel of a goblin trading company.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type skill \
  --in $SRC/frames/auction-native.png \
  --out /assets/wow/auction/controls/frames/auction.webp \
  --manifest $REPO/apps/web/public/assets/wow/auction/controls/frames/manifest.json --manifest-group skills \
  --proof $PROOF
```

---

## 4. Сцена героя — `auction` / `scene` (непрозрачная)

- Где: фон героя `/wow/auction` (сейчас временно `loading/tools.webp`).
- Холст ≈2048×1152, без альфы → итог 1672×941 + 768 + мобильный кроп 640×1000.
- Native: `$SRC/scenes/auction-hall-native.png`
- Input image (только стиль живописи): `/home/debian/Gildra-auction-meta-20261027/apps/web/public/assets/wow/mythic/hub/gateway.webp`

```text
Use case: stylized-concept.
Asset type: real production website environmental background, opaque raster artwork, not a webpage mockup.
Primary request: an original grand fantasy auction hall of a goblin trading company: a high iron-and-stone gallery with a big brass auctioneer's balance scale and a tall arched counting window glowing warm gold at the focal point, stacked crates, coin chests and hanging green banners without any letters, lanterns along the upper balconies. Use the supplied Gildra painting ONLY as reference for the hand-painted Warcraft environmental style; this is a new location, not a collage or remake.
Composition/framing: wide landscape approximately 2048x1152, clear focal point at x72%/y38%. Generous quiet negative space across the left 50% and upper center for real HTML title and menu. Focal silhouette readable at thumbnail size. Lower third is quiet floor/shadow/atmosphere for content to overlap. One believable space with atmospheric depth. No people, no creatures.
Style/medium: polished World of Warcraft painterly environment, broad confident brush shapes, low micro-detail.
Lighting/mood: warm lantern gold against cool deep bottle-green shadows, evening trade hall; moderate local contrast, soft natural bloom, deep readable shadows without crushed black.
Constraints: artwork ONLY, no UI, no cards, no borders or ornamental frame, no lettering, no logos, no watermark, no price tags or numbers. No dense runes, repeated patterns, decorative speckling, excessive floating objects, multiple glowing rings, harsh oversaturated colour.
```

```bash
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type scene \
  --in $SRC/scenes/auction-hall-native.png --out /assets/wow/auction/hall.webp --proof $PROOF
# Мобильный кроп: H — высота исходника, w = round(H*0.64), x = фокус_x − w/2 (зажать в [0, ширина − w]).
$NODE $SKILL/scripts/pack-asset.cjs --repo $REPO --type scene-mobile --crop <x>,0,<w>,<H> \
  --in $SRC/scenes/auction-hall-native.png --out /assets/wow/auction/hall-mobile.webp
```

---

## После генерации (делает Claude-сессия редизайна)

- `auctionKit.ts`: переключить с `kings-rest` на манифесты `/assets/wow/auction/controls/*`, акцент `#d0995a`.
- `AuctionBackdrop.tsx`: `<picture>` с `hall-mobile.webp` / `hall-768.webp` / `hall.webp`.
- `SOURCE.md` в `public/assets/wow/auction/` по `assets.md` §8; proof и контакт-лист рядом с соседями (`asset-kits-dungeons.jpg`).
