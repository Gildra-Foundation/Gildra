-- +goose Up
CREATE TABLE catalog_item_acquisition_methods (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES game_entities(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('drop','quest','vendor','crafting')),
    historical BOOLEAN NOT NULL DEFAULT false,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_id,method)
);

CREATE INDEX catalog_item_acquisition_methods_product_method_idx
    ON catalog_item_acquisition_methods (product_id,method,entity_id);

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_item_acquisition_methods(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM catalog_item_acquisition_methods
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    WITH derived AS (
        SELECT entity.product_id,entity.id AS entity_id,
            CASE
                WHEN source.source_type IN ('encounter','creature','container','world_drop') THEN 'drop'
                WHEN source.source_type='vendor' THEN 'vendor'
                WHEN source.source_type IN ('crafting_recipe','profession') THEN 'crafting'
            END AS method,
            false AS historical
        FROM catalog_item_acquisition_sources source
        JOIN game_entity_versions version ON version.id=source.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
            AND entity.latest_version_id=version.id AND entity.entity_type='item' AND entity.deleted_at IS NULL
        WHERE (selected_product_id IS NULL OR entity.product_id=selected_product_id)
          AND source.source_type IN ('encounter','creature','container','world_drop','vendor','crafting_recipe','profession')

        UNION ALL

        SELECT item.product_id,item.id,'quest',reward_build.build_number<item_build.build_number
        FROM catalog_quest_rewards reward
        JOIN game_builds reward_build ON reward_build.id=reward.build_id
        JOIN game_entities item ON item.id=reward.item_entity_id
            AND item.entity_type='item' AND item.deleted_at IS NULL
        JOIN game_entity_versions item_version ON item_version.id=item.latest_version_id
        JOIN game_builds item_build ON item_build.id=item_version.build_id
        WHERE reward.reward_type='item' AND reward_build.build_number<=item_build.build_number
          AND (selected_product_id IS NULL OR item.product_id=selected_product_id)

        UNION ALL

        SELECT item.product_id,item.id,'quest',reward_build.build_number<item_build.build_number
        FROM catalog_quest_rewards reward
        JOIN game_builds reward_build ON reward_build.id=reward.build_id
        JOIN game_entities item ON item.entity_type='item' AND item.external_id=reward.external_id
            AND item.product_id=reward_build.product_id AND item.deleted_at IS NULL
        JOIN game_entity_versions item_version ON item_version.id=item.latest_version_id
        JOIN game_builds item_build ON item_build.id=item_version.build_id
        WHERE reward.reward_type='item' AND reward.item_entity_id IS NULL
          AND reward_build.build_number<=item_build.build_number
          AND (selected_product_id IS NULL OR item.product_id=selected_product_id)
    )
    INSERT INTO catalog_item_acquisition_methods(product_id,entity_id,method,historical,refreshed_at)
    SELECT product_id,entity_id,method,bool_and(historical),now()
    FROM derived WHERE method IS NOT NULL
    GROUP BY product_id,entity_id,method;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION refresh_all_catalog_read_models(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM refresh_catalog_read_models(selected_product_id);
    PERFORM refresh_catalog_item_acquisition_methods(selected_product_id);
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS refresh_all_catalog_read_models(SMALLINT);
DROP FUNCTION IF EXISTS refresh_catalog_item_acquisition_methods(SMALLINT);
DROP TABLE IF EXISTS catalog_item_acquisition_methods;
