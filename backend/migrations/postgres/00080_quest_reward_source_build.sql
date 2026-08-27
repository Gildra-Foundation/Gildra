-- +goose Up
ALTER TABLE catalog_quest_rewards
    ADD COLUMN source_build_id BIGINT;

UPDATE catalog_quest_rewards
SET source_build_id=build_id
WHERE source='blizzard_api' AND source_build_id IS NULL;

ALTER TABLE catalog_quest_rewards
    ADD CONSTRAINT catalog_quest_rewards_source_build_fk
    FOREIGN KEY (source_build_id)
    REFERENCES game_builds(id) ON DELETE SET NULL
    NOT VALID;

CREATE INDEX catalog_quest_rewards_source_build_idx
    ON catalog_quest_rewards(source_build_id, quest_id)
    WHERE source_build_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_quest_rewards_source_build_idx;
ALTER TABLE catalog_quest_rewards
    DROP CONSTRAINT IF EXISTS catalog_quest_rewards_source_build_fk,
    DROP COLUMN IF EXISTS source_build_id;
