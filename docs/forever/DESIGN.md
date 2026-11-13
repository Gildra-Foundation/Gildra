# Forever — договор о дизайне раздела (2026-11-13)

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
- **Не трогать** файлы `shared/**`, `ForeverFrame.tsx`, `foreverKit.ts`: нужна другая деталь или свойство — заявка сессии «Основа».

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

Страница одной сущности может отдать свою картину: `<ForeverFrame lang={lang} art="/assets/…webp" artPosition="70% 40%">`.
Замок хаба на других страницах не ставить. Новую сцену в реестр добавляет «Основа».

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
- Без `search` (один-два списка выбора) поля и кнопка встают в один ряд.
- `ForeverLevel` — цифры, по умолчанию 1–60 (`min`, `max` меняются: умение 1–300).
- Фильтр без формы (список фильтрует клиентский компонент): `<ForeverFilters lang={lang} live search={…} onReset={…}>`,
  полям передаются `value` и `onChange`; кнопки нет.
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
| `ForeverArtGrid` + `ForeverArtCard` | карточка с артом (подземелье, рейд, раздел): картина, имя, строка, факт в углу | `<ForeverArtCard href={url} art={scene} title={name} note={location} badge="17–20" accent={accent} />` |
| `ForeverRows` + `ForeverRow` | карточка-строка со значком: инструмент, раздел, профессия | `<ForeverRow href={url} sign={<Glyph />} title={t.calc} note={t.calcNote} />`, значок игры — `icon={url}` |
| `ForeverCrests` + `ForeverCrest` | ростер классов в цветах игры | `<ForeverCrest href={url} icon={classIcon(c.icon)!} label={c.name[lang]} color={classColors[c.slug]} />` |
| `ForeverFeature` | большой вход: картина + заголовок + фраза + быстрые ссылки | `<ForeverFeature href={url} art={scene} title={t.title} text={t.text} links={[{ href, label }]} />` |
| `ForeverStack` | шаг между блоками секции (`gap="wide"` — крупнее) | `<ForeverStack>…</ForeverStack>` |
| `foreverPanelStyles` | `.title`, `.text` на панели, `.link` — тихая текстовая ссылка | `<a className={foreverPanelStyles.link} href={url}>{t.showAll}</a>` |

- `ForeverArtGrid`: `min` — ширина самой узкой карточки, `fit` — короткий ряд тянется на всю ширину, `strip` — на телефоне
  лента с прокруткой (иначе две колонки). `ForeverArtCard`: `ratio="3 / 4"` — высокая «дверь», `accent` — цвет верхней
  кромки (цвет данных или токен).
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
  стрелка тянется в сторону перехода. Своим ссылкам и карточкам давать отклик тем же приёмом
  (`transition` на токенах `--atlas-duration-*`, внутри `@media (hover: hover) and (pointer: fine)`).
- Каскад: `ForeverArtGrid`, `ForeverRows`, `ForeverCrests` появляются по одному. Своей сетке достаточно атрибута
  `data-forever-cascade=""` на контейнере — дети поднимутся каскадом (первый экран — CSS с первой отрисовки, ниже —
  при прокрутке, `shared/ForeverMotion.tsx`).
- Выключение обязательно для любого своего движения: `@media (prefers-reduced-motion: reduce)` и
  `:global(html[data-motion="reduced"])` («Меньше движения»). Бесконечных фоновых анимаций нет.

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
| `AtlasEmpty` + ссылка сброса | `ForeverEmpty` |

## 10. Проверка страницы

`npx tsc --noEmit -p apps/web`, eslint своих файлов, `npm run atlas:check`, `npm run test:atlas`, тесты своей области,
`~/.claude/skills/gildra-clean-ui/scripts/clean-ui-audit.cjs` по своим адресам (EN и RU), снимки 1440 и 390 до и после
рядом с образцом Midnight; ноль ошибок консоли, горизонтальной прокрутки и битых картинок.
