-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY catalog_db2_rows_spell_lookup_idx
    ON catalog_db2_rows (
        build_id,
        table_name,
        locale,
        ((NULLIF(payload->>'SpellID', ''))::BIGINT)
    )
    WHERE payload ? 'SpellID';

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_db2_rows_spell_lookup_idx;
