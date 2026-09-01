-- +goose Up
-- A release profile describes which entity types belong in a public edition.
-- This companion table describes the fields that must be present for those
-- entities.  Keeping the policy in the database makes the gate explicit and
-- lets Classic profiles differ from Retail without hard-coding edition rules
-- in the importer.
CREATE TABLE catalog_release_profile_field_requirements (
    profile_key TEXT NOT NULL REFERENCES catalog_release_profiles(profile_key) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    field_key TEXT NOT NULL CHECK (field_key IN (
        'name_en','name_ru','description_en','description_ru','media'
    )),
    requirement TEXT NOT NULL CHECK (requirement IN ('required','optional','not_applicable')),
    reason_en TEXT NOT NULL DEFAULT '',
    reason_ru TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_key, entity_type, field_key)
);

CREATE INDEX catalog_release_profile_field_requirements_lookup_idx
    ON catalog_release_profile_field_requirements (profile_key, entity_type, requirement);

-- Names are required in both API locales for every required entity type.  A
-- source-approved exact English fallback is still a value and remains
-- visible as fallback metadata; the importer must not silently omit the row.
INSERT INTO catalog_release_profile_field_requirements(
    profile_key,entity_type,field_key,requirement,reason_en,reason_ru
)
SELECT profile.profile_key,types.entity_type,field.field_key,'required',
    CASE field.field_key
        WHEN 'name_en' THEN 'Every published entity needs an English name.'
        ELSE 'Every published entity needs a Russian name or an explicit source fallback.'
    END,
    CASE field.field_key
        WHEN 'name_en' THEN 'У каждой опубликованной сущности должно быть английское название.'
        ELSE 'У каждой опубликованной сущности должно быть русское название или явный fallback источника.'
    END
FROM catalog_release_profiles profile
JOIN catalog_release_profile_entity_types types
  ON types.profile_key=profile.profile_key AND types.requirement='required'
CROSS JOIN (VALUES ('name_en'::text),('name_ru'::text)) field(field_key)
WHERE profile.status='active'
ON CONFLICT (profile_key,entity_type,field_key) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    updated_at=now();

-- Descriptions are meaningful and required for the user-facing content types
-- below.  Maps, factions and other registry-only records can legitimately
-- have no prose and are not assigned a description requirement here.
INSERT INTO catalog_release_profile_field_requirements(
    profile_key,entity_type,field_key,requirement,reason_en,reason_ru
)
SELECT profile.profile_key,types.entity_type,field.field_key,'required',
    'The public library must expose a resolved description in both locales.',
    'Публичная библиотека должна содержать разрешённое описание на обоих языках.'
FROM catalog_release_profiles profile
JOIN catalog_release_profile_entity_types types
  ON types.profile_key=profile.profile_key
 AND types.entity_type IN (
    'item','spell','quest','creature','mount','toy','achievement',
    'battle_pet','recipe','talent','pvp_talent'
 )
CROSS JOIN (VALUES ('description_en'::text),('description_ru'::text)) field(field_key)
WHERE profile.status='active'
ON CONFLICT (profile_key,entity_type,field_key) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    updated_at=now();

-- The public card/detail UI must have a usable image for the main content
-- types.  The quality function accepts a proven icon, a FileDataID asset, or
-- a cached media observation tied to an equal/older build.
INSERT INTO catalog_release_profile_field_requirements(
    profile_key,entity_type,field_key,requirement,reason_en,reason_ru
)
SELECT profile.profile_key,types.entity_type,'media','required',
    'The public library must expose a proven image for this entity type.',
    'Публичная библиотека должна содержать подтверждённое изображение для этого типа сущности.'
FROM catalog_release_profiles profile
JOIN catalog_release_profile_entity_types types
  ON types.profile_key=profile.profile_key
 AND types.entity_type IN (
    'item','spell','currency','mount','toy','achievement','battle_pet',
    'creature','talent','pvp_talent'
 )
WHERE profile.status='active'
ON CONFLICT (profile_key,entity_type,field_key) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    updated_at=now();

-- +goose StatementBegin
CREATE FUNCTION catalog_release_required_field_quality(p_release_id UUID)
RETURNS TABLE(
    check_key TEXT,
    failed_count BIGINT,
    blocking BOOLEAN,
    details JSONB
)
LANGUAGE sql
STABLE
AS $$
WITH release_context AS (
    SELECT release_record.id,release_record.product_id,release_record.build_id,
        build.build_number,profile.profile_key
    FROM catalog_releases release_record
    JOIN game_builds build ON build.id=release_record.build_id
    JOIN catalog_release_profiles profile
      ON profile.product_id=release_record.product_id AND profile.status='active'
    WHERE release_record.id=p_release_id
    ORDER BY profile.profile_key
    LIMIT 1
), candidates AS (
    SELECT DISTINCT ON (entity.id)
        entity.id AS entity_id,entity.entity_type,entity.external_id,
        candidate.id AS version_id,candidate.build_id,
        COALESCE(candidate_en.name,'') AS name_en,
        COALESCE(candidate_ru.name,'') AS name_ru,
        COALESCE(candidate_en.description,'') AS description_en,
        COALESCE(candidate_ru.description,'') AS description_ru,
        EXISTS (
            SELECT 1
            FROM catalog_entity_icons icon
            JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
            WHERE icon.build_id=candidate.build_id
              AND icon.entity_type=entity.entity_type
              AND icon.external_id=entity.external_id
              AND btrim(icon.icon_name)<>''
              AND artifact.status='ready'
              AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
        ) OR EXISTS (
            SELECT 1
            FROM catalog_file_assets asset
            WHERE asset.file_data_id=CASE
                WHEN COALESCE(
                    candidate.payload->>'icon_file_data_id',
                    candidate.payload #>> '{db2,InventoryIconFileID}',
                    candidate.payload #>> '{db2,IconFileID}',
                    candidate.payload #>> '{db2,IconFileDataID}',
                    candidate.payload #>> '{db2,SpellIconFileID}'
                ) ~ '^[0-9]+$'
                THEN COALESCE(
                    candidate.payload->>'icon_file_data_id',
                    candidate.payload #>> '{db2,InventoryIconFileID}',
                    candidate.payload #>> '{db2,IconFileID}',
                    candidate.payload #>> '{db2,IconFileDataID}',
                    candidate.payload #>> '{db2,SpellIconFileID}'
                )::bigint
            END
        ) OR EXISTS (
            SELECT 1
            FROM catalog_entity_media media
            JOIN game_builds media_build ON media_build.id=media.build_id
            JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
            WHERE media.entity_id=entity.id
              AND media.entity_type=entity.entity_type
              AND media.external_id=entity.external_id
              AND media_build.product_id=entity.product_id
              AND media_build.build_number<=release.build_number
              AND media.cache_status='cached'
              AND NULLIF(media.cached_url,'') IS NOT NULL
              AND media.cached_content_hash IS NOT NULL
              AND media.cached_byte_size IS NOT NULL
              AND artifact.status='ready'
              AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
        ) AS has_media
    FROM release_context release
    JOIN catalog_snapshots snapshot
      ON snapshot.release_id=release.id AND snapshot.status='validated'
    JOIN game_entity_versions candidate
      ON candidate.snapshot_id=snapshot.id AND candidate.build_id=release.build_id
    JOIN game_entities entity
      ON entity.id=candidate.entity_id
     AND entity.product_id=release.product_id
     AND entity.deleted_at IS NULL
     AND entity.latest_version_id=candidate.id
    LEFT JOIN game_entity_localizations candidate_en
      ON candidate_en.version_id=candidate.id AND candidate_en.locale='en_US'
    LEFT JOIN game_entity_localizations candidate_ru
      ON candidate_ru.version_id=candidate.id AND candidate_ru.locale='ru_RU'
    ORDER BY entity.id,candidate.revision DESC,candidate.created_at DESC,candidate.id DESC
), rules AS (
    SELECT requirement.profile_key,requirement.entity_type,requirement.field_key,
        requirement.requirement
    FROM catalog_release_profile_field_requirements requirement
    JOIN release_context release ON release.profile_key=requirement.profile_key
    WHERE requirement.requirement<>'not_applicable'
), evaluated AS (
    SELECT rule.profile_key,rule.entity_type,rule.field_key,rule.requirement,
        count(candidate.version_id) AS entity_count,
        count(candidate.version_id) FILTER (WHERE
            CASE rule.field_key
                WHEN 'name_en' THEN NULLIF(btrim(candidate.name_en),'') IS NULL
                WHEN 'name_ru' THEN NULLIF(btrim(candidate.name_ru),'') IS NULL
                WHEN 'description_en' THEN
                    NULLIF(btrim(candidate.description_en),'') IS NULL
                    OR candidate.description_en ~ '\\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'
                WHEN 'description_ru' THEN
                    NULLIF(btrim(candidate.description_ru),'') IS NULL
                    OR candidate.description_ru ~ '\\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'
                WHEN 'media' THEN NOT candidate.has_media
                ELSE false
            END
        ) AS failed_count
    FROM rules rule
    LEFT JOIN candidates candidate ON candidate.entity_type=rule.entity_type
    GROUP BY rule.profile_key,rule.entity_type,rule.field_key,rule.requirement
)
SELECT format('required_%s_%s',evaluated.entity_type,evaluated.field_key),
    evaluated.failed_count,
    evaluated.requirement='required',
    jsonb_build_object(
        'profile_key',evaluated.profile_key,
        'entity_type',evaluated.entity_type,
        'field',evaluated.field_key,
        'entities',evaluated.entity_count,
        'requirement',evaluated.requirement
    )
FROM evaluated
WHERE evaluated.failed_count>0;
$$;
-- +goose StatementEnd

-- Extend the existing release gate without rewriting its provenance and
-- regression checks.  The old function remains available under a versioned
-- name for rollback and for diagnostics.
ALTER FUNCTION catalog_release_quality_gate(UUID)
    RENAME TO catalog_release_quality_gate_v2;

-- +goose StatementBegin
CREATE FUNCTION catalog_release_quality_gate(p_release_id UUID)
RETURNS TABLE(
    check_key TEXT,
    failed_count BIGINT,
    blocking BOOLEAN,
    details JSONB
)
LANGUAGE sql
STABLE
AS $$
    SELECT gate.check_key,gate.failed_count,gate.blocking,gate.details
    FROM catalog_release_quality_gate_v2(p_release_id) gate
    UNION ALL
    SELECT required.check_key,required.failed_count,required.blocking,required.details
    FROM catalog_release_required_field_quality(p_release_id) required
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS catalog_release_quality_gate(UUID);
ALTER FUNCTION catalog_release_quality_gate_v2(UUID)
    RENAME TO catalog_release_quality_gate;
DROP FUNCTION IF EXISTS catalog_release_required_field_quality(UUID);
DROP INDEX IF EXISTS catalog_release_profile_field_requirements_lookup_idx;
DROP TABLE IF EXISTS catalog_release_profile_field_requirements;
