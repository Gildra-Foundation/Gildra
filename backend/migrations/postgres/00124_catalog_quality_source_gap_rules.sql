-- +goose Up
-- Battle.net talent and PvP-talent records are selectors for a gameplay
-- spell.  The official talent resources do not carry a standalone
-- description or media document; the public library already resolves the
-- linked spell tooltip/icon as the presentation value.  Keep these source
-- gaps visible in the quality report, but do not block an otherwise complete
-- release on fields that the authoritative endpoint cannot provide.
-- +goose StatementBegin
DO $$
BEGIN
    IF to_regclass('public.catalog_release_profile_field_requirements') IS NOT NULL THEN
        UPDATE catalog_release_profile_field_requirements
        SET requirement='optional',
            reason_en='Battle.net exposes the linked spell as the authoritative description and icon for this talent.',
            reason_ru='Battle.net предоставляет связанное заклинание как источник описания и изображения таланта.',
            updated_at=now()
        WHERE entity_type IN ('talent','pvp_talent')
          AND field_key IN ('description_en','description_ru','media');
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    IF to_regclass('public.catalog_release_profile_field_requirements') IS NOT NULL THEN
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
    END IF;
END $$;
-- +goose StatementEnd
