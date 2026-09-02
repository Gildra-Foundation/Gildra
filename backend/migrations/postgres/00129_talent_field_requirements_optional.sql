-- +goose Up
-- Migration 00124 ran in production before catalog_release_profile_field_requirements
-- existed (00128 creates it), so its guarded UPDATE was a no-op there. Re-apply
-- the rule now that the table and its required-field rows are present:
-- Battle.net talent and PvP-talent records resolve description and media from
-- the linked spell, so those fields are optional for the public quality gate.
UPDATE catalog_release_profile_field_requirements
SET requirement='optional',
    reason_en='Battle.net exposes the linked spell as the authoritative description and icon for this talent.',
    reason_ru='Battle.net предоставляет связанное заклинание как источник описания и изображения таланта.',
    updated_at=now()
WHERE entity_type IN ('talent','pvp_talent')
  AND field_key IN ('description_en','description_ru','media');

-- +goose Down
UPDATE catalog_release_profile_field_requirements
SET requirement='required',
    reason_en=CASE field_key
        WHEN 'media' THEN 'The public library must expose a proven image for this entity type.'
        ELSE 'The public library must expose a resolved description in both locales.'
    END,
    reason_ru=CASE field_key
        WHEN 'media' THEN 'Публичная библиотека должна содержать подтверждённое изображение для этого типа сущности.'
        ELSE 'Публичная библиотека должна содержать разрешённое описание на обоих языках.'
    END,
    updated_at=now()
WHERE entity_type IN ('talent','pvp_talent')
  AND field_key IN ('description_en','description_ru','media');
