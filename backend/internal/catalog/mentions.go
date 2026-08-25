package catalog

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// enrichMentions adds exact, source-backed ability references to the tooltip
// read model. It deliberately works in one batch so catalog pages do not incur
// an N+1 query for every visible card.
func (s *Service) enrichMentions(ctx context.Context, entities []Entity) error {
	if len(entities) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(entities))
	byID := make(map[uuid.UUID]int, len(entities))
	for index := range entities {
		ids = append(ids, entities[index].ID)
		byID[entities[index].ID] = index
	}
	rows, err := s.postgres.Query(ctx, `
		WITH description_sources AS (
			SELECT entity.id AS display_entity_id,version.id AS source_version_id
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.published_version_id
			WHERE entity.id=ANY($1) AND entity.entity_type='spell'
			UNION ALL
			SELECT entity.id,link.spell_version_id
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.published_version_id
			JOIN catalog_talent_spell_links link ON link.talent_version_id=version.id
			WHERE entity.id=ANY($1) AND entity.entity_type IN ('talent','pvp_talent')
		)
		SELECT DISTINCT source.display_entity_id,mention.mention_text,target.id,target.entity_type,
			target.external_id,COALESCE(NULLIF(localized.name,''),fallback.name,''),
			COALESCE(source_icon.icon_name,direct_icon.icon_name,db2_icon.icon_name,spell_icon.icon_name,
				NULLIF(target_version.payload #>> '{raidbots,icon}',''))
		FROM description_sources source
		JOIN catalog_entity_mentions mention ON mention.source_version_id=source.source_version_id AND mention.locale=$2
		JOIN game_entities target ON target.id=mention.target_entity_id AND target.deleted_at IS NULL
		JOIN game_entity_versions target_version ON target_version.id=target.published_version_id
		LEFT JOIN game_entity_localizations localized ON localized.version_id=target_version.id AND localized.locale=$2
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=target_version.id AND fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=target_version.build_id
			AND source_icon.entity_type=target.entity_type AND source_icon.external_id=target.external_id
		LEFT JOIN catalog_file_assets direct_icon ON direct_icon.file_data_id=CASE
			WHEN target_version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (target_version.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets db2_icon ON db2_icon.file_data_id=CASE
			WHEN COALESCE(target_version.payload #>> '{db2,IconFileDataID}',target_version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(target_version.payload #>> '{db2,IconFileDataID}',target_version.payload #>> '{db2,SpellIconFileID}')::bigint END
		LEFT JOIN LATERAL (
			SELECT asset.icon_name
			FROM catalog_db2_rows raw
			JOIN catalog_file_assets asset ON asset.file_data_id=CASE
				WHEN raw.payload->>'SpellIconFileDataID' ~ '^[0-9]+$' THEN (raw.payload->>'SpellIconFileDataID')::bigint END
			WHERE target.entity_type='spell' AND raw.build_id=target_version.build_id AND raw.table_name='SpellMisc'
				AND raw.locale='en_US' AND raw.payload->>'SpellID'=target.external_id::text
			ORDER BY COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id LIMIT 1
		) spell_icon ON true
		ORDER BY source.display_entity_id,mention.mention_text,target.external_id`, ids, normalizeLocale(entities[0].Locale))
	if err != nil {
		return fmt.Errorf("load entity mentions: %w", err)
	}
	defer rows.Close()
	entries := make(map[uuid.UUID][]map[string]any)
	for rows.Next() {
		var displayID, targetID uuid.UUID
		var text, targetType, name string
		var externalID int64
		var iconName *string
		if err := rows.Scan(&displayID, &text, &targetID, &targetType, &externalID, &name, &iconName); err != nil {
			return fmt.Errorf("scan entity mention: %w", err)
		}
		entry := map[string]any{
			"text": text, "entity_id": targetID, "entity_type": targetType,
			"external_id": externalID, "name": name,
		}
		if iconName != nil {
			entry["icon_name"] = *iconName
		}
		entries[displayID] = append(entries[displayID], entry)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate entity mentions: %w", err)
	}
	for displayID, mentions := range entries {
		index := byID[displayID]
		if entities[index].Tooltip == nil {
			entities[index].Tooltip = &Tooltip{}
		}
		entities[index].Tooltip.Blocks = append(entities[index].Tooltip.Blocks, map[string]any{
			"type": "description_mentions", "entries": mentions,
		})
	}
	return nil
}
