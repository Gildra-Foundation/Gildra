package catalog

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type EntityTypeSummary struct {
	Type              string
	Label             string
	Description       string
	Group             string
	IconSymbol        string
	SortOrder         int
	Count             int64
	LocalizedCount    int64
	DescribedCount    int64
	TooltipCount      int64
	IconCount         int64
	RelationshipCount int64
	CoverageUpdatedAt time.Time
}

type EntitySummary struct {
	ID         uuid.UUID
	Type       string
	ExternalID int64
	Slug       string
	Name       string
	IconName   *string
	IconURL    *string
}

type Relationship struct {
	Direction  string
	Relation   string
	BuildID    int64
	Attributes map[string]any
	Entity     EntitySummary
}

type RelationshipParams struct {
	EntityID  uuid.UUID
	Locale    string
	Direction string
	Relation  string
	Cursor    string
	Limit     int
}

type RelationshipPage struct {
	Relationships []Relationship
	NextCursor    string
	HasMore       bool
	Total         int64
}

func (s *Service) EntityTypes(ctx context.Context, product, locale string) ([]EntityTypeSummary, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT registry.entity_type,COALESCE(localized.name,initcap(replace(registry.entity_type,'_',' '))),
			COALESCE(localized.description,''),registry.group_key,registry.icon_symbol,registry.sort_order,
			stats.entity_count,stats.localized_count,stats.described_count,stats.tooltip_count,
			stats.icon_count,stats.relationship_count,stats.refreshed_at
		FROM catalog_entity_type_registry registry
		JOIN game_products product ON product.id=registry.product_id
		JOIN catalog_entity_type_stats stats ON stats.product_id=registry.product_id
			AND stats.entity_type=registry.entity_type AND stats.locale=$2
		LEFT JOIN catalog_entity_type_localizations localized ON localized.product_id=registry.product_id
			AND localized.entity_type=registry.entity_type AND localized.locale=$2
		WHERE product.slug=$1 AND registry.is_public
		ORDER BY registry.sort_order,registry.entity_type`, strings.TrimSpace(product), normalizeLocale(locale))
	if err != nil {
		return nil, fmt.Errorf("list entity types: %w", err)
	}
	defer rows.Close()
	result := make([]EntityTypeSummary, 0, 32)
	for rows.Next() {
		var item EntityTypeSummary
		if err := rows.Scan(&item.Type, &item.Label, &item.Description, &item.Group, &item.IconSymbol,
			&item.SortOrder, &item.Count, &item.LocalizedCount, &item.DescribedCount, &item.TooltipCount,
			&item.IconCount, &item.RelationshipCount, &item.CoverageUpdatedAt); err != nil {
			return nil, fmt.Errorf("scan entity type: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate entity types: %w", err)
	}
	return result, nil
}

func (s *Service) Relationships(ctx context.Context, params RelationshipParams) (RelationshipPage, error) {
	if params.Limit < 1 || params.Limit > 100 {
		return RelationshipPage{}, errors.New("limit must be between 1 and 100")
	}
	if params.Direction == "" {
		params.Direction = "both"
	}
	if params.Direction != "outgoing" && params.Direction != "incoming" && params.Direction != "both" {
		return RelationshipPage{}, errors.New("direction must be outgoing, incoming, or both")
	}
	cursorDirection, cursorRelation, cursorID, err := decodeRelationshipCursor(params.Cursor)
	if err != nil {
		return RelationshipPage{}, err
	}
	var exists bool
	if err := s.postgres.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_entities WHERE id=$1 AND deleted_at IS NULL AND published_version_id IS NOT NULL)`, params.EntityID).Scan(&exists); err != nil {
		return RelationshipPage{}, fmt.Errorf("find relationship entity: %w", err)
	}
	if !exists {
		return RelationshipPage{}, ErrNotFound
	}
	baseSQL := `
		WITH selected_entity AS (
			SELECT version.build_id
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.published_version_id
			WHERE entity.id=$1 AND entity.deleted_at IS NULL
		), links AS (
			SELECT 'outgoing'::text AS direction,link.relation_type,link.target_entity_id AS related_entity_id,
				link.build_id,link.attributes
			FROM game_entity_links link
			WHERE link.source_entity_id=$1 AND link.build_id=(SELECT build_id FROM selected_entity)
			UNION ALL
			SELECT 'incoming'::text,link.relation_type,link.source_entity_id,link.build_id,link.attributes
			FROM game_entity_links link
			WHERE link.target_entity_id=$1 AND link.build_id=(SELECT build_id FROM selected_entity)
		)`
	var total int64
	if err := s.postgres.QueryRow(ctx, baseSQL+`
		SELECT count(*) FROM links
		WHERE ($2='both' OR direction=$2) AND ($3='' OR relation_type=$3)`,
		params.EntityID, params.Direction, strings.TrimSpace(params.Relation)).Scan(&total); err != nil {
		return RelationshipPage{}, fmt.Errorf("count entity relationships: %w", err)
	}
	rows, err := s.postgres.Query(ctx, baseSQL+`
		SELECT links.direction,links.relation_type,links.build_id,links.attributes,entity.id,entity.entity_type,
			entity.external_id,COALESCE(NULLIF(localized.slug,''),NULLIF(fallback.slug,''),entity.canonical_slug),
			COALESCE(NULLIF(localized.name,''),fallback.name,''),
			COALESCE(source_icon.icon_name,direct_icon.icon_name,db2_icon.icon_name,spell_icon.icon_name,
				NULLIF(version.payload #>> '{raidbots,icon}',''))
		FROM links
		JOIN game_entities entity ON entity.id=links.related_entity_id AND entity.deleted_at IS NULL
		JOIN game_entity_versions version ON version.id=entity.published_version_id AND version.build_id=links.build_id
		LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale=$4
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=version.build_id
			AND source_icon.entity_type=entity.entity_type AND source_icon.external_id=entity.external_id
		LEFT JOIN catalog_file_assets direct_icon ON direct_icon.file_data_id=CASE
			WHEN version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (version.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets db2_icon ON db2_icon.file_data_id=CASE
			WHEN COALESCE(version.payload #>> '{db2,InventoryIconFileID}',version.payload #>> '{db2,IconFileDataID}',version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(version.payload #>> '{db2,InventoryIconFileID}',version.payload #>> '{db2,IconFileDataID}',version.payload #>> '{db2,SpellIconFileID}')::bigint END
		LEFT JOIN LATERAL (
			SELECT asset.icon_name FROM catalog_db2_rows raw
			JOIN catalog_file_assets asset ON asset.file_data_id=CASE
				WHEN raw.payload->>'SpellIconFileDataID' ~ '^[0-9]+$' THEN (raw.payload->>'SpellIconFileDataID')::bigint END
			WHERE entity.entity_type='spell' AND raw.build_id=version.build_id AND raw.table_name='SpellMisc'
				AND raw.locale='en_US' AND raw.payload->>'SpellID'=entity.external_id::text
			ORDER BY COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id LIMIT 1
		) spell_icon ON true
		WHERE ($2='both' OR links.direction=$2) AND ($3='' OR links.relation_type=$3)
			AND ($5='' OR (links.direction,links.relation_type,entity.id) > ($5,$6,$7))
		ORDER BY links.direction,links.relation_type,entity.id LIMIT $8`, params.EntityID, params.Direction,
		strings.TrimSpace(params.Relation), normalizeLocale(params.Locale), cursorDirection, cursorRelation, cursorID, params.Limit+1)
	if err != nil {
		return RelationshipPage{}, fmt.Errorf("list entity relationships: %w", err)
	}
	defer rows.Close()
	relationships := make([]Relationship, 0, params.Limit+1)
	for rows.Next() {
		var relationship Relationship
		if err := rows.Scan(&relationship.Direction, &relationship.Relation, &relationship.BuildID, &relationship.Attributes,
			&relationship.Entity.ID, &relationship.Entity.Type, &relationship.Entity.ExternalID, &relationship.Entity.Slug,
			&relationship.Entity.Name, &relationship.Entity.IconName); err != nil {
			return RelationshipPage{}, fmt.Errorf("scan entity relationship: %w", err)
		}
		relationships = append(relationships, relationship)
	}
	if err := rows.Err(); err != nil {
		return RelationshipPage{}, fmt.Errorf("iterate entity relationships: %w", err)
	}
	ids := make([]uuid.UUID, 0, len(relationships))
	for _, relationship := range relationships {
		ids = append(ids, relationship.Entity.ID)
	}
	iconURLs, err := s.cachedIconURLs(ctx, ids)
	if err != nil {
		return RelationshipPage{}, err
	}
	for index := range relationships {
		if value, ok := iconURLs[relationships[index].Entity.ID]; ok {
			relationships[index].Entity.IconURL = &value
		}
	}
	hasMore := len(relationships) > params.Limit
	if hasMore {
		relationships = relationships[:params.Limit]
	}
	nextCursor := ""
	if hasMore && len(relationships) > 0 {
		last := relationships[len(relationships)-1]
		nextCursor = encodeRelationshipCursor(last.Direction, last.Relation, last.Entity.ID)
	}
	return RelationshipPage{Relationships: relationships, NextCursor: nextCursor, HasMore: hasMore, Total: total}, nil
}

func encodeRelationshipCursor(direction, relation string, id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(direction + "\x1f" + relation + "\x1f" + id.String()))
}

func decodeRelationshipCursor(cursor string) (string, string, uuid.UUID, error) {
	if cursor == "" {
		return "", "", uuid.Nil, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return "", "", uuid.Nil, errors.New("cursor is invalid")
	}
	parts := strings.Split(string(decoded), "\x1f")
	if len(parts) != 3 {
		return "", "", uuid.Nil, errors.New("cursor is invalid")
	}
	id, err := uuid.Parse(parts[2])
	if err != nil {
		return "", "", uuid.Nil, errors.New("cursor is invalid")
	}
	return parts[0], parts[1], id, nil
}
