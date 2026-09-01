-- +goose Up
-- Per-level experience and mora tables are versioned independently from the
-- localized source payloads. Material ranges retain the canonical recipe
-- shown by the source (including ore/fodder composition and wasted EXP).
CREATE TABLE genshin_level_progression (
    game_version TEXT NOT NULL,
    subject TEXT NOT NULL CHECK (subject IN ('character', 'weapon')),
    rarity SMALLINT NOT NULL CHECK (rarity BETWEEN 1 AND 5),
    level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 90),
    next_level SMALLINT CHECK (next_level IS NULL OR next_level = level + 1),
    exp_required BIGINT NOT NULL CHECK (exp_required >= 0),
    total_exp BIGINT NOT NULL CHECK (total_exp >= 0),
    mora_cost BIGINT NOT NULL CHECK (mora_cost >= 0),
    PRIMARY KEY (game_version, subject, rarity, level)
);

CREATE INDEX genshin_level_progression_lookup_idx
    ON genshin_level_progression (game_version, subject, rarity, level);

CREATE TABLE genshin_level_material_costs (
    game_version TEXT NOT NULL,
    subject TEXT NOT NULL CHECK (subject IN ('character', 'weapon')),
    rarity SMALLINT NOT NULL CHECK (rarity BETWEEN 1 AND 5),
    from_level SMALLINT NOT NULL CHECK (from_level BETWEEN 1 AND 89),
    to_level SMALLINT NOT NULL CHECK (to_level BETWEEN 2 AND 90 AND to_level > from_level),
    material_key TEXT NOT NULL,
    material_external_id BIGINT,
    material_name_en TEXT NOT NULL,
    material_name_ru TEXT NOT NULL,
    icon_external_id BIGINT,
    count BIGINT NOT NULL CHECK (count > 0),
    experience_per_item BIGINT NOT NULL CHECK (experience_per_item > 0),
    experience_provided BIGINT NOT NULL CHECK (experience_provided > 0),
    wasted_experience BIGINT NOT NULL CHECK (wasted_experience >= 0),
    mora_cost BIGINT NOT NULL CHECK (mora_cost >= 0),
    PRIMARY KEY (game_version, subject, rarity, from_level, to_level, material_key)
);

CREATE INDEX genshin_level_material_costs_lookup_idx
    ON genshin_level_material_costs (game_version, subject, rarity, from_level, to_level);

COMMENT ON TABLE genshin_level_progression IS
    'Per-level EXP and Mora requirements for the published Genshin Impact game version.';
COMMENT ON TABLE genshin_level_material_costs IS
    'Canonical level-range book/ore/fodder composition, with bilingual material labels.';

-- +goose Down
DROP TABLE IF EXISTS genshin_level_material_costs;
DROP TABLE IF EXISTS genshin_level_progression;
