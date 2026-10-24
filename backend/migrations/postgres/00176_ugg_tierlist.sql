-- +goose Up
CREATE TABLE ugg_tierlist_entries (
    snapshot_id UUID NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
    activity TEXT NOT NULL CHECK (activity IN ('raid', 'mythic_plus')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('all', 'normal', 'heroic', 'mythic')),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank')),
    rank SMALLINT NOT NULL CHECK (rank > 0),
    tier TEXT NOT NULL CHECK (tier ~ '^[SABCDF]$'),
    class_name TEXT NOT NULL,
    class_slug TEXT NOT NULL CHECK (class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT NOT NULL,
    spec_slug TEXT NOT NULL CHECK (spec_slug ~ '^[a-z][a-z-]+$'),
    hero_talents JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(hero_talents) = 'array'),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://u[.]gg/wow/tier-list/'),
    score NUMERIC,
    dps NUMERIC,
    hps NUMERIC,
    popularity NUMERIC CHECK (popularity IS NULL OR popularity BETWEEN 0 AND 1),
    parses BIGINT NOT NULL CHECK (parses >= 0),
    source_updated_at TIMESTAMPTZ NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, activity, difficulty, role, class_slug, spec_slug),
    UNIQUE (snapshot_id, activity, difficulty, role, rank)
);

CREATE INDEX ugg_tierlist_entries_spec_history_idx
    ON ugg_tierlist_entries (class_slug, spec_slug, source_updated_at DESC);

INSERT INTO datasets (slug, name, source_name, refresh_interval)
VALUES ('tierlist-ugg', 'Tierlist u.gg', 'u.gg', INTERVAL '12 hours')
ON CONFLICT (slug) DO NOTHING;

-- +goose Down
DELETE FROM datasets
WHERE slug = 'tierlist-ugg'
  AND current_snapshot_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dataset_runs WHERE dataset_runs.dataset_id = datasets.id
  );
DROP TABLE IF EXISTS ugg_tierlist_entries;
