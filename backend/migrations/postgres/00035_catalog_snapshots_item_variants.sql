-- +goose Up
CREATE TABLE catalog_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id SMALLINT NOT NULL REFERENCES game_products(id),
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    status TEXT NOT NULL DEFAULT 'staging'
        CHECK (status IN ('staging', 'validated', 'published', 'failed', 'superseded')),
    content_hash TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    CHECK (content_hash IS NULL OR btrim(content_hash) <> '')
);
CREATE UNIQUE INDEX catalog_snapshots_source_hash_idx
    ON catalog_snapshots (product_id, build_id, source, content_hash)
    WHERE content_hash IS NOT NULL;
CREATE INDEX catalog_snapshots_published_idx
    ON catalog_snapshots (product_id, build_id DESC, source, published_at DESC)
    WHERE status = 'published';

CREATE TABLE catalog_source_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES catalog_snapshots(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    artifact_key TEXT NOT NULL CHECK (btrim(artifact_key) <> ''),
    locale TEXT NOT NULL DEFAULT '' CHECK (locale = '' OR locale ~ '^[a-z]{2}_[A-Z]{2}$'),
    source_url TEXT NOT NULL CHECK (btrim(source_url) <> ''),
    content_hash BYTEA,
    etag TEXT,
    byte_size BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
    parser_version TEXT NOT NULL DEFAULT '1',
    status TEXT NOT NULL DEFAULT 'fetching'
        CHECK (status IN ('fetching', 'ready', 'failed')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (snapshot_id, artifact_key, locale)
);
CREATE INDEX catalog_source_artifacts_build_idx
    ON catalog_source_artifacts (build_id, source, artifact_key, locale);
CREATE UNIQUE INDEX catalog_source_artifacts_hash_idx
    ON catalog_source_artifacts (source, build_id, artifact_key, locale, content_hash)
    WHERE content_hash IS NOT NULL;

ALTER TABLE catalog_import_runs
    ADD COLUMN snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL;
CREATE INDEX catalog_import_runs_snapshot_idx
    ON catalog_import_runs (snapshot_id)
    WHERE snapshot_id IS NOT NULL;

ALTER TABLE game_entity_versions
    ADD COLUMN snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL,
    ADD COLUMN source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL;
CREATE INDEX game_entity_versions_snapshot_idx
    ON game_entity_versions (snapshot_id, entity_id)
    WHERE snapshot_id IS NOT NULL;
CREATE INDEX game_entity_versions_source_artifact_idx
    ON game_entity_versions (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;

ALTER TABLE catalog_db2_rows
    ADD COLUMN snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL,
    ADD COLUMN source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL;
CREATE INDEX catalog_db2_rows_snapshot_idx
    ON catalog_db2_rows (snapshot_id, table_name, locale, row_id)
    WHERE snapshot_id IS NOT NULL;

CREATE TABLE catalog_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL,
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    variant_key TEXT NOT NULL CHECK (btrim(variant_key) <> ''),
    context_id INTEGER NOT NULL DEFAULT 0 CHECK (context_id >= 0),
    bonus_list_ids INTEGER[] NOT NULL DEFAULT '{}',
    item_level INTEGER CHECK (item_level IS NULL OR item_level >= 0),
    quality INTEGER CHECK (quality IS NULL OR quality >= 0),
    crafted_quality INTEGER CHECK (crafted_quality IS NULL OR crafted_quality >= 0),
    upgrade_track_id INTEGER,
    upgrade_rank INTEGER CHECK (upgrade_rank IS NULL OR upgrade_rank >= 0),
    content_hash BYTEA NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_version_id, variant_key)
);
CREATE INDEX catalog_item_variants_context_idx
    ON catalog_item_variants (context_id, item_level DESC, item_version_id);
CREATE INDEX catalog_item_variants_bonus_ids_idx
    ON catalog_item_variants USING GIN (bonus_list_ids);

CREATE TABLE catalog_item_variant_stats (
    variant_id UUID NOT NULL REFERENCES catalog_item_variants(id) ON DELETE CASCADE,
    stat_index SMALLINT NOT NULL CHECK (stat_index >= 0),
    stat_type INTEGER NOT NULL,
    value NUMERIC,
    allocation NUMERIC,
    socket_cost_rate NUMERIC,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (variant_id, stat_index)
);
CREATE INDEX catalog_item_variant_stats_type_idx
    ON catalog_item_variant_stats (stat_type, variant_id);

CREATE TABLE catalog_item_variant_effects (
    variant_id UUID NOT NULL REFERENCES catalog_item_variants(id) ON DELETE CASCADE,
    effect_index SMALLINT NOT NULL CHECK (effect_index >= 0),
    spell_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    spell_external_id BIGINT,
    trigger_type INTEGER,
    cooldown_ms INTEGER CHECK (cooldown_ms IS NULL OR cooldown_ms >= 0),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (variant_id, effect_index)
);
CREATE INDEX catalog_item_variant_effects_spell_idx
    ON catalog_item_variant_effects (spell_entity_id, variant_id)
    WHERE spell_entity_id IS NOT NULL;

CREATE TABLE catalog_acquisition_observations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    item_entity_id UUID NOT NULL REFERENCES game_entities(id) ON DELETE CASCADE,
    source_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('encounter','creature','quest','vendor','container','world_drop','profession')),
    difficulty_id INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_id >= 0),
    attempts BIGINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    drops BIGINT NOT NULL DEFAULT 0 CHECK (drops >= 0 AND drops <= attempts),
    region TEXT NOT NULL DEFAULT '',
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX catalog_acquisition_observations_item_idx
    ON catalog_acquisition_observations (item_entity_id, build_id, difficulty_id);
CREATE INDEX catalog_acquisition_observations_source_idx
    ON catalog_acquisition_observations (source_entity_id, build_id)
    WHERE source_entity_id IS NOT NULL;

CREATE INDEX game_entity_versions_build_id_idx
    ON game_entity_versions (build_id, entity_id);
CREATE INDEX game_entities_first_seen_build_idx
    ON game_entities (first_seen_build_id)
    WHERE first_seen_build_id IS NOT NULL;
CREATE INDEX game_entities_last_seen_build_idx
    ON game_entities (last_seen_build_id)
    WHERE last_seen_build_id IS NOT NULL;
CREATE INDEX game_entity_links_build_idx
    ON game_entity_links (build_id, relation_type, source_entity_id);

-- +goose Down
DROP INDEX IF EXISTS game_entity_links_build_idx;
DROP INDEX IF EXISTS game_entities_last_seen_build_idx;
DROP INDEX IF EXISTS game_entities_first_seen_build_idx;
DROP INDEX IF EXISTS game_entity_versions_build_id_idx;
DROP TABLE IF EXISTS catalog_acquisition_observations;
DROP TABLE IF EXISTS catalog_item_variant_effects;
DROP TABLE IF EXISTS catalog_item_variant_stats;
DROP TABLE IF EXISTS catalog_item_variants;
ALTER TABLE catalog_db2_rows
    DROP COLUMN IF EXISTS source_artifact_id,
    DROP COLUMN IF EXISTS snapshot_id;
ALTER TABLE game_entity_versions
    DROP COLUMN IF EXISTS source_artifact_id,
    DROP COLUMN IF EXISTS snapshot_id;
ALTER TABLE catalog_import_runs DROP COLUMN IF EXISTS snapshot_id;
DROP TABLE IF EXISTS catalog_source_artifacts;
DROP TABLE IF EXISTS catalog_snapshots;
