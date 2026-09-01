-- +goose Up
--
-- Wago's Classic 5.5.4 export explicitly returned HTTP 404 for the tables
-- below during the 5.5.4.67732 import.  Keep these gaps visible as warnings,
-- rather than treating them as failed imports forever.  The importer still
-- records an unavailable artifact and a zero-denominator completeness row;
-- this rule only says that the absence is expected for this product profile.
-- If Wago publishes one of these tables in a later build, the artifact becomes
-- ready and this rule no longer hides it from completeness checks.
WITH unavailable(artifact_key, reason_en, reason_ru) AS (VALUES
    ('ItemBonus', 'Wago does not publish ItemBonus for this Classic 5.5.4 build.', 'Wago не публикует ItemBonus для этой сборки Classic 5.5.4.'),
    ('ItemBonusList', 'Wago does not publish ItemBonusList for this Classic 5.5.4 build.', 'Wago не публикует ItemBonusList для этой сборки Classic 5.5.4.'),
    ('ItemBonusListGroup', 'Wago does not publish ItemBonusListGroup for this Classic 5.5.4 build.', 'Wago не публикует ItemBonusListGroup для этой сборки Classic 5.5.4.'),
    ('ItemBonusListGroupEntry', 'Wago does not publish ItemBonusListGroupEntry for this Classic 5.5.4 build.', 'Wago не публикует ItemBonusListGroupEntry для этой сборки Classic 5.5.4.'),
    ('ItemBonusListLevelDelta', 'Wago does not publish ItemBonusListLevelDelta for this Classic 5.5.4 build.', 'Wago не публикует ItemBonusListLevelDelta для этой сборки Classic 5.5.4.'),
    ('ItemBonusSeason', 'Wago does not publish ItemBonusSeason for this Classic 5.5.4 build.', 'Wago не публикует ItemBonusSeason для этой сборки Classic 5.5.4.'),
    ('ItemLevelSelector', 'Wago does not publish ItemLevelSelector for this Classic 5.5.4 build.', 'Wago не публикует ItemLevelSelector для этой сборки Classic 5.5.4.'),
    ('ItemLevelSelectorQuality', 'Wago does not publish ItemLevelSelectorQuality for this Classic 5.5.4 build.', 'Wago не публикует ItemLevelSelectorQuality для этой сборки Classic 5.5.4.'),
    ('ItemLevelSelectorQualitySet', 'Wago does not publish ItemLevelSelectorQualitySet for this Classic 5.5.4 build.', 'Wago не публикует ItemLevelSelectorQualitySet для этой сборки Classic 5.5.4.'),
    ('ItemModifiedAppearanceExtra', 'Wago does not publish ItemModifiedAppearanceExtra for this Classic 5.5.4 build.', 'Wago не публикует ItemModifiedAppearanceExtra для этой сборки Classic 5.5.4.'),
    ('ItemXItemEffect', 'Wago does not publish ItemXItemEffect for this Classic 5.5.4 build.', 'Wago не публикует ItemXItemEffect для этой сборки Classic 5.5.4.'),
    ('QuestLine', 'Wago does not publish QuestLine for this Classic 5.5.4 build.', 'Wago не публикует QuestLine для этой сборки Classic 5.5.4.'),
    ('QuestLineXQuest', 'Wago does not publish QuestLineXQuest for this Classic 5.5.4 build.', 'Wago не публикует QuestLineXQuest для этой сборки Classic 5.5.4.'),
    ('QuestObjective', 'Wago does not publish QuestObjective for this Classic 5.5.4 build.', 'Wago не публикует QuestObjective для этой сборки Classic 5.5.4.'),
    ('QuestV2CliTask', 'Wago does not publish QuestV2CliTask for this Classic 5.5.4 build.', 'Wago не публикует QuestV2CliTask для этой сборки Classic 5.5.4.'),
    ('SpecSetMember', 'Wago does not publish SpecSetMember for this Classic 5.5.4 build.', 'Wago не публикует SpecSetMember для этой сборки Classic 5.5.4.')
)
INSERT INTO catalog_release_profile_artifact_rules(
    profile_key, source, artifact_key, locale, requirement, reason_en, reason_ru
)
SELECT 'classic-foundation-v1', 'wago_tools', unavailable.artifact_key, '', 'not_applicable',
    unavailable.reason_en, unavailable.reason_ru
FROM unavailable
ON CONFLICT (profile_key, source, artifact_key, locale) DO UPDATE SET
    requirement = EXCLUDED.requirement,
    reason_en = EXCLUDED.reason_en,
    reason_ru = EXCLUDED.reason_ru,
    updated_at = now();

-- +goose Down
DELETE FROM catalog_release_profile_artifact_rules
WHERE profile_key='classic-foundation-v1' AND source='wago_tools' AND locale=''
  AND artifact_key IN (
    'ItemBonus','ItemBonusList','ItemBonusListGroup','ItemBonusListGroupEntry',
    'ItemBonusListLevelDelta','ItemBonusSeason','ItemLevelSelector',
    'ItemLevelSelectorQuality','ItemLevelSelectorQualitySet',
    'ItemModifiedAppearanceExtra','ItemXItemEffect','QuestLine',
    'QuestLineXQuest','QuestObjective','QuestV2CliTask','SpecSetMember'
  );
