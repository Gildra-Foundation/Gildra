-- +goose Up
INSERT INTO datasets (slug, name, source_name, refresh_interval)
VALUES ('tierlist-icyveins', 'Tierlist — Icy Veins', 'Icy Veins', INTERVAL '1 day')
ON CONFLICT (slug) DO NOTHING;

-- +goose Down
DELETE FROM datasets
WHERE slug = 'tierlist-icyveins'
  AND current_snapshot_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dataset_runs WHERE dataset_runs.dataset_id = datasets.id
  );
