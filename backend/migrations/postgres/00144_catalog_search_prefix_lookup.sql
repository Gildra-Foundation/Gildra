-- +goose NO TRANSACTION
-- +goose Up
-- The trigram index rechecks thousands of rows for common name prefixes.
-- This pattern-operator B-tree serves the case-insensitive prefix branch while
-- keeping the trigram index available for fuzzy matching.
CREATE INDEX CONCURRENTLY IF NOT EXISTS game_entity_localizations_locale_lower_name_prefix_idx
    ON game_entity_localizations (locale, lower(name) text_pattern_ops, version_id);

ANALYZE game_entity_localizations;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entity_localizations_locale_lower_name_prefix_idx;
