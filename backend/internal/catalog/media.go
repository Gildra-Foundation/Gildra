package catalog

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

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
	return result, nil
}
