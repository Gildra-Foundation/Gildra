-- +goose Up
-- Wago can legitimately omit tables that did not exist in a Classic client
-- build.  Keep that distinction explicit in the release profile instead of
-- treating an unavailable export as an empty successful import.  Only the
-- tables listed here are currently proven to be outside the Classic talent /
-- profession model; all other unavailable artifacts remain publication
-- blockers until an operator reviews them.
CREATE TABLE catalog_release_profile_artifact_rules (
    profile_key TEXT NOT NULL REFERENCES catalog_release_profiles(profile_key) ON DELETE CASCADE,
    source TEXT NOT NULL REFERENCES catalog_source_policies(source),
    artifact_key TEXT NOT NULL CHECK (btrim(artifact_key) <> ''),
    locale TEXT NOT NULL DEFAULT '' CHECK (locale = '' OR locale ~ '^[a-z]{2}_[A-Z]{2}$'),
    requirement TEXT NOT NULL CHECK (requirement IN ('required','optional','not_applicable')),
    reason_en TEXT NOT NULL DEFAULT '',
    reason_ru TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_key, source, artifact_key, locale)
);

CREATE INDEX catalog_release_profile_artifact_rules_lookup_idx
    ON catalog_release_profile_artifact_rules (source, artifact_key, locale, requirement);

WITH classic_profiles(profile_key) AS (VALUES
    ('classic-foundation-v1'),
    ('classic-era-foundation-v1'),
    ('classic-hardcore-foundation-v1')
), not_applicable(artifact_key, reason_en, reason_ru) AS (VALUES
    ('CraftingData', 'Dragonflight crafting data is not part of this Classic client.', 'Данные крафта Dragonflight отсутствуют в этом клиенте Classic.'),
    ('CraftingDataItemQuality', 'Dragonflight crafting item quality is not part of this Classic client.', 'Качество предметов крафта Dragonflight отсутствует в этом клиенте Classic.'),
    ('PvpTalent', 'PvP talents are not part of this Classic client.', 'PvP-таланты отсутствуют в этом клиенте Classic.'),
    ('TraitDefinition', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitDefinitionEffectPoints', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitEdge', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitNode', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitNodeEntry', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitNodeXTraitNodeEntry', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitSubTree', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.'),
    ('TraitTree', 'The modern trait-talent system is not part of this Classic client.', 'Современная система талантов Trait отсутствует в этом клиенте Classic.')
)
INSERT INTO catalog_release_profile_artifact_rules(
    profile_key, source, artifact_key, locale, requirement, reason_en, reason_ru
)
SELECT profile.profile_key, 'wago_tools', artifact.artifact_key, '', 'not_applicable',
    artifact.reason_en, artifact.reason_ru
FROM classic_profiles profile
CROSS JOIN not_applicable artifact
ON CONFLICT (profile_key, source, artifact_key, locale) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    updated_at=now();

-- +goose Down
DROP TABLE IF EXISTS catalog_release_profile_artifact_rules;
