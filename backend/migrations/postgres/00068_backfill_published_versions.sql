-- +goose Up
-- Keep the schema change and its data transition separate. Existing published
-- snapshots remain public after the application starts using the new pointer.
UPDATE game_entities
SET published_version_id = latest_version_id
WHERE published_version_id IS NULL
  AND latest_version_id IS NOT NULL;

-- +goose Down
UPDATE game_entities SET published_version_id = NULL;
