-- +goose Up
-- Item effects may legitimately reference a spell id that has no SpellName row
-- in the same build. Keep the fact, but make the build-scoped resolution state
-- explicit so consumers never have to infer it from a dangling entity join.
ALTER TABLE catalog_item_effects
    ADD COLUMN spell_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN spell_target_status TEXT NOT NULL DEFAULT 'unavailable_in_build'
        CHECK (spell_target_status IN ('resolved','unavailable_in_build'));

WITH spell_targets AS (
    SELECT effect.version_id, effect.item_effect_id,
        COALESCE(NULLIF(BTRIM(name.payload->>'Name_lang'), ''), '') AS spell_name,
        CASE WHEN name.row_id IS NULL THEN 'unavailable_in_build' ELSE 'resolved' END AS spell_target_status
    FROM catalog_item_effects effect
    JOIN game_entity_versions item_version ON item_version.id=effect.version_id
    LEFT JOIN catalog_db2_rows name
        ON name.build_id=item_version.build_id
       AND name.table_name='SpellName'
       AND name.locale='en_US'
       AND name.row_id=effect.spell_id
)
UPDATE catalog_item_effects effect
SET spell_name=spell_targets.spell_name,
    spell_target_status=spell_targets.spell_target_status
FROM spell_targets
WHERE spell_targets.version_id=effect.version_id
  AND spell_targets.item_effect_id=effect.item_effect_id;

-- +goose Down
ALTER TABLE catalog_item_effects
    DROP COLUMN IF EXISTS spell_target_status,
    DROP COLUMN IF EXISTS spell_name;
