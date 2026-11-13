# Forever — договор о дизайне раздела (2026-11-13, после завершающего прохода)

Раздел `/wow/forever/**` собирается из одних и тех же деталей, чтобы страница Forever стояла рядом со страницей
Midnight как сделанная той же рукой. Детали лежат в `apps/web/components/wow/forever/shared/`. Посмотреть их живьём:
`/dev/forever` на dev-сервере (галерея, в проде 404). Образец страницы — хаб `components/wow/forever/ForeverHome.tsx`.

Общие правила сайта остаются в силе: `docs/design/reference/README.md` (эталон), `docs/brand/BRANDKIT.md`,
`.claude/skills/gildra-clean-ui/SKILL.md`. Этот документ — только то, что у Forever общее.

## 1. Главное

- **Один материал.** Поверхность блока — только `ForeverPanel` (табличка кита `FOREVER_KIT`). Киты `library`,
  `talents`, `tier-lists` и `MaterialPlaque kit="…"` напрямую в разделе больше не используются. Панель в панель не
  вкладывается: внутри панели — строки (`ForeverList`), поля, чипы.
- **Вне панели — стекло:** карточки с артом, строки-ссылки, гербы. Свой цвет панели или карточки не придумывать.
- **Одна шапка, одни крошки:** `ForeverHero`. Крошки всегда `Forever › раздел › страница`, последняя — открытая страница.
- **Одни поля:** `ForeverFilters` + `ForeverSearch` / `ForeverSelect` / `ForeverLevel`. Голых `AtlasInput` и своих сеток
  фильтров на страницах нет.
- **Импорт.** Серверный компонент: `import { … } from "@/components/wow/forever/shared"`. Клиентский (`"use client"`):
  из файла детали — `…/shared/ForeverFilters`, `…/shared/ForeverTabs`, `…/shared/ForeverCards`, `…/shared/ForeverPanel`,
  `…/shared/ForeverStates` (через индекс в бандл попадёт всё остальное).
- **Свой CSS страницы** — только раскладка, на токенах `--atlas-*` (`npm run atlas:check`). Цвет текста на панели:
  `--material-light` (свет кита), линии — `--material-line`.
- **Общие детали меняются для всех страниц сразу.** Правка `shared/**`, `ForeverFrame.tsx`, `foreverKit.ts` — это
  production-сборка, `npm run design:lock`, тесты `tests/forever-classes` и `tests/forever-talents` и снимки всех
  шаблонов раздела (§10). Свойство, нужное одной странице, сначала искать среди существующих (ниже).
- **Пути ассетов раздела** — только в `lib/games/wow/assets.ts`: `FOREVER_UI_TEXTURES` (значки глав хаба, значки типов
  библиотеки), `foreverTreeArt(класс, ветка)` (картины веток талантов — один набор `public/assets/wow/ui/forever/trees/`
  для страниц классов и калькулятора). Картины подземелий и рейдов — `instanceArt(slug)` (`instances/manifest.json`).

## 2. Каркас страницы

```tsx
import Image from "next/image";
import { AtlasSection } from "@/components/atlas";
import { MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { ForeverFrame } from "@/components/wow/forever/ForeverFrame";
import { FOREVER_KIT, ForeverHero, ForeverPanel, ForeverStack } from "@/components/wow/forever/shared";

<ForeverFrame lang={lang} page="classes">            {/* сцена страницы — по page, см. §3 */}
  <ForeverHero lang={lang}
    trail={[{ label: t.classes, href: p(lang, "/wow/forever/classes") }, { label: c.name[lang] }]}
    eyebrow={roles}                                  {/* настоящий контекст: роль, уровень, зона. Не «World of Warcraft» */}
    crest={<Image src={classIcon(c.icon)!} alt="" width={64} height={64} />}   {/* значок сущности, не декор */}
    title={c.name[lang]} lede={c.description[lang]}  {/* лид — одна-две строки */}
    stats={[{ value: 3, label: t.trees }]}           {/* только цифры, которые игрок сравнивает; иначе не передавать */}
    actions={<MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={calc}>{t.calculator}</MaterialLinkButton>} />
  <AtlasSection id="talents" title={t.talents}>      {/* ≤ 5 секций; заголовок не повторяет H1 */}
    <ForeverStack>…блоки секции…</ForeverStack>      {/* шаг между блоками секции */}
  </AtlasSection>
</ForeverFrame>
```

- `ForeverHero`: `trail` — крошки после «Forever» (хаб не передаёт). `actions` — не больше двух нарисованных кнопок
  (`MaterialLinkButton kit={FOREVER_KIT} fit="stack"`). `aside` заменяет счётчики своей панелью. `placeholder` — для загрузки.
- Появление шапки и подъём секций при прокрутке уже есть (`AtlasArrival`). `ForeverFrame` добавляет каскад сеток (§7).

## 3. Сцены

`<ForeverFrame page="…">` ставит свою сцену за шапкой (`shared/foreverScenes.ts` → `lib/atlas/scenes.ts`):

| `page` | Сцена | Где |
| --- | --- | --- |
| `hub` (по умолчанию) | старая дорога к замку | `/wow/forever` |
| `dungeons` | каменный зал со ступенями | список и страницы подземелий |
| `raids` | военный совет у запечатанных врат | рейды |
| `classes`, `changes` | зал тренировок | классы, изменения классов |
| `talents` | зал с книгой талантов | калькулятор |
| `tierLists` | штабная карта | тир-листы |
| `library` | старый архив | библиотека и записи |
| `professions` | мастерская с горном | профессии |

Сцены раздела стоят в обычной тени сайта (как у Midnight), без `shade: "deep"`: картина за шапкой видна.
Страница одной сущности может отдать свою картину: `<ForeverFrame lang={lang} art="/assets/…webp" artPosition="70% 40%">`;
картина игры ярче сцен сайта, поэтому её тень по умолчанию `artShade="deep"` (тёмной картине — `artShade="default"`).
Замок хаба на других страницах не ставить. Новая сцена — запись в `lib/atlas/scenes.ts` и `shared/foreverScenes.ts`.

## 4. Поля и фильтры

Фильтры стоят на `ForeverPanel`, первым блоком над списком. Состояние — в адресе (GET-форма работает без JavaScript).

```tsx
import { ForeverFilters, ForeverSearch, ForeverSelect, ForeverLevel, ForeverPager, ForeverEmpty, ForeverPanel } from "@/components/wow/forever/shared";

<ForeverPanel>
  <ForeverFilters lang={lang} action={base} hidden={{ type: result.type }}
    reset={hasFilters ? `${base}?type=${result.type}` : undefined}       {/* «Сбросить» виден только при фильтрах */}
    search={<ForeverSearch name="q" label={t.search} placeholder={t.searchHint} defaultValue={query.q} />}>
    <ForeverSelect name="quality" label={t.quality} defaultValue={query.quality ?? ""}
      options={[{ value: "", label: t.all }, ...t.qualities.map((label, value) => ({ value, label }))]} />
    <ForeverLevel name="minLevel" label={t.min} defaultValue={query.minLevel} />
    <ForeverLevel name="maxLevel" label={t.max} defaultValue={query.maxLevel} />
  </ForeverFilters>
  {records.length ? <ForeverList>…</ForeverList> : <ForeverEmpty lang={lang} reset={base} />}
  <ForeverPager lang={lang} label={t.title} page={page} pages={pages}
    prev={page > 1 ? url(page - 1) : undefined} next={page < pages ? url(page + 1) : undefined} />
</ForeverPanel>
```

- `ForeverSearch` — подпись, значок лупы и подсказка, что вводить («Меч, зелье, руда…»). Подсказка обязательна и
  называет примеры, а не «Введите запрос». Кнопка действия встаёт справа от поиска сама; её подпись — `submit`
  (по умолчанию «Поиск», без поиска — «Применить»).
- **Один ряд — `inline`.** До трёх коротких полей встают в ряд с поиском: `<ForeverFilters inline …>` (поиск, поля,
  кнопка; на узкой панели поля уходят под поиск сами). Четыре поля и больше — без `inline`: поиск с кнопкой, поля рядом ниже.
- Без `search` (один-два списка выбора) поля и кнопка встают в один ряд.
- Поле держит ширину своего содержимого: список выбора 220 px (в ряду с поиском 180), уровень 128. Списку коротких
  значений (уровень, счёт) ширину задаёт `width`: `<ForeverSelect width={112} …>`. Свою сетку полей странице писать не нужно.
- `ForeverLevel` — цифры, по умолчанию 1–60 (`min`, `max` меняются: умение 1–300).
- Фильтр без формы (список фильтрует клиентский компонент): `<ForeverFilters lang={lang} live search={…} onReset={…}>`,
  полям передаются `value` и `onChange`; кнопки нет. Без поиска это не поиск, а группа настроек:
  `<ForeverFilters live label={t.level}>` (роль `group` с именем).
- Телефон: порядок сверху вниз — поиск, поля, кнопка во всю панель. Поля по два в ряд; список с длинным вариантом
  (длиннее 14 знаков) занимает ряд целиком, выбранное значение не обрезается.
- То, что стоит на панели сразу после фильтров (список, пустое состояние), отступает само: свой отступ не писать.
- Флажок — `AtlasCheckbox` внутри `ForeverFilters` (детей может быть сколько угодно).
- **Вкладки-ссылки** (типы записей, режимы) — над панелью:
  `<ForeverTabs label={t.type} tabs={types.map(type => ({ href, label, current: type === open }))} />`.
- **Чипы** (быстрый выбор: класс, роль, категория) — `ForeverChips`: `{ href, label, icon?, active }` на серверной
  странице, `{ onClick, label, active }` в клиентской. До трёх вариантов можно `AtlasSegmented`.
- **Листание** — только `ForeverPager` (нарисованные «Назад» / «Дальше», страница между ними). Свои кнопки листания убрать.

## 5. Панель, карточки, строки

```tsx
import { ForeverPanel, ForeverIcon, ForeverList, ForeverListRow, ForeverArtGrid, ForeverArtCard, ForeverRows, ForeverRow,
  ForeverCrests, ForeverCrest, ForeverFeature, foreverPanelStyles } from "@/components/wow/forever/shared";
```

| Деталь | Для чего | Пример |
| --- | --- | --- |
| `ForeverPanel` | поверхность блока; `title` — заголовок на табличке (`headingLevel` 2/3), `as="article"` | `<ForeverPanel title={t.amulet}><p className={foreverPanelStyles.text}>…</p></ForeverPanel>` |
| `ForeverIcon` | значок игры в рамке кита | `<ForeverIcon src={icon} size={52} />` |
| `ForeverList` + `ForeverListRow` | строка таблицы внутри панели: значок, имя, тихая строка, значения справа | `<ForeverListRow href={url} icon={<ForeverIcon src={i} size={44} />} title={name} note={zone} values={<span>{level}</span>} />` |
| `ForeverArtGrid` + `ForeverArtCard` | карточка с артом (подземелье, рейд, раздел, ветка талантов): картина, имя, строка, факт в углу, значок игры перед именем | `<ForeverArtCard href={url} art={scene} artPosition="82% 50%" icon={treeIcon} title={name} note={location} badge="17–20" accent={accent} />` |
| `ForeverRows` + `ForeverRow` | карточка-строка со значком: инструмент, раздел, профессия | `<ForeverRow href={url} sign={<Glyph />} title={t.calc} note={t.calcNote} />`, значок игры — `icon={url}` |
| `ForeverCrests` + `ForeverCrest` | ростер классов в цветах игры; `current` — открытая страница | `<ForeverCrest href={url} icon={classIcon(c.icon)!} label={c.name[lang]} color={classColors[c.slug]} current={c.slug === open} />` |
| `ForeverFeature` | большой вход: картина + заголовок + фраза + быстрые ссылки-чипы (`links`) или строки со значками (`entries`) | `<ForeverFeature href={url} art={scene} title={t.title} text={t.text} entries={[{ href, label, icon }]} />` |
| `ForeverStack` | шаг между блоками секции (`gap="wide"` — крупнее) | `<ForeverStack>…</ForeverStack>` |
| `foreverPanelStyles` | `.title`, `.text` на панели, `.link` — тихая текстовая ссылка | `<a className={foreverPanelStyles.link} href={url}>{t.showAll}</a>` |

- `ForeverArtGrid`: `min` — ширина самой узкой карточки, `fit` — короткий ряд тянется на всю ширину, `strip` — на телефоне
  лента с прокруткой (иначе две колонки). `ForeverArtCard`: `ratio="3 / 4"` — высокая «дверь», `accent` — цвет верхней
  кромки (цвет данных или токен), `artPosition` — что карточка оставляет от картины, когда режет её (дверь 3/4 видит
  37 % ширины картины 2:1: положение дверей хаба — `instanceDoorPosition()` в `instanceArt.ts`), `icon` — значок игры
  перед именем (картина — единственное, что растягивается на карточку; свои `<img>` в заголовке больше не ломаются).
- `ForeverListRow`: приглушённой и мелкой становится только строка `note`; `span` внутри заголовка остаётся заголовком.
- Чипы или гербы для выбора класса: чипы (`ForeverChips`), когда выбор стоит над инструментом и должен занимать одну
  строку (калькулятор, изменения классов); гербы (`ForeverCrests` с `current`) — как самостоятельный блок страницы.
- `ForeverRows`: `columns` 2–4; на телефоне всегда две колонки. `aside` у строки — цифра справа вместо стрелки.
- Карточки одного списка заполнены одинаково: если у одной есть строка под именем или факт в углу — они есть у всех.
- Запись библиотеки по-прежнему рисует `LibraryRecordCard`; рамку значка ей даёт `foreverIconFrame(54)`.
- Арт: сначала архив текстур игры (`/home/debian/wow-assets/README.md`), потом существующие сцены сайта; файлы —
  в `public/assets/wow/ui/forever/<часть>/` с `SOURCE.md`. Картины без подписи: `alt=""`.

## 6. Состояния

| Состояние | Деталь | Где |
| --- | --- | --- |
| Загрузка маршрута | `ForeverLoading` (`shared/ForeverLoading`) | `loading.tsx`: `<ForeverLoading lang="en" page="library" title={t.title} variant="cards" count={12} />` |
| Ошибка маршрута | `ForeverError` (`shared/ForeverError`, клиентская) | `error.tsx`: `<ForeverError lang="en" page="library" title={t.title} reset={reset} />` |
| Ничего не найдено | `ForeverEmpty` | внутри панели списка: `<ForeverEmpty lang={lang} reset={base} />` |
| Загрузка части списка | `ForeverSkeleton` | внутри панели: `<ForeverSkeleton lang={lang} variant="rows" count={6} />` |

Тексты состояний общие (`shared/sharedCopy.ts`); своя фраза — `children`, одна, про то, что делать игроку. Свои
`*Error.tsx` / `*States.tsx` разделов заменить этими деталями.

## 7. Движение

- Отклик на наведение у всех деталей встроен: карточка поднимается и ловит блик, строка поднимается, значок растёт,
  стрелка тянется в сторону перехода. Своим ссылкам и карточкам давать отклик тем же приёмом: цвет, кромка и тень —
  в `@media (hover: hover) and (pointer: fine)`; всё, что двигается (`translate`, `scale`, `transform`), — только в
  `@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`.
- Каскад: `ForeverArtGrid`, `ForeverRows`, `ForeverCrests` появляются по одному. Своей сетке достаточно атрибута
  `data-forever-cascade=""` на контейнере: первый экран — CSS с первой отрисовки; ниже каждый ребёнок поднимается,
  когда до него дошла прокрутка, поэтому длинная сетка каскадирует ряд за рядом (`shared/ForeverMotion.tsx`). Своего
  наблюдателя странице писать не нужно. Каскад первого экрана играет один раз: то, что фильтр вставил позже, стоит сразу.
- Выключение обязательно для любого своего движения: системное «уменьшить движение» (условие `no-preference` выше) и
  «Меньше движения» сайта — `:global(html[data-motion="reduced"])`. Отменяя движение, `translate` и `scale` писать как
  `translate: var(--atlas-still, none) !important` (сборщик складывает `transform/translate/scale: none` одного правила
  в один `transform`). Бесконечных фоновых анимаций нет.

## 8. Чего не делать

- Не ставить `MaterialPlaque` с другим китом, `AtlasPanel`, свои рамки и фоны блоков.
- Не вкладывать панель в панель и не класть нарисованную кнопку в каждую карточку: карточка — сама ссылка.
- Не писать служебный текст: откуда данные, даты обновления, «Sources», счётчики ради счётчиков, ID, пояснения к полям.
- Не оставлять осиротевшие ссылки под шапкой («Bosses», «Role», «▸ Sources»): это вкладки (`ForeverTabs`), чипы
  (`ForeverChips`) или действие шапки.
- Не менять тексты гайдов, данные, адреса страниц. После правок `app/(site)` — `npm run routes:mirror`.
- Телефон 390 px: без горизонтальной прокрутки страницы, без разорванных и обрезанных слов.

## 9. Что на что заменить (для сессий по страницам)

| Сейчас | Стало |
| --- | --- |
| `<ForeverFrame lang scene="…">` | `<ForeverFrame lang page="…">` |
| `AtlasHero` + `breadcrumbs={[{ label: "Forever", … }]}` | `ForeverHero` + `trail` |
| `MaterialPlaque kit={FOREVER_KIT \| "library" \| "talents" \| "tier-lists"}` | `ForeverPanel` |
| `<form className={styles.filters}>` + `AtlasField` / `AtlasInput` / `AtlasSelect` + `MaterialButton` | `ForeverFilters` + `ForeverSearch` / `ForeverSelect` / `ForeverLevel` |
| `nav.types`, `nav.modes` (ссылки с подчёркиванием) | `ForeverTabs` |
| `LibraryPagination`, `nav.pageNav` с `MaterialLinkButton` | `ForeverPager` |
| `materialIconFrameStyle(FOREVER_KIT, n)` + `<Image>` | `ForeverIcon` (или `foreverIconFrame(n)`) |
| текстовые ссылки на классы, плашки специализаций | `ForeverCrests`, `ForeverRows`, `ForeverChips` |
| `ClassesError`, `GuidesError`, `ForeverTalentError`, голый `AtlasSkeleton` в `loading.tsx` | `ForeverError`, `ForeverLoading` |
| свой `IntersectionObserver` для каскада сетки (`InstanceMotion`) | `data-forever-cascade=""` на сетке |
| `<img>`/фон-`span` значка в заголовке `ForeverArtCard` | `icon={url}` |
| своя сетка полей поверх `ForeverFilters` | `inline`, `width` у `ForeverSelect` |
| `AtlasEmpty` + ссылка сброса | `ForeverEmpty` |

## 10. Проверка страницы

`npx tsc --noEmit -p apps/web`, eslint своих файлов, `npm run atlas:check`, `npm run test:atlas`, тесты своей области,
`~/.claude/skills/gildra-clean-ui/scripts/clean-ui-audit.cjs` по своим адресам (EN и RU), снимки 1440 и 390 до и после
рядом с образцом Midnight; ноль ошибок консоли, горизонтальной прокрутки и битых картинок.

После правки общих деталей — весь раздел: production-сборка, `npm run design:lock -- --base <адрес сборки>`,
`tests/forever-classes/browser.mjs`, `tests/forever-talents/browser.mjs`, снимки всех шаблонов (список адресов и
инструменты съёмки — `/home/debian/gildra-forever-design-20261113/finish/tools/`: `pages.cjs`, `shoot.cjs`, `sheets.sh`,
`motion.cjs`), четыре темы сайта и forced colors, три режима движения.
