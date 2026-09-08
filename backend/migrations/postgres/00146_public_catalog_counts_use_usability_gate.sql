-- +goose Up
-- Public cards already apply catalog_entity_usability at read time.  Keep all
-- cached counts on exactly that same predicate so the UI never advertises raw
-- or review-only client records as publicly available data.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_public_summary_stats(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM catalog_public_summary_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    INSERT INTO catalog_public_summary_stats(product_id,locale,entity_type,entity_count,refreshed_at)
    SELECT entity.product_id, locale.locale, entity.entity_type, count(*), now()
    FROM game_entities entity
    JOIN game_products product ON product.id=entity.product_id
    JOIN game_entity_versions version ON version.id=entity.published_version_id
    CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(locale)
    LEFT JOIN game_entity_localizations localized
        ON localized.version_id=version.id AND localized.locale=locale.locale
    LEFT JOIN game_entity_localizations fallback
        ON fallback.version_id=version.id AND fallback.locale='en_US'
    WHERE entity.deleted_at IS NULL
      AND COALESCE(NULLIF(localized.name,''),fallback.name,'') <> ''
      AND (
          product.slug <> 'wow'
          OR NOT EXISTS (
              SELECT 1 FROM catalog_entity_usability usability
              WHERE usability.product_id=entity.product_id AND usability.build_id=version.build_id
                AND usability.entity_type=entity.entity_type AND usability.external_id=entity.external_id
                AND usability.decision<>'eligible'
          )
      )
      AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
    GROUP BY entity.product_id,locale.locale,entity.entity_type;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION catalog_refresh_library_datasets_v145(selected_product_id SMALLINT DEFAULT NULL)
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
            count(membership.entity_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM catalog_entity_tooltips tooltip
                WHERE tooltip.version_id=membership.version_id
                  AND tooltip.locale=locale.locale
            )) AS tooltip_count,
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_library_datasets(selected_product_id SMALLINT DEFAULT NULL)
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
    ), public_memberships AS MATERIALIZED (
        SELECT membership.*
        FROM memberships membership
        JOIN game_entities entity ON entity.id=membership.entity_id
        WHERE entity.product_id<>(SELECT id FROM game_products WHERE slug='wow')
           OR NOT EXISTS (
                SELECT 1 FROM catalog_entity_usability usability
                WHERE usability.product_id=membership.product_id AND usability.build_id=membership.build_id
                  AND usability.entity_type=entity.entity_type AND usability.external_id=entity.external_id
                  AND usability.decision<>'eligible'
           )
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
            count(membership.entity_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM catalog_entity_tooltips tooltip
                WHERE tooltip.version_id=membership.version_id
                  AND tooltip.locale=locale.locale
            )) AS tooltip_count,
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
        LEFT JOIN public_memberships membership
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

SELECT refresh_catalog_public_summary_stats(NULL);
SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
-- Restore the v145 functions. The preserved helper is the exact v145 library
-- projection; keeping its tooltip expression lets its historical migration
-- continue to downgrade and reapply deterministically.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_public_summary_stats(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM catalog_public_summary_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    INSERT INTO catalog_public_summary_stats(product_id,locale,entity_type,entity_count,refreshed_at)
    SELECT entity.product_id, locale.locale, entity.entity_type, count(*), now()
    FROM game_entities entity
    JOIN game_products product ON product.id=entity.product_id
    JOIN game_entity_versions version ON version.id=entity.published_version_id
    CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(locale)
    LEFT JOIN game_entity_localizations localized
        ON localized.version_id=version.id AND localized.locale=locale.locale
    LEFT JOIN game_entity_localizations fallback
        ON fallback.version_id=version.id AND fallback.locale='en_US'
    LEFT JOIN catalog_entity_usability usability
        ON usability.product_id=entity.product_id AND usability.build_id=version.build_id
        AND usability.entity_type='item' AND usability.external_id=entity.external_id
    WHERE entity.deleted_at IS NULL
      AND COALESCE(NULLIF(localized.name,''),fallback.name,'') <> ''
      AND (
          entity.entity_type <> 'item'
          OR product.slug <> 'wow'
          OR COALESCE(usability.decision,'eligible')='eligible'
      )
      AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
    GROUP BY entity.product_id,locale.locale,entity.entity_type;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_library_datasets(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    /*
            count(membership.entity_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM catalog_entity_tooltips tooltip
                WHERE tooltip.version_id=membership.version_id
                  AND tooltip.locale=locale.locale
            )) AS tooltip_count,
    */
    PERFORM catalog_refresh_library_datasets_v145(selected_product_id);
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_public_summary_stats(NULL);
SELECT refresh_catalog_library_datasets(NULL);
