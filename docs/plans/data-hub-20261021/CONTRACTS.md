# Контракты Gildra Data Hub

Предлагаемые интерфейсы. Они не существуют в действующем приложении на момент проектирования. Имена `gc_*` — рабочие имена новых таблиц, точные номера миграций выбираются при реализации после проверки свежего состояния репозитория.

## 1. Идентичность и контекст

```ts
type Edition = "retail" | "forever";
type Channel = "live" | "beta" | "ptr";
type CapabilityState = "supported" | "unsupported" | "unknown";

type ContentContext = {
  game: "wow";
  edition: Edition;
  channel: Channel;
  region: string; // global, eu, us и др. из реестра
  progression: {
    kind: "season" | "phase" | "none";
    id: string | null;
  };
};

type EntityRef = {
  entityId: string;       // постоянный внутренний ID
  edition: Edition;
  kind: "raid" | "dungeon" | "encounter" | "npc" | "spell" | "item" | "map";
  upstream: {
    provider: string;
    namespace: string;   // тип и пространство ID источника
    id: string;
  };
};
```

Внутренний ID сохраняется при новом build и переименовании. Существующие UUID и manifest ID сопоставляются через явную таблицу соответствий. Build и progression входят в область версий и отношений сущностей, а не заставляют создавать новую сущность после каждого патча. ID поставщика не считается глобально уникальным.

Стабильный `moduleContextKey` включает game, edition, channel, region, moduleId, progression.kind и progression.id. Полная сериализация канонична и имеет версию; `null` и отсутствующее поле не равнозначны. Локализованные значения находятся внутри снимка с контекстом `enUS`/`ruRU`.

Для каждого адаптера отдельно задаётся отображение этого контекста на реальный namespace/branch/API. Namespace Forever пока неизвестен и не выводится автоматически из retail.

## 2. Контракт адаптера источника

```text
describe() -> SourceDescriptor
probe(context, previousArtifact) -> unchanged | changed | unsupported | unavailable
fetch(context, pinnedSourceVersion, requestBudget) -> SourceArtifact
decode(artifact) -> SourceRecords + DecodeReport
```

`SourceDescriptor` содержит id, версию адаптера, поддерживаемые контексты, разрешённые домены и пути, формат, максимальные размеры, политику частоты и ссылку на условия использования. Отсутствие поддержки возвращается явным результатом.

`SourceArtifact` содержит:

| Поле | Назначение |
|---|---|
| `artifactId`, `sourceId`, `adapterVersion` | Воспроизводимый вход конкретного адаптера |
| `context`, `requestedVersion`, `observedVersion` | Что запросили и что фактически получили |
| `contentBuild`, `locale` | Точная сборка и локаль, если применимы |
| `sourcePublishedAt`, `fetchedAt` | Время источника и время получения; первое может быть неизвестно |
| `sourceUrl`, `etag`, `lastModified` | Происхождение и условные запросы |
| `sha256`, `sizeBytes`, `storageRef` | Целостность и ссылка на сохранённое тело без секретов |
| `completeness`, `warnings` | Полный ответ, страница из набора или неполная выгрузка |

Ответ 304 используется только с сохранённым телом того же запроса и контекста. Он подтверждает отсутствие изменения представления, но не меняет `sourcePublishedAt` и не доказывает исправность игры. HTML страницы блокировки и неожиданный формат не сохраняются как успешный исходный набор.

Сетевой этап не получает доступ на публикацию. Секреты читаются на сервере из существующего хранилища и не входят в URL, метаданные, логи или public DTO. Общий URL fetch из админки не предоставляется: используются зарегистрированные sourceId и ограниченные параметры.

## 3. Контракт предметного модуля

```text
describe() -> ModuleDescriptor
plan(context, previousSnapshot, availableSources) -> RequiredArtifacts
normalize(context, artifacts, identityMap) -> DomainCandidate
validate(candidate, dependencySnapshots) -> ValidationReport
diff(previousSnapshot, candidate) -> ChangeSet
assessImpact(changes, editorialDependencies) -> ImpactReport
project(candidate, editorialVersion) -> PublicProjection
```

`ModuleDescriptor`:

```ts
type ModuleDescriptor = {
  moduleId: string;              // retail.raids, retail.mythic-plus и т. п.
  moduleVersion: string;
  contextSchemaVersion: number;
  snapshotSchemaVersion: number;
  publicSchemaVersion: number;
  capabilities: Record<string, CapabilityState>;
  dependencies: string[];        // id общих модулей/снимков
  sources: string[];
  policyId: string;
  policyVersion: number;
};
```

Разбор формата внешнего сайта находится в адаптере. Правила о составе рейда, таймере и принадлежности способности находятся в предмете. Запись active pointer, права и транзакции находятся у издателя. Код модуля не меняет исходники frontend и не публикует данные напрямую.

Исходный запуск можно воспроизвести по artifact hash, версиям адаптера/модуля, схеме, политике и базе соответствий. Текущая дата не влияет на семантический хеш содержимого.

## 4. Факт и доказательство

```ts
type Evidence = {
  artifactId: string;
  sourceId: string;
  locator: string;       // JSON path, DB2 row/column или точный фрагмент
  sourceUrl: string;
  sourceKind: string;    // из согласованного с completion-contract реестра
  checkedAt: string;
  contentBuild: string | null;
};

type Fact<T> = {
  value: T | null;
  status: "verified" | "identity_only" | "unverified" | "conflict" | "missing";
  evidence: Evidence[];
  sourcePublishedAt: string | null;
  locale?: "enUS" | "ruRU";
  difficultyId?: string;
};
```

`checkedAt` меняется только после успешной проверки соответствующего поля по подходящему источнику. Срок свежести рассчитывается отдельно по времени источника и политике. Неизвестная дата источника не заменяется временем запроса.

Сложность, роль, вариант способности и родительский encounter задаются структурными ссылками. Имя не служит ключом. Один spellId с разными значениями по сложностям имеет несколько вариантов. Неразрешённый шаблон, `$...`, ссылка на неизвестную величину или неразобранная управляющая разметка не превращаются в готовое описание.

Различаются `identityVerified`, `descriptionVerified`, `effectVerified`, `portraitVerified` и `gameplayVerified`. Публичная проекция не повышает статус одного поля из-за проверки соседнего поля.

## 5. Редакторский слой

Редакторская запись содержит target entity/field или stable routeId, локаль, значение, автора, причину, version, доказательства и точные зависимости. Зависимость может указывать конкретную версию факта, difficulty, map/floor или состав группы.

Композиция для публикации:

```text
Нормализованные факты
  + закреплённая версия редакторских пояснений
  + совместимые маршруты и назначения
  = неизменяемая публичная проекция снимка
```

Пользовательские назначения группы хранятся в своих workspace, не в общем контенте. Импорт не меняет их. Удалённая способность становится конфликтом назначения и требует явного действия пользователя.

Статусы тактики: `draft`, `source_reviewed`, `gameplay_verified`, `needs_review`, `incompatible`. Дата подтверждения в игре и использованный build остаются историческими фактами. Если зависимый spell/map изменился, новое состояние получает `needs_review` или `incompatible`; прежняя проверка не удаляется из истории.

Редакторская правка, изменяющая подтверждённое значение игры, требует причины и доказательства, хранится как отдельное утверждение и проходит правила предметного модуля. Она не может незаметно перезаписать источник.

## 6. Хранение

Все таблицы принадлежат одному новому Go-компоненту `gamecontent`. Существующие jobs передают ему команды. Python сохраняет исходные артефакты и возвращает результаты сбора через внутренний контракт; прямые записи в таблицы публикации ему не нужны.

| Таблица/хранилище | Содержимое и ограничения |
|---|---|
| `gc_contexts` | Уникальный moduleContextKey, moduleId, настройки расписания и политики |
| `gc_runs` | runKey, точный scheduledFor, статус, попытки, lease/fence, результат, безопасная сводка ошибки; UNIQUE(contextId, runKey) |
| `gc_artifacts` + закрытое хранилище тел | Источники, хеши, версии и метаданные; один исходный файл переиспользуется несколькими модулями |
| `gc_module_snapshots` | Неизменяемые нормализованные данные, public projection, coverage и evidence refs; схема и семантический хеш |
| `gc_candidates` | baseGeneration, snapshotId, diff, отчёты, policyVersion, approval hash и решение |
| `gc_editorial_versions` | Неизменяемые версии правок и зависимостей; опубликованный snapshot закрепляет одну версию |
| `gc_releases` | Манифест совместимых moduleId → snapshotId и dependency hashes; content hash |
| `gc_publication_channels` | Область публикации edition/channel/region/progression, currentReleaseId и возрастающий generation |
| `gc_publication_events` | Кто/что/почему переключил версию, предыдущая и следующая generation; включая откат |
| `gc_outbox` | Надёжная доставка события publication_changed для кеша и read model |

Публикационный канал может обслуживать несколько сайтов, читающих одну версию игры; сайт задаёт разрешённый канал и локали. Разные сайты с редакторскими отличиями используют разные каналы. Чтение не выбирает канал по произвольному клиентскому URL без серверной конфигурации.

Небольшой структурированный payload удобно хранить в JSONB. Крупные сжатые выгрузки и медиа хранятся по хешу в закрытом каталоге/существующем объектном хранилище; выбор после измерения размеров. Ссылки на артефакты — идентификаторы, не доступные пользователю пути файловой системы.

Для MVP достаточно индексов по контексту, runKey, времени и entity refs. Retention сначала измеряется: активные снимки, кандидаты на просмотр и последние версии для отката не удаляются; очистка остальных артефактов учитывает все ссылки. Аудит решений хранится отдельно от тяжёлых тел.

## 7. Жизненный цикл и атомарность

Запуск: `queued → running → no_change | candidate_ready | failed | cancelled`.

Кандидат: `pending_review | ready → approved → published`; отрицательное решение — `rejected`. Автоматика даёт `approved` с актором `policy:<id>:<version>`, человек — с проверенным staff ID. Изменение содержимого отменяет прежнее одобрение.

Порядок публикации:

1. Сетевой сбор и нормализация выполняются вне транзакции публикации.
2. Кандидат закрепляет артефакты, данные, политику, редакторскую версию, baseGeneration и зависимости. Проверяется хеш полного утверждаемого изменения.
3. Под блокировкой контекста издатель перечитывает действующий канал. Просроченный lease/fence, изменившийся policy или baseGeneration приводят к повторному сравнению; старое одобрение не переносится на новый diff.
4. Издатель собирает манифест из новых снимков и прежних совместимых снимков других модулей. Общая зависимость при необходимости публикуется вместе с потребителями. Несовместимый зависимый модуль блокирует этот пакет, но не независимый канал другой edition.
5. В одной транзакции проверяются схема и внешние связи, создаётся release, выполняется CAS по ожидаемой generation, пишутся publication event и outbox.
6. После commit читатели видят только полный релиз. Повтор команды с тем же idempotency key возвращает тот же результат.

Пример: обновляется только таймер M+. Release закрепляет новый snapshot M+ и прежний snapshot рейдов. Если меняется общий набор spell IDs, издатель проверяет все затронутые зависимости перед переключением.

Откат — новая публикация прежнего совместимого release с новой generation и причиной. Фоновое задание, стартовавшее до отката, не может вернуть старый кандидат поверх него. Откат данных не выполняет восстановление всей прикладной БД.

Потеря сети, crash после fetch, невалидная локаль и частичная выгрузка не меняют active pointer. Нулевой набор не означает удаление всех боссов. Отсутствие сущности превращается в предложение удаления после проверки полноты и явного решения.

## 8. Политика автоматических изменений

Начальная конфигурация всех модулей — `collect_only`. После приёмки:

```text
autoAllowed:
  - source_recheck_without_semantic_change
  - exact_localized_name_with_trusted_identity
  - publication_safe_description_with_same_verified_context
  - existing_dungeon_timer_under_explicit_source_and_delta_policy

reviewRequired:
  - structure_or_identity_change
  - source_conflict_or_build_mismatch
  - ability_effect_or_difficulty_change
  - map_or_coordinate_transform_change
  - editorial_or_route_change
```

Без заданного численного порога таймеры остаются `review_required`. Предложение для первого включения: не более 120 секунд за изменение и не более 10% от предыдущего значения одновременно, положительное целое число секунд и точное совпадение сезона/подземелья. Дополнительно требуется согласие двух независимых подходящих источников либо одного явно утверждённого авторитетного структурированного источника. Это проектные пороги для согласования по реальным изменениям, а не сведения о правилах Blizzard.

Текст допускается автоматически только при точном ID и контексте, успешном разборе, отсутствии числовых/механических противоречий и корректном источнике локали. Выделение механически значимых изменений консервативно: сомнение отправляет diff на просмотр.

## 9. Предлагаемые API

Публичные read-only маршруты в существующем Go API:

```text
GET /v1/game-content/wow/{edition}/catalog?channel=live&region=eu&progression=...
GET /v1/game-content/releases/{releaseId}/raids
GET /v1/game-content/releases/{releaseId}/raids/{raidSlug}
GET /v1/game-content/releases/{releaseId}/raids/{raidSlug}/bosses/{bossSlug}
GET /v1/game-content/releases/{releaseId}/dungeons
GET /v1/game-content/releases/{releaseId}/dungeons/{dungeonSlug}
GET /v1/game-content/releases/{releaseId}/dungeons/{dungeonSlug}/routes/{routeId}
```

Публичный catalog выдаёт только разрешённую edition/channel и releaseId. Чтение произвольного releaseId также проверяет публичность его канала; beta, редакторские кандидаты и закрытые версии не становятся публичными по знанию UUID. Связанные запросы используют один releaseId. Неподдерживаемые возможности возвращают явный код, без перехода на retail.

Внутренние команды через server-to-server мост существующей CMS:

```text
POST /internal/v1/game-content/contexts/{contextId}/refresh
GET  /internal/v1/game-content/runs/{runId}
GET  /internal/v1/game-content/candidates/{candidateId}
POST /internal/v1/game-content/candidates/{candidateId}/approve
POST /internal/v1/game-content/candidates/{candidateId}/reject
POST /internal/v1/game-content/channels/{channelId}/rollback
POST /internal/v1/game-content/contexts/{contextId}/pause
```

`refresh` возвращает `202 {runId}`. Все команды имеют Idempotency-Key. `approve` закрепляет candidateHash, policyVersion и baseGeneration. `rollback` указывает конкретный целевой releaseId, ожидаемую generation и причину. Ошибка конкуренции — `409`, несовместимая схема/контекст — `422` с безопасным кодом.

Для staff проверяются роль, область сайта/канала и разрешённое действие. Для моста проверяются техническая идентичность и подписанный контекст действующего сотрудника; реализация зависит от существующей схемы CMS. Идентификатор сотрудника из произвольного заголовка клиента не считается аутентификацией.

## 10. Доставка на страницы

Public DTO содержит schemaVersion, releaseId, контекст, доступные возможности, coverage, опубликованные данные и точные сведения о проверках. Сырые ответы источников и staff audit не выдаются.

`lib/data` сначала получает catalog/manifest, затем читает нужные части по его releaseId. Компоненты не повторяют выбор активного сезона. Счётчики выводятся из каталога, число боссов не определяется по числу stop в авторском маршруте.

Cache key: publication channel + releaseId + projection + locale. Неизменяемые public release responses имеют ETag по хешу. Указатель активного релиза кешируется до 60 секунд; данные frontend — до 5 минут либо до события инвалидирования. При потере события повторный запрос указателя восстанавливает актуальность.

SSR читает кешированную опубликованную проекцию и передаёт клиенту только нужный фрагмент. Отсутствие RU-текста не скрывается выдуманным переводом: модуль либо удерживает обязательный блок, либо разрешает явно помеченный цельный EN fallback согласно принятому контракту локализации.

Существующие адреса сохраняются. Смена названия не меняет slug автоматически; при одобренной смене адреса создаётся alias/redirect по стабильной сущности. Индекс, вложенные страницы и sitemap используют одну опубликованную версию.
