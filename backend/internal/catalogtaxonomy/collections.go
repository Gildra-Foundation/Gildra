package catalogtaxonomy

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
)

// Collection facts are derived only from the selected unpublished build. They
// live in localized attributes so the existing detail API can expose both the
// structured facts and ordinary tooltip blocks without a second read model.
func rebuildCollectionDetails(ctx context.Context, tx pgx.Tx) error {
	if _, err := tx.Exec(ctx, projectionSQL(collectionDetailsSQL), pgx.QueryExecModeSimpleProtocol); err != nil {
		return fmt.Errorf("project collection details: %w", err)
	}
	return nil
}

const collectionDetailsSQL = `
CREATE TEMP TABLE collection_base ON COMMIT DROP AS
 SELECT e.id entity_id,e.entity_type,e.external_id,e.product_id,v.id version_id,v.build_id,l.locale,
 r.payload,r.source_artifact_id,l.description
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
 JOIN game_entity_localizations l ON l.version_id=v.id
 JOIN catalog_db2_rows r ON r.build_id=v.build_id AND r.row_id=e.external_id AND r.locale=l.locale
 AND r.table_name=CASE e.entity_type WHEN 'mount' THEN 'Mount' WHEN 'battle_pet' THEN 'BattlePetSpecies'
 WHEN 'toy' THEN 'Toy' WHEN 'transmog_set' THEN 'TransmogSet' WHEN 'item_set' THEN 'ItemSet' END
 WHERE e.deleted_at IS NULL AND e.entity_type IN ('mount','battle_pet','toy','transmog_set','item_set');
CREATE INDEX ON collection_base(build_id,entity_type,external_id);
ANALYZE collection_base;

CREATE TEMP TABLE collection_members ON COMMIT DROP AS
 SELECT b.version_id,b.build_id,b.product_id,b.entity_id,b.locale,a.payload->>'ItemID' item_id,
 jsonb_build_object('appearance_id',a.row_id,'appearance_modifier',a.payload->'ItemAppearanceModifierID',
 'slot',i.payload->'InventoryType','armor_type',i.payload->'SubclassID','item_class',i.payload->'ClassID') attributes,
 ARRAY[b.source_artifact_id,m.source_artifact_id,a.source_artifact_id,i.source_artifact_id] artifacts
 FROM collection_base b
 JOIN catalog_db2_rows m ON m.build_id=b.build_id AND m.table_name='TransmogSetItem' AND m.locale='en_US'
 AND (m.payload->>'TransmogSetID')::bigint=b.external_id
 JOIN catalog_db2_rows a ON a.build_id=b.build_id AND a.table_name='ItemModifiedAppearance' AND a.locale='en_US'
 AND a.row_id=(m.payload->>'ItemModifiedAppearanceID')::bigint
 LEFT JOIN catalog_db2_rows i ON i.build_id=b.build_id AND i.table_name='Item' AND i.locale='en_US' AND i.row_id=(a.payload->>'ItemID')::bigint
 WHERE b.entity_type='transmog_set'
 UNION ALL
 SELECT b.version_id,b.build_id,b.product_id,b.entity_id,b.locale,member.value,
 jsonb_build_object('slot',i.payload->'InventoryType'),ARRAY[b.source_artifact_id,i.source_artifact_id]
 FROM collection_base b CROSS JOIN LATERAL jsonb_each_text(b.payload) member
 LEFT JOIN catalog_db2_rows i ON i.build_id=b.build_id AND i.table_name='Item' AND i.locale='en_US' AND i.row_id=CASE WHEN member.value ~ '^[1-9][0-9]*$' THEN member.value::bigint END
 WHERE b.entity_type='item_set' AND member.key ~ '^ItemID_[0-9]+$' AND member.value ~ '^[1-9][0-9]*$';

CREATE TEMP TABLE collection_bonuses ON COMMIT DROP AS
 SELECT b.version_id,b.build_id,b.product_id,b.entity_id,b.locale,s.row_id bonus_id,
 (s.payload->>'SpellID')::bigint spell_id,(s.payload->>'Threshold')::int pieces,
 s.payload->'ChrSpecID' specialization_id,spell.payload->>'Description_lang' description,
 ARRAY[b.source_artifact_id,s.source_artifact_id,spell.source_artifact_id] artifacts
 FROM collection_base b JOIN catalog_db2_rows s ON s.build_id=b.build_id AND s.table_name='ItemSetSpell' AND s.locale='en_US'
 AND (s.payload->>'ItemSetID')::bigint=b.external_id
 LEFT JOIN catalog_db2_rows spell ON spell.build_id=b.build_id AND spell.table_name='Spell' AND spell.locale=b.locale AND spell.row_id=(s.payload->>'SpellID')::bigint
 WHERE b.entity_type='item_set';

-- Materialize typed join keys once: joining JSON ItemID expressions directly
-- lets the planner repeatedly scan the complete ItemXItemEffect table.
CREATE TEMP TABLE collection_toy_uses ON COMMIT DROP AS
 SELECT x.build_id,(x.payload->>'ItemID')::bigint item_id,ef.row_id effect_id,
 (ef.payload->>'SpellID')::bigint spell_id,x.source_artifact_id item_artifact,ef.source_artifact_id effect_artifact
 FROM catalog_db2_rows x JOIN catalog_db2_rows ef ON ef.build_id=x.build_id AND ef.table_name='ItemEffect'
 AND ef.locale='en_US' AND ef.row_id=(x.payload->>'ItemEffectID')::bigint
 WHERE x.build_id IN (SELECT DISTINCT build_id FROM collection_base) AND x.table_name='ItemXItemEffect' AND x.locale='en_US'
 AND ef.payload->>'TriggerType'='0';
CREATE INDEX ON collection_toy_uses(build_id,item_id);
ANALYZE collection_toy_uses;
CREATE TEMP TABLE collection_toy_effects ON COMMIT DROP AS
 SELECT b.version_id,b.locale,u.effect_id,u.spell_id::text spell_id,
 spell.payload->>'Description_lang' description,
 ARRAY[b.source_artifact_id,u.item_artifact,u.effect_artifact,spell.source_artifact_id] artifacts
 FROM collection_base b JOIN collection_toy_uses u ON u.build_id=b.build_id AND u.item_id=(b.payload->>'ItemID')::bigint
 JOIN catalog_db2_rows spell ON spell.build_id=b.build_id AND spell.table_name='Spell' AND spell.locale=b.locale AND spell.row_id=u.spell_id
 WHERE b.entity_type='toy';

CREATE TEMP TABLE collection_abilities ON COMMIT DROP AS
 SELECT b.version_id,b.locale,x.row_id link_id,a.row_id ability_id,
 a.payload->>'Name_lang' name,a.payload->>'Description_lang' description,
 x.payload->'RequiredLevel' required_level,x.payload->'SlotEnum' slot,
 ARRAY[b.source_artifact_id,x.source_artifact_id,a.source_artifact_id] artifacts
 FROM collection_base b JOIN catalog_db2_rows x ON x.build_id=b.build_id AND x.table_name='BattlePetSpeciesXAbility' AND x.locale='en_US'
 AND (x.payload->>'BattlePetSpeciesID')::bigint=b.external_id
 JOIN catalog_db2_rows a ON a.build_id=b.build_id AND a.table_name='BattlePetAbility' AND a.locale=b.locale AND a.row_id=(x.payload->>'BattlePetAbilityID')::bigint
 WHERE b.entity_type='battle_pet';

CREATE INDEX ON collection_members(version_id,locale);
CREATE INDEX ON collection_bonuses(version_id,locale);
CREATE INDEX ON collection_toy_effects(version_id,locale);
CREATE INDEX ON collection_abilities(version_id,locale);
ANALYZE collection_members;
ANALYZE collection_bonuses;
ANALYZE collection_toy_effects;
ANALYZE collection_abilities;
CREATE TEMP TABLE collection_facts ON COMMIT DROP AS
 SELECT b.*,
 CASE WHEN b.entity_type='toy' THEN concat_ws(E'\n',NULLIF(item.payload->>'Description_lang',''),effects.description)
 WHEN b.entity_type='item_set' THEN COALESCE(bonuses.description,'')
 WHEN b.entity_type IN ('mount','battle_pet') THEN COALESCE(b.payload->>'Description_lang','')
 ELSE b.description END new_description,
 jsonb_strip_nulls(jsonb_build_object('source_text',NULLIF(b.payload->>'SourceText_lang',''),
 'pet_family',CASE WHEN b.entity_type='battle_pet' THEN b.payload->'PetTypeEnum' END,
 'mount_type_id',b.payload->'MountTypeID','class_mask',b.payload->'ClassMask',
 'expansion_id',b.payload->'ExpansionID','expansion_name',CASE WHEN b.locale='ru_RU' THEN expansion.name_ru ELSE expansion.name_en END,'patch_introduced',b.payload->'PatchIntroduced',
 'group_id',b.payload->'TransmogSetGroupID','parent_set_id',b.payload->'ParentTransmogSetID',
 'group_name',NULLIF(grp.payload->>'Name_lang',''),'variant',NULLIF(variant.payload->>'Description_lang',''),
 'bonuses',bonuses.entries,'toy_effects',effects.entries,'item_description',CASE WHEN b.entity_type='toy' THEN NULLIF(item.payload->>'Description_lang','') END,'abilities',abilities.entries,'members',members.entries,
 'armor_types',members.armor_types,'classes',classes.entries,'mount_capabilities',capabilities.entries)) facts,
 ARRAY[b.source_artifact_id,item.source_artifact_id,grp.source_artifact_id,variant.source_artifact_id] artifacts
 FROM collection_base b
 LEFT JOIN catalog_expansions expansion ON expansion.product_id=b.product_id AND expansion.external_expansion_id=(b.payload->>'ExpansionID')::int
 LEFT JOIN catalog_db2_rows item ON b.entity_type='toy' AND item.build_id=b.build_id AND item.table_name='ItemSparse' AND item.locale=b.locale AND item.row_id=(b.payload->>'ItemID')::bigint
 LEFT JOIN catalog_db2_rows grp ON b.entity_type='transmog_set' AND grp.build_id=b.build_id AND grp.table_name='TransmogSetGroup' AND grp.locale=b.locale AND grp.row_id=(b.payload->>'TransmogSetGroupID')::bigint
 LEFT JOIN catalog_db2_rows variant ON b.entity_type='transmog_set' AND variant.build_id=b.build_id AND variant.table_name='ItemNameDescription' AND variant.locale=b.locale AND variant.row_id=(b.payload->>'ItemNameDescriptionID')::bigint
 LEFT JOIN LATERAL (SELECT string_agg(DISTINCT NULLIF(description,''),E'\n' ORDER BY NULLIF(description,'')) description, jsonb_agg(jsonb_build_object('spell_id',spell_id,'description',description) ORDER BY effect_id) entries FROM collection_toy_effects t WHERE t.version_id=b.version_id AND t.locale=b.locale) effects ON true
 LEFT JOIN LATERAL (SELECT string_agg(CASE WHEN NULLIF(description,'') IS NOT NULL THEN '('||pieces||') '||description END,E'\n' ORDER BY pieces,bonus_id) description,
 jsonb_agg(jsonb_build_object('spell_id',spell_id,'pieces',pieces,'specialization_id',specialization_id,'description',description) ORDER BY pieces,bonus_id) entries
 FROM collection_bonuses t WHERE t.version_id=b.version_id AND t.locale=b.locale) bonuses ON true
 LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',ability_id,'name',name,'description',description,'required_level',required_level,'slot',slot) ORDER BY slot,required_level,ability_id) entries
 FROM collection_abilities t WHERE t.version_id=b.version_id AND t.locale=b.locale) abilities ON true
 LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('item_id',item_id)||attributes ORDER BY item_id,attributes::text) entries,
 jsonb_agg(DISTINCT attributes->'armor_type') FILTER(WHERE attributes->>'item_class'='4' AND attributes->>'armor_type' IN ('1','2','3','4')) armor_types
 FROM collection_members t WHERE t.version_id=b.version_id AND t.locale=b.locale) members ON true
 LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',c.row_id,'name',c.payload->>'Name_lang') ORDER BY c.row_id) entries
 FROM catalog_db2_rows c WHERE b.entity_type='transmog_set' AND c.build_id=b.build_id AND c.table_name='ChrClasses' AND c.locale=b.locale
 AND c.row_id BETWEEN 1 AND 63 AND (COALESCE((b.payload->>'ClassMask')::bigint,0) & (1::bigint << (c.row_id::int-1)))<>0) classes ON true
 LEFT JOIN LATERAL (SELECT jsonb_agg(c.payload ORDER BY c.row_id) entries
 FROM catalog_db2_rows x JOIN catalog_db2_rows c ON c.build_id=x.build_id AND c.table_name='MountCapability' AND c.locale='en_US' AND c.row_id=(x.payload->>'MountCapabilityID')::bigint
 WHERE b.entity_type='mount' AND x.build_id=b.build_id AND x.table_name='MountTypeXCapability' AND x.locale='en_US' AND x.payload->>'MountTypeID'=b.payload->>'MountTypeID') capabilities ON true;

-- Mount capability bits are client movement flags (ground=1, flight=2,
-- surface swimming=4, underwater=8). Keep all applicable modes, not a guessed
-- single category; restrictions remain available in mount_capabilities.
UPDATE collection_facts SET facts=facts||jsonb_build_object('mount_modes',
 COALESCE((SELECT jsonb_agg(mode ORDER BY bit) FROM (VALUES(1,'ground'),(2,'flying'),(12,'aquatic')) modes(bit,mode)
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(facts->'mount_capabilities') c WHERE ((c->>'Flags')::int & bit)<>0)),'[]'::jsonb))
 WHERE entity_type='mount' AND facts ? 'mount_capabilities';

UPDATE game_entity_localizations l SET description=COALESCE(NULLIF(f.new_description,''),f.description,''),
 attributes=l.attributes||jsonb_build_object('collection',f.facts||jsonb_build_object('blocks',
 jsonb_build_array(f.facts||jsonb_build_object('type','collection_info'))
 || CASE WHEN NULLIF(f.facts->>'item_description','') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','description','text',f.facts->>'item_description')) ELSE '[]'::jsonb END
 || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','effect','spell_id',x->'spell_id','text',x->>'description','trigger',0)) FROM jsonb_array_elements(f.facts->'toy_effects') x WHERE NULLIF(x->>'description','') IS NOT NULL),'[]'::jsonb)
 || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','effect','spell_id',x->'spell_id','pieces',x->'pieces','text','('||(x->>'pieces')||') '||(x->>'description'))) FROM jsonb_array_elements(f.facts->'bonuses') x WHERE NULLIF(x->>'description','') IS NOT NULL),'[]'::jsonb)
 || CASE WHEN NULLIF(f.facts->>'source_text','') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','effect','text',f.facts->>'source_text')) ELSE '[]'::jsonb END
 || CASE WHEN NULLIF(f.facts->>'expansion_name','') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','effect','text',f.facts->>'expansion_name')) ELSE '[]'::jsonb END
 || CASE WHEN NULLIF(f.facts->>'variant','') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','effect','text',f.facts->>'variant')) ELSE '[]'::jsonb END
 || CASE WHEN NULLIF(f.facts->>'group_name','') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','effect','text',f.facts->>'group_name')) ELSE '[]'::jsonb END
 || CASE WHEN f.entity_type='battle_pet' AND (f.facts->>'pet_family')::int BETWEEN 0 AND 9 THEN
 jsonb_build_array(jsonb_build_object('type','effect','text',CASE WHEN f.locale='ru_RU' THEN
 (ARRAY['Гуманоид','Дракон','Летающий','Нежить','Зверек','Магический','Элементаль','Животное','Водный','Механизм'])[(f.facts->>'pet_family')::int+1]
 ELSE (ARRAY['Humanoid','Dragonkin','Flying','Undead','Critter','Magic','Elemental','Beast','Aquatic','Mechanical'])[(f.facts->>'pet_family')::int+1] END)) ELSE '[]'::jsonb END
 || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','effect','text',CASE WHEN f.locale='ru_RU' THEN CASE m #>> '{}' WHEN 'ground' THEN 'Наземный' WHEN 'flying' THEN 'Летающий' WHEN 'aquatic' THEN 'Водный' END ELSE initcap(m #>> '{}') END)) FROM jsonb_array_elements(f.facts->'mount_modes') m),'[]'::jsonb)
 || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','effect','text',c->>'name')) FROM jsonb_array_elements(f.facts->'classes') c),'[]'::jsonb)
 || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','subclass','class_id',4,'subclass_id',c)) FROM jsonb_array_elements(f.facts->'armor_types') c),'[]'::jsonb)
 || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','effect','text',a->>'name'||' ('||COALESCE(a->>'required_level','1')||')'||CASE WHEN NULLIF(a->>'description','') IS NOT NULL THEN ': '|| (a->>'description') ELSE '' END)) FROM jsonb_array_elements(f.facts->'abilities') a),'[]'::jsonb)))
 FROM collection_facts f WHERE l.version_id=f.version_id AND l.locale=f.locale;

INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
 SELECT DISTINCT version_id,locale,artifact FROM (
 SELECT version_id,locale,unnest(artifacts) artifact FROM collection_facts
 UNION ALL SELECT version_id,locale,unnest(artifacts) FROM collection_members
 UNION ALL SELECT version_id,locale,unnest(artifacts) FROM collection_bonuses
 UNION ALL SELECT version_id,locale,unnest(artifacts) FROM collection_toy_effects
 UNION ALL SELECT version_id,locale,unnest(artifacts) FROM collection_abilities
 UNION ALL SELECT b.version_id,b.locale,c.source_artifact_id FROM collection_base b JOIN catalog_db2_rows c
 ON b.entity_type='transmog_set' AND c.build_id=b.build_id AND c.table_name='ChrClasses' AND c.locale=b.locale
 AND c.row_id BETWEEN 1 AND 63 AND (COALESCE((b.payload->>'ClassMask')::bigint,0) & (1::bigint << (c.row_id::int-1)))<>0
 UNION ALL SELECT b.version_id,b.locale,unnest(ARRAY[x.source_artifact_id,c.source_artifact_id]) FROM collection_base b
 JOIN catalog_db2_rows x ON b.entity_type='mount' AND x.build_id=b.build_id AND x.table_name='MountTypeXCapability' AND x.locale='en_US' AND x.payload->>'MountTypeID'=b.payload->>'MountTypeID'
 JOIN catalog_db2_rows c ON c.build_id=b.build_id AND c.table_name='MountCapability' AND c.locale='en_US' AND c.row_id=(x.payload->>'MountCapabilityID')::bigint
 ) proofs WHERE artifact IS NOT NULL ON CONFLICT DO NOTHING;

DROP TABLE collection_facts,collection_abilities,collection_toy_effects,collection_toy_uses,collection_bonuses,collection_members,collection_base;
`

func rebuildCollectionLinks(ctx context.Context, tx pgx.Tx) error {
	if err := rebuildCollectionDetails(ctx, tx); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, projectionSQL(collectionLinksSQL), pgx.QueryExecModeSimpleProtocol)
	if err != nil {
		return fmt.Errorf("project collection relationships: %w", err)
	}
	return nil
}

const collectionLinksSQL = `
DELETE FROM game_entity_links WHERE build_id IN ({projection_builds}) AND attributes->>'projection'='db2_collections';
CREATE TEMP TABLE collection_item_teachers ON COMMIT DROP AS
 SELECT x.build_id,(ef.payload->>'SpellID')::bigint spell_id,(x.payload->>'ItemID')::bigint item_id,
 x.source_artifact_id,ef.source_artifact_id effect_artifact
 FROM catalog_db2_rows x JOIN catalog_db2_rows ef ON ef.build_id=x.build_id AND ef.table_name='ItemEffect' AND ef.locale='en_US' AND ef.row_id=(x.payload->>'ItemEffectID')::bigint
 WHERE x.build_id IN ({projection_builds}) AND x.table_name='ItemXItemEffect' AND x.locale='en_US';
CREATE INDEX ON collection_item_teachers(build_id,spell_id);
ANALYZE collection_item_teachers;
CREATE TEMP TABLE collection_learn_spells ON COMMIT DROP AS
 SELECT build_id,(payload->>'SpellID')::bigint spell_id,(payload->>'EffectTriggerSpell')::bigint learned_spell_id,source_artifact_id
 FROM catalog_db2_rows WHERE build_id IN ({projection_builds}) AND table_name='SpellEffect' AND locale='en_US' AND payload->>'Effect'='36' AND (payload->>'EffectTriggerSpell')::bigint>0 AND (payload->>'SpellID')::bigint>0;
CREATE INDEX ON collection_learn_spells(build_id,learned_spell_id);
ANALYZE collection_learn_spells;

CREATE TEMP TABLE collection_link_base ON COMMIT DROP AS
 SELECT e.id,e.entity_type,e.external_id,e.product_id,v.build_id,l.attributes->'collection' facts,r.payload,r.source_artifact_id
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
 JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale='en_US'
 JOIN catalog_db2_rows r ON r.build_id=v.build_id AND r.locale='en_US' AND r.row_id=e.external_id
 AND r.table_name=CASE e.entity_type WHEN 'mount' THEN 'Mount' WHEN 'battle_pet' THEN 'BattlePetSpecies' WHEN 'toy' THEN 'Toy' WHEN 'transmog_set' THEN 'TransmogSet' WHEN 'item_set' THEN 'ItemSet' END
 WHERE e.deleted_at IS NULL AND e.entity_type IN ('mount','battle_pet','toy','transmog_set','item_set');
ANALYZE collection_link_base;
CREATE TEMP TABLE collection_link_candidates ON COMMIT DROP AS
 WITH direct AS (
 SELECT b.*,CASE b.entity_type WHEN 'mount' THEN (payload->>'SourceSpellID')::bigint ELSE (payload->>'SummonSpellID')::bigint END spell_id FROM collection_link_base b WHERE entity_type IN ('mount','battle_pet')
 ), teachers AS MATERIALIZED (
 SELECT build_id,id,product_id,spell_id,source_artifact_id FROM direct WHERE spell_id>0
 UNION
 SELECT d.build_id,d.id,d.product_id,s.spell_id,s.source_artifact_id FROM direct d
 JOIN collection_learn_spells s ON s.build_id=d.build_id AND s.learned_spell_id=d.spell_id AND d.spell_id>0
 )
 SELECT b.id source_id,b.build_id,b.product_id,'item'::text target_type,(m->>'item_id')::bigint target_id,'contains'::text relation,
 m||jsonb_build_object('source_artifact_id',b.source_artifact_id) attrs
 FROM collection_link_base b CROSS JOIN LATERAL jsonb_array_elements(b.facts->'members') m
 UNION ALL SELECT b.id,b.build_id,b.product_id,'spell',(m->>'spell_id')::bigint,'grants',m||jsonb_build_object('source_artifact_id',b.source_artifact_id)
 FROM collection_link_base b CROSS JOIN LATERAL jsonb_array_elements(b.facts->'bonuses') m
 UNION ALL SELECT b.id,b.build_id,b.product_id,'item',(payload->>'ItemID')::bigint,'obtained_from',jsonb_build_object('source_artifact_id',b.source_artifact_id)
 FROM collection_link_base b WHERE entity_type='toy'
 UNION ALL SELECT d.id,d.build_id,d.product_id,'spell',d.spell_id,'grants',jsonb_build_object('source_artifact_id',d.source_artifact_id) FROM teachers d WHERE spell_id>0
 UNION ALL SELECT d.id,d.build_id,d.product_id,'item',x.item_id,'obtained_from',jsonb_build_object('teaching_spell_id',d.spell_id,'source_artifact_id',x.source_artifact_id,'effect_artifact_id',x.effect_artifact)
 FROM teachers d JOIN collection_item_teachers x ON x.build_id=d.build_id AND x.spell_id=d.spell_id
 UNION ALL SELECT b.id,b.build_id,b.product_id,'transmog_set',(payload->>'ParentTransmogSetID')::bigint,'belongs_to',jsonb_build_object('source_artifact_id',b.source_artifact_id)
 FROM collection_link_base b WHERE entity_type='transmog_set' AND (payload->>'ParentTransmogSetID')::bigint>0
 UNION ALL SELECT b.id,b.build_id,b.product_id,'class',(c->>'id')::bigint,'owned_by',jsonb_build_object('source_artifact_id',b.source_artifact_id)
 FROM collection_link_base b CROSS JOIN LATERAL jsonb_array_elements(b.facts->'classes') c;

ANALYZE collection_link_candidates;
INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
 SELECT CASE WHEN c.relation='contains' THEN target.id ELSE c.source_id END,
 CASE WHEN c.relation='contains' THEN c.source_id ELSE target.id END,c.build_id,
 CASE WHEN c.relation='contains' THEN 'belongs_to' ELSE c.relation END,
 jsonb_build_object('projection','db2_collections','source','db2','entries',jsonb_agg(DISTINCT c.attrs),'slot',min(c.attrs->>'slot'))
 FROM collection_link_candidates c JOIN game_entities target ON target.product_id=c.product_id AND target.entity_type=c.target_type AND target.external_id=c.target_id AND target.deleted_at IS NULL
 WHERE EXISTS(SELECT 1 FROM game_entity_versions tv WHERE tv.entity_id=target.id AND tv.build_id=c.build_id)
 GROUP BY c.source_id,target.id,c.build_id,c.relation
 ON CONFLICT(source_entity_id,target_entity_id,build_id,relation_type) DO UPDATE SET attributes=EXCLUDED.attributes;
DROP TABLE collection_link_candidates,collection_link_base,collection_item_teachers,collection_learn_spells;
`
