package catalog

// Quest context is read from the existing build-scoped projections. Never use
// latest_version_id here: a newer candidate must not leak into a public quest.
// Objective discriminators follow QuestObjective.Type (QuestDef.h); in
// particular game objects, criteria trees and kill labels are not creatures.
// https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Quests/QuestDef.h
var questObjectivesSQL = `COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
   'id',objective.objective_id,'type',objective.objective_type,
   'object_id',objective.object_id,'amount',objective.amount,'flags',objective.flags,
   'description',COALESCE(objective_text.description,''),
   'target',target.entry
 ) ORDER BY objective.order_index,objective.objective_id)
 FROM catalog_quest_objectives objective
 LEFT JOIN catalog_quest_objective_localizations objective_text
   ON objective_text.build_id=objective.build_id AND objective_text.quest_id=objective.quest_id
   AND objective_text.objective_id=objective.objective_id AND objective_text.locale={locale}
 LEFT JOIN LATERAL (` + questTargetSelect + `
   WHERE target_entity.product_id=e.product_id AND target_entity.external_id=objective.object_id
     AND target_entity.entity_type=CASE objective.objective_type
       WHEN 0 THEN 'creature' WHEN 1 THEN 'item' WHEN 3 THEN 'creature'
       WHEN 4 THEN 'currency' WHEN 5 THEN 'spell' WHEN 11 THEN 'creature' WHEN 16 THEN 'currency' WHEN 17 THEN 'currency' END
     AND target_entity.deleted_at IS NULL
 ) target ON true
 WHERE objective.build_id=v.build_id AND objective.quest_id=e.external_id
),'[]'::jsonb)`

// An absent or unnamed public target remains null. The raw source ID is kept
// separately, without manufacturing a link to an unavailable library page.
var questTargetSelect = `
 SELECT jsonb_build_object('entity_id',target_entity.id,'entity_type',target_entity.entity_type,
   'external_id',target_entity.external_id,'name',COALESCE(NULLIF(target_name.name,''),target_fallback.name),
   'resolved_locale',CASE WHEN NULLIF(target_name.name,'') IS NULL THEN 'en_US' ELSE {locale} END,
   'slug',COALESCE(NULLIF(target_name.slug,''),NULLIF(target_fallback.slug,''),target_entity.canonical_slug)) AS entry
 FROM game_entities target_entity
 JOIN game_entity_versions target_version ON target_version.id=target_entity.published_version_id
   AND target_version.build_id=v.build_id
 LEFT JOIN game_entity_localizations target_name ON target_name.version_id=target_version.id
   AND target_name.locale={locale}
 JOIN game_entity_localizations target_fallback ON target_fallback.version_id=target_version.id AND target_fallback.locale='en_US'
` + publicCatalogDisplayNamePredicate("target_name", "target_fallback") + publicCatalogUsabilityPredicate("target_entity", "target_version")

var questLinesSQL = `COALESCE((
 SELECT jsonb_agg(jsonb_build_object('id',line.quest_line_id,'name',COALESCE(line_text.name,''),
   'order',line.order_index,'previous',COALESCE(neighbours.previous,'[]'::jsonb),
   'next',COALESCE(neighbours.next,'[]'::jsonb)) ORDER BY line.quest_line_id)
 FROM catalog_quest_line_entries line
 LEFT JOIN catalog_quest_line_localizations line_text ON line_text.build_id=line.build_id
   AND line_text.quest_line_id=line.quest_line_id AND line_text.locale={locale}
 LEFT JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('quest_id',adjacent.quest_id,'order',adjacent.order_index,
     'target',target.entry) ORDER BY adjacent.quest_id) FILTER(WHERE adjacent.order_index<line.order_index) AS previous,
     jsonb_agg(jsonb_build_object('quest_id',adjacent.quest_id,'order',adjacent.order_index,
     'target',target.entry) ORDER BY adjacent.quest_id) FILTER(WHERE adjacent.order_index>line.order_index) AS next
   FROM catalog_quest_line_entries adjacent
   LEFT JOIN LATERAL (` + questTargetSelect + `
     WHERE target_entity.product_id=e.product_id AND target_entity.entity_type='quest'
       AND target_entity.external_id=adjacent.quest_id AND target_entity.deleted_at IS NULL
   ) target ON true
   WHERE adjacent.build_id=line.build_id AND adjacent.quest_line_id=line.quest_line_id
     AND adjacent.order_index IN (
       (SELECT max(prior.order_index) FROM catalog_quest_line_entries prior
         WHERE prior.build_id=line.build_id AND prior.quest_line_id=line.quest_line_id AND prior.order_index<line.order_index),
       (SELECT min(following.order_index) FROM catalog_quest_line_entries following
         WHERE following.build_id=line.build_id AND following.quest_line_id=line.quest_line_id AND following.order_index>line.order_index)
     )
 ) neighbours ON true
 WHERE line.build_id=v.build_id AND line.quest_id=e.external_id
),'[]'::jsonb)`

// UI maps name the zone of a POI without inferring an area from an arbitrary
// UiMapAssignment rectangle. Fall back to its world map only if no public UI
// map exists. DISTINCT removes duplicate objective blobs on the same map.
var questLocationsSQL = `COALESCE((
 SELECT jsonb_agg(location.entry ORDER BY location.entry->>'name') FROM (
   SELECT DISTINCT COALESCE(ui_map.entry,world_map.entry) AS entry
   FROM catalog_quest_poi_blobs poi
   LEFT JOIN LATERAL (` + questTargetSelect + `
     WHERE target_entity.product_id=e.product_id AND target_entity.entity_type='ui_map'
       AND target_entity.external_id=poi.ui_map_id AND target_entity.deleted_at IS NULL
   ) ui_map ON true
   LEFT JOIN LATERAL (` + questTargetSelect + `
     WHERE target_entity.product_id=e.product_id AND target_entity.entity_type='map'
       AND target_entity.external_id=poi.map_id AND target_entity.deleted_at IS NULL
   ) world_map ON ui_map.entry IS NULL
   WHERE poi.build_id=v.build_id AND poi.quest_id=e.external_id
 ) location WHERE location.entry IS NOT NULL
),'[]'::jsonb)`

// Keep client filters verbatim: their boolean logic/conditions are not a flat
// list of prerequisite quests. ContentTuningID is not a character level.
// Official API level bounds are already retained in localization attributes.
var questRequirementsSQL = `jsonb_strip_nulls(
 jsonb_build_object(
   'min_level',COALESCE(l.attributes#>'{blizzard_api,requirements,min_character_level}',fallback.attributes#>'{blizzard_api,requirements,min_character_level}',v.payload#>'{requirements,min_character_level}'),
   'max_level',COALESCE(l.attributes#>'{blizzard_api,requirements,max_character_level}',fallback.attributes#>'{blizzard_api,requirements,max_character_level}',v.payload#>'{requirements,max_character_level}')
 ) || COALESCE((SELECT jsonb_build_object(
   'content_tuning_id',detail.content_tuning_id,
   'classes',COALESCE((SELECT jsonb_agg(class.payload->>'Name_lang' ORDER BY class.row_id)
     FROM catalog_db2_rows class WHERE class.build_id=detail.build_id AND class.table_name='ChrClasses'
       AND class.locale={locale} AND class.row_id BETWEEN 1 AND 63 AND detail.class_mask>0
       AND (detail.class_mask & (1::bigint << (class.row_id-1)::int))<>0),'[]'::jsonb),
   'races',COALESCE((SELECT jsonb_agg(race.payload->>'Name_lang' ORDER BY race.row_id)
     FROM catalog_db2_rows race WHERE race.build_id=detail.build_id AND race.table_name='ChrRaces'
       AND race.locale={locale} AND (race.payload->>'PlayableRaceBit')::int BETWEEN 0 AND 63
       AND NOT (detail.race_mask_0=-1 AND detail.race_mask_1=-1)
       AND (CASE WHEN (race.payload->>'PlayableRaceBit')::int<32 THEN detail.race_mask_0 ELSE detail.race_mask_1 END
         & (1::bigint << ((race.payload->>'PlayableRaceBit')::int % 32)))<>0),'[]'::jsonb),
   'class_mask',detail.class_mask::text,'race_mask_0',detail.race_mask_0::text,'race_mask_1',detail.race_mask_1::text,
   'breadcrumb_quest_id',detail.breadcrumb_quest_id,'breadcrumb',breadcrumb.entry,
   'start_item_id',detail.start_item_id,'start_item',start_item.entry,
   'condition_id',detail.condition_id,'world_state_expression_id',detail.world_state_expression_id,
   'quest_filters',jsonb_strip_nulls(jsonb_build_object(
     'active',detail.flags->'FiltActiveQuest','not_active',detail.flags->'FiltNonActiveQuest',
     'completed_0',detail.flags->'FiltCompletedQuest_0','completed_1',detail.flags->'FiltCompletedQuest_1',
     'completed_2',detail.flags->'FiltCompletedQuest_2','completed_logic',detail.flags->'FiltCompletedQuestLogic'))
 ) FROM catalog_quest_details detail
 LEFT JOIN LATERAL (` + questTargetSelect + `
   WHERE target_entity.product_id=e.product_id AND target_entity.entity_type='quest'
     AND target_entity.external_id=detail.breadcrumb_quest_id AND target_entity.deleted_at IS NULL
 ) breadcrumb ON true
 LEFT JOIN LATERAL (` + questTargetSelect + `
   WHERE target_entity.product_id=e.product_id AND target_entity.entity_type='item'
     AND target_entity.external_id=detail.start_item_id AND target_entity.deleted_at IS NULL
 ) start_item ON true
 WHERE detail.build_id=v.build_id AND detail.quest_id=e.external_id),'{}'::jsonb))`
