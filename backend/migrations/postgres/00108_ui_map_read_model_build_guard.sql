-- +goose Up
-- UiMap is a public dataset/read model in its own right.  This guard is
-- invoked after an atomic DB2 release refreshes read models and verifies that
-- its published UiMap identities and their dataset statistics are pinned to
-- the build selected by that release.
-- +goose StatementBegin
CREATE FUNCTION assert_catalog_ui_map_read_model(
    selected_product_id SMALLINT,
    selected_build_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    published_ui_maps BIGINT;
    entity_stat_rows BIGINT;
    dataset_stat_rows BIGINT;
BEGIN
    IF selected_product_id IS NULL OR selected_build_id IS NULL THEN
        RAISE EXCEPTION 'ui_map read model requires product and build IDs';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM game_builds build
        WHERE build.id=selected_build_id AND build.product_id=selected_product_id
          AND build.is_active
    ) THEN
        RAISE EXCEPTION 'ui_map read model build % is not the active build for product %',
            selected_build_id,selected_product_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM catalog_read_model_state state
        WHERE state.product_id=selected_product_id AND state.status='fresh'
    ) THEN
        RAISE EXCEPTION 'ui_map read model is not fresh for product %', selected_product_id;
    END IF;

    SELECT count(*) INTO published_ui_maps
    FROM game_entities entity
    JOIN game_entity_versions version ON version.id=entity.published_version_id
    WHERE entity.product_id=selected_product_id AND entity.entity_type='ui_map'
      AND entity.deleted_at IS NULL AND version.build_id=selected_build_id;

    IF published_ui_maps=0 OR EXISTS (
        SELECT 1
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE entity.product_id=selected_product_id AND entity.entity_type='ui_map'
          AND entity.deleted_at IS NULL AND version.build_id<>selected_build_id
    ) THEN
        RAISE EXCEPTION 'published ui_map identities are not pinned to build % for product %',
            selected_build_id,selected_product_id;
    END IF;

    SELECT count(*) INTO entity_stat_rows
    FROM catalog_entity_type_stats stats
    WHERE stats.product_id=selected_product_id AND stats.entity_type='ui_map'
      AND stats.locale IN ('en_US','ru_RU') AND stats.entity_count=published_ui_maps;

    IF entity_stat_rows<>2 THEN
        RAISE EXCEPTION 'ui_map entity read model is incomplete for product %: rows=% expected=2',
            selected_product_id,entity_stat_rows;
    END IF;

    SELECT count(*) INTO dataset_stat_rows
    FROM catalog_library_dataset_definitions definition
    JOIN catalog_library_dataset_stats stats ON stats.dataset_slug=definition.slug
    WHERE definition.slug='ui-maps' AND definition.entity_type='ui_map'
      AND definition.is_public AND stats.product_id=selected_product_id
      AND stats.locale IN ('en_US','ru_RU') AND stats.build_id=selected_build_id
      AND stats.entity_count=published_ui_maps;

    IF dataset_stat_rows<>2 THEN
        RAISE EXCEPTION 'ui-maps dataset read model is incomplete for product % build %: rows=% expected=2',
            selected_product_id,selected_build_id,dataset_stat_rows;
    END IF;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS assert_catalog_ui_map_read_model(SMALLINT,BIGINT);
