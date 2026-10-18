-- +goose NO TRANSACTION
-- +goose Up
-- enrichMentions compares the original SpellID text. The numeric lookup index
-- remains necessary for other DB2 readers and cannot serve this expression.
CREATE INDEX CONCURRENTLY catalog_db2_rows_spell_misc_text_lookup_idx
    ON catalog_db2_rows (build_id, (payload->>'SpellID'))
    WHERE table_name='SpellMisc' AND locale='en_US';

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_db2_rows_spell_misc_text_lookup_idx;
