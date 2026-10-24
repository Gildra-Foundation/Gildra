# Сбор данных рейдов и Mythic+ — collect_only

Второй этап добавляет два retail-сборщика и ежедневные задания River. Они сохраняют исходные ответы, нормализованные факты и diff кандидата. Ни один путь сборщика не создаёт release, approval, publication event или outbox публикации.

## Источник и объём

Первый адаптер использует публичные [static-data API Raider.IO](https://raider.io/api):

```text
https://raider.io/api/v1/raiding/static-data?expansion_id=11
https://raider.io/api/v1/mythic-plus/static-data?expansion_id=11
```

Рейды: ID, upstream slugs/названия, состав и порядок боссов, опубликованные источником границы доступности. Три рейда первого сезона представлены у поставщика одной группой; явные ID-соответствия распределяют девять боссов между ними. Другие известные группы — Sporefall и Venomous Abyss. Неизвестные сущности сохраняются с предупреждением, а не сопоставляются по названию.

Mythic+: конкретный сезон `season-mn-2`, Blizzard season 18, состав его подземелий, Raider.IO/Challenge Mode ID, названия и таймеры. У источника несколько `is_main_season=true`; этот флаг не выбирает сезон. Глобальный список подземелий также не заменяет сезонный пул. Метаданные доступных сезонов сохраняются отдельно: появление нового сезона создаёт diff и предупреждение, сохраняя выбранный текущий пул.

Это source facts, а не готовая проекция сайта. RU-переводы, тексты механик, авторские советы, карты, маршруты, spell tooltips и gameplay verification этим адаптером не обновляются. Клиентская сборка и дата публикации источника остаются неизвестными. Известные различия/новые сущности ждут проверки; редакторские данные первого этапа не перезаписываются. При будущем публичном использовании данных сохранять ссылку на Raider.IO.

Forever отклоняется retail-адаптером до сетевого запроса. Для него нужны отдельные источники и таблица соответствий, без автоматической подстановки retail namespace.

## Хранение и повторные запуски

Миграция `00174_game_content_collection.sql` добавляет шесть таблиц:

- `gc_collection_targets`: контекст, модуль, enabled и единственный допустимый режим `collect_only`.
- `gc_collection_runs`: ключ запуска, slot, попытка, fence, результат и безопасный код ошибки.
- `gc_source_artifacts`: неизменяемое тело JSON до 1 МиБ, URL, namespace, locale, adapter version и SHA-256.
- `gc_collection_observations`: время текущей проверки, HTTP 200/304 и условные заголовки. Повторная проверка не меняет первоначальное время артефакта.
- `gc_collection_candidates`: неизменяемые факты и diff, source warnings, base generation и статус `pending_review`.
- `gc_source_cooldowns`: общий Retry-After поставщика для обоих модулей и последующих процессов.

Новый кандидат появляется только при семантическом изменении фактов. Diff сравнивается с последним успешно собранным кандидатом этого модуля; первый запуск показывает исходное добавление фактов. `baseGeneration` фиксирует generation канала на старте. Это ещё не редакторский diff готовой публичной страницы — композиция с публикацией относится к следующему этапу.

Повтор завершённого ключа запуска возвращает сохранённый результат без fetch. Неизменное тело переиспользует артефакт; 304 допустим только с сохранённым телом того же запроса и контекста. Возврат к более ранним данным создаёт новый diff относительно последнего сбора, а не переиспользует старое сравнение.

Session advisory lock разрешает один активный сбор контекста/модуля. Сетевая работа выполняется без длинной SQL-транзакции; выделенное соединение держит lock. После прерывания соединение освобождает lock, повтор повышает fence и attempt. Кандидат и итоговый статус запуска записываются одной транзакцией.

Таймаут HTTP — 25 секунд, всего один source GET на попытку, общий интервал в одном процессе — минимум секунда. Тело и JSON ограничены. Редиректы не выполняются. HTTP 429/503 учитывают Retry-After, общий для модулей и сохранённый в БД. Transient ошибки повторяет River; максимум четыре попытки на запуск, включая snooze. Неверная схема, частичный обязательный состав и постоянные HTTP-ошибки завершают задание без бесконечных повторов. Старые кандидаты и публичная версия сохраняются.

## Расписание

По выбору владельца оба раздела проверяются раз в сутки:

| Модуль | Ежедневный slot UTC |
|---|---|
| Рейды | 03:15 |
| Mythic+ | 03:30 |

Расписание фиксировано в UTC. В Варшаве 22 октября это 05:15/05:30; после осеннего перехода на зимнее время — 04:15/04:30. Ключ содержит полный UTC timestamp с часами и минутами. При старте после простоя выполняется один последний пропущенный slot каждого модуля. Очередь `game_content_collect` имеет одного worker; дубликаты подавляются River и долговечным ключом в `gc_collection_runs`.

В существующем Go server режим по умолчанию `GAME_CONTENT_COLLECTION_MODE=off`. Значение `collect_only` регистрирует два задания и worker после штатного применения миграций. Значения `auto`/`publish` недопустимы. Переменная не переключает frontend reader и не разрешает публикацию. River migrations должны быть применены штатным процессом, как для существующей очереди.

## Локальный запуск

CLI разрешает только собственную loopback-БД `gildra_gc_*` через `GAME_CONTENT_DATABASE_URL`. Production `DATABASE_URL` он не читает. Для свежего изолированного стенда:

```sh
cd backend
go build -o /tmp/gildra-game-content ./cmd/game-content
go build -o /tmp/gildra-content-collector ./cmd/game-content-collector
cd ..

# Строка подключения к собственной отдельной локальной БД.
export GAME_CONTENT_DATABASE_URL='postgres://...@127.0.0.1:15483/gildra_gc_example?sslmode=disable'

/tmp/gildra-game-content init-schema --file backend/migrations/postgres/00173_game_content_releases.sql
/tmp/gildra-content-collector init-schema --file backend/migrations/postgres/00174_game_content_collection.sql
/tmp/gildra-content-collector init-queue
/tmp/gildra-content-collector configure
/tmp/gildra-content-collector worker
```

`init-schema` — только локальный helper, он не ведёт Goose version table. На реальном окружении миграции 173/174 проходят штатный Goose. Не применять локальные helpers к production и не запускать повторно на существующей схеме.

В отдельном терминале с той же переменной:

```sh
# Сразу выполнить сбор, без очереди.
/tmp/gildra-content-collector run --module raids --request-key my-review-1
/tmp/gildra-content-collector run --module mythic-plus --request-key my-review-1

# Поставить ручное задание в ту же очередь.
/tmp/gildra-content-collector enqueue --module raids --request-key queued-review-1

/tmp/gildra-content-collector runs
/tmp/gildra-content-collector inspect --run RUN_UUID
```

В `inspect` доступны facts, diff, предупреждения и ссылки/хеши исходных артефактов. В теле артефакта хранится исходный публичный JSON; он доступен только в закрытой БД. Публичного endpoint кандидатов или staff bridge этот этап не добавляет. CLI не имеет команд approve/publish.

Для отдельного постоянного collector-процесса достаточно новой схемы/прав на коллекционные таблицы и SELECT к `gc_contexts`/`gc_publication_channels`. Прав записи к семи таблицам публикации не требуется — это проверено интеграционным тестом с ограниченной PostgreSQL-ролью. Production API продолжает использовать свою существующую роль; выделение отдельного сервиса/роли выполняется при согласованном релизе.

Выключение worker останавливает локальный процесс. В production режим `off` отключает регистрацию этой очереди и расписания после штатного перезапуска; уже запущенную попытку останавливает graceful shutdown. Снятие задачи с публикации и управление staff относятся к следующим этапам.

## Проверки

```sh
cd backend
GAME_CONTENT_TEST_DATABASE_URL="$GAME_CONTENT_DATABASE_URL" go test -race ./internal/gamecontentcollect ./internal/gamecontent ./internal/config ./internal/datasetrefresh ./cmd/game-content-collector ./cmd/server
go vet ./internal/gamecontentcollect ./internal/config ./cmd/game-content-collector ./cmd/server
```

Тесты без сетевых запросов используют записанные source fixtures; PostgreSQL-сценарии создают только собственные случайные схемы и отдельную временную роль. Без тестовой переменной интеграционные сценарии пропускаются. Реальный ограниченный прогон источников и запуск расписания описаны в отчёте `docs/reports/data-hub-stage2-20261022/REPORT.md`.
