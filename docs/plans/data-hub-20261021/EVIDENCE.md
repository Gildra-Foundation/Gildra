# Основания проекта и выполненные проверки

Проверка: 21 октября 2026 года, примерно 20:15–20:30 UTC. Исследование только на чтение. Документы архитектуры сохранены отдельно от исходников приложения.

## Публичные страницы

Получены обычным GET без аккаунта и без запуска платных сборщиков:

| Страница | Фактическая выдача |
|---|---|
| [Рейды](https://gildra.net/ru/wow/raids) | HTTP 200; 5 рейдов, 18 боссов, текущий S2 и архив; у Споропада ограниченный статус сведений |
| [Mythic+](https://gildra.net/ru/wow/mythic-plus) | HTTP 200; 8 подземелий, 28 боссов; отдельные ссылки и даты сверки состава/таймеров/имён; маршруты помечены черновиками |

Проверялся серверный HTML, а не весь интерактивный цикл браузера. Эти значения описывают полученную выдачу и не являются новой верификацией игровых механик.

## Изученные исходники

Репозиторий: `git@github.com:Gildra-Foundation/Gildra.git`.

Рабочая копия: `/home/debian/Gildra-motion-design-20261018`.

Ветка: `feature/motion-design-perf-20261018`.

HEAD в начале и при заключительной проверке: `50e4b0d1df08bfb6d4f6a6a7be8e5c3754bc8f01`. `git status --short` пуст до и после исследования.

| Файл | Проверенный вывод |
|---|---|
| [RaidAtlasPage.tsx](/home/debian/Gildra-motion-design-20261018/apps/web/components/wow/raid/RaidAtlasPage.tsx:30) | Текущий raid slug выбирается в коде; встречается требование ровно 8 боссов текущего рейда; данные берутся из manifest и TS |
| [midnightRaidData.ts](/home/debian/Gildra-motion-design-20261018/apps/web/components/wow/raid/midnightRaidData.ts:1) | Архивные рейды/боссы заданы в TS, список механик строится из публикационного JSON |
| [MythicAtlasPage.tsx](/home/debian/Gildra-motion-design-20261018/apps/web/components/wow/mythic/MythicAtlasPage.tsx:12) | Каталог, таймеры и число боссов читаются из route data; сезон указан в компоненте |
| [mythicVerification.ts](/home/debian/Gildra-motion-design-20261018/apps/web/components/wow/mythic/mythicVerification.ts:4) | Состав, таймеры, имена, patch имеют отдельные ссылки/даты; route.status=draft, route.checkedAt=null |
| [dungeonRoutes.ts](/home/debian/Gildra-motion-design-20261018/apps/web/components/wow/mythic/dungeonRoutes.ts:1) | Факты о подземельях смешаны с авторскими stops, расчётными duration/forces и назначениями |
| [wow.ts](/home/debian/Gildra-motion-design-20261018/apps/web/lib/data/wow.ts:1) | Серверная граница доступа к игровым данным; прямой импорт data в компоненты запрещается принятой архитектурой |
| [game-data/index.ts](/home/debian/Gildra-motion-design-20261018/packages/game-data/src/index.ts:1) | Существующий общий пакет простых игровых данных и manifest |
| [content-manifest.json](/home/debian/Gildra-motion-design-20261018/packages/game-data/src/content-manifest.json:1) | schemaVersion=2; editions retail/classic/classic-era/hardcore, без forever; есть версии, источники, варианты сложности и история |
| [completion-contract.json](/home/debian/Gildra-motion-design-20261018/apps/web/data/wow/completion-contract.json:1) | Уже определены приоритеты sourceKind, проверки полноты, статусы описаний и ожидания к маршрутам |
| [datasetrefresh/worker.go](/home/debian/Gildra-motion-design-20261018/backend/internal/datasetrefresh/worker.go:17) | River queue datasets; периодические jobs и вызов Python worker для других наборов |
| [wowhead_dataset_daemon.py](/home/debian/Gildra-motion-design-20261018/scraper/parsers/wowhead_dataset_daemon.py:1) | Существующий приватный HTTP worker поддерживает четыре обновления tier lists |
| [wowhead_dataset_service.py](/home/debian/Gildra-motion-design-20261018/scraper/parsers/wowhead_dataset_service.py:203) | Пример цикла fetch/validate/snapshot/current pointer и сохранения прежней версии при неудаче |
| [00004_datasets.sql](/home/debian/Gildra-motion-design-20261018/backend/migrations/postgres/00004_datasets.sql:47) | snapshot требует unique_spec_count>0; runs содержат поля специализаций и scheduled_for DATE |
| [scraper/README.md](/home/debian/Gildra-motion-design-20261018/scraper/README.md:1) | Платный сбор требует профиля, seed URLs и бюджета; одних credentials недостаточно |

Просмотр доступных SQL-миграций в этой рабочей копии не обнаружил снятия обязательного `unique_spec_count > 0`. Живая схема PostgreSQL не исследовалась. Поэтому проект предлагает независимые таблицы контента, сохраняя действующие ограничения tier lists.

Прочитаны также существующие аудиты дерева encounter journal, эффектов, NPC и медиа. Они содержат логику контекста и evidence, полезную для перехода к воспроизводимым модулям. Некоторые скрипты умеют писать в исходники; при будущем переиспользовании нужен изолированный ввод/вывод.

Для оценки объёма существующего состояния в manifest просмотрены 14 instances, 19 encounters и 69 abilities. Отдельный season-one publication содержит 4 публикационно безопасных способности и coverage по 9 encounters. Это разные области и статусы; их числа нельзя автоматически приравнять к полноте всего рейдового журнала. Качество каждой механики заново не проверялось.

## Внешние первичные источники

- [Blizzard: Forever What’s Next](https://news.blizzard.com/en-us/article/24303862/world-of-warcraft-forever-whats-next-panel-recap): самостоятельное развитие Forever, анонс подземелий/рейдов, время запуска и открытие рейдов. Использован для выбора edition/phase/capabilities вместо копирования retail-сезонов.
- [Официальная страница Forever](https://worldofwarcraft.blizzard.com/en-us/forever/): подтверждает самостоятельный продукт. Использована как ориентир для будущего source registry.
- [Blizzard Game Data API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis): первичная точка проверки API. Детальное покрытие Forever и namespace в этой работе не установлены.
- [MythicDungeonTools](https://github.com/Nnoggie/MythicDungeonTools): авторский репозиторий описывает планирование маршрутов, точки NPC и enemy forces. Данные конкретного commit и разрешённость конкретных медиа для нового инструмента ещё предстоит проверить.
- [Raider.IO static data](https://raider.io/api/v1/mythic-plus/static-data?expansion_id=11): этот адрес уже указан в изученном mythicVerification.ts как источник таймеров. Новый запрос API и фактическая сверка всех таймеров в этой работе не выполнялись.

Отсутствие подтверждения Mythic+ для Forever в этом исследовании выражено `unknown`, а не утверждением об отсутствии такой системы.

## Координация и границы работы

Общая память прочитана: `/var/lib/gildra/codex-team/memory/gildra/` — MEMORY, CONTEXT, REFERENCE и последняя запись sessions.

Настоящий общий coordination store проверен через `CODEX_TEAM_STATE_DIR=/var/lib/gildra/codex-team`. Sandbox-preflight сначала показал локальный fallback; он не использовался как свидетельство отсутствия чужих работ. Повторная проверка общего store выявила действующие отдельные задачи по raid evidence, mythic evidence и auction autoassembly.

Сессия проектирования: `gildra-data-autoupdate-design-20261021`. Занят только `artifact:data-autoupdate-design-20261021`. Исходники и прикладные БД не редактировались. Обращений к другим людям/чатам не было.

Доступ обычного пользователя к Docker socket оказался недоступен; состояние образов и активное расписание сервисов по Docker не подтверждались. Это не мешало чтению публичных страниц и проектированию по исходникам.

Не выполнялись commit, push, deploy, restart, production import, миграции или установка реального расписания. Будущие проверки описаны как спецификация в IMPLEMENTATION.md; они не выданы за выполненные тесты.

## Следующее действие

При начале реализации — прочитать свежие handoff задач по рейдам/Mythic+, проверить Git и locks, создать отдельную рабочую копию и выполнить этап 0. Затем реализовать storage/publication/read path на изолированном стенде с существующими данными, до подключения автоматического сбора.
