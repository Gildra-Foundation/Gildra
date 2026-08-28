-- +goose Up
-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_library_media_previews(selected_product_id SMALLINT DEFAULT NULL)
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
            version.build_id
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type=definition.entity_type
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN catalog_items item ON item.version_id=version.id
        WHERE definition.is_public AND definition.item_class_id IS NOT NULL
          AND item.item_class_id=definition.item_class_id AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT definition.slug,entity.product_id,entity.id,version.build_id
        FROM catalog_library_dataset_definitions definition
        JOIN game_entities entity ON entity.entity_type=definition.entity_type
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE definition.is_public AND definition.category_path='' AND definition.item_class_id IS NULL
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT scope.dataset_slug,entity.product_id,entity.id,version.build_id
        FROM category_scope scope
        JOIN game_entity_categories assignment ON assignment.category_id=scope.category_id
        JOIN game_entity_versions version ON version.id=assignment.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
          AND entity.published_version_id=version.id AND entity.product_id=scope.product_id
        WHERE entity.deleted_at IS NULL
    ), candidates AS MATERIALIZED (
        SELECT DISTINCT ON (membership.dataset_slug,membership.product_id)
            membership.dataset_slug,membership.product_id,media.id AS media_id
        FROM memberships membership
        JOIN catalog_entity_media media ON media.entity_id=membership.entity_id
          AND media.cache_status='cached' AND media.cached_url IS NOT NULL
          AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL
        JOIN game_builds media_build ON media_build.id=media.build_id
          AND media_build.product_id=membership.product_id
        JOIN game_builds published_build ON published_build.id=membership.build_id
          AND published_build.product_id=membership.product_id
          AND media_build.build_number<=published_build.build_number
        JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
          AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
        JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
        ORDER BY membership.dataset_slug,membership.product_id,
          (media.media_kind='icon') DESC,media.is_primary DESC,
          media_build.build_number DESC,media.updated_at DESC,media.id
    ), selected AS (
        SELECT stats.dataset_slug,stats.product_id,candidate.media_id
        FROM catalog_library_dataset_stats stats
        LEFT JOIN candidates candidate ON candidate.dataset_slug=stats.dataset_slug
          AND candidate.product_id=stats.product_id
        WHERE selected_product_id IS NULL OR stats.product_id=selected_product_id
    )
    UPDATE catalog_library_dataset_stats stats
    SET preview_media_id=selected.media_id
    FROM selected
    WHERE stats.dataset_slug=selected.dataset_slug
      AND stats.product_id=selected.product_id;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_library_media_previews(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_library_media_previews(SMALLINT);
