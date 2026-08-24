-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY catalog_db2_rows_skill_spell_lookup_idx
    ON catalog_db2_rows (
        build_id,
        ((NULLIF(payload->>'Spell', ''))::BIGINT)
    )
    WHERE table_name = 'SkillLineAbility' AND locale = 'en_US' AND payload ? 'Spell';

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_db2_rows_skill_spell_lookup_idx;
