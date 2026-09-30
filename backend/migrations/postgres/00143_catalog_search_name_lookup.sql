-- +goose NO TRANSACTION
-- +goose Up
-- The exact-name search branch filters by locale and lower(name). Without a
-- matching B-tree, separating it from full-text/prefix predicates still makes
-- the planner scan the entire localization table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS game_entity_localizations_locale_lower_name_idx
    ON game_entity_localizations (locale, lower(name), version_id);
ANALYZE game_entity_localizations;
ANALYZE game_entities;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entity_localizations_locale_lower_name_idx;
