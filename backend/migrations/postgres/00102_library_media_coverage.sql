-- +goose Up
-- Dataset image coverage is the union of proven canonical icons, proven
-- FileDataID assets and version-compatible media observations. A media row
-- from a build newer than the public entity version is a candidate and must
-- not change public coverage.
CREATE INDEX catalog_entity_media_entity_build_source_idx
    ON catalog_entity_media(entity_id,build_id,source)
    WHERE entity_id IS NOT NULL AND source_artifact_id IS NOT NULL;

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_library_media_coverage(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
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
            entity.entity_type,entity.external_id,version.id AS version_id,
            version.build_id,version.payload
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type=definition.entity_type
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE definition.is_public AND definition.category_path='' AND definition.item_class_id IS NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT definition.slug,entity.product_id,entity.id,entity.entity_type,
            entity.external_id,version.id,version.build_id,version.payload
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type='item'
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_items item ON item.version_id=version.id AND item.item_class_id=definition.item_class_id
        WHERE definition.is_public AND definition.item_class_id IS NOT NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT scope.dataset_slug,entity.product_id,entity.id,entity.entity_type,
            entity.external_id,version.id,version.build_id,version.payload
        FROM category_scope scope
        JOIN game_entity_categories assignment ON assignment.category_id=scope.category_id
        JOIN game_entity_versions version ON version.id=assignment.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
          AND entity.published_version_id=version.id AND entity.product_id=scope.product_id
        WHERE entity.deleted_at IS NULL
    ), coverage AS (
        SELECT membership.dataset_slug,membership.product_id,
            count(*) FILTER (WHERE
                EXISTS (
                    SELECT 1
                    FROM catalog_entity_icons icon
                    JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
                    WHERE icon.build_id=membership.build_id
                      AND icon.entity_type=membership.entity_type
                      AND icon.external_id=membership.external_id
                      AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                      AND artifact.byte_size IS NOT NULL
                ) OR EXISTS (
                    SELECT 1
                    FROM catalog_file_assets asset
                    JOIN catalog_source_artifacts artifact ON artifact.id=asset.source_artifact_id
                    WHERE asset.file_data_id=CASE
                        WHEN COALESCE(membership.payload->>'icon_file_data_id',
                            membership.payload #>> '{db2,InventoryIconFileID}',
                            membership.payload #>> '{db2,IconFileID}',
                            membership.payload #>> '{db2,IconFileDataID}',
                            membership.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
                        THEN COALESCE(membership.payload->>'icon_file_data_id',
                            membership.payload #>> '{db2,InventoryIconFileID}',
                            membership.payload #>> '{db2,IconFileID}',
                            membership.payload #>> '{db2,IconFileDataID}',
                            membership.payload #>> '{db2,SpellIconFileID}')::bigint END
                      AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                      AND artifact.byte_size IS NOT NULL
                ) OR EXISTS (
                    SELECT 1
                    FROM catalog_entity_media media
                    JOIN game_builds media_build ON media_build.id=media.build_id
                      AND media_build.product_id=membership.product_id
                    JOIN game_builds published_build ON published_build.id=membership.build_id
                      AND published_build.product_id=membership.product_id
                    JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
                    JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
                    WHERE media.entity_id=membership.entity_id
                      AND media_build.build_number<=published_build.build_number
                      AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                      AND artifact.byte_size IS NOT NULL
                )
            ) AS image_count
        FROM memberships membership
        GROUP BY membership.dataset_slug,membership.product_id
    )
    UPDATE catalog_library_dataset_stats stats
    SET image_count=coverage.image_count,refreshed_at=now()
    FROM coverage
    WHERE stats.dataset_slug=coverage.dataset_slug
      AND stats.product_id=coverage.product_id;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_library_media_coverage(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_library_media_coverage(SMALLINT);
DROP INDEX IF EXISTS catalog_entity_media_entity_build_source_idx;
SELECT refresh_catalog_library_datasets(NULL);
