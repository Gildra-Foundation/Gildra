-- +goose Up
-- Public requests must not discover their source dependency graph by scanning
-- high-cardinality fact/media tables. The graph is rebuilt inside the atomic
-- publication transaction and read as a tiny fail-closed registry.
CREATE TABLE catalog_published_source_dependencies (
    source TEXT PRIMARY KEY CHECK (btrim(source)<>''),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_published_source_dependencies()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE refreshed BIGINT;
BEGIN
    PERFORM set_config('max_parallel_workers_per_gather','0',true);
    DELETE FROM catalog_published_source_dependencies;
    INSERT INTO catalog_published_source_dependencies(source,refreshed_at)
    WITH source_candidates AS (
        SELECT DISTINCT version.source
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_entity_version_artifacts observation ON observation.version_id=entity.published_version_id
        JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_entity_localization_artifacts observation ON observation.version_id=entity.published_version_id
        JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_npc_roles fact ON fact.version_id=entity.published_version_id
        JOIN catalog_source_artifacts artifact ON artifact.id=fact.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_npc_locations fact ON fact.version_id=entity.published_version_id
        JOIN catalog_source_artifacts artifact ON artifact.id=fact.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_item_acquisition_sources fact ON fact.version_id=entity.published_version_id
        JOIN catalog_source_artifacts artifact ON artifact.id=fact.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_loot_tables loot ON loot.owner_version_id=entity.published_version_id
        JOIN catalog_source_artifacts artifact ON artifact.id=loot.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN catalog_loot_tables loot ON loot.owner_version_id=entity.published_version_id
        JOIN catalog_loot_entries entry ON entry.loot_table_id=loot.id
        JOIN catalog_source_artifacts artifact ON artifact.id=entry.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_entity_media media ON media.entity_id=entity.id AND media.build_id=version.build_id
        JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_entity_icons icon ON icon.build_id=version.build_id
            AND icon.entity_type=entity.entity_type AND icon.external_id=entity.external_id
        JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
        WHERE entity.deleted_at IS NULL
        UNION ALL
        SELECT DISTINCT artifact.source
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_entity_icons icon ON icon.build_id=version.build_id
            AND icon.entity_type=entity.entity_type AND icon.external_id=entity.external_id
        JOIN catalog_source_artifacts artifact ON artifact.id=icon.asset_source_artifact_id
        WHERE entity.deleted_at IS NULL
    )
    SELECT DISTINCT source,now() FROM source_candidates;
    GET DIAGNOSTICS refreshed = ROW_COUNT;
    RETURN refreshed;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_published_source_dependencies();

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_published_source_dependencies();
DROP TABLE IF EXISTS catalog_published_source_dependencies;
