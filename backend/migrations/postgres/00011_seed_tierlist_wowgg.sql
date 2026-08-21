-- +goose Up
INSERT INTO datasets (slug, name, source_name, refresh_interval)
VALUES ('tierlist-wowgg', 'Tierlist — wow.gg', 'wow.gg', INTERVAL '8 hours')
ON CONFLICT (slug) DO NOTHING;

-- +goose Down
DELETE FROM datasets
WHERE slug = 'tierlist-wowgg'
  AND current_snapshot_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dataset_runs WHERE dataset_runs.dataset_id = datasets.id
  );
