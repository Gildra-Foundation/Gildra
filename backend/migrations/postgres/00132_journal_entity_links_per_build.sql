-- +goose Up
-- catalog_journal_instances and catalog_journal_encounters are keyed per
-- build (build_id, journal_*_id), but 00039 made entity_id unique across all
-- builds.  The first import of a second retail build (12.1.0.69587 on
-- 2026-09-02) therefore failed in projectJournalEntities with
-- "duplicate key value violates unique constraint
-- catalog_journal_instances_entity_idx" as soon as the new build's rows were
-- linked to the same instance entities.  Every reader joins these tables by
-- build_id, so uniqueness is per build.
DROP INDEX IF EXISTS catalog_journal_instances_entity_idx;
CREATE UNIQUE INDEX catalog_journal_instances_entity_idx
    ON catalog_journal_instances(build_id, entity_id) WHERE entity_id IS NOT NULL;
DROP INDEX IF EXISTS catalog_journal_encounters_entity_idx;
CREATE UNIQUE INDEX catalog_journal_encounters_entity_idx
    ON catalog_journal_encounters(build_id, entity_id) WHERE entity_id IS NOT NULL;

-- +goose Down
-- The single-column indexes can only be restored when one build owns the
-- entity links; keep the links of the active build of each product.
UPDATE catalog_journal_instances instance SET entity_id=NULL
FROM game_builds build
WHERE build.id=instance.build_id AND NOT build.is_active;
UPDATE catalog_journal_encounters encounter SET entity_id=NULL
FROM game_builds build
WHERE build.id=encounter.build_id AND NOT build.is_active;
DROP INDEX IF EXISTS catalog_journal_instances_entity_idx;
CREATE UNIQUE INDEX catalog_journal_instances_entity_idx
    ON catalog_journal_instances(entity_id) WHERE entity_id IS NOT NULL;
DROP INDEX IF EXISTS catalog_journal_encounters_entity_idx;
CREATE UNIQUE INDEX catalog_journal_encounters_entity_idx
    ON catalog_journal_encounters(entity_id) WHERE entity_id IS NOT NULL;
