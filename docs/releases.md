# Журнал релизов gildra.net

Один журнал для всех сессий, которые выкатывают сайт (roadmap, пункт 98). Каждая
выкатка — строка ниже, **до** сообщения соседней сессии о том, что сайт свободен.

Как выкатывают сейчас: образ собирается на хосте из чистого `git worktree` на
коммите релизной ветки `release/atlas-theme-20261011`, ставится на staging
(`sudo sh infra/deploy/deploy-web-staging.sh <образ>`, http://127.0.0.1:3200),
проходит `npm run qa:release -- --candidate http://127.0.0.1:3200`, и тот же образ
выкатывается `deploy-web-host.sh <образ> <метка>` (веб) или аналогом для API; оба берут
`/run/lock/gildra-deploy.lock` и переписывают в `/opt/gildra/current-release.env`
только свои ключи (`WEB_*` / `API_*`). Прежний манифест остаётся в
`/opt/gildra/<метка>-previous.env` — это и есть откат. После выкатки `master`
на GitHub получает коммит `[skip ci]` с тем же деревом.

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
