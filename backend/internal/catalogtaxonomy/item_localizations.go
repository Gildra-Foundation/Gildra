package catalogtaxonomy

// Exact-build, exact-locale text for Raidbots item aliases. Missing Russian
// text is never filled from English. Source observations accompany new rows;
// ordinary publication and usability checks remain authoritative.
const itemAliasLocalizationsSQL = `
WITH candidates AS (
 SELECT v.id AS version_id,e.canonical_slug,r.locale,
  r.payload->>'Display_lang' AS name,COALESCE(r.payload->>'Description_lang','') AS description,
  r.source_artifact_id
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
 JOIN catalog_db2_rows r ON r.build_id=v.build_id AND r.table_name='ItemSparse'
  AND r.row_id=e.external_id AND r.locale IN ('en_US','ru_RU')
 WHERE e.entity_type IN ('gem','food','flask','potion') AND e.deleted_at IS NULL
  AND NULLIF(btrim(r.payload->>'Display_lang'),'') IS NOT NULL
 UNION ALL
 SELECT v.id,e.canonical_slug,r.locale,r.payload->>'Name_lang',
  COALESCE(d.payload->>'Description_lang',''),r.source_artifact_id
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
 JOIN catalog_db2_rows r ON r.build_id=v.build_id AND r.table_name='SpellName'
  AND r.row_id=CASE WHEN v.payload #>> '{raidbots,spellId}' ~ '^[1-9][0-9]*$'
   THEN (v.payload #>> '{raidbots,spellId}')::bigint END AND r.locale IN ('en_US','ru_RU')
 LEFT JOIN catalog_db2_rows d ON d.build_id=r.build_id AND d.table_name='Spell'
  AND d.row_id=r.row_id AND d.locale=r.locale
 WHERE e.entity_type='enchantment' AND e.deleted_at IS NULL
  AND NULLIF(btrim(r.payload->>'Name_lang'),'') IS NOT NULL
), written AS (
 INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
 SELECT version_id,locale,canonical_slug,name,description,
  jsonb_build_object('localization_source','item_alias_client') FROM candidates
 ON CONFLICT(version_id,locale) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,
  attributes=game_entity_localizations.attributes||EXCLUDED.attributes
 WHERE NULLIF(btrim(game_entity_localizations.name),'') IS NULL
  OR game_entity_localizations.attributes->>'localization_source'='item_alias_client'
 RETURNING version_id,locale
)
INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
SELECT DISTINCT c.version_id,c.locale,c.source_artifact_id FROM candidates c
JOIN written w USING(version_id,locale) WHERE c.source_artifact_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
SELECT v.id,l.locale,r.source_artifact_id
FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
JOIN game_entity_localizations l ON l.version_id=v.id AND l.attributes->>'localization_source'='item_alias_client'
JOIN catalog_db2_rows r ON r.build_id=v.build_id AND r.table_name='Spell' AND r.locale=l.locale
 AND r.row_id=CASE WHEN v.payload #>> '{raidbots,spellId}' ~ '^[1-9][0-9]*$'
 THEN (v.payload #>> '{raidbots,spellId}')::bigint END
WHERE e.entity_type='enchantment' AND r.source_artifact_id IS NOT NULL
ON CONFLICT DO NOTHING;`

// Alias records share the physical item's effects and facts, not just its
// generic socket/flavour sentence. Both versions and the tooltip locale match.
const itemAliasTooltipsSQL = `
UPDATE catalog_entity_tooltips target
SET blocks=jsonb_build_array(jsonb_build_object('type','name','text',name.name)) ||
 COALESCE((SELECT jsonb_agg(block) FROM jsonb_array_elements(source.blocks) block WHERE block->>'type'<>'name'),'[]'::jsonb),
 plain_text=source.plain_text,
 content_hash=digest(convert_to(name.name||source.plain_text||source.blocks::text,'UTF8'),'sha256')
FROM game_entities alias JOIN game_entity_versions v ON v.id=alias.latest_version_id
JOIN game_entity_localizations name ON name.version_id=v.id
JOIN game_entities item ON item.product_id=alias.product_id AND item.entity_type='item'
 AND item.external_id=alias.external_id AND item.deleted_at IS NULL
JOIN game_entity_versions iv ON iv.id=item.latest_version_id AND iv.build_id=v.build_id
JOIN catalog_entity_tooltips source ON source.version_id=iv.id AND source.locale=name.locale
WHERE alias.entity_type IN ('gem','food','flask','potion') AND alias.deleted_at IS NULL
 AND target.version_id=v.id AND target.locale=name.locale;`
