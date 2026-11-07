package catalog

import (
	"context"
	"maps"
	"net/url"
	"slices"
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

// enrichTooltipMedia attaches cached icon URLs to the entity references in
// all given tooltips with a single lookup, so a list page costs one query
// instead of one per entity.
func (s *Service) enrichTooltipMedia(ctx context.Context, tooltips ...*Tooltip) error {
	unique := make(map[uuid.UUID]struct{})
	for _, tooltip := range tooltips {
		if tooltip != nil {
			collectTooltipEntityIDs(tooltip.Blocks, unique)
		}
	}
	if len(unique) == 0 {
		return nil
	}
	urls, err := s.cachedIconURLs(ctx, slices.Collect(maps.Keys(unique)))
	if err != nil {
		return err
	}
	for _, tooltip := range tooltips {
		if tooltip != nil {
			attachTooltipMediaURLs(tooltip.Blocks, urls)
		}
	}
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

// cachedIconURLs returns only locally verified icon observations. A remote
// source URL is not a usable public image: it can expire, reject the browser,
// or point at a FileDataID that no longer exists. Callers deliberately receive
// no URL in that case and render their standard non-broken placeholder.
func (s *Service) cachedIconURLs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	result := make(map[uuid.UUID]string)
	if len(ids) == 0 {
		return result, nil
	}
	entities := make([]*Entity, 0, len(ids))
	for _, id := range ids {
		entities = append(entities, &Entity{ID: id})
	}
	if err := s.enrichMedia(ctx, entities); err != nil {
		return nil, err
	}
	for _, entity := range entities {
		if entity.IconURL != nil {
			result[entity.ID] = *entity.IconURL
		}
	}
	return result, nil
}
