-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_read_models(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO catalog_read_model_state(product_id,status,updated_at)
    SELECT id,'refreshing',now() FROM game_products
    WHERE selected_product_id IS NULL OR id=selected_product_id
    ON CONFLICT (product_id) DO UPDATE SET status='refreshing',error_message='',updated_at=now();

    INSERT INTO catalog_entity_type_registry(product_id,entity_type)
    SELECT DISTINCT product_id,entity_type FROM game_entities
    WHERE deleted_at IS NULL AND published_version_id IS NOT NULL
      AND (selected_product_id IS NULL OR product_id=selected_product_id)
    ON CONFLICT (product_id,entity_type) DO NOTHING;

    INSERT INTO catalog_entity_type_localizations(product_id,entity_type,locale,name)
    SELECT registry.product_id,registry.entity_type,locale.locale,
        initcap(replace(registry.entity_type,'_',' '))
    FROM catalog_entity_type_registry registry
    CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(locale)
    WHERE selected_product_id IS NULL OR registry.product_id=selected_product_id
    ON CONFLICT (product_id,entity_type,locale) DO NOTHING;

    DELETE FROM catalog_entity_type_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    WITH locales(locale) AS (VALUES ('en_US'::text),('ru_RU'::text)),
    base AS (
        SELECT entity.product_id,entity.entity_type,locale.locale,count(*) entity_count,
            count(*) FILTER (WHERE localization.version_id IS NOT NULL) localized_count,
            count(*) FILTER (WHERE localization.description <> '') described_count,
            count(*) FILTER (WHERE tooltip.version_id IS NOT NULL) tooltip_count,
            count(*) FILTER (WHERE COALESCE(source_icon.icon_name,direct_icon.icon_name) IS NOT NULL) icon_count
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        CROSS JOIN locales locale
        LEFT JOIN game_entity_localizations localization ON localization.version_id=version.id AND localization.locale=locale.locale
        LEFT JOIN catalog_entity_tooltips tooltip ON tooltip.version_id=version.id AND tooltip.locale=locale.locale
        LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=version.build_id
            AND source_icon.entity_type=entity.entity_type AND source_icon.external_id=entity.external_id
        LEFT JOIN catalog_file_assets direct_icon ON direct_icon.file_data_id=CASE
            WHEN version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (version.payload->>'icon_file_data_id')::bigint END
        WHERE entity.deleted_at IS NULL AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        GROUP BY entity.product_id,entity.entity_type,locale.locale
    ), public_links AS (
        SELECT link.source_entity_id,link.target_entity_id
        FROM game_entity_links link
        JOIN game_entities source ON source.id=link.source_entity_id AND source.deleted_at IS NULL
        JOIN game_entity_versions source_version ON source_version.id=source.published_version_id
            AND source_version.build_id=link.build_id
        JOIN game_entities target ON target.id=link.target_entity_id AND target.deleted_at IS NULL
        JOIN game_entity_versions target_version ON target_version.id=target.published_version_id
            AND target_version.build_id=link.build_id
        WHERE selected_product_id IS NULL OR source.product_id=selected_product_id OR target.product_id=selected_product_id
    ), relationship_counts AS (
        SELECT product_id,entity_type,sum(count) relationship_count FROM (
            SELECT source.product_id,source.entity_type,count(*) FROM public_links link
            JOIN game_entities source ON source.id=link.source_entity_id GROUP BY source.product_id,source.entity_type
            UNION ALL
            SELECT target.product_id,target.entity_type,count(*) FROM public_links link
            JOIN game_entities target ON target.id=link.target_entity_id GROUP BY target.product_id,target.entity_type
        ) linked GROUP BY product_id,entity_type
    )
    INSERT INTO catalog_entity_type_stats(product_id,entity_type,locale,entity_count,localized_count,described_count,tooltip_count,icon_count,relationship_count,refreshed_at)
    SELECT base.product_id,base.entity_type,base.locale,base.entity_count,base.localized_count,
        base.described_count,base.tooltip_count,base.icon_count,COALESCE(relationship_counts.relationship_count,0),now()
    FROM base LEFT JOIN relationship_counts USING(product_id,entity_type);

    DELETE FROM catalog_category_stats
    WHERE selected_product_id IS NULL OR category_id IN (SELECT id FROM catalog_categories WHERE product_id=selected_product_id);

    WITH RECURSIVE descendants AS (
        SELECT id ancestor_id,id descendant_id FROM catalog_categories
        WHERE selected_product_id IS NULL OR product_id=selected_product_id
        UNION ALL
        SELECT descendants.ancestor_id,child.id FROM descendants
        JOIN catalog_categories child ON child.parent_id=descendants.descendant_id
    )
    INSERT INTO catalog_category_stats(category_id,entity_count,refreshed_at)
    SELECT descendants.ancestor_id,count(DISTINCT entity.id),now()
    FROM descendants
    LEFT JOIN game_entity_categories assignment ON assignment.category_id=descendants.descendant_id
    LEFT JOIN game_entities entity ON entity.published_version_id=assignment.version_id AND entity.deleted_at IS NULL
    GROUP BY descendants.ancestor_id;

    DELETE FROM catalog_field_coverage
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    INSERT INTO catalog_field_coverage(product_id,build_id,entity_type,locale,field_key,entity_count,populated_count,refreshed_at)
    SELECT stats.product_id,published_build.id,stats.entity_type,stats.locale,coverage.field_key,
        stats.entity_count,coverage.populated_count,now()
    FROM catalog_entity_type_stats stats
    JOIN LATERAL (
        SELECT version.build_id AS id
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE entity.product_id=stats.product_id AND entity.deleted_at IS NULL
        GROUP BY version.build_id
        ORDER BY count(*) DESC,version.build_id DESC
        LIMIT 1
    ) published_build ON true
    CROSS JOIN LATERAL (VALUES
        ('localization',stats.localized_count),
        ('description',stats.described_count),
        ('tooltip',stats.tooltip_count),
        ('icon',stats.icon_count),
        ('relationships',LEAST(stats.entity_count,stats.relationship_count))
    ) coverage(field_key,populated_count)
    WHERE selected_product_id IS NULL OR stats.product_id=selected_product_id;

    UPDATE catalog_read_model_state SET status='fresh',generation=generation+1,
        refreshed_at=now(),updated_at=now(),error_message=''
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE catalog_read_model_state SET status='failed',error_message=left(SQLERRM,500),updated_at=now()
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;
    RAISE;
END;
$$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_read_models(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO catalog_read_model_state(product_id,status,updated_at)
    SELECT id,'refreshing',now() FROM game_products
    WHERE selected_product_id IS NULL OR id=selected_product_id
    ON CONFLICT (product_id) DO UPDATE SET status='refreshing',error_message='',updated_at=now();

    INSERT INTO catalog_entity_type_registry(product_id,entity_type)
    SELECT DISTINCT product_id,entity_type FROM game_entities
    WHERE deleted_at IS NULL AND (selected_product_id IS NULL OR product_id=selected_product_id)
    ON CONFLICT (product_id,entity_type) DO NOTHING;

    INSERT INTO catalog_entity_type_localizations(product_id,entity_type,locale,name)
    SELECT registry.product_id,registry.entity_type,locale.locale,
        initcap(replace(registry.entity_type,'_',' '))
    FROM catalog_entity_type_registry registry
    CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(locale)
    WHERE selected_product_id IS NULL OR registry.product_id=selected_product_id
    ON CONFLICT (product_id,entity_type,locale) DO NOTHING;

    DELETE FROM catalog_entity_type_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    WITH locales(locale) AS (VALUES ('en_US'::text),('ru_RU'::text)),
    base AS (
        SELECT entity.product_id,entity.entity_type,locale.locale,count(*) entity_count,
            count(*) FILTER (WHERE localization.version_id IS NOT NULL) localized_count,
            count(*) FILTER (WHERE localization.description <> '') described_count,
            count(*) FILTER (WHERE tooltip.version_id IS NOT NULL) tooltip_count,
            count(*) FILTER (WHERE COALESCE(source_icon.icon_name,direct_icon.icon_name) IS NOT NULL) icon_count
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.latest_version_id
        CROSS JOIN locales locale
        LEFT JOIN game_entity_localizations localization ON localization.version_id=version.id AND localization.locale=locale.locale
        LEFT JOIN catalog_entity_tooltips tooltip ON tooltip.version_id=version.id AND tooltip.locale=locale.locale
        LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=version.build_id
            AND source_icon.entity_type=entity.entity_type AND source_icon.external_id=entity.external_id
        LEFT JOIN catalog_file_assets direct_icon ON direct_icon.file_data_id=CASE
            WHEN version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (version.payload->>'icon_file_data_id')::bigint END
        WHERE entity.deleted_at IS NULL AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        GROUP BY entity.product_id,entity.entity_type,locale.locale
    ), relationship_counts AS (
        SELECT product_id,entity_type,sum(count) relationship_count FROM (
            SELECT source.product_id,source.entity_type,count(*) FROM game_entity_links link
            JOIN game_entities source ON source.id=link.source_entity_id GROUP BY source.product_id,source.entity_type
            UNION ALL
            SELECT target.product_id,target.entity_type,count(*) FROM game_entity_links link
            JOIN game_entities target ON target.id=link.target_entity_id GROUP BY target.product_id,target.entity_type
        ) linked GROUP BY product_id,entity_type
    )
    INSERT INTO catalog_entity_type_stats(product_id,entity_type,locale,entity_count,localized_count,described_count,tooltip_count,icon_count,relationship_count,refreshed_at)
    SELECT base.product_id,base.entity_type,base.locale,base.entity_count,base.localized_count,
        base.described_count,base.tooltip_count,base.icon_count,COALESCE(relationship_counts.relationship_count,0),now()
    FROM base LEFT JOIN relationship_counts USING(product_id,entity_type);

    DELETE FROM catalog_category_stats
    WHERE selected_product_id IS NULL OR category_id IN (SELECT id FROM catalog_categories WHERE product_id=selected_product_id);

    WITH RECURSIVE descendants AS (
        SELECT id ancestor_id,id descendant_id FROM catalog_categories
        WHERE selected_product_id IS NULL OR product_id=selected_product_id
        UNION ALL
        SELECT descendants.ancestor_id,child.id FROM descendants
        JOIN catalog_categories child ON child.parent_id=descendants.descendant_id
    )
    INSERT INTO catalog_category_stats(category_id,entity_count,refreshed_at)
    SELECT descendants.ancestor_id,count(DISTINCT entity.id),now()
    FROM descendants
    LEFT JOIN game_entity_categories assignment ON assignment.category_id=descendants.descendant_id
    LEFT JOIN game_entities entity ON entity.latest_version_id=assignment.version_id AND entity.deleted_at IS NULL
    GROUP BY descendants.ancestor_id;

    DELETE FROM catalog_field_coverage
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    INSERT INTO catalog_field_coverage(product_id,build_id,entity_type,locale,field_key,entity_count,populated_count,refreshed_at)
    SELECT stats.product_id,active_build.id,stats.entity_type,stats.locale,coverage.field_key,
        stats.entity_count,coverage.populated_count,now()
    FROM catalog_entity_type_stats stats
    JOIN LATERAL (
        SELECT build.id FROM game_builds build
        WHERE build.product_id=stats.product_id
        ORDER BY build.is_active DESC,build.build_number DESC LIMIT 1
    ) active_build ON true
    CROSS JOIN LATERAL (VALUES
        ('localization',stats.localized_count),
        ('description',stats.described_count),
        ('tooltip',stats.tooltip_count),
        ('icon',stats.icon_count),
        ('relationships',LEAST(stats.entity_count,stats.relationship_count))
    ) coverage(field_key,populated_count)
    WHERE selected_product_id IS NULL OR stats.product_id=selected_product_id;

    UPDATE catalog_read_model_state SET status='fresh',generation=generation+1,
        refreshed_at=now(),updated_at=now(),error_message=''
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE catalog_read_model_state SET status='failed',error_message=left(SQLERRM,500),updated_at=now()
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;
    RAISE;
END;
$$;
-- +goose StatementEnd
