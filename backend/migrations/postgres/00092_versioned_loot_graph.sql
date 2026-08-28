-- +goose Up
-- A loot table is the auditable intermediate node between a source entity and
-- an item.  Rows are immutable observations for one published candidate
-- version/build; release validation decides which generation is public.
CREATE TABLE catalog_loot_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    table_kind TEXT NOT NULL CHECK (table_kind IN (
        'creature','pickpocket','skinning','vendor','container','fishing','other'
    )),
    external_id BIGINT NOT NULL DEFAULT 0 CHECK (external_id >= 0),
    difficulty_id INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_id >= 0),
    source_artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_version_id, table_kind, external_id, difficulty_id, source_artifact_id)
);

CREATE INDEX catalog_loot_tables_owner_idx
    ON catalog_loot_tables (owner_version_id, table_kind, difficulty_id, external_id);
CREATE INDEX catalog_loot_tables_artifact_idx
    ON catalog_loot_tables (source_artifact_id, owner_version_id);

CREATE TABLE catalog_loot_entries (
    loot_table_id UUID NOT NULL REFERENCES catalog_loot_tables(id) ON DELETE CASCADE,
    entry_index INTEGER NOT NULL CHECK (entry_index >= 0),
    item_external_id BIGINT NOT NULL CHECK (item_external_id > 0),
    item_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    resolution_status TEXT NOT NULL CHECK (resolution_status IN ('resolved','source_missing')),
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= min_quantity),
    chance_percent NUMERIC CHECK (chance_percent IS NULL OR (chance_percent >= 0 AND chance_percent <= 100)),
    chance_basis TEXT NOT NULL DEFAULT 'unknown'
        CHECK (chance_basis IN ('source_exact','observed','estimated','unknown')),
    source_artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (loot_table_id, entry_index),
    CHECK ((resolution_status = 'resolved') = (item_entity_id IS NOT NULL)),
    CHECK ((chance_basis = 'unknown') = (chance_percent IS NULL))
);

CREATE INDEX catalog_loot_entries_item_idx
    ON catalog_loot_entries (item_entity_id, loot_table_id)
    WHERE item_entity_id IS NOT NULL;
CREATE INDEX catalog_loot_entries_external_idx
    ON catalog_loot_entries (item_external_id, loot_table_id);
CREATE INDEX catalog_loot_entries_artifact_idx
    ON catalog_loot_entries (source_artifact_id, loot_table_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_loot_entries;
DROP TABLE IF EXISTS catalog_loot_tables;
