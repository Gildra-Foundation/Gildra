-- +goose Up
-- The public directory must never calculate its headline count by scanning the
-- complete historical catalog on a request.  Keep an exact, build-aware
-- projection instead: it applies the same usable-item gate and non-empty-name
-- rule as the public summaries endpoint, while raw/review rows remain intact
-- for operations and quality review.
CREATE TABLE catalog_public_summary_stats (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    entity_count BIGINT NOT NULL DEFAULT 0 CHECK (entity_count >= 0),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, locale, entity_type)
);

CREATE INDEX catalog_public_summary_stats_lookup_idx
    ON catalog_public_summary_stats(product_id, locale, entity_type);

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_public_summary_stats(selected_product_id SMALLINT DEFAULT NULL)
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

-- Populate the exact projection before routing production reads to it.
SELECT refresh_catalog_public_summary_stats(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_public_summary_stats(SMALLINT);
DROP TABLE IF EXISTS catalog_public_summary_stats;
