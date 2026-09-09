-- +goose Up
-- Retail WoW item statistics are player-facing API values.  They must use the
-- same name and build-pinned usability predicate as public summaries instead
-- of counting raw client rows which cannot be opened by a player.  Other
-- datasets retain their established accounting until each has its own public
-- visibility rule and validation coverage.
ALTER FUNCTION refresh_catalog_library_datasets(SMALLINT)
    RENAME TO refresh_catalog_library_datasets_v149;

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_library_datasets(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM refresh_catalog_library_datasets_v149(selected_product_id);

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
            entity.entity_type,entity.external_id,version.id AS version_id,version.build_id
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type=definition.entity_type
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE definition.is_public AND definition.category_path='' AND definition.item_class_id IS NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT definition.slug,entity.product_id,entity.id,entity.entity_type,entity.external_id,version.id,version.build_id
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type='item'
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_items item ON item.version_id=version.id AND item.item_class_id=definition.item_class_id
        WHERE definition.is_public AND definition.item_class_id IS NOT NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT scope.dataset_slug,entity.product_id,entity.id,entity.entity_type,entity.external_id,version.id,version.build_id
        FROM category_scope scope
        JOIN game_entity_categories assignment ON assignment.category_id=scope.category_id
        JOIN game_entity_versions version ON version.id=assignment.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
          AND entity.published_version_id=version.id AND entity.product_id=scope.product_id
        WHERE entity.deleted_at IS NULL
    ), public_memberships AS MATERIALIZED (
        SELECT membership.*
        FROM memberships membership
        WHERE membership.product_id<>(SELECT id FROM game_products WHERE slug='wow')
           OR NOT EXISTS (
                SELECT 1
                FROM catalog_entity_usability usability
                WHERE usability.product_id=membership.product_id AND usability.build_id=membership.build_id
                  AND usability.entity_type=membership.entity_type AND usability.external_id=membership.external_id
                  AND usability.decision<>'eligible'
           )
    ), locales(locale) AS (VALUES ('en_US'::text),('ru_RU'::text)), visible_memberships AS MATERIALIZED (
        SELECT membership.*,locale.locale,localized.version_id AS localized_version_id
        FROM public_memberships membership
        CROSS JOIN locales locale
        LEFT JOIN game_entity_localizations localized
          ON localized.version_id=membership.version_id AND localized.locale=locale.locale
        LEFT JOIN game_entity_localizations fallback
          ON fallback.version_id=membership.version_id AND fallback.locale='en_US'
        WHERE COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) IS NOT NULL
          AND COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) !~*
              '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\]'
    ), aggregates AS (
        SELECT membership.dataset_slug,membership.product_id,membership.locale,
            max(membership.build_id) AS build_id,
            count(*) AS entity_count,
            count(*) FILTER (WHERE membership.localized_version_id IS NOT NULL) AS localized_count,
            count(*) FILTER (WHERE membership.localized_version_id IS NOT NULL AND EXISTS (
                SELECT 1
                FROM catalog_entity_localization_artifacts observation
                JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
                WHERE observation.version_id=membership.version_id AND observation.locale=membership.locale
                  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
                  AND (artifact.locale='' OR artifact.locale=observation.locale)
            )) AS verified_localized_count,
            count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM catalog_entity_tooltips tooltip
                WHERE tooltip.version_id=membership.version_id AND tooltip.locale=membership.locale
            )) AS tooltip_count,
            count(*) FILTER (WHERE
                EXISTS (SELECT 1
                    FROM catalog_entity_icons icon
                    JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
                    WHERE icon.build_id=membership.build_id AND icon.entity_type=membership.entity_type
                      AND icon.external_id=membership.external_id AND artifact.status='ready'
                      AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)
                OR EXISTS (SELECT 1
                    FROM catalog_file_assets asset
                    JOIN catalog_source_artifacts artifact ON artifact.id=asset.source_artifact_id
                    JOIN game_entity_versions version ON version.id=membership.version_id
                    WHERE asset.file_data_id=CASE
                        WHEN COALESCE(version.payload->>'icon_file_data_id',version.payload #>> '{db2,InventoryIconFileID}',
                            version.payload #>> '{db2,IconFileID}',version.payload #>> '{db2,IconFileDataID}',
                            version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
                        THEN COALESCE(version.payload->>'icon_file_data_id',version.payload #>> '{db2,InventoryIconFileID}',
                            version.payload #>> '{db2,IconFileID}',version.payload #>> '{db2,IconFileDataID}',
                            version.payload #>> '{db2,SpellIconFileID}')::bigint END
                      AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)
                OR EXISTS (SELECT 1
                    FROM catalog_entity_media media
                    JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
                    WHERE media.entity_id=membership.entity_id AND media.build_id=membership.build_id
                      AND media.cache_status IN ('remote','cached') AND artifact.status='ready'
                      AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)
            ) AS image_count,
            min(icon.icon_name) FILTER (WHERE artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL) AS preview_icon_name
        FROM visible_memberships membership
        LEFT JOIN catalog_entity_icons icon
          ON icon.build_id=membership.build_id AND icon.entity_type=membership.entity_type
         AND icon.external_id=membership.external_id
        LEFT JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
        GROUP BY membership.dataset_slug,membership.product_id,membership.locale
    ), targets AS (
        SELECT stats.dataset_slug,stats.product_id,stats.locale,
            COALESCE(aggregate.build_id,stats.build_id) AS build_id,
            COALESCE(aggregate.entity_count,0) AS entity_count,
            COALESCE(aggregate.localized_count,0) AS localized_count,
            COALESCE(aggregate.verified_localized_count,0) AS verified_localized_count,
            COALESCE(aggregate.tooltip_count,0) AS tooltip_count,
            COALESCE(aggregate.image_count,0) AS image_count,
            aggregate.preview_icon_name
        FROM catalog_library_dataset_stats stats
        JOIN catalog_library_dataset_definitions definition
          ON definition.slug=stats.dataset_slug AND definition.entity_type='item'
        JOIN game_products product ON product.id=stats.product_id AND product.slug='wow'
        LEFT JOIN aggregates aggregate
          ON aggregate.dataset_slug=stats.dataset_slug AND aggregate.product_id=stats.product_id AND aggregate.locale=stats.locale
        WHERE selected_product_id IS NULL OR stats.product_id=selected_product_id
    )
    UPDATE catalog_library_dataset_stats stats
    SET build_id=target.build_id,entity_count=target.entity_count,localized_count=target.localized_count,
        verified_localized_count=target.verified_localized_count,tooltip_count=target.tooltip_count,
        image_count=target.image_count,preview_icon_name=COALESCE(target.preview_icon_name,stats.preview_icon_name),refreshed_at=now()
    FROM targets target
    WHERE stats.dataset_slug=target.dataset_slug AND stats.product_id=target.product_id AND stats.locale=target.locale;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_library_datasets(SMALLINT);
ALTER FUNCTION refresh_catalog_library_datasets_v149(SMALLINT)
    RENAME TO refresh_catalog_library_datasets;
SELECT refresh_catalog_library_datasets(NULL);
