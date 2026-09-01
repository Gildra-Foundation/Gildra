-- +goose Up
-- Wago returns a deterministic 404 for these exports in the Classic 5.5.4
-- family.  They are not silently treated as empty data: the unavailable
-- artifact remains recorded and the profile explains why it is not a release
-- blocker.  If Wago starts publishing one later, the importer will still
-- ingest it normally.
WITH classic_profiles(profile_key) AS (VALUES
    ('classic-foundation-v1'),
    ('classic-era-foundation-v1'),
    ('classic-hardcore-foundation-v1')
), unavailable_exports(artifact_key, reason_en, reason_ru) AS (VALUES
    ('CraftingData', 'Wago does not publish this export for the Classic client family.', 'Wago не публикует этот экспорт для семейства клиентов Classic.'),
    ('CraftingDataItemQuality', 'Wago does not publish this export for the Classic client family.', 'Wago не публикует этот экспорт для семейства клиентов Classic.'),
    ('ItemBonus', 'Wago does not publish this modern item-bonus export for the Classic client family.', 'Wago не публикует этот современный экспорт бонусов предметов для семейства клиентов Classic.'),
    ('ItemBonusList', 'Wago does not publish this modern item-bonus export for the Classic client family.', 'Wago не публикует этот современный экспорт бонусов предметов для семейства клиентов Classic.'),
    ('ItemBonusListGroup', 'Wago does not publish this modern item-bonus export for the Classic client family.', 'Wago не публикует этот современный экспорт бонусов предметов для семейства клиентов Classic.'),
    ('ItemBonusListGroupEntry', 'Wago does not publish this modern item-bonus export for the Classic client family.', 'Wago не публикует этот современный экспорт бонусов предметов для семейства клиентов Classic.'),
    ('ItemBonusListLevelDelta', 'Wago does not publish this modern item-bonus export for the Classic client family.', 'Wago не публикует этот современный экспорт бонусов предметов для семейства клиентов Classic.'),
    ('ItemBonusSeason', 'Wago does not publish this modern item-bonus export for the Classic client family.', 'Wago не публикует этот современный экспорт бонусов предметов для семейства клиентов Classic.'),
    ('ItemLevelSelector', 'Wago does not publish this modern item-level export for the Classic client family.', 'Wago не публикует этот современный экспорт уровней предметов для семейства клиентов Classic.'),
    ('ItemLevelSelectorQuality', 'Wago does not publish this modern item-level export for the Classic client family.', 'Wago не публикует этот современный экспорт уровней предметов для семейства клиентов Classic.'),
    ('ItemLevelSelectorQualitySet', 'Wago does not publish this modern item-level export for the Classic client family.', 'Wago не публикует этот современный экспорт уровней предметов для семейства клиентов Classic.'),
    ('ItemModifiedAppearanceExtra', 'Wago does not publish this modern appearance export for the Classic client family.', 'Wago не публикует этот современный экспорт внешнего вида для семейства клиентов Classic.'),
    ('ItemXItemEffect', 'Wago does not publish this item-effect link export for the Classic client family.', 'Wago не публикует этот экспорт связей эффектов предметов для семейства клиентов Classic.'),
    ('PvpTalent', 'PvP talents are not part of this Classic foundation profile.', 'PvP-таланты не входят в этот профиль базы Classic.'),
    ('QuestLine', 'Quest lines are not published for this Classic build.', 'Цепочки заданий не публикуются для этой сборки Classic.'),
    ('QuestLineXQuest', 'Quest-line links are not published for this Classic build.', 'Связи цепочек заданий не публикуются для этой сборки Classic.'),
    ('QuestObjective', 'Quest objectives are not published for this Classic build.', 'Цели заданий не публикуются для этой сборки Classic.'),
    ('QuestV2CliTask', 'Modern quest client tasks are not part of this Classic build.', 'Современные клиентские задачи заданий отсутствуют в этой сборке Classic.'),
    ('SpecSetMember', 'Modern specialization-set membership is not part of this Classic build.', 'Современное членство в наборах специализаций отсутствует в этой сборке Classic.')
)
INSERT INTO catalog_release_profile_artifact_rules(
    profile_key, source, artifact_key, locale, requirement, reason_en, reason_ru
)
SELECT profile.profile_key, 'wago_tools', export.artifact_key, '', 'not_applicable',
    export.reason_en, export.reason_ru
FROM classic_profiles profile
CROSS JOIN unavailable_exports export
ON CONFLICT (profile_key, source, artifact_key, locale) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    updated_at=now();

-- Classic profiles intentionally use DB2/listfile evidence.  A failed optional
-- Battle.net item search must not make those profiles unpublishable.
WITH classic_profiles(profile_key) AS (VALUES
    ('classic-foundation-v1'),
    ('classic-era-foundation-v1'),
    ('classic-hardcore-foundation-v1')
)
INSERT INTO catalog_release_profile_artifact_rules(
    profile_key, source, artifact_key, locale, requirement, reason_en, reason_ru
)
SELECT profile_key, 'blizzard_api', 'battlenet/item', '', 'not_applicable',
    'The Classic foundation profile does not publish the optional Battle.net item search.',
    'Профиль базы Classic не публикует необязательный поиск предметов через Battle.net.'
FROM classic_profiles
ON CONFLICT (profile_key, source, artifact_key, locale) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    updated_at=now();

-- +goose Down
DELETE FROM catalog_release_profile_artifact_rules
WHERE profile_key IN ('classic-foundation-v1','classic-era-foundation-v1','classic-hardcore-foundation-v1')
  AND (
      source='blizzard_api' AND artifact_key='battlenet/item'
      OR source='wago_tools' AND artifact_key IN (
          'CraftingData','CraftingDataItemQuality','ItemBonus','ItemBonusList',
          'ItemBonusListGroup','ItemBonusListGroupEntry','ItemBonusListLevelDelta',
          'ItemBonusSeason','ItemLevelSelector','ItemLevelSelectorQuality',
          'ItemLevelSelectorQualitySet','ItemModifiedAppearanceExtra','ItemXItemEffect',
          'PvpTalent','QuestLine','QuestLineXQuest','QuestObjective','QuestV2CliTask',
          'SpecSetMember'
      )
  );
