# SEO и производительность WowArcana

Состояние на 2026-11-11 02:02 UTC. Подготовлен source-пакет для единого релиза Forever по решению владельца; scoped проверки пройдены, полный candidate/build/browser gate выполняет координатор. Отдельного SEO-деплоя нет. Незавершённый performance-аудит остаётся следующим шагом после релиза.

## Проверенное состояние и границы

- Worktree `feat/seo-performance-20261111`, HEAD `9e8d3a9c9192109c5c50cd857224f1b64ab319ff`, feature commit включает этот отчёт; отправляется только `feat/seo-performance-20261111`, author/committer Shpuntyara. LIVE повторно проверен через Docker: `gildra-web:round5-20261110-9e8d3a9c9192`. Другие Forever-ветки ещё интегрируются.
- Основной домен `https://wowarcana.com`. Проверенные 301 сохраняют path/query: HTTPS gildra.net → новый домен, www → без www; HTTP gildra.net проходит через HTTPS старого домена (2 hops). OAuth-исключения не менялись.
- SSR/canonical/H1/EN-RU/x-default проверены выборочно на главной, M+, Voidspire, карте `/wow/map`, библиотеке, аукционе, Forever/Scholomance. Содержимое crawler HTML содержит реальные заголовки и данные. Это выборка, не полный crawl.
- Robots200 открывает публичные маршруты, не блокирует render resources, закрывает API/console/analytics/dev, указывает новый sitemap. UA browser/Bingbot/YandexBot на `/` и sitemap200; это не проверка с настоящих IP роботов.
- Baseline до round5: static sitemap735unique, index106files, library datasets60URLs. Class record shards EN/RU по15URL и первые record pages200/self-canonical. Историческая заметка о полном отсутствии library records устарела.
- SITE_ORIGIN и public metadata нового домена согласованы. Старое имя Gildra в title/schema главной при новом логотипе подтверждено; часть внутренних metadata/root defaults ещё требует будущей унификации.
- LIVE public analytics site ID = `gildra.net`, tracker src/event endpoint на wowarcana.com. Старый hostname filter отклоняет wowarcana.com, поэтому tracker не монтируется. Это ошибка маршрутизации аналитики, не доказательство нулевого трафика.
- Подключённого инструмента Search Console/Plausible/GA/Yandex/Bing не было найдено. Нет подтверждённых данных clicks/impressions/CTR/positions, query demand или field CWV p75. PageSpeed API вернул429; наличие CrUX из этого не определяется.

## Подготовленные изменения

1. Analytics hostname allowlist использует canonical SITE_ORIGIN отдельно от исторического Plausible ID. Production/www разрешены, preview/staging/чужие домены исключены; ID сохраняется. Убран useEffect/setState загрузчика, вызывавший лишний render.
2. Главная EN/RU: title/OG и H1 используют WowArcana. WebSite/Organization schema: WowArcana с alternateName Gildra, реальные origin/logo/поиск сохранены. Видимый игровой контент и дизайн не менялись.
3. 28существующих dungeon guides (56EN/RU wrappers): единый metadata helper с названием, intent «Dungeon Guide»/«гайд по подземелью», собственной description о входе/карте/тактике/опубликованном levelband. Проверенные RU названия переиспользуются, непереведённые имена остаются EN. Canonical/hreflang/OG связаны с тем же маршрутом. Новых страниц нет.
4. **Sitemap передан координатору.** Предыдущий патч28dungeons вместо1, +54localized URLs, экспортирован в `/tmp/seo-performance-20261111/frozen-patches/sitemap-handoff.patch` и удалён из активного source diff. Координатор подтвердил покрытие28dungeons в своей более полной реализации с классами/калькуляторами/профессиями. Глобальный поиск и edition boundaries — его scope.

Эталоны M+/meta/raids, общие компоненты, CSS, навигация и единый подвал не менялись. Служебные фразы на страницы не добавлялись. Изменение H1 главной — замена бренда в существующем заголовке, без добавления скрытого SEO-текста.

Проверяемый пакет: `/tmp/seo-performance-20261111/frozen-patches/source-handoff.patch` (66source/test files, включая новые helper/tests), `source-manifest.json` с SHA256 каждого файла и патча. Проверка применения в другой ветке: сначала `git apply --check`, затем ревью относительно актуального FULL source; не применять поверх интеграции без проверки. Владелец отдельно разрешил commit/push только feature-ветки; master/release ветки и деплой эта сессия не выполняет.

## Измерения

### HTTP baseline до round5, не browser CWV

Три последовательных прохода curl7.88.1 с `--compressed`, Googlebot UA, отдельный процесс на запрос, сервер→публичный edge, без CPU/network throttle. Все24ответа200; edge cache state не фиксировался. Host load9–13. [Таблица](timing-table.md), сырые значения `timings.json`.

Медианы TTFB97–217мс на8маршрутах; compressed HTML/XML12–35КБ. Root HTML загрузил14initial script tags, отдельные gzipGET суммарно225759байт, максимум64810байт/chunk, immutable max-age1год. Это не полный вес страницы: dynamic JS, CSS, fonts, images, API не посчитаны.

### Browser baseline/candidate

До общей паузы01:01 browser job не завершился: полного JSON нет. После возобновления01:42 найден только завершённый source-tests TAP32/32. Прежнего measure процесса нет. Единственный новый waiter590013 отменён01:45 до получения lock (детей не было), по steering приоритета Forever QA/final combined candidate. Holder575806bench-c — другая сессия, не SEO; чужие процессы не остановлены. Новых измерений от этого waiter нет.

| Метрика/проверка | Baseline | Candidate/after |
| --- | --- | --- |
| TTFB | 24HTTP observations до round5 | Не измерено |
| LCP/CLS mobile/desktop lab | Не измерено | Не измерено |
| INP scripted interactions | Не измерено | Не измерено |
| LCP/INP/CLS real-user p75 | Нет доступа/подтверждённого набора | Требуются новые реальные посещения после публикации |
| Full page transfer и bottleneck attribution | Частичный rootJS inventory | Не измерено |

**Ускорение в миллисекундах и прохождение CWV не заявляются.** Удаление лишнего render — проверяемая runtime simplification, его вклад в page latency не измерен. Аналитика исправляет сбор данных, не доказывает улучшение скорости. Картинки/JS/cache не изменялись без runtime evidence.

## Проверки

- `source-tests-0101.tap`:32/32PASS (analytics host regression,28dungeon metadata uniqueness/levelband/canonical/OG/routes, SEO/routes/library records). Завершённый TAP обнаружен после паузы; все строки итога присутствуют.
- Свежие scoped проверки02:01UTC: TypeScript5.9.3,66изменённых source/test roots,854imported files, diagnostics только для изменённых файлов и compiler options:0. ESLint всех66:0errors/0warnings.32source tests повторно32/32PASS, source-tests-final.tap/scoped-checks.json. Это scoped tsc, не полный project typecheck.
- `git diff --check` PASS, coordinator check-paths без конфликтов. `lab-measure.cjs` syntax check PASS; это не успешный browser run.
- Source packages @gildra теперь разрешаются в эту worktree, а не старый основной checkout; внешние установленные deps shared read-only. Install не выполнялся. Собственных старых `.next-*` при возобновлении нет. Shared caches не чистились.
- Full build/project typecheck/candidate SSR metadata/browser desktop/mobile EN/RU/focus/motion/error/empty/loading остаются общими gates координатора и отдельно здесь не запускались. Rich Results Test не запускался. Эти этапы остаются необходимыми до публикации.

## Приоритеты и измеримые следующие действия

Частотность неизвестна; ниже приоритизация по пользовательскому intent и качеству текущих страниц, не выдуманные объёмы спроса.

1. **P0: достоверная аналитика.** Проверить исправленный tracker на production hostname с историческим ID в локальном browser harness, перехватывая события; preview/staging не должны отправлять pageview/CWV. После согласованной публикации подтвердить реальные события в Plausible. Отдельно проверить порядок готовности tracker и WebVitals: ранние callbacks сейчас могут теряться, это гипотеза до browser repro.
2. **P1: индексация готового контента.** Координатор интегрирует все28гайдов и новые разделы в sitemap; проверить 200/selfcanonical/robots/hreflang по выборке каждой family. Отправить sitemap через подтверждённые аккаунты, проверить URL Inspection/excluded reasons. Ответ200 не означает индексацию.
3. **P1: бренд.** Согласовать оставшиеся titles/rootOG/site names с WowArcana, сохранить old-domain redirect/OAuth. Search Console migration/canonical selection проверить во внешних аккаунтах. Не менять эталонные страницы ради формального SEO.
4. **P1: intent готовых гайдов и карт.** `[dungeon] route/boss tactics`, `[рейд] тактика`, `карта [zone]`: сравнить queries/pages EN/RU по impressions, clicks, CTR и позиции за сопоставимые окна. Уточнять существующее содержание/metadata, не создавать перестановочные тонкие страницы.
5. **P2: инструменты и библиотека.** Аукцион цена/регион/предмет, профессии прокачка/рецепты, library имена/связи: проверить SSR и query canonical/noindex, качество RU и доступность ссылок. Не индексировать бесконечные сочетания фильтров.
6. **P2: измеренная скорость.** После явного coordinator handoff общего heavy slot — serial baseline/candidate,3cold navigations на6семействах×mobile/desktop. Одинаковая среда origin/cache/backend/release/consent/auth/CPU/network; сравнивать медиану и диапазон. Локальный origin нельзя выдавать за ускорение относительно public edge. При необходимости baseline и candidate обслуживать одним и тем же локальным setup.

Repro harness `lab-measure.cjs`: подготовлен новый контекст на каждый URL, cache disabled, serviceworkers blocked, mobile390×844/4xCPU/1.6Mibps150ms, desktop1440×900/1xCPU/10Mibps20ms, reduced-motion, guest, stats events blocked; mapZoom/librarySuggestions/auctionSearch. Лабораторный INP — наблюдение ограниченного сценария, не fieldp75. Запускать **только после разрешённого slot handoff** с `flock -x /tmp/forever-platform-20261111/heavy.lock` на весь процесс. После окончания общего релиза, по отдельному слоту: сначала2URL×1run диагностический smoke, проверить exports/metrics/locators, затем полный матричный прогон. Во время следующего полного кандидата отдельно normal-motion и RU проверки. Не запускать параллельную сборку и не удалять чужие кэши.

## Официальные основания

- [Google canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
- [Google site names](https://developers.google.com/search/docs/appearance/site-names), [описания страниц](https://developers.google.com/search/docs/appearance/snippet), [title links](https://developers.google.com/search/docs/appearance/title-link).
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a), [Yandex primary address](https://yandex.com/support/webmaster/en/yandex-indexing/site-addresses), [index monitoring](https://www.yandex.com/support/webmaster/en/robot-workings/control).
- [Web Vitals](https://web.dev/articles/vitals), [INP](https://web.dev/articles/inp), [LCP](https://web.dev/articles/optimize-lcp/).

Первое место не обещается. Внешние аккаунты/переобход и реальные пользовательские данные требуют отдельных действий и времени.
