package catalog

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// enrichTalentOwners exposes the normalized talent -> specialization -> class
// path in the same tooltip shape used by spells.
func (s *Service) enrichTalentOwners(ctx context.Context, entities []Entity) error {
	ids := make([]uuid.UUID, 0, len(entities))
	byID := make(map[uuid.UUID]int, len(entities))
	locale := "en_US"
	for index := range entities {
		if entities[index].Type == "talent" || entities[index].Type == "pvp_talent" {
			ids = append(ids, entities[index].ID)
			byID[entities[index].ID] = index
			locale = normalizeLocale(entities[index].Locale)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT DISTINCT talent.id,specialization.id,specialization.external_id,
			COALESCE(NULLIF(spec_name.name,''),spec_fallback.name,''),
			COALESCE(spec_source_icon.icon_name,spec_icon.icon_name),class.external_id,
			COALESCE(NULLIF(class_name.name,''),class_fallback.name,''),
			COALESCE(class_source_icon.icon_name,class_icon.icon_name)
		FROM game_entity_links link
		JOIN game_entities talent ON talent.id=link.source_entity_id
		JOIN game_entities specialization ON specialization.id=link.target_entity_id
			AND specialization.entity_type='specialization' AND specialization.deleted_at IS NULL
		JOIN game_entity_versions spec_version ON spec_version.id=specialization.latest_version_id
		LEFT JOIN game_entity_localizations spec_name ON spec_name.version_id=spec_version.id AND spec_name.locale=$2
		LEFT JOIN game_entity_localizations spec_fallback ON spec_fallback.version_id=spec_version.id AND spec_fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons spec_source_icon ON spec_source_icon.build_id=spec_version.build_id
			AND spec_source_icon.entity_type='specialization' AND spec_source_icon.external_id=specialization.external_id
		LEFT JOIN catalog_file_assets spec_icon ON spec_icon.file_data_id=CASE
			WHEN spec_version.payload #>> '{db2,SpellIconFileID}' ~ '^[0-9]+$' THEN (spec_version.payload #>> '{db2,SpellIconFileID}')::bigint END
		LEFT JOIN game_entities class ON class.product_id=specialization.product_id AND class.entity_type='class'
			AND class.external_id=NULLIF(spec_version.payload #>> '{db2,ClassID}','')::bigint AND class.deleted_at IS NULL
		LEFT JOIN game_entity_versions class_version ON class_version.id=class.latest_version_id
		LEFT JOIN game_entity_localizations class_name ON class_name.version_id=class_version.id AND class_name.locale=$2
		LEFT JOIN game_entity_localizations class_fallback ON class_fallback.version_id=class_version.id AND class_fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons class_source_icon ON class_source_icon.build_id=class_version.build_id
			AND class_source_icon.entity_type='class' AND class_source_icon.external_id=class.external_id
		LEFT JOIN catalog_file_assets class_icon ON class_icon.file_data_id=CASE
			WHEN class_version.payload #>> '{db2,IconFileDataID}' ~ '^[0-9]+$' THEN (class_version.payload #>> '{db2,IconFileDataID}')::bigint END
		WHERE talent.id=ANY($1) AND link.relation_type='owned_by'
		ORDER BY talent.id,class.external_id,specialization.external_id`, ids, locale)
	if err != nil {
		return fmt.Errorf("load talent owners: %w", err)
	}
	defer rows.Close()
	owners := make(map[uuid.UUID][]map[string]any)
	for rows.Next() {
		var talentID, specEntityID uuid.UUID
		var specID int64
		var specName string
		var specIcon *string
		var classID *int64
		var className string
		var classIcon *string
		if err := rows.Scan(&talentID, &specEntityID, &specID, &specName, &specIcon, &classID, &className, &classIcon); err != nil {
			return fmt.Errorf("scan talent owner: %w", err)
		}
		entry := map[string]any{
			"owner_type": "specialization", "owner_id": specID, "entity_id": specEntityID,
			"name": specName, "class_name": className,
		}
		if specIcon != nil {
			entry["icon_name"] = *specIcon
		}
		if classID != nil {
			entry["class_id"] = *classID
		}
		if classIcon != nil {
			entry["class_icon_name"] = *classIcon
		}
		owners[talentID] = append(owners[talentID], entry)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate talent owners: %w", err)
	}
	for talentID, entries := range owners {
		index := byID[talentID]
		if entities[index].Tooltip == nil {
			entities[index].Tooltip = &Tooltip{}
		}
		entities[index].Tooltip.Blocks = append(entities[index].Tooltip.Blocks, map[string]any{
			"type": "spell_owners", "entries": entries,
		})
	}
	return nil
}
