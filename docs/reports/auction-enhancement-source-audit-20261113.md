# Auction enhancement source audit — 2026-11-13

Дополнение: повторная проверка [auction-enhancement-recheck-20261113.md](auction-enhancement-recheck-20261113.md) обнаружила доступные pinned native данные и уточнила блокер. Первоначальное отсутствие локальных выгрузок не доказывало отсутствие всех источников правил.

Вывод: исходный код содержит части цепочки DB2, но доступных проверенных записей и полного контракта совместимости для включения покупаемых камней/чар недостаточно. Нельзя считать блокер закрытым. Это аудит текущих файлов общего checkout, включая уже существующие незакоммиченные изменения; не новая реализация.

## Подтвержденные источники и поля

Пути ниже относительно корня репозитория.

| Данные | Реализация и точный контракт |
|---|---|
| Сырой DB2 | `backend/cmd/db2-import/options.go:14`: в defaultTables есть ItemSparse, ItemXItemEffect, ItemEffect, SpellEffect, SpellItemEnchantment, GemProperties, ItemLimitCategory, SpellEquippedItems, SkillLineAbility. Это список запрашиваемых таблиц, **не доказательство успешного импорта**. `catalog_db2_rows`: build_id, table_name, locale, row_id, payload, source_artifact_id. |
| Предмет → заклинание | `backend/cmd/db2-import/project_items.go:523`: ItemXItemEffect.payload.ItemID → ItemEffectID → ItemEffect.row_id → payload.SpellID. Classic fallback: ItemEffect.payload.ParentItemID при отсутствии соответствующей связи ItemXItemEffect. Проекция `catalog_item_effects`: version_id, item_effect_id, spell_id, trigger_type, player_condition_id, specialization_id, source_artifact_id, spell_target_status. Последний подтверждает наличие SpellName, а не разрешимость улучшения. |
| Заклинание → кандидат enchant ID | `backend/internal/catalogtaxonomy/projections.go:156`: SpellEffect.SpellID связывается с версией заклинания; Effect → effect_type, EffectMiscValue_0 → attributes.misc_value_0, EffectTriggerSpell → attributes.trigger_spell_id. `backend/internal/catalog/description_values.go:360` уже соединяет misc_value_0 с SpellItemEnchantment.row_id в том же build/locale для описаний. Там читаются также ItemLevelMin/ItemLevelMax. Этот join сам по себе не проверяет тип эффекта и применимость чар. |
| Базовые гнёзда | `backend/cmd/db2-import/project_items.go:480`: ItemSparse.SocketType_0..2 > 0 → `catalog_item_sockets(version_id, slot, socket_type)`. Число строк версии — число базовых гнёзд. Не доказано соответствие конкретному auction variant с bonus IDs/модификаторами. |
| Профессия и прочие требования предмета | Там же, строка 493: RequiredSkill, RequiredSkillRank, RequiredAbility, RequiredLevel, AllowableClass, AllowableRaces_0/1 → `catalog_item_requirements` с required_skill_id/rank, required_ability_id, required_level и масками. Отсутствие требования у предмета не доказывает отсутствие требования у enchant/spell. |
| Категория уникальности | `backend/internal/catalogtaxonomy/tooltips.go:317`: ItemSparse.LimitCategory → ItemLimitCategory.row_id; читаются Name_lang и Quantity. Tooltip `limit_category` содержит name/quantity, но не стабильный ID категории и не полные условия ограничения. `required_skill` содержит skill_id/rank. |
| Надетые улучшения | `apps/web/lib/wow/auctionGearEquipment.ts:46`: snapshot enchantments[].enchantment_id/enchantment_slot.id и sockets[].socket_type.type/item.id участвуют в сравнении identity. Это сведения об уже надетом предмете, не каталог совместимых расходников и не подтверждение наличия расходников в сумках. |

## Доступные API и разрыв контракта

- `docs/catalog-api.md`: GET `/world-of-warcraft/retail/v1/game/entity-summaries?product=wow&type=item&...`, затем `/game/entities/{uuid}` и `/game/entities/{uuid}/relationships`. Raw DB2 payload не является публичным контрактом; tooltip — представление, не валидатор совместимости.
- POST `/v1/wow/gear/variants` зарегистрирован в `backend/internal/rotationlab/worker_handler.go`. `GearVariantMetadata` в `gear_variants.go:30` отдаёт itemId, itemLevel, requiredLevel, inventoryType, itemClassId, itemSubclassId, quality, uniqueEquipped, setId, stats, weapon, error. Нет socket count/type, gem properties, категории уникальности, профессии, consumable→enchant mapping. `infra/simc/gear-metadata.patch` экспортирует unique_equipped из ITEM_FLAG_UNIQUE_EQUIPPED; это не групповой лимит камней.
- `backend/internal/rotationlab/model.go` принимает GearChange.enchantId/gemIds; `simc.go:310` пишет enchant_id/gem_id. Проверки диапазона ID и максимум трёх камней в `engine.go` не доказывают совместимость.
- `apps/web/lib/wow/auctionGearCost.ts` правильно оставляет compatibility=unverified, totalCopper=null и budgetCertified=false при запросе улучшений. Данный аудит не даёт оснований снять эту защиту.

## Реальный пример и границы доказательства

В локальном `backend/internal/rotationlab/profiles/MID2_Warrior_Fury.simc:27` есть item 271456, bonus_id 12854/13335/13750, gem_id 240967, enchant_id 7961. Это проверяемая строка существующего профиля, **не** доказательство текущей совместимости и не связь покупаемого consumable item ID с enchant 7961. Аналогично кольца профиля содержат gem 240900/enchant 7967. Использовать эти значения как подбор или ценовое соответствие нельзя.

Полный реальный пример consumable item ID → enchant ID подтвердить не удалось. Поиск доступных файлов не обнаружил соответствующих CSV/DB2 выгрузок; `/opt/gildra-team/data` и `/home/debian` недоступны для листинга (Permission denied), `psql` не найден в PATH. SQL к базе не выполнялся, фактическая заполненность таблиц не измерена. Тестовые fixture ID из provenance/simc tests не использовались как реальные данные. Внешние источники не использовались.

## Что необходимо для закрытия блокера

1. Read-only выборка по конкретному build с artifact provenance: ItemSparse/ItemXItemEffect/ItemEffect/SpellEffect/SpellItemEnchantment для нескольких реальных продаваемых чар. Проверить effect_type и цепочки trigger_spell_id, а не соединять любой misc_value_0 с существующим enchant ID. Зафиксировать положительные и отрицательные примеры.
2. Для камней проверить реальные ключи payload GemProperties и ссылку на них из ItemSparse: в просмотренной реализации нет такого join/нормализованного контракта. Названия полей связи, масок цвета и enchant ID нельзя объявить подтверждёнными без записей. Нужна также явная семантика совместимости типов гнёзд.
3. Проверить реальные поля SpellEquippedItems, SpellItemEnchantment и ограничения применения: слот/класс/подкласс, min/max item level, профессия/ранг, условия персонажа. Таблицы заявлены к импорту, но законченного валидатора и покрытия данных аудит не обнаружил. Неизвестные условия должны отклонять сертификацию.
4. Сохранить ID категории ItemLimitCategory и её семантику/условия, а не только локализованное имя/Quantity. Проверять лимит на всей итоговой экипировке. Наличие дополнительных таблиц условий и их необходимость устанавливать по реальным ссылкам; отсутствие импорта таких таблиц пока не доказано.
5. Добавить build-pinned контракт разрешения улучшения: consumableItemId, enchantId (для чар), gem identity/type, target variant sockets после bonus/modifiers, ограничения, provenance, явный статус unknown. Отдельно нужны подтверждённые профессии персонажа. Только после этого связывать с точными ценовыми лестницами и симулировать ту же оплаченную конфигурацию.

Проверки: чтение исходников/контрактов и поиск локальных артефактов. Импорты, миграции, сервисы, сборки и тесты не запускались. Изменён только этот отчёт; остальные существующие изменения сохранены.
