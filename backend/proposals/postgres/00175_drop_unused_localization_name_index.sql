-- +goose NO TRANSACTION
-- +goose Up
-- (locale, lower(name), version_id) duplicates the text_pattern_ops index of
-- the same columns, which also answers equality; it had no scans since the
-- statistics reset of 2026-10-08 and costs 1.7 GB plus a write per
-- localization insert.
DROP INDEX CONCURRENTLY IF EXISTS game_entity_localizations_locale_lower_name_idx;

-- +goose Down
CREATE INDEX CONCURRENTLY game_entity_localizations_locale_lower_name_idx
    ON game_entity_localizations (locale, lower(name), version_id);
