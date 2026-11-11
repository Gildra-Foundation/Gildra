# SEO и производительность WowArcana — 11 ноября 2026, UTC

Первый пакет исходников подготовлен на `feat/seo-performance-20261111`, база `9e8d3a9c9`. Не закоммичен, не отправлен, не опубликован. Полный аудит производительности **не завершён**: round5 держит production-lock, тяжёлые замеры и сборка отложены по заданию. LIVE при проверке: `gildra-web:forever-complete-20261110-65c9ad7973c7`.

## Проверенные результаты

- Основной origin: `https://wowarcana.com`. HTTPS gildra.net и www.wowarcana.com отвечают 301 на него, путь и query сохраняются в проверенном случае. HTTP gildra.net делает два перехода: HTTPS старого домена, затем новый домен. Инфраструктура не менялась; OAuth-исключения не затронуты.
- На проверенных EN/RU страницах главной, Mythic+, Voidspire, карты `/wow/map`, библиотеки, аукциона и Scholomance: 200, собственный canonical нового домена, H1 и SSR HTML. Парные страницы несут EN/RU/x-default alternates там, где они проверены (см. HTTP JSON). Вывод не распространяется на все URL сайта.
- Запросы с обычным browser UA, Bingbot и YandexBot UA к главной и sitemap получили 200, без cf-mitigated. Подстановка UA не доказывает доступ с реальных IP поисковых роботов.
- `robots.txt`: 200, разрешает публичный сайт, закрывает API/console/analytics/dev, указывает новый sitemap. Нет блокировки `/_next/`.
- Sitemap index: 106 дочерних файлов; static: 735 уникальных URL; наборы библиотеки: 60 URL. Устаревшая заметка о полном отсутствии записей библиотеки уже не соответствует LIVE: classes EN/RU содержат по 15 URL, первые записи обоих языков дают 200 и собственные canonical. Все крупные record shards не обходились.
- JSON-LD главной парсится, содержит WebSite/Organization; на проверенных контентных страницах есть BreadcrumbList. Forever hub не содержит JSON-LD — это возможность улучшения, само по себе не запрет индексации. Права на rich results не проверены внешним валидатором.
- В LIVE metadata главной и schema называли сайт Gildra при новом домене и логотипе WowArcana. Многие внутренние заголовки и H1 главной также ещё содержат старое имя; их полная унификация остаётся отдельной задачей согласования с оболочкой.
- LIVE public analytics configuration проверена выборочно без сохранения окружения: site ID Plausible = `gildra.net`, script/event endpoint на wowarcana.com. Старый код разрешает только hostname из site ID, поэтому отбрасывает wowarcana.com. Это подтверждённая причина отсутствия загрузчика на новом домене, а не доказательство нулевого реального трафика.
- Поиск доступных интеграций не обнаружил установленного инструмента Search Console/GA/Plausible/Yandex/Bing. Найденные маркетинговые коннекторы не установлены. Доступ к статистике аккаунтов, показы, позиции, CTR, поисковый спрос и field p75 не подтверждены.
- PageSpeed API без ключа вернул HTTP 429. Это не означает отсутствие CrUX и не считается успешной проверкой CWV.

## Изменено в этой worktree

| Изменение | До | После в исходниках | Проверка |
| --- | --- | --- | --- |
| Sitemap Forever | 1 dungeon / 2 локализованных URL | 28 dungeons / 56 локализованных URL | Те же instanceData, что у каталога; тест наличия EN/RU route files, уникальность путей |
| Бренд главной EN/RU | Gildra в title и OG title | WowArcana, игровой подзаголовок сохранён | Исходники; website schema сохраняет Gildra как alternateName |
| WebSite/Organization | name Gildra | name WowArcana + alternateName Gildra | Существующие schema tests |
| Домен аналитики | Сверка hostname с историческим site ID | Сверка с SITE_ORIGIN, ID неизменён | Новый регрессионный тест: production/www разрешены, staging/preview/чужие домены запрещены |
| Загрузчик аналитики | useEffect → setState → повторный render | Чтение фиксированного hostname в client-only компоненте | ESLint; импорт через существующий ssr:false adapter |

В sitemap добавляются 54 локализованных URL **существующих** содержательных гайдов. Новые посадочные страницы и тексты не создавались. Список WoW source paths теперь 395, все уникальны. Ожидаемый размер static sitemap после публикации — 789 URL; HTTP нового sitemap ещё не проверен, т.к. кандидат не собирался. Эталоны M+/meta/raids, CSS, навигация и единый подвал не менялись.

## Производительность: имеющиеся измерения

`timings.json`: три последовательных прохода, curl 7.88.1, HTTPS public edge, Googlebot UA, Accept-Encoding через `--compressed`, отдельный процесс на запрос, без CPU/network throttling и browser cache. Восемь маршрутов, все 24 ответа 200. Источник — этот сервер, не геораспределённые пользователи. Состояние edge cache не зафиксировано; эти числа нельзя выдавать за холодную загрузку телефона. Load average в ходе аудита 9–13; сервер занят параллельной работой. Нельзя сравнивать с будущим кандидатом без повторной baseline.

Таблица в [timing-table.md](timing-table.md). Медианы TTFB: главная EN 112 мс, RU 99; Voidspire 140; карта 168; библиотека 217; аукцион 132; Scholomance 121; static sitemap 97. HTML/XML transfer 12–35 КБ в этих запросах, не полный вес страницы.

`root-resources.json`: 14 initial external script tags главной, суммарно 225 759 байт gzip при отдельных GET; самый большой chunk 64 810 байт. Ответы immutable, max-age=31536000. Это нижняя граница JS: последующие dynamic chunks, изображения, CSS, шрифты и API сюда не входят. Нет оснований называть этот chunk узким местом без trace.

| Метрика | До | После |
| --- | --- | --- |
| LCP, mobile/desktop lab | Отложено по production/heavy gate | Не измерено |
| CLS, mobile/desktop lab | Отложено | Не измерено |
| INP реальных пользователей, p75 | Нет подтверждённого доступа к field data | Появление данных возможно только после публикации исправления и новых посещений |
| INP при сценариях в браузере | Не измерено | Не измерено |
| TTFB | 24 запроса, см. JSON | Кандидат не запущен |

Ускорение страниц в миллисекундах **не заявляется**. Реализованное улучшение runtime устраняет лишний рендер загрузчика; исправление аналитики восстанавливает возможность собирать CWV. Оптимизации картинок/кэша/JS до trace были бы предположениями.

## Приоритеты по намерению игрока

Частотность и текущие позиции неизвестны; это гипотезы по существующему содержанию, не измеренный рейтинг спроса.

1. **P0 — достоверное измерение.** Опубликовать исправление analytics отдельным согласованным выпуском после интеграции, проверить pageview и Web Vitals events на настоящем production hostname. Проверить staging/preview exclusions. Не отправлять искусственные события в production.
2. **P1 — обнаружение уже готовых гайдов.** Включить 27 пропущенных dungeon guides, затем отправить sitemap в верифицированные Search Console/Yandex Webmaster/Bing Webmaster. Проверить URL Inspection и причины исключения, не считать ответ 200 доказательством индексации.
3. **P1 — брендовый поиск.** Проверить site name, оставшиеся Gildra titles/H1/OG/root defaults и миграцию домена в аккаунтах. Поддерживать old-domain redirects, не ломая OAuth callbacks. Новый бренд должен согласовываться с реальным видимым именем сайта.
4. **P1 — конкретная игровая задача.** Готовые dungeon/raid guides, Mythic+ routes и карты: `[dungeon] route/boss tactics`, `[рейд] тактика`, `карта [zone]`. Сначала измерить queries/pages EN и RU, затем уточнять title/description существующих страниц по реальному содержанию, не плодить страницы под перестановки слов.
5. **P2 — игровые инструменты.** Аукцион: цена/регион/предмет; профессии: прокачка/рецепты; библиотека: названия сущностей и связи. Проверить query-driven canonical/noindex и фактический SSR, покрытие shard URL и качество переводов выборкой. Индексация произвольных фильтров может размножить дубли.
6. **P2 — доказанные performance bottlenecks.** По trace отделить server wait, image discovery/load, render delay, JS tasks и layout shifts. Оптимизировать только найденную причину; сохранить картинки, игровой смысл и эталоны.

## Проверки и следующий шаг

- 32/32 профильных теста SEO/routes/analytics прошли; штатная отдельная команда analytics также 2/2.
- ESLint изменённых файлов: 0 ошибок, первоначально 1 существующее предупреждение setState-in-effect; после удаления этого effect — повторная проверка соответствующих двух файлов: 0 ошибок и предупреждений.
- `git diff --check` и coordinator check-paths: без конфликтов.
- Попытка исполнить XML route напрямую в Node тестовым resolver остановилась на TSX barrel скрытой LoL-секции: resolver не умеет index.tsx. Это ограничение способа проверки, не подтверждённая ошибка Next. Сам генератор WoW paths успешно исполнен.
- Полные build/typecheck, candidate HTTP, browser interactions, desktop/mobile screenshots и CWV comparison не запускались из-за оговорённого ограничения на тяжёлую работу. Внешний Rich Results Test также не запускался. Никаких production mutations, push, commit, cache cleanup, install или агентов.

Точное продолжение: перечитать coordinator status и LIVE; дождаться освобождения round5/heavy gate, получить соответствующий resource claim; провести baseline и candidate serial lab runs в одинаковых условиях (по 3 cold navigations mobile/desktop на главной, Voidspire/Scholomance, карте, библиотеке, аукционе; фиксировать браузер, viewport, 4x CPU/mobile network, consent/auth/cache и release). Добавить реальные сценарии карты/фильтров/аукциона для interaction latency. Сопоставить медиану и диапазон, полный resource transfer и DOM LCP attribution. Собрать локальный кандидат без Docker-конкуренции, проверить render/metadata/schema/состояния EN/RU; затем интеграция в актуальный FULL source координатором. Публикация и переиндексация отдельно, по разрешённому процессу.

## Официальные основания

- [Google: canonical и редиректы](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) и [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): согласованные адреса существующего контента.
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a): crawlability и содержательная ценность; гарантий позиций нет.
- [Yandex: основной адрес](https://yandex.com/support/webmaster/en/yandex-indexing/site-addresses), [контроль индексации](https://www.yandex.com/support/webmaster/en/robot-workings/control): проверять аккаунт и исключения, не судить по единичной выдаче.
- [Google Web Vitals](https://web.dev/articles/vitals), [INP](https://web.dev/articles/inp), [LCP](https://web.dev/articles/optimize-lcp/): lab и field различаются; отсутствие field data не означает прохождение CWV.

Первые места не обещаются. Для решений о спросе нужны реальные query/page данные и время после переобхода.
