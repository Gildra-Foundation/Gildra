# Журнал релизов gildra.net

Один журнал для всех сессий, которые выкатывают сайт (roadmap, пункт 98). Каждая
выкатка — строка ниже, **до** сообщения соседней сессии о том, что сайт свободен.

Как выкатывали до `deploy-web-host.sh` (ниже): образ собирается на хосте из чистого `git worktree` на
коммите релизной ветки `release/atlas-theme-20261011`, ставится на staging
(`sudo sh infra/deploy/deploy-web-staging.sh <образ>`, http://127.0.0.1:3200),
проходит `npm run qa:release -- --candidate http://127.0.0.1:3200`, и тот же образ
выкатывается `deploy-web-host.sh <образ> <метка>` (веб) или аналогом для API; оба берут
`/run/lock/gildra-deploy.lock` и переписывают в `/opt/gildra/current-release.env`
только свои ключи (`WEB_*` / `API_*`). Прежний манифест остаётся в
`/opt/gildra/<метка>-previous.env` — это и есть откат. После выкатки `master`
на GitHub получает коммит `[skip ci]` с тем же деревом.

## Веб одной командой (`infra/deploy/deploy-web-host.sh`)

Из checkout на хосте, на закоммиченном релизном коммите:

```bash
sudo infra/deploy/deploy-web-host.sh <метка> [--ref <коммит>] [--staging] [--expect /ru:<текст>] [--prune]
```

Скрипт собирает образ `gildra-web:<метка>-<sha12>` из дерева коммита (не из
рабочей копии), берёт `/run/lock/gildra-deploy.lock` уже после сборки, проверяет,
что текущий релиз здоров и проходит smoke, ставит тег
`gildra-web:rollback-before-<метка>` на прежний образ, сохраняет
`/opt/gildra/<метка>-previous.env`, переключает `web`, перезагружает nginx,
прогоняет 25 маршрутов параллельно и пишет в манифест только `WEB_*`. Любая
ошибка после переключения — автоматический откат образа и манифеста. В конце
печатает время каждого шага. `--staging` сначала ставит образ на staging
(`deploy-web-staging.sh`), `--image <образ>` выкатывает уже собранный образ,
`--prune` после успешной выкатки оставляет 5 последних релизов, 3 последних
тега rollback/backup и образы, занятые контейнерами, и чистит кэш сборки старше
7 дней (сверх 30 ГБ); `--prune-dry-run` только показывает, что удалит. При
свободном месте меньше 20 ГБ скрипт останавливается до сборки. Тест контракта:
`bash infra/deploy/test-deploy-web-host.sh`.

Почему быстро (замер 2026-10-22 на этом хосте при load 25–30, правка одного
файла): сборка и выкатка 143 с против ≈690 с у прежнего процесса (сборка 658 с +
ручная выкатка). Кэши BuildKit (`npm`, `.next/cache` с кэшем Turbopack и
OG-карточками, `tsbuildinfo`) живут между сборками; typecheck идёт отдельной
стадией параллельно с `next build`; 322 OG-карточки (≈80 % CPU сборки) берутся
из кэша, если их входы не менялись (`lib/og/atlasOg.tsx`); слой `public/`
общий для всех релизов, так что новый образ добавляет на диск ≈220 МБ, а не
≈1.2 ГБ. Холодная сборка (пустые кэши) по-прежнему ≈9–11 минут.

## Проверки и журнал

Перед выкаткой: `npm run typecheck`, `npm run lint`, `npm run test:atlas`,
`npm run routes:check`, `npm run atlas:check`, сборка, `npm run visual:diff`,
`npm run qa:a11y`, `npm run qa:motion`, проверка 0 px главной и книги, тест
перехода. После: `SMOKE_URL=https://gildra.net npm run smoke:routes`.

| Время (UTC) | Метка | Образ | Коммит | Что вошло | Кто | Откат на |
|---|---|---|---|---|---|---|
| 2026-10-11 13:09 | atlas-theme-20261011 | `gildra-web:atlas-theme-20261011-20aacae3` | 20aacae | тема атласа на внутренних страницах | атлас | `cold-motion-20261010-e61f56c3` |
| 2026-10-11 14:59 | atlas-declutter-20261011 | `gildra-web:atlas-declutter-20261011-debf5e2a` | debf5e2 | разгрузка страниц, общая CMS, статьи | атлас + CMS | `atlas-theme-20261011-20aacae3` |
| 2026-10-12 08:31 | cms-tools-20261012 | `gildra-web:cms-tools-20261012-86a0982` | 86a0982 | инструменты редактора CMS | CMS | `atlas-declutter-20261011-debf5e2a` |
| 2026-10-12 13:50 | atlas-art-20261012 | `gildra-web:atlas-art-20261012-c816806f` | c816806 | арт страниц, тихий переход | атлас | `cms-tools-20261012-86a0982` |
| 2026-10-12 15:22 | atlas-alive-20261012 | `gildra-web:atlas-alive-20261012-fa73f012` | fa73f01 | живая атмосфера, каталог классов | атлас | `atlas-art-20261012-c816806f` |
| 2026-10-12 16:19 | quick-fixes-20261012 | `gildra-web:quick-fixes-20261012-896d8573` | 896d857 | LCP, CLS, 404, заголовки безопасности | анализ фронтенда | `atlas-alive-20261012-fa73f012` |
| 2026-10-12 16:30 | atlas-scenes-20261012 | `gildra-web:atlas-scenes-20261012-e761d383` | e761d38 | сцены разделов, юридический блок | атлас | `quick-fixes-20261012-896d8573` |
| 2026-10-12 16:33 | quick-fixes-20261012b | `gildra-web:quick-fixes-20261012b-cdf79b97` | cdf79b9 | быстрые правки поверх сцен | анализ фронтенда | `atlas-scenes-20261012-e761d383` |
| 2026-10-12 17:02 | atlas-flow-20261012 | `gildra-web:atlas-flow-20261012-d7f241dc` | d7f241d | View Transitions, хабы по центру, путь рейда | атлас | `quick-fixes-20261012b-cdf79b97` |
| 2026-10-12 22:06 | atlas-cards-20261012 | `gildra-web:atlas-cards-20261012-a4b89a32` | a4b89a3 | превью ссылок, свет факела, глаз Бездны | атлас | `atlas-flow-20261012-d7f241dc` |
| 2026-10-12 23:13 | atlas-wave1-20261012 | `gildra-web:atlas-wave1-20261012-d82f78de` | d82f78d | волна 1: набор, поиск ⌘K, ESLint, Tailwind по маршрутам | атлас | `atlas-cards-20261012-a4b89a32` |
| 2026-10-12 23:22 | atlas-wave1b-20261012 | `gildra-web:atlas-wave1b-20261012-531062ad` | 531062a | указатель поиска под `/api/platform/` | атлас | `atlas-wave1-20261012-d82f78de` |
| 2026-10-13 00:24 | ops-api-20261012 | `gildra-api:ops-20261012-cd4be8c5` | cd4be8c | API: каталог, иконки 307, быстрый поиск | анализ фронтенда | GHCR-дайджест `93df55dc` |
| 2026-10-13 00:30 | atlas-wave2-20261013 | `gildra-web:atlas-wave2-20261013-18b6171d` | 18b6171 | волна 2: токены, сцены, «Поделиться», честные 404 | атлас | `atlas-wave1b-20261012-531062ad` |
| 2026-10-13 01:30 | atlas-wave3a-20261013 | `gildra-web:atlas-wave3a-20261013-ed3ed9b3` | ed3ed9b | волна 3a: доступность, GlitchTip, смоук, проверка окружения | атлас + анализ фронтенда | `atlas-wave2-20261013-18b6171d` |
| 2026-10-13 02:20 | atlas-wave3b-20261013 | `gildra-web:atlas-wave3b-20261013-990abfe4` | 990abfe | волна 3b: перетекание арта, направленные переходы, искры, каскад; DSN GlitchTip; образ 0.78 → 0.45 ГБ | атлас + анализ фронтенда | `atlas-wave3a-20261013-ed3ed9b3` |
| 2026-10-13 03:05 | atlas-wave4a-20261013 | `gildra-web:atlas-wave4a-20261013-5f885550` | 5f88555 | волна 4a: реестр маршрутов, флаги, бюджеты, Lighthouse CI, Web Vitals, заглушки, «Что нового»; облегчённый клиент ошибок (JS страницы 1154 → 653 КБ) | атлас + анализ фронтенда | `atlas-wave3b-20261013-990abfe4` |
| 2026-10-13 03:55 | atlas-wave4b-20261013 | `gildra-web:atlas-wave4b-20261013-27682778` | 2768277 | волна 4b: «Сейчас в игре», живой свет на сценах, таймеры ключей, листание, таймлайн версий, флаг staging; впервые через staging | атлас | `atlas-wave4a-20261013-5f885550` |
| 2026-10-13 04:32 | atlas-wave5-20261013 | `gildra-web:atlas-wave5-20261013-5967c428` | 5967c42 | волна 5: npm workspaces — данные игры в `@gildra/game-data`, кит в `@gildra/atlas-ui`, контракты блоков (JSON Schema); через staging | атлас | `atlas-wave4b-20261013-27682778` |
| 2026-10-13 05:08 | atlas-wave6-20261013 | `gildra-web:atlas-wave6-20261013-a9e638b5` | a9e638b | волна 6: две корневые раскладки — сервер отдаёт `<html lang="ru">` для /ru, общий 404 `global-not-found`; через staging | атлас | `atlas-wave5-20261013-5967c428` |
| 2026-10-13 05:52 | atlas-wave7-20261013 | `gildra-web:atlas-wave7-20261013-afbe3284` | afbe328 | волна 7: `/ru`-зеркала генерируются из английских страниц, метаданные разделов из реестра; строки интерфейса в `*Copy.ts` + правило ESLint; через staging | атлас | `atlas-wave6-20261013-a9e638b5` |
| 2026-10-13 06:27 | atlas-wave8-20261013 | `gildra-web:atlas-wave8-20261013-83ce9ce5` | 83ce9ce | волна 8: монорепозиторий — сайт в `apps/web`, корень = npm workspaces; раскладка образа `/app` прежняя; через staging | атлас | `atlas-wave7-20261013-afbe3284` |
| 2026-10-13 16:12 | atlas-wave9-20261013 | `gildra-web:atlas-wave9-20261013-0600d3c9` | 0600d3c | волна 9: полировка — единый разделитель заголовков «— Gildra», названия наборов и записей библиотеки в заголовках, заголовки сезона M+ и Prey (RU), даты в формате кита; через staging | атлас | `atlas-wave8-20261013-83ce9ce5` |
| 2026-10-13 18:26 | book-nav-20261013 | `gildra-web:book-nav-20261013-6de662c6` | 6de662c | книга оглавления раскрывается из кнопки и возвращается в неё; единая серебристая обложка на кнопке, главной и в анимации; private staging 3201, qa:release и публичные RU/EN desktop/mobile проверки прошли | навигация книги | `atlas-wave9-20261013-0600d3c9` |
| 2026-10-13 19:52 | atlas-wave10b-20261013 | `gildra-web:atlas-wave10b-20261013-20515aa0` | 20515aa | волна 10: производительность — без корневого loading.tsx (React больше не раскрывает панель через View Transition на первой загрузке; телефон 4× CPU: медианный LCP 1548 → 660 мс), световые слои карточек только для мыши, счётчик после перехода; поверх релиза книги владельца (6de662c); через staging | атлас | `book-nav-20261013-6de662c6` |
| 2026-10-13 20:01 | seo-articles-20261013 | `gildra-web:seo-articles-20261013-6df729d6` | 6df729d | статьи: колонка чтения, оформленные блоки редактора, теги и «Другие статьи», JSON-LD Article/BreadcrumbList, OG-карточки; пустой список — noindex и ссылки на рейды и Mythic+. SEO: og:title/url/locale на страницах, без утечки корневого hreflang, JSON-LD WebSite на главной, noindex `/search` и `/wow/rotation/*`, `/lairs` → 308; nginx: www → 301 на apex (применено на месте, `nginx -t`); через staging | ops | `atlas-wave10b-20261013-20515aa0` |
| 2026-10-13 20:22 | seo-db-20261013 | `gildra-web:seo-db-20261013-7dd6921c` | 7dd6921 | SEO: записи базы — 404 для неизвестных и неверных id вместо 500/200, неверный slug → 308 на свой, hreflang на канонический адрес другого языка, описания для коротких текстов; `/talents/<неизвестный>` → 404 (proxy), hreflang у калькуляторов талантов; через staging | ops | `seo-articles-20261013-6df729d6` |
| 2026-10-13 20:34 | cms-ux-20261013 | `gildra-cms:cms-ux-20261013` + `gildra-cms-jobs:cms-ux-20261013` | e06b26f | CMS (cms.gildra.net, только `cms` и `cms-jobs`, ключи `CMS_*`): языковая панель RU/EN в редакторе статей и страниц (переключение без перезагрузки, «заполнить из другой версии», панель сверки), палитра Ctrl+K (cmdk), меню без перезагрузок и закреплено на ноутбуках, колонки «Языки» и «Сайт», превью медиа через оптимизатор; без миграций; 121 тест CMS, локальная копия базы | админка | `cms-tools-20261011` (`/opt/gildra/cms-ux-20261013-previous.env`) |
| 2026-10-13 20:52 | atlas-wave11-20261013 | `gildra-web:atlas-wave11-20261013-c2de8075` | c2de807 | волна 11: шейдер «Глаза Бездны» останавливает цикл, когда глаз не виден, и не пишет атрибут в каждом кадре (десктоп, the-voidspire: главный поток в покое 2,96 → 2,28 с за 8 с); поверх seo-db; через staging | атлас | `seo-db-20261013-7dd6921c` |
| 2026-10-13 21:12 | img-fix-20261013 | `gildra-web:img-fix-20261013-c0bd008e` | c0bd008 | картинки: оборванный клиентом первый запрос `/_next/image` больше не подвешивает ключ кэша оптимизатора навсегда (504 через 60 с на карте логова Luashal, артах nalorakk и altar) — `scripts/patch-next.mjs` отвязывает внутренний ответ от сокета клиента; повтор на холодном кэше 7/28 → 0/56; вместе с 7bb1904 (VoidEye: таймер вместо каждого кадра, гейт волны 12 атласа); через staging | ops | `atlas-wave11-20261013-c2de8075` |
| 2026-10-13 21:58 | atlas-wave13-20261013 | `gildra-web:atlas-wave13-20261013-5b5b38ae` | 5b5b38a | волна 13: плавность — переход страниц только opacity/transform и короче (телефон 4×: переход 800 → 561 мс), морф именуется по нажатию, каскад прибытия по классам, живые слои отдыхают во время перехода и под диалогом, подложка диалога без размытия (ввод в ⌘K 488 → 112 мс), резерв высоты списка поиска на телефоне; независимый замер «Анализа фронтенда»: переход быстрее на 9/9 сценариях; через staging | атлас | `img-fix-20261013-c0bd008e` |
| 2026-10-14 18:40 | localization-20261014 | `gildra-web:localization-20261014-5a48b8b` | 5a48b8b | RU/EN: оригинальные названия боссов, подземелий, заклинаний и талантов; локализация ротаций и каталога; английская консоль API; поверх wave 14; staging: функциональные проверки прошли, текстовые visual diff просмотрены; публичные RU/EN и desktop/mobile проверки | локализация | `atlas-wave14-20261013-67048041` (`/opt/gildra/localization-20261014-previous.env`) |
| 2026-10-14 19:51 | localization-20261014b | `gildra-web:localization-20261014b-969ee7b` | 969ee7b | полный перевод глубоких панелей: оригинальные NPC/заклинания по ID, все шаги восьми подземелий, источники способностей, поля каталога без ложного ru_RU, подписи этажей; проверены 110 URL, 180 панелей RU/EN и 18 публичных снимков | локализация | `localization-20261014-5a48b8b` (`/opt/gildra/localization-20261014b-previous.env`) |
| 2026-10-15 18:40 | auction-gear-20261015-57f74f1 | web/API/worker `*:auction-gear-20261015-57f74f1` | база 3ab504f + source manifest 57f74f1, без commit/push | подбор аукционных вещей под бюджет, реальные бонусы/модификаторы, совместимость и сверка масштаба с Blizzard; Элкардия +2,606% за 15 золота; 7 staging-гейтов и публичные RU/EN проверки прошли; схема 171 | подбор экипировки | прежние web/API/worker и scoped rollback runner; [отчёт](reports/auction-gear-deployment-20261015.md) |
| 2026-10-15 20:43 | farm-gear-20261015-dcce589 | web `gildra-web:farm-gear-20261015-dcce589`; worker `gildra-rotation-sim-worker:farm-gear-20261015-dcce589` | dcce589 | подтверждённые Normal/context17 награды и независимые симуляции; Элкардия EN/RU: Warbanner +4,39%, голова +2,76%; 7 staging-гейтов, postdeploy EN/RU, публичные проверки и наблюдение прошли | подбор экипировки | прежние web/worker; `/opt/gildra/farm-gear-20261015-dcce589-previous.env`; scoped runner; [отчёт](reports/farm-gear-deployment-20261015.md) |
| 2026-10-15 21:49 | gear-ui-20261015-2ae23b1 | web `gildra-web:gear-ui-20261015-2ae23b1` (image `1b260d1b`) | 2ae23b1 | настоящие иконки мест и вещей в рамках, общие тултипы, сравнение с надетым, понятные бюджет/цена/остаток и DPS; 7 staging-гейтов, свежие farm/auction EN/RU на Элкардии, публичные проверки и наблюдение прошли | подбор экипировки | прежний web `farm-gear-20261015-dcce589`; `/opt/gildra/gear-ui-20261015-2ae23b1-previous.env`; [отчёт](reports/gear-planner-ui-deployment-20261015.md) |
| 2026-10-15 23:08 | auction-slots-20261015-ca51c38 | web `gildra-web:auction-slots-20261015-ca51c38` (image `0cb85ef7`) | ca51c38 | выбор слотов, полный найденный список реальных лотов с ценой/DPS и исключениями, отдельная точная сборка под исходный бюджет; Элкардия EN/RU: 608 вариантов, полный HEAD/WRIST перебор 22/20, +372 DPS за 15 золота; 7 staging-гейтов, публичные проверки и наблюдение 528 с прошли | подбор экипировки | прежний web `gear-ui-20261015-2ae23b1`; `/opt/gildra/auction-slots-20261015-ca51c38-previous.env`; [отчёт](reports/auction-slot-plans-deployment-20261015.md) |
| 2026-10-16 05:17 | auction-improvements-20261016-f2fbe4c | web `gildra-web:auction-improvements-20261016-f2fbe4c` (image `a059d0db`) | f2fbe4c | только подтверждённые улучшения; видимая сборка единого сета под исходный бюджет перед списком; целый сет и исключение проверены на Элкардии EN/RU по всем 16 слотам; 7 staging-гейтов, публичные проверки и наблюдение 402.887 с прошли | подбор экипировки | прежний web `gildra-web:game-switcher-20261016-ced19b0` (`7c2b8b2a`); `/opt/gildra/auction-improvements-20261016-f2fbe4c-previous.env`; [отчёт](reports/auction-improvements-deployment-20261016.md) |
| 2026-10-16 06:59 | auction-fixes-20261016-8a5f3eb | web `gildra-web:auction-fixes-20261016-8a5f3eb` (image `571a7537`) | 8a5f3eb | шесть исправлений аукционного подбора: совместные улучшения, точная закупка лотов, обновление рынка, полный возобновляемый поиск и честные неизвестные требования; свежие Элкардия EN/RU WRIST exact + 16-slot partial, UI 24+4, 7 staging-гейтов, публичные проверки и 525.974 с наблюдения | подбор экипировки | прежний web `gildra-web:auction-improvements-20261016-f2fbe4c`; `/opt/gildra/auction-fixes-20261016-8a5f3eb-previous.env`; [отчёт](reports/auction-fixes-deployment-20261016.md) |
| 2026-10-16 10:22 | auction-reliability-20261016-764210f | web `gildra-web:auction-reliability-20261016-764210f` (`e77e773b`); worker `gildra-rotation-sim-worker:auction-reliability-20261016-764210f` (`3d676fd9`) | 764210f | 14 исправлений надёжности: подтверждённый сет, сохранение результатов, исключения, восстановление потерянных запросов, отмена/повтор, реальные свойства вещей; 65 focused + 80 browser, 7 staging-гейтов; Элкардия EN/RU +503 DPS за 300,89 золота, 4 real UI replay и 16 public views; 424,714 с наблюдения | подбор экипировки | прежние web `571a7537` и worker `3d320982`; `/opt/gildra/auction-reliability-20261016-764210f-previous.env`; [отчёт](reports/auction-reliability-deployment-20261016.md) |
| 2026-10-19 08:45 | motion-design-20261019-7357c61-r1 | web `gildra-web:motion-design-20261019-7357c61` (image `0104dafb`) | 7357c61 | один владелец переходов (эффект персонажа только у главной, тап пропускает; между страницами 0.1–0.3 с, каскад и перелёт арта), CLS: на телефоне 0, на десктопе ≤0.053; новая страница «Персонажи»; 29 правок текста, данных и мобильной вёрстки; staging: home-gate 0 px, smoke 28, переходы, темы, сцены, CLS; после выкатки smoke/переходы/темы на gildra.net | Claude (motion/design) | `fba239aa` (illidan-acid-20261018-f4da729-r1), манифест `/opt/gildra/motion-design-20261019-7357c61-r1-previous.env` |
| 2026-10-22 21:06 | nav-locale-20261022 | web `gildra-web:nav-locale-20261022-6a06f0e381e9` (image `e232246610fb`) | 6a06f0e | редизайн меню (realm bar с порталами, мобильное меню-лист, portal-переходы между страницами, gilded identity) + анимированный переключатель EN/RU с cross-document view transition и сохранением позиции чтения; typecheck, atlas:check, test:atlas 164/164, routes:check, сборка 766 страниц; локальный образ и gildra.net: 26 браузерных проверок 1440/390 без ошибок консоли, smoke 25 маршрутов | Claude (release) | `ef70c8dd` (`gildra-web:atlas-valyro-20261022-ce40d85a58a7`, тег `gildra-web:rollback-before-nav-locale-20261022`), манифест `/opt/gildra/nav-locale-20261022-previous.env` |
