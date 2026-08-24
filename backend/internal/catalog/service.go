package catalog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("game entity not found")

type Product struct {
	ID   int32
	Slug string
	Name string
}

type Entity struct {
	ID          uuid.UUID
	Product     string
	Type        string
	ExternalID  int64
	Slug        string
	Locale      string
	Name        string
	Description string
	Tooltip     *Tooltip
	IconName    *string
	Quality     *int
	BuildID     *int64
	Payload     map[string]any
	UpdatedAt   time.Time
}

type Tooltip struct {
	PlainText string
	Blocks    []map[string]any
}

type Category struct {
	ID          int64
	Type        string
	Facet       string
	Slug        string
	Path        string
	ParentPath  string
	Name        string
	Description string
	Count       int64
	SortOrder   int
}

type ListParams struct {
	Product  string
	Type     string
	Locale   string
	Query    string
	Category string
	Cursor   string
	Limit    int
}

type Page struct {
	Entities   []Entity
	NextCursor string
	HasMore    bool
	Total      int64
}

type Service struct {
	postgres *pgxpool.Pool
}

func NewService(postgres *pgxpool.Pool) *Service {
	return &Service{postgres: postgres}
}

func (s *Service) Products(ctx context.Context) ([]Product, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT id, slug, name
		FROM game_products
		ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list game products: %w", err)
	}
	defer rows.Close()

	products := make([]Product, 0, 8)
	for rows.Next() {
		var product Product
		if err := rows.Scan(&product.ID, &product.Slug, &product.Name); err != nil {
			return nil, fmt.Errorf("scan game product: %w", err)
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate game products: %w", err)
	}
	return products, nil
}

func (s *Service) Categories(ctx context.Context, product, entityType, locale string) ([]Category, error) {
	if strings.TrimSpace(entityType) == "" {
		return nil, errors.New("entity type is required")
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT c.id, c.entity_type, c.facet, c.slug, c.path, COALESCE(parent.path, ''),
			COALESCE(NULLIF(l.name, ''), fallback.name, c.slug),
			COALESCE(NULLIF(l.description, ''), fallback.description, ''),
			COALESCE(stats.entity_count, 0), c.sort_order
		FROM catalog_categories c
		JOIN game_products p ON p.id = c.product_id
		LEFT JOIN catalog_categories parent ON parent.id = c.parent_id
		LEFT JOIN catalog_category_localizations l ON l.category_id = c.id AND l.locale = $3
		LEFT JOIN catalog_category_localizations fallback ON fallback.category_id = c.id AND fallback.locale = 'en_US'
		LEFT JOIN catalog_category_stats stats ON stats.category_id = c.id
		WHERE p.slug = $1 AND c.entity_type = $2 AND COALESCE(stats.entity_count, 0) > 0
		ORDER BY c.path, c.sort_order, c.id`,
		strings.TrimSpace(product), strings.TrimSpace(entityType), normalizeLocale(locale))
	if err != nil {
		return nil, fmt.Errorf("list game categories: %w", err)
	}
	defer rows.Close()
	categories := make([]Category, 0, 64)
	for rows.Next() {
		var category Category
		if err := rows.Scan(&category.ID, &category.Type, &category.Facet, &category.Slug, &category.Path,
			&category.ParentPath, &category.Name, &category.Description, &category.Count, &category.SortOrder); err != nil {
			return nil, fmt.Errorf("scan game category: %w", err)
		}
		categories = append(categories, category)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate game categories: %w", err)
	}
	return categories, nil
}

func (s *Service) List(ctx context.Context, params ListParams) (Page, error) {
	if params.Limit < 1 || params.Limit > 100 {
		return Page{}, errors.New("limit must be between 1 and 100")
	}
	cursorID, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page{}, err
	}
	total, err := s.count(ctx, params)
	if err != nil {
		return Page{}, err
	}

	rows, err := s.postgres.Query(ctx, `
		WITH RECURSIVE selected_categories AS (
			SELECT c.id
			FROM catalog_categories c
			JOIN game_products selected_product ON selected_product.id = c.product_id
			WHERE $7 <> '' AND selected_product.slug = COALESCE(NULLIF($1, ''), 'wow')
			  AND c.entity_type = $2 AND c.path = $7
			UNION ALL
			SELECT child.id
			FROM catalog_categories child
			JOIN selected_categories selected ON child.parent_id = selected.id
		)
		SELECT
			e.id, p.slug, e.entity_type, e.external_id, e.canonical_slug,
			$4::text AS locale, COALESCE(NULLIF(l.name, ''), fallback.name, ''),
			COALESCE(NULLIF(l.description, ''), fallback.description, ''),
			v.build_id, COALESCE(v.payload, '{}'::jsonb), e.updated_at,
			COALESCE(t.plain_text, fallback_t.plain_text),
			COALESCE(t.blocks,fallback_t.blocks,'[]'::jsonb)
			|| COALESCE(spell_effects.blocks,'[]'::jsonb) || COALESCE(talent_spells.blocks,'[]'::jsonb) || COALESCE(profession_info.blocks,'[]'::jsonb) || COALESCE(recipe_info.blocks,'[]'::jsonb) || COALESCE(item_context.blocks,'[]'::jsonb) || COALESCE(quest_info.blocks,'[]'::jsonb) || COALESCE(creature_info.blocks,'[]'::jsonb) || COALESCE(generic_description.blocks,'[]'::jsonb) || COALESCE(provenance.blocks,'[]'::jsonb),
			COALESCE(fa.icon_name, spell_fa.icon_name, source_icon.icon_name, db2_fa.icon_name,
				NULLIF(v.payload #>> '{raidbots,icon}',''),NULLIF(v.payload #>> '{raidbots,spellIcon}','')),CASE WHEN ci.quality ~ '^[0-9]+$' THEN ci.quality::int END
		FROM game_entities e
		JOIN game_products p ON p.id = e.product_id
		LEFT JOIN (
			SELECT DISTINCT ec.version_id FROM game_entity_categories ec
			WHERE ec.category_id IN (SELECT id FROM selected_categories)
		) selected_entity ON selected_entity.version_id=e.latest_version_id
		LEFT JOIN game_entity_versions v ON v.id = e.latest_version_id
		LEFT JOIN game_entity_localizations l ON l.version_id = v.id AND l.locale = $4
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id = v.id AND fallback.locale = 'en_US'
		LEFT JOIN catalog_entity_tooltips t ON t.version_id = v.id AND t.locale = $4
		LEFT JOIN catalog_entity_tooltips fallback_t ON fallback_t.version_id = v.id AND fallback_t.locale = 'en_US'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','spell_effects','entries',jsonb_agg(jsonb_build_object('index',effect.effect_index,'difficulty_id',effect.difficulty_id,'effect_type',effect.effect_type,'aura_type',effect.aura_type,'base_points',effect.base_points,'coefficient',effect.coefficient,'attack_power_coefficient',effect.attack_power_coefficient,'amplitude_ms',effect.amplitude_ms,'chain_targets',effect.chain_targets,'attributes',effect.attributes) ORDER BY effect.effect_index,effect.difficulty_id))) AS blocks
			FROM catalog_spell_effects effect WHERE e.entity_type='spell' AND effect.spell_version_id=v.id
		) spell_effects ON e.entity_type='spell'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','talent_spells','entries',jsonb_agg(jsonb_build_object(
				'entity_id',spell.id,'external_id',spell.external_id,'name',COALESCE(spell_name.name,spell_fallback.name,''),
				'relationship',relation.relationship,'source',relation.source,'attributes',relation.attributes,
				'icon_name',COALESCE(spell_icon.icon_name,NULLIF(spell_version.payload #>> '{raidbots,icon}',''),NULLIF(spell_version.payload #>> '{raidbots,spellIcon}','')),
				'effects',COALESCE((SELECT jsonb_agg(jsonb_build_object('index',effect.effect_index,'difficulty_id',effect.difficulty_id,'effect_type',effect.effect_type,'aura_type',effect.aura_type,'base_points',effect.base_points,'coefficient',effect.coefficient,'attack_power_coefficient',effect.attack_power_coefficient,'amplitude_ms',effect.amplitude_ms,'chain_targets',effect.chain_targets,'attributes',effect.attributes) ORDER BY effect.effect_index,effect.difficulty_id) FROM catalog_spell_effects effect WHERE effect.spell_version_id=relation.spell_version_id),'[]'::jsonb)
			) ORDER BY relation.relationship,spell.external_id))) AS blocks
			FROM catalog_talent_spell_relations relation
			JOIN game_entity_versions spell_version ON spell_version.id=relation.spell_version_id
			JOIN game_entities spell ON spell.id=spell_version.entity_id
			LEFT JOIN game_entity_localizations spell_name ON spell_name.version_id=spell_version.id AND spell_name.locale=$4
			LEFT JOIN game_entity_localizations spell_fallback ON spell_fallback.version_id=spell_version.id AND spell_fallback.locale='en_US'
			LEFT JOIN catalog_entity_icons spell_icon ON spell_icon.build_id=spell_version.build_id AND spell_icon.entity_type='spell' AND spell_icon.external_id=spell.external_id
			WHERE e.entity_type IN ('talent','pvp_talent') AND relation.talent_version_id=v.id
		) talent_spells ON e.entity_type IN ('talent','pvp_talent')
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','profession_info',
				'skill_line_id',profession.skill_line_id,'parent_skill_line_id',profession.parent_skill_line_id,
				'category_id',profession.category_id,'tier_index',profession.parent_tier_index,
				'can_link',profession.can_link,'recipe_count',(SELECT count(*) FROM catalog_profession_recipes recipe WHERE recipe.profession_version_id=v.id),
				'category_count',(SELECT count(DISTINCT recipe.trade_skill_category_id) FROM catalog_profession_recipes recipe WHERE recipe.profession_version_id=v.id AND recipe.trade_skill_category_id IS NOT NULL),
				'recipes',COALESCE((SELECT jsonb_agg(sample.entry ORDER BY sample.name) FROM (SELECT recipe_name.name,jsonb_build_object('id',recipe_entity.id,'external_id',recipe_entity.external_id,'name',recipe_name.name,'min_skill_rank',recipe.min_skill_rank) entry FROM catalog_profession_recipes recipe JOIN game_entity_versions recipe_version ON recipe_version.id=recipe.recipe_version_id JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id LEFT JOIN game_entity_localizations recipe_name ON recipe_name.version_id=recipe.recipe_version_id AND recipe_name.locale=$4 WHERE recipe.profession_version_id=v.id ORDER BY recipe_name.name NULLS LAST LIMIT 8) sample),'[]'::jsonb))) AS blocks
			FROM catalog_professions profession WHERE e.entity_type='profession' AND profession.version_id=v.id
		) profession_info ON true
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','recipe_info','spell_id',recipe.spell_id,
				'professions',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',profession_entity.id,'external_id',profession_entity.external_id,'name',COALESCE(profession_name.name,profession_fallback.name,''),'min_skill_rank',link.min_skill_rank,'category_id',link.trade_skill_category_id) ORDER BY profession_entity.external_id) FROM catalog_profession_recipes link JOIN game_entity_versions profession_version ON profession_version.id=link.profession_version_id JOIN game_entities profession_entity ON profession_entity.id=profession_version.entity_id LEFT JOIN game_entity_localizations profession_name ON profession_name.version_id=link.profession_version_id AND profession_name.locale=$4 LEFT JOIN game_entity_localizations profession_fallback ON profession_fallback.version_id=link.profession_version_id AND profession_fallback.locale='en_US' WHERE link.recipe_version_id=v.id),'[]'::jsonb),
				'reagents',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',item.id,'external_id',reagent.item_external_id,'name',COALESCE(item_name.name,item_fallback.name,''),'quantity',reagent.quantity,'recraft_quantity',reagent.recraft_quantity,'slot',reagent.slot) ORDER BY reagent.slot) FROM catalog_recipe_reagents reagent LEFT JOIN game_entities item ON item.id=reagent.item_entity_id LEFT JOIN game_entity_localizations item_name ON item_name.version_id=item.latest_version_id AND item_name.locale=$4 LEFT JOIN game_entity_localizations item_fallback ON item_fallback.version_id=item.latest_version_id AND item_fallback.locale='en_US' WHERE reagent.recipe_version_id=v.id),'[]'::jsonb),
				'currencies',COALESCE((SELECT jsonb_agg(jsonb_build_object('external_id',currency.currency_external_id,'quantity',currency.quantity,'recraft_quantity',currency.recraft_quantity) ORDER BY currency.order_index,currency.currency_external_id) FROM catalog_recipe_currencies currency WHERE currency.recipe_version_id=v.id),'[]'::jsonb),
				'outputs',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',item.id,'external_id',output.item_external_id,'name',COALESCE(item_name.name,item_fallback.name,''),'source',output.source) ORDER BY output.item_external_id) FROM catalog_recipe_outputs output LEFT JOIN game_entities item ON item.id=output.item_entity_id LEFT JOIN game_entity_localizations item_name ON item_name.version_id=item.latest_version_id AND item_name.locale=$4 LEFT JOIN game_entity_localizations item_fallback ON item_fallback.version_id=item.latest_version_id AND item_fallback.locale='en_US' WHERE output.recipe_version_id=v.id),'[]'::jsonb))) AS blocks
			FROM catalog_recipes recipe WHERE e.entity_type='spell' AND recipe.version_id=v.id
		) recipe_info ON e.entity_type='spell'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','item_requirements','class_mask',requirements.allowable_class_mask::text,
				'race_mask_0',requirements.allowable_race_mask_0::text,'race_mask_1',requirements.allowable_race_mask_1::text,
				'required_ability_id',requirements.required_ability_id,'faction_id',requirements.min_faction_id,'reputation',requirements.min_reputation,
				'holiday_id',requirements.required_holiday_id,'transmog_holiday_id',requirements.required_transmog_holiday_id))
				|| COALESCE((SELECT jsonb_build_array(jsonb_build_object('type','item_effect_metadata','entries',jsonb_agg(jsonb_build_object('spell_id',effect.spell_id,'charges',effect.charges,'cooldown_ms',effect.cooldown_ms,'category_cooldown_ms',effect.category_cooldown_ms,'specialization_id',effect.specialization_id,'player_condition_id',effect.player_condition_id) ORDER BY effect.slot))) FROM catalog_item_effects effect WHERE effect.version_id=v.id AND (effect.charges<>0 OR effect.cooldown_ms<>0 OR effect.category_cooldown_ms<>0 OR effect.specialization_id<>0 OR effect.player_condition_id<>0)),'[]'::jsonb) AS blocks
			FROM catalog_item_requirements requirements WHERE e.entity_type='item' AND requirements.version_id=v.id
		) item_context ON e.entity_type='item'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','quest_info','status',registry.enrichment_status,
				'bullet_text',COALESCE(quest_text.bullet_text,''),
				'objectives',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',objective.objective_id,'type',objective.objective_type,'object_id',objective.object_id,'amount',objective.amount,'description',COALESCE(objective_text.description,'')) ORDER BY objective.order_index,objective.objective_id) FROM catalog_quest_objectives objective LEFT JOIN catalog_quest_objective_localizations objective_text ON objective_text.build_id=objective.build_id AND objective_text.quest_id=objective.quest_id AND objective_text.objective_id=objective.objective_id AND objective_text.locale=$4 WHERE objective.build_id=registry.build_id AND objective.quest_id=registry.quest_id),'[]'::jsonb),
				'quest_lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',line.quest_line_id,'name',COALESCE(line_text.name,''),'order',line.order_index) ORDER BY line.order_index) FROM catalog_quest_line_entries line LEFT JOIN catalog_quest_line_localizations line_text ON line_text.build_id=line.build_id AND line_text.quest_line_id=line.quest_line_id AND line_text.locale=$4 WHERE line.build_id=registry.build_id AND line.quest_id=registry.quest_id),'[]'::jsonb),
				'rewards',COALESCE((SELECT jsonb_agg(jsonb_build_object(
					'type',reward.reward_type,'external_id',reward.external_id,'amount',reward.amount,'choice',reward.is_choice,
					'entity_id',reward_entity.id,'entity_type',reward_entity.entity_type,'slug',COALESCE(NULLIF(reward_name.slug,''),NULLIF(reward_fallback.slug,''),reward_entity.canonical_slug),
					'name',COALESCE(NULLIF(reward_name.name,''),reward.attributes #>> ARRAY['names',$4],NULLIF(reward_fallback.name,''),reward.attributes #>> '{names,en_US}',''),
					'icon_name',COALESCE(reward_icon.icon_name,reward_file.icon_name,reward_db2_file.icon_name,NULLIF(reward_version.payload #>> '{raidbots,icon}','')),
					'quality',CASE WHEN reward_item.quality ~ '^[0-9]+$' THEN reward_item.quality::int END
				) ORDER BY reward.reward_type,reward.reward_index)
				FROM catalog_quest_rewards reward
				LEFT JOIN game_entities reward_entity ON reward_entity.product_id=e.product_id
					AND reward_entity.entity_type=CASE reward.reward_type WHEN 'reputation' THEN 'faction' ELSE reward.reward_type END
					AND reward_entity.external_id=reward.external_id AND reward_entity.deleted_at IS NULL
					AND reward_entity.latest_version_id IS NOT NULL
				LEFT JOIN LATERAL (SELECT candidate.id,candidate.payload FROM game_entity_versions candidate WHERE candidate.entity_id=reward_entity.id AND candidate.build_id=reward.build_id ORDER BY candidate.revision DESC LIMIT 1) reward_version ON true
				LEFT JOIN game_entity_localizations reward_name ON reward_name.version_id=reward_version.id AND reward_name.locale=$4
				LEFT JOIN game_entity_localizations reward_fallback ON reward_fallback.version_id=reward_version.id AND reward_fallback.locale='en_US'
				LEFT JOIN catalog_entity_icons reward_icon ON reward_icon.build_id=reward.build_id AND reward_icon.entity_type=reward_entity.entity_type AND reward_icon.external_id=reward.external_id
				LEFT JOIN catalog_file_assets reward_file ON reward_file.file_data_id=CASE WHEN reward_version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (reward_version.payload->>'icon_file_data_id')::bigint END
				LEFT JOIN catalog_file_assets reward_db2_file ON reward_db2_file.file_data_id=CASE WHEN COALESCE(reward_version.payload #>> '{db2,InventoryIconFileID}',reward_version.payload #>> '{db2,IconFileID}',reward_version.payload #>> '{db2,IconFileDataID}') ~ '^[0-9]+$' THEN COALESCE(reward_version.payload #>> '{db2,InventoryIconFileID}',reward_version.payload #>> '{db2,IconFileID}',reward_version.payload #>> '{db2,IconFileDataID}')::bigint END
				LEFT JOIN catalog_items reward_item ON reward_item.version_id=reward_version.id
				WHERE reward.build_id=registry.build_id AND reward.quest_id=registry.quest_id),'[]'::jsonb),
				'poi_count',(SELECT count(*) FROM catalog_quest_poi_blobs poi WHERE poi.build_id=registry.build_id AND poi.quest_id=registry.quest_id))) AS blocks
			FROM catalog_quest_registry registry LEFT JOIN catalog_quest_localizations quest_text ON quest_text.build_id=registry.build_id AND quest_text.quest_id=registry.quest_id AND quest_text.locale=$4
			WHERE e.entity_type='quest' AND registry.build_id=v.build_id AND registry.quest_id=e.external_id
		) quest_info ON e.entity_type='quest'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','creature_info','classification_id',creature.classification_id,
				'creature_type_id',creature.creature_type_id,'creature_type',COALESCE((SELECT taxon.name FROM catalog_creature_taxon_localizations taxon WHERE taxon.build_id=v.build_id AND taxon.taxon_type='type' AND taxon.external_id=creature.creature_type_id AND taxon.locale=$4),''),
				'creature_family_id',creature.creature_family_id,'creature_family',COALESCE((SELECT taxon.name FROM catalog_creature_taxon_localizations taxon WHERE taxon.build_id=v.build_id AND taxon.taxon_type='family' AND taxon.external_id=creature.creature_family_id AND taxon.locale=$4),''),
				'difficulty_count',(SELECT count(*) FROM catalog_creature_difficulties difficulty WHERE difficulty.version_id=v.id),
				'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role.role,'source',role.source) ORDER BY role.role) FROM catalog_npc_roles role WHERE role.version_id=v.id),'[]'::jsonb),
				'locations',COALESCE((SELECT jsonb_agg(sample.entry ORDER BY sample.ui_map_id,sample.map_id) FROM (SELECT location.ui_map_id,location.map_id,jsonb_build_object('map_id',location.map_id,'ui_map_id',location.ui_map_id,'x',location.x,'y',location.y,'z',location.z,'source',location.source) entry FROM catalog_npc_locations location WHERE location.version_id=v.id ORDER BY location.ui_map_id,location.map_id LIMIT 8) sample),'[]'::jsonb))) AS blocks
			FROM catalog_creatures creature WHERE e.entity_type='creature' AND creature.version_id=v.id
		) creature_info ON e.entity_type='creature'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','description','text',
				COALESCE(NULLIF(l.description,''),NULLIF(fallback.description,'')))) AS blocks
			WHERE e.entity_type NOT IN ('item','spell','talent','pvp_talent')
			  AND COALESCE(NULLIF(l.description,''),NULLIF(fallback.description,'')) IS NOT NULL
		) generic_description ON true
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','provenance','build',build.version,'build_number',build.build_number,'source_url',v.source_url,'updated_at',e.updated_at)) AS blocks
			FROM game_builds build WHERE build.id=v.build_id
		) provenance ON true
		LEFT JOIN catalog_items ci ON ci.version_id=v.id
		LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=v.build_id
			AND source_icon.entity_type=e.entity_type AND source_icon.external_id=e.external_id
		LEFT JOIN catalog_file_assets fa ON fa.file_data_id=CASE WHEN v.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (v.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets db2_fa ON db2_fa.file_data_id=CASE
			WHEN COALESCE(v.payload #>> '{db2,InventoryIconFileID}',v.payload #>> '{db2,IconFileID}',
				v.payload #>> '{db2,IconFileDataID}',v.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(v.payload #>> '{db2,InventoryIconFileID}',v.payload #>> '{db2,IconFileID}',
				v.payload #>> '{db2,IconFileDataID}',v.payload #>> '{db2,SpellIconFileID}')::bigint END
		LEFT JOIN LATERAL (
			SELECT raw.payload
			FROM catalog_db2_rows raw
			WHERE e.entity_type IN ('spell','talent','pvp_talent') AND raw.build_id=v.build_id AND raw.table_name='SpellMisc' AND raw.locale='en_US'
			  AND raw.payload ? 'SpellID' AND (NULLIF(raw.payload->>'SpellID',''))::bigint=CASE
				WHEN e.entity_type='spell' THEN e.external_id
				WHEN e.entity_type='talent' THEN COALESCE(NULLIF(v.payload #>> '{raidbots,spellId}','')::bigint,0)
				ELSE COALESCE(NULLIF(v.payload #>> '{db2,SpellID}','')::bigint,0) END
			ORDER BY COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id
			LIMIT 1
		) spell_misc ON true
		LEFT JOIN catalog_file_assets spell_fa ON spell_fa.file_data_id=CASE WHEN spell_misc.payload->>'SpellIconFileDataID' ~ '^[0-9]+$' THEN (spell_misc.payload->>'SpellIconFileDataID')::bigint END
		WHERE e.deleted_at IS NULL
		  AND ($1 = '' OR p.slug = $1)
		  AND ($2 = '' OR e.entity_type = $2)
		  AND e.id > $3
		  AND ($7 = '' OR selected_entity.version_id IS NOT NULL)
		  AND (
			$5 = ''
			OR CASE WHEN $5 ~ '^[0-9]+$' THEN e.external_id = $5::bigint ELSE (
				l.search_document @@ websearch_to_tsquery('simple', $5)
				OR l.name % $5
				OR fallback.search_document @@ websearch_to_tsquery('simple', $5)
				OR fallback.name % $5
			) END
		  )
		ORDER BY e.id
		LIMIT $6`,
		strings.TrimSpace(params.Product), strings.TrimSpace(params.Type), cursorID,
		normalizeLocale(params.Locale), strings.TrimSpace(params.Query), params.Limit+1,
		strings.TrimSpace(params.Category),
	)
	if err != nil {
		return Page{}, fmt.Errorf("list game entities: %w", err)
	}
	defer rows.Close()

	entities := make([]Entity, 0, params.Limit+1)
	for rows.Next() {
		entity, err := scanEntity(rows)
		if err != nil {
			return Page{}, err
		}
		entities = append(entities, entity)
	}
	if err := rows.Err(); err != nil {
		return Page{}, fmt.Errorf("iterate game entities: %w", err)
	}

	hasMore := len(entities) > params.Limit
	if hasMore {
		entities = entities[:params.Limit]
	}
	if err := s.enrichMentions(ctx, entities); err != nil {
		return Page{}, err
	}
	if err := s.enrichTalentOwners(ctx, entities); err != nil {
		return Page{}, err
	}
	nextCursor := ""
	if hasMore && len(entities) > 0 {
		nextCursor = encodeCursor(entities[len(entities)-1].ID)
	}
	return Page{Entities: entities, NextCursor: nextCursor, HasMore: hasMore, Total: total}, nil
}

func (s *Service) count(ctx context.Context, params ListParams) (int64, error) {
	var total int64
	if strings.TrimSpace(params.Query) == "" {
		err := s.postgres.QueryRow(ctx, `
			WITH RECURSIVE selected_categories AS (
				SELECT c.id FROM catalog_categories c
				JOIN game_products selected_product ON selected_product.id=c.product_id
				WHERE $3<>'' AND selected_product.slug=COALESCE(NULLIF($1,''),'wow') AND c.entity_type=$2 AND c.path=$3
				UNION ALL
				SELECT child.id FROM catalog_categories child JOIN selected_categories selected ON child.parent_id=selected.id
			)
			SELECT count(*) FROM game_entities e JOIN game_products p ON p.id=e.product_id
			WHERE e.deleted_at IS NULL AND ($1='' OR p.slug=$1) AND ($2='' OR e.entity_type=$2)
			  AND ($3='' OR EXISTS(SELECT 1 FROM game_entity_categories ec
				WHERE ec.version_id=e.latest_version_id AND ec.category_id IN (SELECT id FROM selected_categories)))`,
			strings.TrimSpace(params.Product), strings.TrimSpace(params.Type), strings.TrimSpace(params.Category)).Scan(&total)
		if err != nil {
			return 0, fmt.Errorf("count game entities: %w", err)
		}
		return total, nil
	}
	err := s.postgres.QueryRow(ctx, `
		WITH RECURSIVE selected_categories AS (
			SELECT c.id
			FROM catalog_categories c
			JOIN game_products selected_product ON selected_product.id=c.product_id
			WHERE $5 <> '' AND selected_product.slug=COALESCE(NULLIF($1,''),'wow')
			  AND c.entity_type=$2 AND c.path=$5
			UNION ALL
			SELECT child.id FROM catalog_categories child
			JOIN selected_categories selected ON child.parent_id=selected.id
		)
		SELECT count(*)
		FROM game_entities e
		JOIN game_products p ON p.id=e.product_id
		LEFT JOIN game_entity_versions v ON v.id=e.latest_version_id
		LEFT JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale=$3
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US'
		WHERE e.deleted_at IS NULL
		  AND ($1='' OR p.slug=$1)
		  AND ($2='' OR e.entity_type=$2)
		  AND ($5='' OR EXISTS (
			SELECT 1 FROM game_entity_categories ec
			WHERE ec.version_id=e.latest_version_id
			  AND ec.category_id IN (SELECT id FROM selected_categories)
		  ))
		  AND (
			$4=''
			OR CASE WHEN $4 ~ '^[0-9]+$' THEN e.external_id=$4::bigint ELSE (
				l.search_document @@ websearch_to_tsquery('simple',$4)
				OR l.name % $4
				OR fallback.search_document @@ websearch_to_tsquery('simple',$4)
				OR fallback.name % $4
			) END
		  )`, strings.TrimSpace(params.Product), strings.TrimSpace(params.Type),
		normalizeLocale(params.Locale), strings.TrimSpace(params.Query),
		strings.TrimSpace(params.Category)).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("count game entities: %w", err)
	}
	return total, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID, locale string) (Entity, error) {
	row := s.postgres.QueryRow(ctx, `
		SELECT
			e.id, p.slug, e.entity_type, e.external_id, e.canonical_slug,
			$2::text AS locale, COALESCE(NULLIF(l.name, ''), fallback.name, ''),
			COALESCE(NULLIF(l.description, ''), fallback.description, ''),
			v.build_id, COALESCE(v.payload, '{}'::jsonb), e.updated_at,
			COALESCE(t.plain_text, fallback_t.plain_text),
			COALESCE(t.blocks,fallback_t.blocks,'[]'::jsonb)
			|| COALESCE(spell_effects.blocks,'[]'::jsonb) || COALESCE(talent_spells.blocks,'[]'::jsonb) || COALESCE(profession_info.blocks,'[]'::jsonb) || COALESCE(recipe_info.blocks,'[]'::jsonb) || COALESCE(item_context.blocks,'[]'::jsonb) || COALESCE(quest_info.blocks,'[]'::jsonb) || COALESCE(creature_info.blocks,'[]'::jsonb) || COALESCE(generic_description.blocks,'[]'::jsonb) || COALESCE(provenance.blocks,'[]'::jsonb),
			COALESCE(fa.icon_name, spell_fa.icon_name, source_icon.icon_name, db2_fa.icon_name,
				NULLIF(v.payload #>> '{raidbots,icon}',''),NULLIF(v.payload #>> '{raidbots,spellIcon}','')),CASE WHEN ci.quality ~ '^[0-9]+$' THEN ci.quality::int END
		FROM game_entities e
		JOIN game_products p ON p.id = e.product_id
		LEFT JOIN game_entity_versions v ON v.id = e.latest_version_id
		LEFT JOIN game_entity_localizations l ON l.version_id = v.id AND l.locale = $2
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id = v.id AND fallback.locale = 'en_US'
		LEFT JOIN catalog_entity_tooltips t ON t.version_id = v.id AND t.locale = $2
		LEFT JOIN catalog_entity_tooltips fallback_t ON fallback_t.version_id = v.id AND fallback_t.locale = 'en_US'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','spell_effects','entries',jsonb_agg(jsonb_build_object('index',effect.effect_index,'difficulty_id',effect.difficulty_id,'effect_type',effect.effect_type,'aura_type',effect.aura_type,'base_points',effect.base_points,'coefficient',effect.coefficient,'attack_power_coefficient',effect.attack_power_coefficient,'amplitude_ms',effect.amplitude_ms,'chain_targets',effect.chain_targets,'attributes',effect.attributes) ORDER BY effect.effect_index,effect.difficulty_id))) AS blocks
			FROM catalog_spell_effects effect WHERE e.entity_type='spell' AND effect.spell_version_id=v.id
		) spell_effects ON e.entity_type='spell'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','talent_spells','entries',jsonb_agg(jsonb_build_object(
				'entity_id',spell.id,'external_id',spell.external_id,'name',COALESCE(spell_name.name,spell_fallback.name,''),
				'relationship',relation.relationship,'source',relation.source,'attributes',relation.attributes,
				'icon_name',COALESCE(spell_icon.icon_name,NULLIF(spell_version.payload #>> '{raidbots,icon}',''),NULLIF(spell_version.payload #>> '{raidbots,spellIcon}','')),
				'effects',COALESCE((SELECT jsonb_agg(jsonb_build_object('index',effect.effect_index,'difficulty_id',effect.difficulty_id,'effect_type',effect.effect_type,'aura_type',effect.aura_type,'base_points',effect.base_points,'coefficient',effect.coefficient,'attack_power_coefficient',effect.attack_power_coefficient,'amplitude_ms',effect.amplitude_ms,'chain_targets',effect.chain_targets,'attributes',effect.attributes) ORDER BY effect.effect_index,effect.difficulty_id) FROM catalog_spell_effects effect WHERE effect.spell_version_id=relation.spell_version_id),'[]'::jsonb)
			) ORDER BY relation.relationship,spell.external_id))) AS blocks
			FROM catalog_talent_spell_relations relation
			JOIN game_entity_versions spell_version ON spell_version.id=relation.spell_version_id
			JOIN game_entities spell ON spell.id=spell_version.entity_id
			LEFT JOIN game_entity_localizations spell_name ON spell_name.version_id=spell_version.id AND spell_name.locale=$2
			LEFT JOIN game_entity_localizations spell_fallback ON spell_fallback.version_id=spell_version.id AND spell_fallback.locale='en_US'
			LEFT JOIN catalog_entity_icons spell_icon ON spell_icon.build_id=spell_version.build_id AND spell_icon.entity_type='spell' AND spell_icon.external_id=spell.external_id
			WHERE e.entity_type IN ('talent','pvp_talent') AND relation.talent_version_id=v.id
		) talent_spells ON e.entity_type IN ('talent','pvp_talent')
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','profession_info',
				'skill_line_id',profession.skill_line_id,'parent_skill_line_id',profession.parent_skill_line_id,
				'category_id',profession.category_id,'tier_index',profession.parent_tier_index,
				'can_link',profession.can_link,'recipe_count',(SELECT count(*) FROM catalog_profession_recipes recipe WHERE recipe.profession_version_id=v.id),
				'category_count',(SELECT count(DISTINCT recipe.trade_skill_category_id) FROM catalog_profession_recipes recipe WHERE recipe.profession_version_id=v.id AND recipe.trade_skill_category_id IS NOT NULL),
				'recipes',COALESCE((SELECT jsonb_agg(sample.entry ORDER BY sample.name) FROM (SELECT recipe_name.name,jsonb_build_object('id',recipe_entity.id,'external_id',recipe_entity.external_id,'name',recipe_name.name,'min_skill_rank',recipe.min_skill_rank) entry FROM catalog_profession_recipes recipe JOIN game_entity_versions recipe_version ON recipe_version.id=recipe.recipe_version_id JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id LEFT JOIN game_entity_localizations recipe_name ON recipe_name.version_id=recipe.recipe_version_id AND recipe_name.locale=$2 WHERE recipe.profession_version_id=v.id ORDER BY recipe_name.name NULLS LAST LIMIT 8) sample),'[]'::jsonb))) AS blocks
			FROM catalog_professions profession WHERE e.entity_type='profession' AND profession.version_id=v.id
		) profession_info ON true
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','recipe_info','spell_id',recipe.spell_id,
				'professions',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',profession_entity.id,'external_id',profession_entity.external_id,'name',COALESCE(profession_name.name,profession_fallback.name,''),'min_skill_rank',link.min_skill_rank,'category_id',link.trade_skill_category_id) ORDER BY profession_entity.external_id) FROM catalog_profession_recipes link JOIN game_entity_versions profession_version ON profession_version.id=link.profession_version_id JOIN game_entities profession_entity ON profession_entity.id=profession_version.entity_id LEFT JOIN game_entity_localizations profession_name ON profession_name.version_id=link.profession_version_id AND profession_name.locale=$2 LEFT JOIN game_entity_localizations profession_fallback ON profession_fallback.version_id=link.profession_version_id AND profession_fallback.locale='en_US' WHERE link.recipe_version_id=v.id),'[]'::jsonb),
				'reagents',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',item.id,'external_id',reagent.item_external_id,'name',COALESCE(item_name.name,item_fallback.name,''),'quantity',reagent.quantity,'recraft_quantity',reagent.recraft_quantity,'slot',reagent.slot) ORDER BY reagent.slot) FROM catalog_recipe_reagents reagent LEFT JOIN game_entities item ON item.id=reagent.item_entity_id LEFT JOIN game_entity_localizations item_name ON item_name.version_id=item.latest_version_id AND item_name.locale=$2 LEFT JOIN game_entity_localizations item_fallback ON item_fallback.version_id=item.latest_version_id AND item_fallback.locale='en_US' WHERE reagent.recipe_version_id=v.id),'[]'::jsonb),
				'currencies',COALESCE((SELECT jsonb_agg(jsonb_build_object('external_id',currency.currency_external_id,'quantity',currency.quantity,'recraft_quantity',currency.recraft_quantity) ORDER BY currency.order_index,currency.currency_external_id) FROM catalog_recipe_currencies currency WHERE currency.recipe_version_id=v.id),'[]'::jsonb),
				'outputs',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',item.id,'external_id',output.item_external_id,'name',COALESCE(item_name.name,item_fallback.name,''),'source',output.source) ORDER BY output.item_external_id) FROM catalog_recipe_outputs output LEFT JOIN game_entities item ON item.id=output.item_entity_id LEFT JOIN game_entity_localizations item_name ON item_name.version_id=item.latest_version_id AND item_name.locale=$2 LEFT JOIN game_entity_localizations item_fallback ON item_fallback.version_id=item.latest_version_id AND item_fallback.locale='en_US' WHERE output.recipe_version_id=v.id),'[]'::jsonb))) AS blocks
			FROM catalog_recipes recipe WHERE e.entity_type='spell' AND recipe.version_id=v.id
		) recipe_info ON e.entity_type='spell'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','item_requirements','class_mask',requirements.allowable_class_mask::text,
				'race_mask_0',requirements.allowable_race_mask_0::text,'race_mask_1',requirements.allowable_race_mask_1::text,
				'required_ability_id',requirements.required_ability_id,'faction_id',requirements.min_faction_id,'reputation',requirements.min_reputation,
				'holiday_id',requirements.required_holiday_id,'transmog_holiday_id',requirements.required_transmog_holiday_id))
				|| COALESCE((SELECT jsonb_build_array(jsonb_build_object('type','item_effect_metadata','entries',jsonb_agg(jsonb_build_object('spell_id',effect.spell_id,'charges',effect.charges,'cooldown_ms',effect.cooldown_ms,'category_cooldown_ms',effect.category_cooldown_ms,'specialization_id',effect.specialization_id,'player_condition_id',effect.player_condition_id) ORDER BY effect.slot))) FROM catalog_item_effects effect WHERE effect.version_id=v.id AND (effect.charges<>0 OR effect.cooldown_ms<>0 OR effect.category_cooldown_ms<>0 OR effect.specialization_id<>0 OR effect.player_condition_id<>0)),'[]'::jsonb) AS blocks
			FROM catalog_item_requirements requirements WHERE e.entity_type='item' AND requirements.version_id=v.id
		) item_context ON e.entity_type='item'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','quest_info','status',registry.enrichment_status,'bullet_text',COALESCE(quest_text.bullet_text,''),
				'objectives',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',objective.objective_id,'type',objective.objective_type,'object_id',objective.object_id,'amount',objective.amount,'description',COALESCE(objective_text.description,'')) ORDER BY objective.order_index,objective.objective_id) FROM catalog_quest_objectives objective LEFT JOIN catalog_quest_objective_localizations objective_text ON objective_text.build_id=objective.build_id AND objective_text.quest_id=objective.quest_id AND objective_text.objective_id=objective.objective_id AND objective_text.locale=$2 WHERE objective.build_id=registry.build_id AND objective.quest_id=registry.quest_id),'[]'::jsonb),
				'quest_lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',line.quest_line_id,'name',COALESCE(line_text.name,''),'order',line.order_index) ORDER BY line.order_index) FROM catalog_quest_line_entries line LEFT JOIN catalog_quest_line_localizations line_text ON line_text.build_id=line.build_id AND line_text.quest_line_id=line.quest_line_id AND line_text.locale=$2 WHERE line.build_id=registry.build_id AND line.quest_id=registry.quest_id),'[]'::jsonb),
				'rewards',COALESCE((SELECT jsonb_agg(jsonb_build_object(
					'type',reward.reward_type,'external_id',reward.external_id,'amount',reward.amount,'choice',reward.is_choice,
					'entity_id',reward_entity.id,'entity_type',reward_entity.entity_type,'slug',COALESCE(NULLIF(reward_name.slug,''),NULLIF(reward_fallback.slug,''),reward_entity.canonical_slug),
					'name',COALESCE(NULLIF(reward_name.name,''),reward.attributes #>> ARRAY['names',$2],NULLIF(reward_fallback.name,''),reward.attributes #>> '{names,en_US}',''),
					'icon_name',COALESCE(reward_icon.icon_name,reward_file.icon_name,reward_db2_file.icon_name,NULLIF(reward_version.payload #>> '{raidbots,icon}','')),
					'quality',CASE WHEN reward_item.quality ~ '^[0-9]+$' THEN reward_item.quality::int END
				) ORDER BY reward.reward_type,reward.reward_index)
				FROM catalog_quest_rewards reward
				LEFT JOIN game_entities reward_entity ON reward_entity.product_id=e.product_id
					AND reward_entity.entity_type=CASE reward.reward_type WHEN 'reputation' THEN 'faction' ELSE reward.reward_type END
					AND reward_entity.external_id=reward.external_id AND reward_entity.deleted_at IS NULL
					AND reward_entity.latest_version_id IS NOT NULL
				LEFT JOIN LATERAL (SELECT candidate.id,candidate.payload FROM game_entity_versions candidate WHERE candidate.entity_id=reward_entity.id AND candidate.build_id=reward.build_id ORDER BY candidate.revision DESC LIMIT 1) reward_version ON true
				LEFT JOIN game_entity_localizations reward_name ON reward_name.version_id=reward_version.id AND reward_name.locale=$2
				LEFT JOIN game_entity_localizations reward_fallback ON reward_fallback.version_id=reward_version.id AND reward_fallback.locale='en_US'
				LEFT JOIN catalog_entity_icons reward_icon ON reward_icon.build_id=reward.build_id AND reward_icon.entity_type=reward_entity.entity_type AND reward_icon.external_id=reward.external_id
				LEFT JOIN catalog_file_assets reward_file ON reward_file.file_data_id=CASE WHEN reward_version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (reward_version.payload->>'icon_file_data_id')::bigint END
				LEFT JOIN catalog_file_assets reward_db2_file ON reward_db2_file.file_data_id=CASE WHEN COALESCE(reward_version.payload #>> '{db2,InventoryIconFileID}',reward_version.payload #>> '{db2,IconFileID}',reward_version.payload #>> '{db2,IconFileDataID}') ~ '^[0-9]+$' THEN COALESCE(reward_version.payload #>> '{db2,InventoryIconFileID}',reward_version.payload #>> '{db2,IconFileID}',reward_version.payload #>> '{db2,IconFileDataID}')::bigint END
				LEFT JOIN catalog_items reward_item ON reward_item.version_id=reward_version.id
				WHERE reward.build_id=registry.build_id AND reward.quest_id=registry.quest_id),'[]'::jsonb),'poi_count',(SELECT count(*) FROM catalog_quest_poi_blobs poi WHERE poi.build_id=registry.build_id AND poi.quest_id=registry.quest_id))) AS blocks
			FROM catalog_quest_registry registry LEFT JOIN catalog_quest_localizations quest_text ON quest_text.build_id=registry.build_id AND quest_text.quest_id=registry.quest_id AND quest_text.locale=$2
			WHERE e.entity_type='quest' AND registry.build_id=v.build_id AND registry.quest_id=e.external_id
		) quest_info ON e.entity_type='quest'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','creature_info','classification_id',creature.classification_id,'creature_type_id',creature.creature_type_id,
				'creature_type',COALESCE((SELECT taxon.name FROM catalog_creature_taxon_localizations taxon WHERE taxon.build_id=v.build_id AND taxon.taxon_type='type' AND taxon.external_id=creature.creature_type_id AND taxon.locale=$2),''),'creature_family_id',creature.creature_family_id,
				'creature_family',COALESCE((SELECT taxon.name FROM catalog_creature_taxon_localizations taxon WHERE taxon.build_id=v.build_id AND taxon.taxon_type='family' AND taxon.external_id=creature.creature_family_id AND taxon.locale=$2),''),
				'difficulty_count',(SELECT count(*) FROM catalog_creature_difficulties difficulty WHERE difficulty.version_id=v.id),'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role.role,'source',role.source) ORDER BY role.role) FROM catalog_npc_roles role WHERE role.version_id=v.id),'[]'::jsonb),
				'locations',COALESCE((SELECT jsonb_agg(sample.entry ORDER BY sample.ui_map_id,sample.map_id) FROM (SELECT location.ui_map_id,location.map_id,jsonb_build_object('map_id',location.map_id,'ui_map_id',location.ui_map_id,'x',location.x,'y',location.y,'z',location.z,'source',location.source) entry FROM catalog_npc_locations location WHERE location.version_id=v.id ORDER BY location.ui_map_id,location.map_id LIMIT 8) sample),'[]'::jsonb))) AS blocks
			FROM catalog_creatures creature WHERE e.entity_type='creature' AND creature.version_id=v.id
		) creature_info ON e.entity_type='creature'
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','description','text',
				COALESCE(NULLIF(l.description,''),NULLIF(fallback.description,'')))) AS blocks
			WHERE e.entity_type NOT IN ('item','spell','talent','pvp_talent')
			  AND COALESCE(NULLIF(l.description,''),NULLIF(fallback.description,'')) IS NOT NULL
		) generic_description ON true
		LEFT JOIN LATERAL (
			SELECT jsonb_build_array(jsonb_build_object('type','provenance','build',build.version,'build_number',build.build_number,'source_url',v.source_url,'updated_at',e.updated_at)) AS blocks FROM game_builds build WHERE build.id=v.build_id
		) provenance ON true
		LEFT JOIN catalog_items ci ON ci.version_id=v.id
		LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=v.build_id
			AND source_icon.entity_type=e.entity_type AND source_icon.external_id=e.external_id
		LEFT JOIN catalog_file_assets fa ON fa.file_data_id=CASE WHEN v.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (v.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets db2_fa ON db2_fa.file_data_id=CASE
			WHEN COALESCE(v.payload #>> '{db2,InventoryIconFileID}',v.payload #>> '{db2,IconFileID}',
				v.payload #>> '{db2,IconFileDataID}',v.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(v.payload #>> '{db2,InventoryIconFileID}',v.payload #>> '{db2,IconFileID}',
				v.payload #>> '{db2,IconFileDataID}',v.payload #>> '{db2,SpellIconFileID}')::bigint END
		LEFT JOIN LATERAL (
			SELECT raw.payload
			FROM catalog_db2_rows raw
			WHERE e.entity_type IN ('spell','talent','pvp_talent') AND raw.build_id=v.build_id AND raw.table_name='SpellMisc' AND raw.locale='en_US'
			  AND raw.payload ? 'SpellID' AND (NULLIF(raw.payload->>'SpellID',''))::bigint=CASE
				WHEN e.entity_type='spell' THEN e.external_id
				WHEN e.entity_type='talent' THEN COALESCE(NULLIF(v.payload #>> '{raidbots,spellId}','')::bigint,0)
				ELSE COALESCE(NULLIF(v.payload #>> '{db2,SpellID}','')::bigint,0) END
			ORDER BY COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id
			LIMIT 1
		) spell_misc ON true
		LEFT JOIN catalog_file_assets spell_fa ON spell_fa.file_data_id=CASE WHEN spell_misc.payload->>'SpellIconFileDataID' ~ '^[0-9]+$' THEN (spell_misc.payload->>'SpellIconFileDataID')::bigint END
		WHERE e.id = $1 AND e.deleted_at IS NULL`, id, normalizeLocale(locale))
	entity, err := scanEntity(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entity{}, ErrNotFound
	}
	if err != nil {
		return Entity{}, err
	}
	entities := []Entity{entity}
	if err := s.enrichMentions(ctx, entities); err != nil {
		return Entity{}, err
	}
	if err := s.enrichTalentOwners(ctx, entities); err != nil {
		return Entity{}, err
	}
	entity = entities[0]
	if err := s.resolveEntityDescriptions(ctx, &entity); err != nil {
		return Entity{}, err
	}
	return entity, nil
}

type rowScanner interface {
	Scan(...any) error
}

func scanEntity(row rowScanner) (Entity, error) {
	var entity Entity
	var encodedPayload []byte
	var tooltipPlain *string
	var tooltipBlocks []byte
	if err := row.Scan(
		&entity.ID, &entity.Product, &entity.Type, &entity.ExternalID, &entity.Slug,
		&entity.Locale, &entity.Name, &entity.Description, &entity.BuildID,
		&encodedPayload, &entity.UpdatedAt, &tooltipPlain, &tooltipBlocks, &entity.IconName, &entity.Quality,
	); err != nil {
		return Entity{}, fmt.Errorf("scan game entity: %w", err)
	}
	if err := json.Unmarshal(encodedPayload, &entity.Payload); err != nil {
		return Entity{}, fmt.Errorf("decode game entity payload: %w", err)
	}
	if len(tooltipBlocks) > 0 {
		var blocks []map[string]any
		if err := json.Unmarshal(tooltipBlocks, &blocks); err != nil {
			return Entity{}, fmt.Errorf("decode game entity tooltip: %w", err)
		}
		plainText := ""
		if tooltipPlain != nil {
			plainText = *tooltipPlain
		}
		entity.Tooltip = &Tooltip{PlainText: plainText, Blocks: blocks}
	}
	return entity, nil
}

func normalizeLocale(locale string) string {
	if locale == "ru_RU" {
		return locale
	}
	return "en_US"
}

func encodeCursor(id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(id.String()))
}

func decodeCursor(cursor string) (uuid.UUID, error) {
	if cursor == "" {
		return uuid.Nil, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return uuid.Nil, errors.New("cursor is invalid")
	}
	id, err := uuid.Parse(string(decoded))
	if err != nil {
		return uuid.Nil, errors.New("cursor is invalid")
	}
	return id, nil
}
