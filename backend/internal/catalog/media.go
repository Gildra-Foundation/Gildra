package catalog

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/google/uuid"
)

const officialIconOrigin = "https://render.worldofwarcraft.com/eu/icons/56/"

// iconURLFromName returns the official render URL for a build-backed icon
// name. The name is validated before it is placed in a URL path so malformed
// source data cannot turn this fallback into an open redirect or path escape.
// Local media objects remain preferred; this is only used while the media
// worker has not cached an otherwise valid icon yet.
func iconURLFromName(name string) (string, bool) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return "", false
	}
	for _, character := range name {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '_' {
			return "", false
		}
	}
	return officialIconOrigin + url.PathEscape(name) + ".jpg", true
}

func (s *Service) enrichTooltipMedia(ctx context.Context, tooltip *Tooltip) error {
	if tooltip == nil || len(tooltip.Blocks) == 0 {
		return nil
	}
	unique := make(map[uuid.UUID]struct{})
	collectTooltipEntityIDs(tooltip.Blocks, unique)
	ids := make([]uuid.UUID, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	urls, err := s.cachedIconURLs(ctx, ids)
	if err != nil {
		return err
	}
	attachTooltipMediaURLs(tooltip.Blocks, urls)
	return nil
}

func collectTooltipEntityIDs(value any, result map[uuid.UUID]struct{}) {
	switch current := value.(type) {
	case []map[string]any:
		for _, entry := range current {
			collectTooltipEntityIDs(entry, result)
		}
	case []any:
		for _, entry := range current {
			collectTooltipEntityIDs(entry, result)
		}
	case map[string]any:
		for key, entry := range current {
			if strings.HasSuffix(key, "entity_id") {
				if id, ok := tooltipEntityID(entry); ok {
					result[id] = struct{}{}
				}
			}
			collectTooltipEntityIDs(entry, result)
		}
	}
}

func attachTooltipMediaURLs(value any, urls map[uuid.UUID]string) {
	switch current := value.(type) {
	case []map[string]any:
		for _, entry := range current {
			attachTooltipMediaURLs(entry, urls)
		}
	case []any:
		for _, entry := range current {
			attachTooltipMediaURLs(entry, urls)
		}
	case map[string]any:
		if id, ok := tooltipObjectEntityID(current); ok {
			if mediaURL, exists := urls[id]; exists {
				current["icon_url"] = mediaURL
			}
		}
		for _, entry := range current {
			attachTooltipMediaURLs(entry, urls)
		}
	}
}

func tooltipObjectEntityID(object map[string]any) (uuid.UUID, bool) {
	for _, key := range []string{"entity_id", "item_entity_id", "spell_entity_id", "owner_entity_id"} {
		if id, ok := tooltipEntityID(object[key]); ok {
			return id, true
		}
	}
	unique := make(map[uuid.UUID]struct{})
	for key, value := range object {
		if !strings.HasSuffix(key, "entity_id") {
			continue
		}
		if id, ok := tooltipEntityID(value); ok {
			unique[id] = struct{}{}
		}
	}
	if len(unique) != 1 {
		return uuid.Nil, false
	}
	for id := range unique {
		return id, true
	}
	return uuid.Nil, false
}

func tooltipEntityID(value any) (uuid.UUID, bool) {
	switch candidate := value.(type) {
	case uuid.UUID:
		return candidate, candidate != uuid.Nil
	case string:
		id, err := uuid.Parse(strings.TrimSpace(candidate))
		return id, err == nil && id != uuid.Nil
	default:
		return uuid.Nil, false
	}
}

// cachedIconURLs returns the best verified icon observation for each entity.
// Locally cached bytes win; when caching has not completed yet, the reviewed
// HTTPS source URL is returned so authenticated consumers can still render an
// icon while the media worker retries the local copy.
func (s *Service) cachedIconURLs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	result := make(map[uuid.UUID]string)
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT DISTINCT ON (media.entity_id) media.entity_id,
			COALESCE(NULLIF(media.cached_url,''),media.source_url)
		FROM catalog_entity_media media
		JOIN game_entities entity ON entity.id=media.entity_id
		JOIN game_entity_versions published ON published.id=entity.published_version_id
		JOIN game_builds published_build ON published_build.id=published.build_id
		  AND published_build.product_id=entity.product_id
		JOIN game_builds media_build ON media_build.id=media.build_id
		  AND media_build.product_id=entity.product_id
		JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
		JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
		WHERE media.entity_id=ANY($1::uuid[])
		  AND (
			(media.cache_status='cached' AND NULLIF(media.cached_url,'') IS NOT NULL
			 AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL)
			OR (media.cache_status='remote' AND media.source_url ~ '^https://')
		  )
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
		  AND artifact.byte_size IS NOT NULL
		  AND media_build.build_number<=published_build.build_number
		ORDER BY media.entity_id,(media.media_kind='icon') DESC,media.is_primary DESC,
		  media_build.build_number DESC,media.updated_at DESC,media.id`, ids)
	if err != nil {
		return nil, fmt.Errorf("list cached entity icons: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var entityID uuid.UUID
		var value string
		if err := rows.Scan(&entityID, &value); err != nil {
			return nil, fmt.Errorf("scan cached entity icon: %w", err)
		}
		result[entityID] = value
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate cached entity icons: %w", err)
	}
	// The icon registry is populated from build-pinned DB2/Wago artifacts, but
	// media caching is intentionally asynchronous. Fill only still-missing
	// icons with the same official render URL used by the media worker so cards
	// and tooltip relations remain useful during a cache backfill.
	missing := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := result[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) == 0 {
		return result, nil
	}
	rows, err = s.postgres.Query(ctx, `
		SELECT DISTINCT ON (entity.id) entity.id,
			COALESCE(NULLIF(icon.icon_name,''),NULLIF(direct.icon_name,''),NULLIF(db2.icon_name,''),
				NULLIF(version.payload #>> '{raidbots,icon}',''),
				NULLIF(version.payload #>> '{raidbots,spellIcon}',''))
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.published_version_id
		LEFT JOIN catalog_entity_icons icon ON icon.build_id=version.build_id
			AND icon.entity_type=entity.entity_type AND icon.external_id=entity.external_id
		LEFT JOIN catalog_file_assets direct ON direct.file_data_id=CASE
			WHEN version.payload->>'icon_file_data_id' ~ '^[0-9]+$'
			THEN (version.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets db2 ON db2.file_data_id=CASE
			WHEN COALESCE(version.payload #>> '{db2,InventoryIconFileID}',version.payload #>> '{db2,IconFileID}',
				version.payload #>> '{db2,IconFileDataID}',version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(version.payload #>> '{db2,InventoryIconFileID}',version.payload #>> '{db2,IconFileID}',
				version.payload #>> '{db2,IconFileDataID}',version.payload #>> '{db2,SpellIconFileID}')::bigint END
		WHERE entity.id=ANY($1::uuid[]) AND entity.deleted_at IS NULL
		ORDER BY entity.id,(icon.icon_name IS NOT NULL) DESC,(direct.icon_name IS NOT NULL) DESC,
			(db2.icon_name IS NOT NULL) DESC`, missing)
	if err != nil {
		return nil, fmt.Errorf("list icon-name fallbacks: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var entityID uuid.UUID
		var iconName *string
		if err := rows.Scan(&entityID, &iconName); err != nil {
			return nil, fmt.Errorf("scan icon-name fallback: %w", err)
		}
		if iconName == nil {
			continue
		}
		if value, ok := iconURLFromName(*iconName); ok {
			result[entityID] = value
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate icon-name fallbacks: %w", err)
	}
	// Talent records often identify their gameplay spell through the normalized
	// relation graph instead of carrying a duplicate icon field. Reuse that
	// build-pinned spell icon as a presentation fallback so talent cards do not
	// degrade to the generic database glyph while the media worker catches up.
	missing = missing[:0]
	for _, id := range ids {
		if _, ok := result[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) == 0 {
		return result, nil
	}
	rows, err = s.postgres.Query(ctx, `
		SELECT DISTINCT ON (talent.id) talent.id,
			COALESCE(spell_icon.icon_name,spell_file.icon_name)
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.published_version_id
		JOIN catalog_talent_spell_relations relation ON relation.talent_version_id=talent_version.id
		JOIN game_entity_versions spell_version ON spell_version.id=relation.spell_version_id
		JOIN game_entities spell ON spell.id=spell_version.entity_id AND spell.entity_type='spell'
		LEFT JOIN catalog_entity_icons spell_icon ON spell_icon.build_id=spell_version.build_id
			AND spell_icon.entity_type='spell' AND spell_icon.external_id=spell.external_id
		LEFT JOIN catalog_file_assets spell_file ON spell_file.file_data_id=CASE
			WHEN spell_version.payload->>'icon_file_data_id' ~ '^[0-9]+$'
			THEN (spell_version.payload->>'icon_file_data_id')::bigint END
		WHERE talent.id=ANY($1::uuid[])
		  AND talent.entity_type IN ('talent','pvp_talent')
		  AND talent.deleted_at IS NULL AND spell.deleted_at IS NULL
		  AND COALESCE(spell_icon.icon_name,spell_file.icon_name) IS NOT NULL
		ORDER BY talent.id,(relation.relationship='grants') DESC,
			(spell_icon.icon_name IS NOT NULL) DESC,spell.external_id`, missing)
	if err != nil {
		return nil, fmt.Errorf("list talent spell icon fallbacks: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var entityID uuid.UUID
		var iconName *string
		if err := rows.Scan(&entityID, &iconName); err != nil {
			return nil, fmt.Errorf("scan talent spell icon fallback: %w", err)
		}
		if iconName == nil {
			continue
		}
		if value, ok := iconURLFromName(*iconName); ok {
			result[entityID] = value
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate talent spell icon fallbacks: %w", err)
	}
	return result, nil
}
