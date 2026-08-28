-- +goose Up
-- Public library datasets are named, stable views over the canonical catalog.
-- They never copy entity payloads: membership always points at the published
-- entity version, so a failed import cannot replace the last good release.
CREATE TABLE catalog_library_dataset_definitions (
    slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    category_path TEXT NOT NULL DEFAULT '' CHECK (category_path = '' OR category_path ~ '^[a-z0-9][a-z0-9_/-]{0,190}$'),
    item_class_id INTEGER CHECK (item_class_id IS NULL OR item_class_id >= 0),
    group_key TEXT NOT NULL CHECK (group_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    icon_symbol TEXT NOT NULL DEFAULT '',
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_library_dataset_localizations (
    dataset_slug TEXT NOT NULL REFERENCES catalog_library_dataset_definitions(slug) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (dataset_slug, locale)
);

CREATE TABLE catalog_library_dataset_stats (
    dataset_slug TEXT NOT NULL REFERENCES catalog_library_dataset_definitions(slug) ON DELETE CASCADE,
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    build_id BIGINT REFERENCES game_builds(id) ON DELETE SET NULL,
    entity_count BIGINT NOT NULL DEFAULT 0 CHECK (entity_count >= 0),
    localized_count BIGINT NOT NULL DEFAULT 0 CHECK (localized_count BETWEEN 0 AND entity_count),
    verified_localized_count BIGINT NOT NULL DEFAULT 0 CHECK (verified_localized_count BETWEEN 0 AND localized_count),
    tooltip_count BIGINT NOT NULL DEFAULT 0 CHECK (tooltip_count BETWEEN 0 AND entity_count),
    image_count BIGINT NOT NULL DEFAULT 0 CHECK (image_count BETWEEN 0 AND entity_count),
    preview_icon_name TEXT,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_slug, product_id, locale)
);

CREATE INDEX catalog_library_dataset_stats_product_idx
    ON catalog_library_dataset_stats (product_id, locale, refreshed_at DESC, dataset_slug);

INSERT INTO catalog_library_dataset_definitions(slug,entity_type,category_path,item_class_id,group_key,icon_symbol,sort_order) VALUES
('items','item','',NULL,'equipment','#ic-bag',10),
('weapons','item','equipment/weapons',2,'equipment','#ic-sword',20),
('armor','item','equipment/armor',4,'equipment','#ic-shield',30),
('consumables','item','',0,'equipment','#ic-bag',40),
('gems','item','',3,'equipment','#ic-gem',50),
('reagents','item','',5,'equipment','#ic-hammer',60),
('trade-goods','item','',7,'equipment','#ic-bag',70),
('item-enhancements','item','',8,'equipment','#ic-spark',80),
('spells','spell','',NULL,'combat','#ic-spark',100),
('classes','class','',NULL,'combat','#ic-sword',110),
('specializations','specialization','',NULL,'combat','#ic-sword',120),
('pvp-talents','pvp_talent','',NULL,'combat','#ic-spark',130),
('instances','instance','',NULL,'encounters','#ic-shield',200),
('encounters','encounter','',NULL,'encounters','#ic-skull',210),
('professions','profession','',NULL,'crafting','#ic-hammer',300),
('recipes','recipe','',NULL,'crafting','#ic-hammer',300),
('quests','quest','',NULL,'world','#ic-scroll',400),
('npcs','creature','',NULL,'world','#ic-skull',410),
('maps','map','',NULL,'world','#ic-map',420),
('areas','area','',NULL,'world','#ic-map',430),
('factions','faction','',NULL,'world','#ic-shield',440),
('currencies','currency','',NULL,'collections','#ic-gem',500),
('mounts','mount','',NULL,'collections','#ic-shield',510),
('battle-pets','battle_pet','',NULL,'collections','#ic-star',520),
('toys','toy','',NULL,'collections','#ic-star',530),
('transmog-sets','transmog_set','',NULL,'collections','#ic-star',540),
('achievements','achievement','',NULL,'collections','#ic-gem',550);

INSERT INTO catalog_library_dataset_localizations(dataset_slug,locale,name,description) VALUES
('items','en_US','Items','All published items and equipment'),
('items','ru_RU','Предметы','Все опубликованные предметы и экипировка'),
('weapons','en_US','Weapons','Weapons grouped by type and equipment rules'),
('weapons','ru_RU','Оружие','Оружие по типам и правилам экипировки'),
('armor','en_US','Armor','Armor grouped by material and equipment slot'),
('armor','ru_RU','Броня','Броня по материалу и слоту экипировки'),
('consumables','en_US','Consumables','Food, potions, flasks and other consumable items'),
('consumables','ru_RU','Расходуемые предметы','Еда, зелья, настои и другие расходуемые предметы'),
('gems','en_US','Gems','Socketable gems and their structured item facts'),
('gems','ru_RU','Самоцветы','Самоцветы для гнёзд и их структурированные свойства'),
('reagents','en_US','Reagents','Items classified by the client as reagents'),
('reagents','ru_RU','Реагенты','Предметы, классифицированные клиентом как реагенты'),
('trade-goods','en_US','Trade goods','Materials and profession trade goods'),
('trade-goods','ru_RU','Ремесленные товары','Материалы и товары для профессий'),
('item-enhancements','en_US','Item enhancements','Enchantments and other item enhancements'),
('item-enhancements','ru_RU','Улучшения предметов','Зачарования и другие улучшения предметов'),
('spells','en_US','Spells','Abilities, auras and structured spell effects'),
('spells','ru_RU','Заклинания','Способности, ауры и структурированные эффекты'),
('classes','en_US','Classes','Playable and client-defined classes'),
('classes','ru_RU','Классы','Игровые и клиентские классы'),
('specializations','en_US','Specializations','Class specializations and ownership links'),
('specializations','ru_RU','Специализации','Специализации классов и связи принадлежности'),
('pvp-talents','en_US','PvP talents','PvP talents, spell links and requirements'),
('pvp-talents','ru_RU','PvP-таланты','PvP-таланты, связанные заклинания и требования'),
('instances','en_US','Instances','Dungeons, raids and other journal instances'),
('instances','ru_RU','Подземелья и рейды','Инстансы из журнала приключений'),
('encounters','en_US','Encounters','Boss encounters and journal relationships'),
('encounters','ru_RU','Боссы','Сражения с боссами и связи журнала приключений'),
('professions','en_US','Professions','Skill lines, recipe ownership and requirements'),
('professions','ru_RU','Профессии','Линии навыков, рецепты и требования'),
('quests','en_US','Quests','Quest objectives, chains and verified rewards'),
('quests','ru_RU','Задания','Цели, цепочки и подтверждённые награды'),
('npcs','en_US','NPCs','Creatures, vendors, trainers and quest givers'),
('npcs','ru_RU','NPC','Существа, продавцы, тренеры и квестодатели'),
('maps','en_US','Maps','Client maps and parent-child world structure'),
('maps','ru_RU','Карты','Карты клиента и иерархия игрового мира'),
('areas','en_US','Areas','Zones, subzones and map ownership'),
('areas','ru_RU','Зоны','Зоны, подзоны и принадлежность картам'),
('factions','en_US','Factions','Factions and reputation identities'),
('factions','ru_RU','Фракции','Фракции и идентификаторы репутации'),
('recipes','en_US','Recipes','Crafting outputs, reagents and professions'),
('recipes','ru_RU','Рецепты','Результаты ремесла, реагенты и профессии'),
('currencies','en_US','Currencies','Currency identities and client metadata'),
('currencies','ru_RU','Валюты','Валюты и клиентские метаданные'),
('mounts','en_US','Mounts','Collectible mounts and their acquisition links'),
('mounts','ru_RU','Маунты','Коллекционный транспорт и способы получения'),
('battle-pets','en_US','Battle pets','Collectible battle-pet species'),
('battle-pets','ru_RU','Боевые питомцы','Коллекционные виды боевых питомцев'),
('toys','en_US','Toys','Collectible toys and their effects'),
('toys','ru_RU','Игрушки','Коллекционные игрушки и их эффекты'),
('transmog-sets','en_US','Transmog sets','Appearance sets and collection metadata'),
('transmog-sets','ru_RU','Комплекты трансмогрификации','Комплекты обликов и метаданные коллекции'),
('achievements','en_US','Achievements','Achievements, criteria and rewards'),
('achievements','ru_RU','Достижения','Достижения, критерии и награды');

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_library_datasets(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM catalog_library_dataset_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    WITH RECURSIVE category_scope(dataset_slug,product_id,category_id) AS (
        SELECT definition.slug,category.product_id,category.id
        FROM catalog_library_dataset_definitions definition
        JOIN catalog_categories category
          ON category.entity_type=definition.entity_type AND category.path=definition.category_path
        WHERE definition.category_path<>'' AND definition.item_class_id IS NULL AND definition.is_public
          AND (selected_product_id IS NULL OR category.product_id=selected_product_id)
        UNION ALL
        SELECT scope.dataset_slug,scope.product_id,child.id
        FROM category_scope scope
        JOIN catalog_categories child ON child.parent_id=scope.category_id
    ), memberships AS MATERIALIZED (
        SELECT definition.slug AS dataset_slug,entity.product_id,entity.id AS entity_id,
            version.id AS version_id,version.build_id
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type=definition.entity_type
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE definition.is_public AND definition.category_path='' AND definition.item_class_id IS NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT definition.slug,entity.product_id,entity.id,version.id,version.build_id
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type='item'
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_items item ON item.version_id=version.id AND item.item_class_id=definition.item_class_id
        WHERE definition.is_public AND definition.item_class_id IS NOT NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT scope.dataset_slug,entity.product_id,entity.id,version.id,version.build_id
        FROM category_scope scope
        JOIN game_entity_categories assignment ON assignment.category_id=scope.category_id
        JOIN game_entity_versions version ON version.id=assignment.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
          AND entity.published_version_id=version.id AND entity.product_id=scope.product_id
        WHERE entity.deleted_at IS NULL
    ), locales(locale) AS (VALUES ('en_US'::text),('ru_RU'::text)), aggregates AS (
        SELECT definition.slug,product.id AS product_id,locale.locale,
            max(membership.build_id) AS build_id,
            count(membership.entity_id) AS entity_count,
            count(membership.entity_id) FILTER (WHERE localization.version_id IS NOT NULL) AS localized_count,
            count(membership.entity_id) FILTER (WHERE localization.version_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM catalog_entity_localization_artifacts observation
                JOIN catalog_source_artifacts localization_artifact ON localization_artifact.id=observation.source_artifact_id
                WHERE observation.version_id=membership.version_id AND observation.locale=locale.locale
                  AND localization_artifact.status='ready' AND localization_artifact.content_hash IS NOT NULL
                  AND localization_artifact.byte_size IS NOT NULL
                  AND (localization_artifact.locale='' OR localization_artifact.locale=observation.locale)
            )) AS verified_localized_count,
            -- Every public entity detail is assembled as a source-backed tooltip.
            -- Stored game text is enriched with normalized facts and provenance;
            -- therefore tooltip availability follows published membership.
            count(membership.entity_id) AS tooltip_count,
            count(membership.entity_id) FILTER (WHERE membership.entity_id IS NOT NULL AND (
                EXISTS (SELECT 1 FROM catalog_entity_icons icon
                    JOIN catalog_source_artifacts icon_artifact ON icon_artifact.id=icon.source_artifact_id
                    WHERE icon.build_id=membership.build_id
                      AND icon.entity_type=definition.entity_type
                      AND icon.external_id=entity.external_id
                      AND icon_artifact.status='ready' AND icon_artifact.content_hash IS NOT NULL
                      AND icon_artifact.byte_size IS NOT NULL)
                OR EXISTS (SELECT 1 FROM catalog_file_assets asset
                    JOIN catalog_source_artifacts file_artifact ON file_artifact.id=asset.source_artifact_id
                    JOIN game_entity_versions selected_version ON selected_version.id=membership.version_id
                    WHERE asset.file_data_id=CASE
                        WHEN COALESCE(selected_version.payload->>'icon_file_data_id',selected_version.payload #>> '{db2,InventoryIconFileID}',
                            selected_version.payload #>> '{db2,IconFileID}',selected_version.payload #>> '{db2,IconFileDataID}',
                            selected_version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
                        THEN COALESCE(selected_version.payload->>'icon_file_data_id',selected_version.payload #>> '{db2,InventoryIconFileID}',
                            selected_version.payload #>> '{db2,IconFileID}',selected_version.payload #>> '{db2,IconFileDataID}',
                            selected_version.payload #>> '{db2,SpellIconFileID}')::bigint END
                      AND file_artifact.status='ready' AND file_artifact.content_hash IS NOT NULL
                      AND file_artifact.byte_size IS NOT NULL)
                OR EXISTS (SELECT 1 FROM catalog_entity_media media
                    JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
                    WHERE media.entity_id=membership.entity_id AND media.build_id=membership.build_id
                      AND media.cache_status IN ('remote','cached') AND artifact.status='ready'
                      AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)
            )) AS image_count,
            min(preview_icon.icon_name) FILTER (WHERE preview_icon_artifact.status='ready'
                AND preview_icon_artifact.content_hash IS NOT NULL
                AND preview_icon_artifact.byte_size IS NOT NULL) AS preview_icon_name
        FROM catalog_library_dataset_definitions definition
        CROSS JOIN game_products product
        CROSS JOIN locales locale
        LEFT JOIN memberships membership
          ON membership.dataset_slug=definition.slug AND membership.product_id=product.id
        LEFT JOIN game_entities entity ON entity.id=membership.entity_id
        LEFT JOIN game_entity_localizations localization
          ON localization.version_id=membership.version_id AND localization.locale=locale.locale
        LEFT JOIN catalog_entity_icons preview_icon
          ON preview_icon.build_id=membership.build_id
         AND preview_icon.entity_type=definition.entity_type
         AND preview_icon.external_id=entity.external_id
        LEFT JOIN catalog_source_artifacts preview_icon_artifact
          ON preview_icon_artifact.id=preview_icon.source_artifact_id
        WHERE definition.is_public
          AND (selected_product_id IS NULL OR product.id=selected_product_id)
        GROUP BY definition.slug,product.id,locale.locale
    )
    INSERT INTO catalog_library_dataset_stats(
        dataset_slug,product_id,locale,build_id,entity_count,localized_count,verified_localized_count,tooltip_count,image_count,preview_icon_name,refreshed_at
    )
    SELECT slug,product_id,locale,build_id,entity_count,localized_count,verified_localized_count,tooltip_count,image_count,preview_icon_name,now()
    FROM aggregates;
END;
$$;
-- +goose StatementEnd

-- Initial backfill is intentionally part of the migration. It reads only
-- published versions, leaving the current public release untouched.
SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_library_datasets(SMALLINT);
DROP TABLE IF EXISTS catalog_library_dataset_stats;
DROP TABLE IF EXISTS catalog_library_dataset_localizations;
DROP TABLE IF EXISTS catalog_library_dataset_definitions;
