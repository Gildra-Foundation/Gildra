-- +goose Up
-- Resolution remains a fail-closed staging operation. These columns record
-- whether an ATT reference can be tied to a build-proven canonical identity;
-- they do not project relationships into the public catalog.
ALTER TABLE catalog_staged_source_references
    ADD COLUMN resolution_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (resolution_status IN ('pending','resolved','unresolved','ambiguous','excluded')),
    ADD COLUMN resolution_reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Preserve any manually reviewed target IDs created before the explicit
-- reference status columns existed.
UPDATE catalog_staged_source_references
SET resolution_status='resolved',resolution_reason='',updated_at=now()
WHERE target_entity_id IS NOT NULL;
UPDATE catalog_staged_source_nodes
SET resolution_status='resolved',resolution_reason='',updated_at=now()
WHERE resolved_entity_id IS NOT NULL AND resolution_status<>'resolved';

ALTER TABLE catalog_staged_source_references
    ADD CONSTRAINT catalog_staged_source_references_resolution_check
    CHECK ((resolution_status = 'resolved') = (target_entity_id IS NOT NULL));

ALTER TABLE catalog_staged_source_nodes
    ADD CONSTRAINT catalog_staged_source_nodes_resolution_check
    CHECK ((resolution_status = 'resolved') = (resolved_entity_id IS NOT NULL));

CREATE INDEX catalog_staged_source_references_resolution_idx
    ON catalog_staged_source_references (resolution_status, node_id, id);

CREATE TABLE catalog_source_entity_type_mappings (
    source TEXT NOT NULL REFERENCES catalog_source_policies(source) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    disposition TEXT NOT NULL CHECK (disposition IN ('resolve','exclude')),
    canonical_entity_type TEXT CHECK (
        canonical_entity_type IS NULL OR canonical_entity_type ~ '^[a-z][a-z0-9_]{1,63}$'
    ),
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, source_type),
    CHECK (
        (disposition = 'resolve' AND canonical_entity_type IS NOT NULL AND btrim(reason) = '')
        OR
        (disposition = 'exclude' AND canonical_entity_type IS NULL AND btrim(reason) <> '')
    )
);

INSERT INTO catalog_source_entity_type_mappings (
    source, source_type, disposition, canonical_entity_type, reason
) VALUES
    ('all_the_things','achievement','resolve','achievement',''),
    ('all_the_things','achievement_criteria','resolve','achievement_criteria',''),
    ('all_the_things','battle_pet','resolve','battle_pet',''),
    ('all_the_things','creature','resolve','creature',''),
    ('all_the_things','currency','resolve','currency',''),
    ('all_the_things','encounter','resolve','encounter',''),
    ('all_the_things','faction','resolve','faction',''),
    ('all_the_things','game_object','resolve','game_object',''),
    ('all_the_things','item','resolve','item',''),
    ('all_the_things','map','resolve','map',''),
    ('all_the_things','mount','resolve','mount',''),
    ('all_the_things','quest','resolve','quest',''),
    -- ATT recipe IDs are spell IDs in the canonical catalog.
    ('all_the_things','recipe','resolve','spell',''),
    ('all_the_things','spell','resolve','spell',''),
    ('all_the_things','toy','resolve','toy',''),
    ('all_the_things','custom_header','exclude',NULL,'non_game_header');

CREATE TABLE catalog_source_resolution_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES catalog_snapshots(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    source TEXT NOT NULL REFERENCES catalog_source_policies(source),
    status TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
    node_total BIGINT NOT NULL DEFAULT 0 CHECK (node_total >= 0),
    node_resolved BIGINT NOT NULL DEFAULT 0 CHECK (node_resolved >= 0),
    node_unresolved BIGINT NOT NULL DEFAULT 0 CHECK (node_unresolved >= 0),
    node_ambiguous BIGINT NOT NULL DEFAULT 0 CHECK (node_ambiguous >= 0),
    node_excluded BIGINT NOT NULL DEFAULT 0 CHECK (node_excluded >= 0),
    reference_total BIGINT NOT NULL DEFAULT 0 CHECK (reference_total >= 0),
    reference_resolved BIGINT NOT NULL DEFAULT 0 CHECK (reference_resolved >= 0),
    reference_unresolved BIGINT NOT NULL DEFAULT 0 CHECK (reference_unresolved >= 0),
    reference_ambiguous BIGINT NOT NULL DEFAULT 0 CHECK (reference_ambiguous >= 0),
    reference_excluded BIGINT NOT NULL DEFAULT 0 CHECK (reference_excluded >= 0),
    error_summary TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (node_total = node_resolved + node_unresolved + node_ambiguous + node_excluded),
    CHECK (
        reference_total = reference_resolved + reference_unresolved + reference_ambiguous + reference_excluded
    ),
    CHECK ((status = 'succeeded' AND btrim(error_summary) = '') OR status = 'failed')
);

CREATE INDEX catalog_source_resolution_runs_snapshot_idx
    ON catalog_source_resolution_runs (snapshot_id, finished_at DESC, id DESC);

-- +goose Down
DROP TABLE IF EXISTS catalog_source_resolution_runs;
DROP TABLE IF EXISTS catalog_source_entity_type_mappings;
DROP INDEX IF EXISTS catalog_staged_source_references_resolution_idx;
ALTER TABLE catalog_staged_source_nodes
    DROP CONSTRAINT IF EXISTS catalog_staged_source_nodes_resolution_check;
ALTER TABLE catalog_staged_source_references
    DROP CONSTRAINT IF EXISTS catalog_staged_source_references_resolution_check,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS resolution_reason,
    DROP COLUMN IF EXISTS resolution_status;
