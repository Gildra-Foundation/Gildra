-- +goose Up
-- 00158 correctly filters Classic quest/recipe rows from the public library,
-- but an UPDATE ... FROM aggregate has no source row when every record is
-- held. Reset those stale cached counts explicitly so the UI cannot advertise
-- the raw registry denominator after a quality refresh.
-- +goose StatementBegin
DO $$
DECLARE
    product_record RECORD;
    dataset_record RECORD;
    current_build BIGINT;
BEGIN
    FOR product_record IN
        SELECT id
        FROM game_products
        WHERE slug IN ('wow_classic','wow_classic_era','wow_classic_hardcore')
    LOOP
        SELECT max(version.build_id) INTO current_build
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE entity.product_id=product_record.id
          AND entity.entity_type IN ('quest','recipe')
          AND entity.deleted_at IS NULL;

        FOR dataset_record IN
            SELECT slug,entity_type
            FROM catalog_library_dataset_definitions
            WHERE is_public AND category_path='' AND item_class_id IS NULL
              AND entity_type IN ('quest','recipe')
        LOOP
            UPDATE catalog_library_dataset_stats
            SET build_id=current_build,
                entity_count=0,
                localized_count=0,
                verified_localized_count=0,
                tooltip_count=0,
                image_count=0,
                preview_icon_name=NULL,
                refreshed_at=now()
            WHERE dataset_slug=dataset_record.slug
              AND product_id=product_record.id;
        END LOOP;
    END LOOP;
END;
$$;
-- +goose StatementEnd

-- +goose Down
-- Cached stats are rebuilt by the normal library refresh; no raw rows are
-- changed by this correction.
