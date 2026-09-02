-- +goose Up
-- Field requirements must describe what a source can provide. Production data
-- audited on 2026-09-02 (retail-foundation-v1, build 12.1.0.69497) showed:
--   * quest_reward_package: 3233 packages, none has prose or an icon — they are
--     derived aggregates of quest rewards, so description and media do not exist
--     for this entity type at all;
--   * encounter: Raidbots instance data carries English names only, no prose
--     and no icon.
-- Marking those fields not applicable/optional keeps the gate honest about
-- real gaps (items, spells, talents…) without blocking every future release on
-- fields that can never be filled.
UPDATE catalog_release_profile_field_requirements
SET requirement='not_applicable',
    reason_en='Quest reward packages are derived aggregates without prose or artwork.',
    reason_ru='Пакеты наград заданий — производные агрегаты без описания и изображения.',
    updated_at=now()
WHERE entity_type='quest_reward_package'
  AND field_key IN ('description_en','description_ru','media');

UPDATE catalog_release_profile_field_requirements
SET requirement='optional',
    reason_en='Encounter records come from Raidbots instance data, which publishes English names only.',
    reason_ru='Записи encounter приходят из данных инстансов Raidbots, где есть только английские названия.',
    updated_at=now()
WHERE entity_type='encounter'
  AND field_key IN ('name_ru','description_en','description_ru','media');

-- +goose Down
UPDATE catalog_release_profile_field_requirements
SET requirement='required',
    reason_en=CASE field_key
        WHEN 'media' THEN 'The public library must expose a proven image for this entity type.'
        WHEN 'name_ru' THEN 'The public library must expose a verified Russian name.'
        ELSE 'The public library must expose a resolved description in both locales.'
    END,
    reason_ru=CASE field_key
        WHEN 'media' THEN 'Публичная библиотека должна содержать подтверждённое изображение для этого типа сущности.'
        WHEN 'name_ru' THEN 'Публичная библиотека должна содержать проверенное русское название.'
        ELSE 'Публичная библиотека должна содержать разрешённое описание на обоих языках.'
    END,
    updated_at=now()
WHERE (entity_type='quest_reward_package' AND field_key IN ('description_en','description_ru','media'))
   OR (entity_type='encounter' AND field_key IN ('name_ru','description_en','description_ru','media'));
