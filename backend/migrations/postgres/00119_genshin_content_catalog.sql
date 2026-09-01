-- +goose Up
-- Generic source-preserving records cover every genshin-db folder that does
-- not yet have a specialized projection (foods, materials, enemies, domains,
-- TCG cards, achievements, and future categories). This is additive so the
-- optimized core tables remain backward compatible.
CREATE TABLE genshin_content_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES genshin_catalog_releases(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category ~ '^[a-z0-9]+$'),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    external_id BIGINT,
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (release_id, category, slug)
);

CREATE INDEX genshin_content_entries_category_idx
    ON genshin_content_entries (release_id, category, slug);

CREATE INDEX genshin_content_entries_external_id_idx
    ON genshin_content_entries (release_id, category, external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE genshin_content_localizations (
    entry_id BIGINT NOT NULL REFERENCES genshin_content_entries(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (entry_id, locale)
);

CREATE INDEX genshin_content_localizations_name_idx
    ON genshin_content_localizations (locale, lower(name));

CREATE TABLE genshin_content_media (
    entry_id BIGINT NOT NULL REFERENCES genshin_content_entries(id) ON DELETE CASCADE,
    media_role TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    PRIMARY KEY (entry_id, media_role),
    UNIQUE (entry_id, source_filename)
);

CREATE INDEX genshin_content_media_asset_idx
    ON genshin_content_media (asset_id);

-- +goose Down
DROP TABLE IF EXISTS genshin_content_media;
DROP TABLE IF EXISTS genshin_content_localizations;
DROP TABLE IF EXISTS genshin_content_entries;
