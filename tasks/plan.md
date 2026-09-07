# План: довести WoW / Midnight до честной полноты данных

## Цель

Сделать публичный каталог пригодным для игровых решений, а не просто технически
доступным. «Полнота» считается только по подтверждённому игровому набору
сущностей: тестовые, DNT, неиспользуемые и непроверенные записи сохраняются в
сырой БД, но не попадают в публичную выдачу.

Для каждой публичной сущности должны быть известны: происхождение, решение
`eligible/review/excluded`, состояние EN/RU, поля, требуемые для её типа,
состояние медиа и момент последней проверки. Английский fallback разрешён только
с явной маркировкой; он не считается русским переводом.

## Факты на 2026-09-07

- Midnight, активная сборка `12.1.0.69587`: 7 812 item-записей; 6 843 eligible,
  961 review, 8 excluded.
- Публичный запрос пока не использует `catalog_entity_usability`: 961 review
  могут быть показаны. Это блокер.
- Во всём WoW: у предметов есть RU-имя у 175 156 из 213 341 опубликованных;
  у квестов — у 15 025 из 66 902.
- Есть 239 199 неразрешённых шаблонов в описаниях, 619 879 — в tooltip-ах;
  1 495 медиа-объектов ещё не готовы локально; в истории 12 failed imports.

## Архитектурные решения

- Сырой импорт не удаляем. Публичная проекция всегда строится из него через
  versioned quality-gate.
- Решение о пригодности pinned к build и источнику; нельзя вычислять его только
  по имени или ID.
- Для EN и RU храним отдельно `verified`, `fallback`, `missing`, `machine_draft`.
  Только `verified` засчитывается в «полноту перевода».
- Статус `productionReady` должен стать блокирующим для публичного релиза, а не
  пропускать предупреждения о пустых текстах, шаблонах и review-записях.
- Каждая загрузка обязана быть идемпотентной, иметь артефакт-источник и
  возобновляться после ошибки без ручного изменения production-БД.

## Definition of Done

Для активной Midnight-сборки и затем для каждого расширения:

1. 100% `eligible` сущностей имеют EN/RU отображаемое имя; 0 технических имён.
2. Для отображаемых полей нет неразрешённых шаблонов; fallback или draft явно
   помечены и не дают ложный бейдж «полно».
3. Все поля, обязательные в профиле типа, имеют происхождение и валидное
   значение; непроверенные записи не публикуются.
4. Медиа либо закэшировано и отдаётся, либо имеет безопасный remote fallback;
   failed media имеет очередь и причину.
5. Public API использует quality-gate; raw/review доступны только внутреннему
   аудиту.
6. Новый импорт не может ухудшить показатели: CI и production-release блокируют
   регрессию.

## Зависимости

```text
Канонический cohort + quality state
        ├── public API / UI gate
        ├── import + локализация + resolver шаблонов
        │       └── media + факты по типам
        └── audit / dashboard / release gate
```

## Список работ

### Фаза 0 — остановить публикацию мусора

#### Task 1: Зафиксировать исходный quality snapshot

**Описание:** сохранить измеримые baseline-метрики по build, типу, языку,
пустым полям, шаблонам, медиа, import failures и provenance.

**Критерии приёмки:**
- [ ] Один SQL/API report воспроизводимо выдаёт те же сегменты для EN и RU.
- [ ] Метрики привязаны к build `12.1.0.69587`, а не к смешанным версиям.
- [ ] В отчёте отделены raw, eligible, review и excluded.

**Проверка:** production read-only audit и regression fixture.

**Зависимости:** нет. **Размер:** M.

#### Task 2: Подключить Midnight eligibility к public API

**Описание:** изменить list/count/detail/summaries так, чтобы Midnight item
отбирались только из active-build `eligible`; review/excluded не были доступны
через публичные API, поиск и прямой detail URL.

**Критерии приёмки:**
- [ ] Public total Midnight items = 6 843 для текущей сборки.
- [ ] 961 review и 8 excluded дают 404/не входят в поиск.
- [ ] Raw records остаются доступны для внутреннего audit endpoint.

**Проверка:** Go unit/integration tests, API contract tests EN/RU.

**Зависимости:** Task 1. **Размер:** M.

#### Task 3: Ввести единый public quality state

**Описание:** сделать типизированную проекцию `public/held/review/excluded` с
причиной и versioned rule; убрать разрозненные regexp-фильтры как единственную
защиту.

**Критерии приёмки:**
- [ ] Каждая public entity имеет traceable decision и evidence.
- [ ] Отсутствующее имя, DNT/PH marker и invalid media не могут обойти gate.
- [ ] API отдаёт state только внутреннему пользователю, а public не видит held.

**Проверка:** migration tests, query plans, backfill verification.

**Зависимости:** Task 2. **Размер:** M.

#### Task 4: Жёсткий release-gate и truthful UI

**Описание:** перестать называть базу полной, когда есть warning-классы,
заданные профилем как блокирующие; добавить видимый source/language status.

**Критерии приёмки:**
- [ ] Release не проходит при review в public cohort, пустом required field или
  unresolved template.
- [ ] UI не показывает заглушку как переведённый текст.
- [ ] Отчёт показывает denominator и процент, а не только зелёный статус.

**Проверка:** CI negative fixtures, Playwright API-console check.

**Зависимости:** Tasks 1–3. **Размер:** M.

### Checkpoint A — public safety

- [ ] Ни одна review/excluded Midnight item не доступна публично.
- [ ] 100% public rows имеют non-technical display name.
- [ ] Все focused Go/API/UI tests проходят.

### Фаза 1 — сделать Midnight полным вертикальным срезом

#### Task 5: Канонический Midnight denominator

**Описание:** выбрать одну активную сборку и завести cohort для items, maps и
transmog sets; устранить удвоение между `69497` и `69587`.

**Критерии приёмки:**
- [ ] Каждая запись cohort имеет build, source artifact и expansion evidence.
- [ ] Нет дубликатов entity/build/type/external_id.
- [ ] Переход на новую сборку создаёт diff, а не смешивает данные.

**Проверка:** SQL uniqueness and build-diff tests.

**Зависимости:** Tasks 1–3. **Размер:** M.

#### Task 6: Заполнить authoritative EN/RU локализации Midnight

**Описание:** импортировать доступные locale DB2/официальные источники, связать
их с published version и классифицировать остаток `missing/fallback/draft`.

**Критерии приёмки:**
- [ ] 100% eligible Midnight entities имеют verified EN name.
- [ ] RU покрытие и fallback отдельно измеряются; пустых отображаемых строк нет.
- [ ] Каждая локализация имеет source artifact и locale provenance.

**Проверка:** importer tests + EN/RU completeness query.

**Зависимости:** Task 5. **Размер:** L, разбивать по типам при реализации.

#### Task 7: Полнота базовых item-фактов

**Описание:** для eligible Midnight item заполнить slot, class/subclass,
качество, ilvl, требования, stats, effects, sockets, set/recipe/loot links.

**Критерии приёмки:**
- [ ] Поля, требуемые profile для каждого item class, заполнены или честно
  `not_applicable`.
- [ ] Нет dangling links на spells, recipes, rewards и item IDs.
- [ ] Источник каждого факта проверен.

**Проверка:** catalog-audit и type-specific integration fixtures.

**Зависимости:** Tasks 5–6. **Размер:** L, реализовать slices: gear, consumables,
crafting, quest/loot.

#### Task 8: Resolver Blizzard template tokens для Midnight

**Описание:** разрешить `$@spelldesc`, conditional и числовые Blizzard tokens в
описаниях/tooltip с build-aware ссылками на Spell tables.

**Критерии приёмки:**
- [ ] Для eligible Midnight нет unresolved token в public output.
- [ ] Ошибки resolution уходят в review с точной причиной.
- [ ] EN/RU resolver даёт одинаковую структуру, а не склеенный plain text.

**Проверка:** golden tooltip fixtures, malformed-cycle tests.

**Зависимости:** Tasks 5–7. **Размер:** L, разбить parser/resolver/projection.

#### Task 9: Медиа Midnight

**Описание:** переочередить failed/remote media, проверить source URL, cache
key, icon file-data mapping и fallback-политику.

**Критерии приёмки:**
- [ ] Public eligible cards/details не содержат broken image.
- [ ] Каждая проблема имеет retryable/non-retryable reason.
- [ ] Remote fallback имеет HTTPS, allowlist и мониторинг 4xx.

**Проверка:** media worker tests + sampled HTTP checks.

**Зависимости:** Tasks 5–7. **Размер:** M.

#### Task 10: Review-очередь Midnight

**Описание:** дать 961 review-записи приоритизацию, evidence и действия
approve/exclude/defer; не смешивать ручные решения с автоматическим импортом.

**Критерии приёмки:**
- [ ] Очередь сортируется по пользовательскому влиянию и причине.
- [ ] Ручное решение имеет автора, время и source/evidence.
- [ ] Повторный импорт не стирает curator override.

**Проверка:** authorization/audit tests.

**Зависимости:** Tasks 3, 5–9. **Размер:** M.

#### Task 11: Midnight acceptance sweep

**Описание:** прогнать API, UI и репрезентативные игровые сценарии: gear,
профессии, квесты, dungeons, transmog и карты.

**Критерии приёмки:**
- [ ] 100% eligible cohort соответствует Definition of Done.
- [ ] 200 случайных и 100 edge-case записей подтверждены автоматически;
  выборка ручной проверки приложена.
- [ ] Цифры отчёта совпадают с public API total.

**Проверка:** reproducible audit command and Playwright smoke suite.

**Зависимости:** Tasks 6–10. **Размер:** M.

### Checkpoint B — Midnight release candidate

- [ ] 6 843 eligible current-build items проверены по полям и языкам.
- [ ] review/excluded не публикуются; остаток review имеет маршрут обработки.
- [ ] 0 broken images и 0 unresolved public tokens в Midnight.

### Фаза 2 — закрыть крупнейшие пробелы текущего WoW

#### Task 12: Предметы вне Midnight

**Описание:** разделить 38k без имён на valid historical records, raw/test и
реальные incomplete entities; загрузить EN/RU и применить quality gate.

**Критерии приёмки:**
- [ ] Public item denominator не содержит пустых имён.
- [ ] EN/RU coverage публикуется по expansion/build.
- [ ] Технические и unproven rows доступны только в audit.

**Проверка:** segmented completeness regression test.

**Зависимости:** Tasks 2–4. **Размер:** L, идти expansion-by-expansion.

#### Task 13: Квесты — EN и RU

**Описание:** восполнить самый большой языковой разрыв: имена, тексты,
objectives, rewards, quest chains и карты.

**Критерии приёмки:**
- [ ] У public quest нет пустого EN/RU title.
- [ ] RU является verified или явно помеченным fallback, не пустой строкой.
- [ ] Reward/chain/location links валидны.

**Проверка:** quest fixtures + coverage by expansion and locale.

**Зависимости:** Tasks 3–4. **Размер:** L, slices: names, bodies, objectives,
rewards/relations.

#### Task 14: Спеллы и tooltip quality

**Описание:** системно разобрать 239k descriptions и 619k tooltips с
неразрешёнными шаблонами; начать с тех, на которые ссылаются Midnight items,
таланты и квесты.

**Критерии приёмки:**
- [ ] У публичных dependent entities нет raw Blizzard tokens.
- [ ] Resolver имеет coverage по типу token и source build.
- [ ] Неразрешимые случаи held/review, не masquerade as complete.

**Проверка:** resolver corpus and negative API tests.

**Зависимости:** Task 8. **Размер:** XL; разбить на token families.

#### Task 15: Существа, энкаунтеры и лут

**Описание:** заполнить low-coverage creature descriptions/media и привязать
их к encounters, locations, loot и difficulty.

**Критерии приёмки:**
- [ ] Required creature/encounter facts have source proof.
- [ ] Loot references resolve to public eligible items.
- [ ] Отсутствующее медиа не ломает карточку.

**Проверка:** relation-integrity and representative dungeon/raid tests.

**Зависимости:** Tasks 7, 9, 12. **Размер:** L, vertical slice by expansion.

#### Task 16: Профессии, recipes и reagents

**Описание:** довести recipe descriptions, profession links, outputs/reagents,
currencies и quality tiers.

**Критерии приёмки:**
- [ ] 0 unresolved reagent/output links.
- [ ] Public recipes obey language and template rules.
- [ ] Crafting-only item cohort included in item completeness.

**Проверка:** profession integration fixtures.

**Зависимости:** Tasks 7, 12, 14. **Размер:** M.

#### Task 17: Малые типы и explicit not-applicable профили

**Описание:** закрыть gems, enchantments, consumables, seasons, maps, sets,
talents и типы без RU; для неуместных полей задокументировать `not_applicable`.

**Критерии приёмки:**
- [ ] Нет типа, который молча получает 0% RU без статуса.
- [ ] Все public small-type records follow language policy.
- [ ] Profile определяет, нужны ли description, icon и official document.

**Проверка:** one profile test per entity type.

**Зависимости:** Tasks 3–4. **Размер:** L, one type per task.

### Checkpoint C — качество всего WoW

- [ ] Coverage report по каждому type × locale × expansion/build.
- [ ] Нет критичных blank/raw/template/media дефектов в public cohort.
- [ ] All relation and provenance checks pass.

### Фаза 3 — сделать качество постоянным

#### Task 18: Надёжная очередь импортов

**Описание:** разобрать 12 failed imports, добавить typed failure reasons,
retry/backoff, idempotency key, quarantine и alerting.

**Критерии приёмки:**
- [ ] Все 12 failures классифицированы и воспроизводимы.
- [ ] Retry не создаёт duplicate entities/versions.
- [ ] Новая ошибка видна в dashboard и блокирует affected cohort.

**Проверка:** importer failure simulations.

**Зависимости:** Tasks 1, 5. **Размер:** M.

#### Task 19: Quality dashboard и API отчётов

**Описание:** вывести numerator/denominator, языки, assets, templates,
provenance и freshness по build/expansion/type.

**Критерии приёмки:**
- [ ] Один dashboard объясняет, почему cohort held.
- [ ] Цифры совпадают с SQL audit и public API.
- [ ] История показывает ухудшение после импорта.

**Проверка:** snapshot/API contract tests.

**Зависимости:** Tasks 1–4, 18. **Размер:** M.

#### Task 20: Закрепить production policy

**Описание:** внедрить SLO, scheduled audits, canary build, rollback rules и
политику выпуска по типам/расширениям.

**Критерии приёмки:**
- [ ] CI блокирует quality regression.
- [ ] Production deployment требует verified backup, migration and quality gate.
- [ ] Alert приходит до того, как плохой cohort становится публичным.

**Проверка:** CI negative cases and staging deployment rehearsal.

**Зависимости:** Tasks 4, 11, 18–19. **Размер:** M.

## Риски и защита

| Риск | Влияние | Защита |
|---|---|---|
| Смешение build'ов | Неверные факты | build-pinned cohorts и diff |
| AI-перевод выдаётся за официальный | Потеря доверия | отдельный state/provenance, verified-only badge |
| Raw записи возвращаются через поиск/detail | Мусор в публичной БД | единый API gate + negative contract tests |
| DB2 неполон у поставщика | Ложная «100%» | explicit unavailable/not-applicable и source gap queue |
| Большой backfill блокирует production | Деградация | batch/queue, staging restore rehearsal, immutable release |
| Новая загрузка ухудшает покрытие | Регрессия | baseline diff, CI threshold and automatic hold |

## Порядок запуска

Начать с Tasks 1–4, затем выполнить Tasks 5–11 как один Midnight release
candidate. Только после этого массово расширять Tasks 12–17. Tasks 18–20 идут
параллельно после фикса API contract, но production migration/deploy — строго
последовательно и только после проверенного recovery backup.

## Текущий статус реализации

- **Task 1 выполнен локально:** `catalog-audit` получил scoped профиль
  `midnight-active` и отдаёт denominator, EN/RU provenance, template/media/import
  quality snapshot.
- **Task 2 выполнен локально:** public list, search, count, summaries и detail
  теперь пропускают только Midnight `eligible` записи pinned к build. Изменения
  ещё не прошли CI/production-deploy.
- **Task 3 и Task 4 остаются открытыми:** текущая реализация ограничивает
  Midnight, но ещё не даёт единую public quality-state модель для каждого типа и
  не добавляет UI-индикацию статуса.
