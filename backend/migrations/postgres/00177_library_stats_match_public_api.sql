-- +goose Up
-- Library counters must describe exactly what the public API returns.
--
-- * entity_count uses the same membership, display-name and usability
--   predicates as /v1/game/entity-summaries?dataset=... for every dataset and
--   product (previously only item datasets applied the display-name filter, so
--   spells advertised 413 935 rows while the API lists 376 463).
-- * image_count counts records for which the API returns an iconUrl: a cached,
--   hash-verified media row backed by a ready artifact and a published source,
--   from a build no newer than the published one (catalog.cachedIconURLs).
--   Icon names and remote-only media no longer count as an image.
-- * Item datasets can narrow an item class by subclass.  Legion artifact relics
--   (gem class 3, subclass 11) move from "Gems" to their own dataset.
--
-- The previous refresh chain (v149 -> v158_base -> Classic quest/recipe
-- wrapper) is replaced by one pass; Classic quest/recipe holds keep working
-- because the shared usability predicate excludes held rows and empty
-- datasets are written as zero instead of being skipped.
ALTER TABLE catalog_library_dataset_definitions
    ADD COLUMN item_subclass_ids INTEGER[],
    ADD COLUMN excluded_item_subclass_ids INTEGER[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT catalog_library_dataset_definitions_subclass_scope_check
        CHECK ((item_subclass_ids IS NULL AND excluded_item_subclass_ids='{}') OR item_class_id IS NOT NULL);

UPDATE catalog_library_dataset_definitions
SET excluded_item_subclass_ids='{11}'
WHERE slug='gems';

-- Every cached dataset counter predates these rules: until the refresh below
-- runs, the API counts dataset totals exactly (catalog.datasetSummaryCount).
UPDATE catalog_library_dataset_definitions SET updated_at=now();

INSERT INTO catalog_library_dataset_definitions(slug,entity_type,category_path,item_class_id,item_subclass_ids,group_key,icon_symbol,sort_order)
VALUES ('artifact-relics','item','',3,'{11}','equipment','#ic-gem',55);

INSERT INTO catalog_library_dataset_localizations(dataset_slug,locale,name,description) VALUES
    ('artifact-relics','en_US','Artifact relics','Legion artifact weapon relics and their structured item facts'),
    ('artifact-relics','ru_RU','Реликвии артефактов','Реликвии для артефактного оружия Легиона и их структурированные свойства');

INSERT INTO catalog_library_dataset_applicability(dataset_slug,product_id,status,reason_en,reason_ru)
SELECT 'artifact-relics',product.id,
    CASE WHEN product.slug='wow' THEN 'applicable' ELSE 'not_applicable' END,
    CASE WHEN product.slug='wow' THEN '' ELSE 'Artifact relics exist only in the retail game since Legion.' END,
    CASE WHEN product.slug='wow' THEN '' ELSE 'Реликвии артефактов есть только в актуальной версии игры начиная с Легиона.' END
FROM game_products product
WHERE product.slug IN ('wow','wow_classic','wow_classic_era','wow_classic_hardcore');

ALTER FUNCTION refresh_catalog_library_datasets(SMALLINT)
    RENAME TO refresh_catalog_library_datasets_v176;
ALTER FUNCTION refresh_catalog_library_media_previews(SMALLINT)
    RENAME TO refresh_catalog_library_media_previews_v176;
ALTER FUNCTION refresh_catalog_public_summary_stats(SMALLINT)
    RENAME TO refresh_catalog_public_summary_stats_v176;
ALTER FUNCTION refresh_catalog_read_models(SMALLINT)
    RENAME TO refresh_catalog_read_models_v176;

-- Facet counts (/v1/game/categories) count the same entities the filtered list
-- returns. Category stats carry no locale, so the display-name rule uses the
-- primary site locale (ru_RU, falling back to en_US like the API).
-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_read_models(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM refresh_catalog_read_models_v176(selected_product_id);

    DELETE FROM catalog_category_stats
    WHERE selected_product_id IS NULL
       OR category_id IN (SELECT id FROM catalog_categories WHERE product_id=selected_product_id);

    WITH RECURSIVE descendants AS (
        SELECT id ancestor_id,id descendant_id FROM catalog_categories
        WHERE selected_product_id IS NULL OR product_id=selected_product_id
        UNION ALL
        SELECT descendants.ancestor_id,child.id FROM descendants
        JOIN catalog_categories child ON child.parent_id=descendants.descendant_id
    ), visible AS MATERIALIZED (
        SELECT DISTINCT assignment.category_id,entity.id AS entity_id
        FROM game_entity_categories assignment
        JOIN catalog_categories category ON category.id=assignment.category_id
        JOIN game_entities entity ON entity.published_version_id=assignment.version_id
          AND entity.product_id=category.product_id AND entity.entity_type=category.entity_type
          AND entity.deleted_at IS NULL
        JOIN game_entity_versions version ON version.id=assignment.version_id
        LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale='ru_RU'
        LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
        WHERE (selected_product_id IS NULL OR category.product_id=selected_product_id)
          AND COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) IS NOT NULL
          AND COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) !~*
              '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\]'
          AND NOT EXISTS (
              SELECT 1 FROM catalog_entity_usability usability
              WHERE usability.product_id=entity.product_id AND usability.build_id=version.build_id
                AND usability.entity_type=entity.entity_type AND usability.external_id=entity.external_id
                AND usability.decision<>'eligible'
          )
          AND (entity.entity_type<>'quest'
            OR entity.product_id<>(SELECT id FROM game_products WHERE slug='wow')
            OR EXISTS (
                SELECT 1 FROM catalog_entity_usability usability
                WHERE usability.product_id=entity.product_id AND usability.build_id=version.build_id
                  AND usability.entity_type='quest' AND usability.external_id=entity.external_id
                  AND usability.decision='eligible'
            ))
    )
    INSERT INTO catalog_category_stats(category_id,entity_count,refreshed_at)
    SELECT descendants.ancestor_id,count(DISTINCT visible.entity_id),now()
    FROM descendants
    LEFT JOIN visible ON visible.category_id=descendants.descendant_id
    GROUP BY descendants.ancestor_id;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_library_datasets(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM catalog_library_dataset_stats stats
    USING catalog_library_dataset_definitions definition
    WHERE definition.slug=stats.dataset_slug AND NOT definition.is_public
      AND (selected_product_id IS NULL OR stats.product_id=selected_product_id);

    WITH RECURSIVE category_scope(dataset_slug,product_id,category_id) AS (
        SELECT definition.slug,category.product_id,category.id
        FROM catalog_library_dataset_definitions definition
        JOIN catalog_categories category
          ON category.entity_type=definition.entity_type AND category.path=definition.category_path
        WHERE definition.is_public AND definition.category_path<>'' AND definition.item_class_id IS NULL
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
        JOIN game_entities entity ON entity.entity_type=definition.entity_type
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_items item ON item.version_id=version.id AND item.item_class_id=definition.item_class_id
        WHERE definition.is_public AND definition.item_class_id IS NOT NULL
          AND (definition.item_subclass_ids IS NULL OR item.item_subclass_id=ANY(definition.item_subclass_ids))
          AND (item.item_subclass_id IS NULL OR item.item_subclass_id<>ALL(definition.excluded_item_subclass_ids))
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
        UNION
        SELECT scope.dataset_slug,entity.product_id,entity.id,entity.entity_type,entity.external_id,version.id,version.build_id
        FROM category_scope scope
        JOIN game_entity_categories assignment ON assignment.category_id=scope.category_id
        JOIN game_entity_versions version ON version.id=assignment.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
          AND entity.published_version_id=version.id AND entity.product_id=scope.product_id
        JOIN catalog_library_dataset_definitions definition ON definition.slug=scope.dataset_slug
          AND definition.entity_type=entity.entity_type
        WHERE entity.deleted_at IS NULL
    ), public_memberships AS MATERIALIZED (
        -- Same as catalog.publicCatalogUsabilityPredicate.
        SELECT membership.*
        FROM memberships membership
        WHERE NOT EXISTS (
                SELECT 1 FROM catalog_entity_usability usability
                WHERE usability.product_id=membership.product_id AND usability.build_id=membership.build_id
                  AND usability.entity_type=membership.entity_type AND usability.external_id=membership.external_id
                  AND usability.decision<>'eligible'
            )
          AND (membership.entity_type<>'quest'
            OR membership.product_id<>(SELECT id FROM game_products WHERE slug='wow')
            OR EXISTS (
                SELECT 1 FROM catalog_entity_usability usability
                WHERE usability.product_id=membership.product_id AND usability.build_id=membership.build_id
                  AND usability.entity_type='quest' AND usability.external_id=membership.external_id
                  AND usability.decision='eligible'
            ))
    ), servable_media AS MATERIALIZED (
        -- Same as catalog.cachedIconURLs: only these rows produce an iconUrl.
        SELECT DISTINCT media.entity_id
        FROM catalog_entity_media media
        JOIN game_entities entity ON entity.id=media.entity_id
        JOIN game_entity_versions published ON published.id=entity.published_version_id
        JOIN game_builds published_build ON published_build.id=published.build_id
          AND published_build.product_id=entity.product_id
        JOIN game_builds media_build ON media_build.id=media.build_id
          AND media_build.product_id=entity.product_id
        JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
        JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
        WHERE media.cache_status='cached' AND NULLIF(media.cached_url,'') IS NOT NULL
          AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL
          AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
          AND media_build.build_number<=published_build.build_number
          AND entity.deleted_at IS NULL
          AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
    ), locales(locale) AS (VALUES ('en_US'::text),('ru_RU'::text)), visible_memberships AS MATERIALIZED (
        -- Same as catalog.publicCatalogDisplayNamePredicate.
        SELECT membership.dataset_slug,membership.product_id,membership.version_id,membership.build_id,
            membership.entity_type,membership.external_id,locale.locale,
            localized.version_id IS NOT NULL AS localized,
            servable.entity_id IS NOT NULL AS has_image
        FROM public_memberships membership
        CROSS JOIN locales locale
        LEFT JOIN game_entity_localizations localized
          ON localized.version_id=membership.version_id AND localized.locale=locale.locale
        LEFT JOIN game_entity_localizations fallback
          ON fallback.version_id=membership.version_id AND fallback.locale='en_US'
        LEFT JOIN servable_media servable ON servable.entity_id=membership.entity_id
        WHERE COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) IS NOT NULL
          AND COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) !~*
              '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\]'
    ), aggregates AS (
        SELECT membership.dataset_slug,membership.product_id,membership.locale,
            max(membership.build_id) AS build_id,
            count(*) AS entity_count,
            count(*) FILTER (WHERE membership.localized) AS localized_count,
            count(*) FILTER (WHERE membership.localized AND EXISTS (
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
            count(*) FILTER (WHERE membership.has_image) AS image_count,
            min(icon.icon_name) FILTER (WHERE artifact.status='ready' AND artifact.content_hash IS NOT NULL
                AND artifact.byte_size IS NOT NULL) AS preview_icon_name
        FROM visible_memberships membership
        LEFT JOIN catalog_entity_icons icon
          ON icon.build_id=membership.build_id AND icon.entity_type=membership.entity_type
         AND icon.external_id=membership.external_id
        LEFT JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
        GROUP BY membership.dataset_slug,membership.product_id,membership.locale
    )
    INSERT INTO catalog_library_dataset_stats AS stats(
        dataset_slug,product_id,locale,build_id,entity_count,localized_count,verified_localized_count,
        tooltip_count,image_count,preview_icon_name,refreshed_at
    )
    SELECT definition.slug,product.id,locale.locale,aggregate.build_id,
        COALESCE(aggregate.entity_count,0),COALESCE(aggregate.localized_count,0),
        COALESCE(aggregate.verified_localized_count,0),COALESCE(aggregate.tooltip_count,0),
        COALESCE(aggregate.image_count,0),aggregate.preview_icon_name,now()
    FROM catalog_library_dataset_definitions definition
    CROSS JOIN game_products product
    CROSS JOIN locales locale
    LEFT JOIN aggregates aggregate
      ON aggregate.dataset_slug=definition.slug AND aggregate.product_id=product.id AND aggregate.locale=locale.locale
    WHERE definition.is_public
      AND (selected_product_id IS NULL OR product.id=selected_product_id)
    ON CONFLICT (dataset_slug,product_id,locale) DO UPDATE
    SET build_id=COALESCE(EXCLUDED.build_id,stats.build_id),
        entity_count=EXCLUDED.entity_count,
        localized_count=EXCLUDED.localized_count,
        verified_localized_count=EXCLUDED.verified_localized_count,
        tooltip_count=EXCLUDED.tooltip_count,
        image_count=EXCLUDED.image_count,
        preview_icon_name=EXCLUDED.preview_icon_name,
        refreshed_at=EXCLUDED.refreshed_at;
END;
$$;
-- +goose StatementEnd

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
        JOIN catalog_items item ON item.version_id=version.id AND item.item_class_id=definition.item_class_id
        WHERE definition.is_public AND definition.item_class_id IS NOT NULL
          AND (definition.item_subclass_ids IS NULL OR item.item_subclass_id=ANY(definition.item_subclass_ids))
          AND (item.item_subclass_id IS NULL OR item.item_subclass_id<>ALL(definition.excluded_item_subclass_ids))
          AND entity.deleted_at IS NULL
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
        JOIN catalog_library_dataset_definitions definition ON definition.slug=scope.dataset_slug
          AND definition.entity_type=entity.entity_type
        WHERE entity.deleted_at IS NULL
    ), candidates AS MATERIALIZED (
        SELECT DISTINCT ON (membership.dataset_slug,membership.product_id)
            membership.dataset_slug,membership.product_id,media.id AS media_id
        FROM memberships membership
        JOIN catalog_entity_media media ON media.entity_id=membership.entity_id
          AND media.cache_status='cached' AND NULLIF(media.cached_url,'') IS NOT NULL
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

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_public_summary_stats(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM catalog_public_summary_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    -- Type totals use the same display-name and usability predicates as the
    -- unfiltered public summary list.
    INSERT INTO catalog_public_summary_stats(product_id,locale,entity_type,entity_count,refreshed_at)
    SELECT entity.product_id,locale.locale,entity.entity_type,count(*),now()
    FROM game_entities entity
    CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(locale)
    JOIN game_entity_versions version ON version.id=entity.published_version_id
    LEFT JOIN game_entity_localizations localized
        ON localized.version_id=version.id AND localized.locale=locale.locale
    LEFT JOIN game_entity_localizations fallback
        ON fallback.version_id=version.id AND fallback.locale='en_US'
    WHERE entity.deleted_at IS NULL
      AND COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) IS NOT NULL
      AND COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) !~*
          '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\]'
      AND NOT EXISTS (
          SELECT 1 FROM catalog_entity_usability usability
          WHERE usability.product_id=entity.product_id AND usability.build_id=version.build_id
            AND usability.entity_type=entity.entity_type AND usability.external_id=entity.external_id
            AND usability.decision<>'eligible'
      )
      AND (entity.entity_type<>'quest'
        OR entity.product_id<>(SELECT id FROM game_products WHERE slug='wow')
        OR EXISTS (
            SELECT 1 FROM catalog_entity_usability usability
            WHERE usability.product_id=entity.product_id AND usability.build_id=version.build_id
              AND usability.entity_type='quest' AND usability.external_id=entity.external_id
              AND usability.decision='eligible'
        ))
      AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
    GROUP BY entity.product_id,locale.locale,entity.entity_type;
END;
$$;
-- +goose StatementEnd

-- No refresh here: a full pass over production takes longer than the API
-- health window of a release (it reads every published localization,
-- tooltip and localization artifact). Run it once after this migration, outside
-- a release, and the next catalog publication keeps it current:
--   SELECT refresh_catalog_read_models(NULL);
--   SELECT refresh_catalog_public_summary_stats(NULL);
--   SELECT refresh_catalog_library_datasets(NULL);
--   SELECT refresh_catalog_library_media_previews(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_read_models(SMALLINT);
ALTER FUNCTION refresh_catalog_read_models_v176(SMALLINT)
    RENAME TO refresh_catalog_read_models;
DROP FUNCTION IF EXISTS refresh_catalog_public_summary_stats(SMALLINT);
DROP FUNCTION IF EXISTS refresh_catalog_library_media_previews(SMALLINT);
DROP FUNCTION IF EXISTS refresh_catalog_library_datasets(SMALLINT);
ALTER FUNCTION refresh_catalog_public_summary_stats_v176(SMALLINT)
    RENAME TO refresh_catalog_public_summary_stats;
ALTER FUNCTION refresh_catalog_library_media_previews_v176(SMALLINT)
    RENAME TO refresh_catalog_library_media_previews;
ALTER FUNCTION refresh_catalog_library_datasets_v176(SMALLINT)
    RENAME TO refresh_catalog_library_datasets;

DELETE FROM catalog_library_dataset_definitions WHERE slug='artifact-relics';
ALTER TABLE catalog_library_dataset_definitions
    DROP CONSTRAINT catalog_library_dataset_definitions_subclass_scope_check,
    DROP COLUMN excluded_item_subclass_ids,
    DROP COLUMN item_subclass_ids;
-- Stats keep their last values until the restored functions are run again.
