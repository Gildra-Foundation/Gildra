package catalog

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

// Projection runs before publication/quest eligibility refresh. Resolve embedded
// links at read time so they obey the same gates as public relationships.
func (s *Service) enrichAchievementTargets(ctx context.Context, entities []*Entity) error {
	type request struct {
		ID      string `json:"id"`
		Build   int64  `json:"build"`
		Product string `json:"product"`
		Locale  string `json:"locale"`
	}
	refs := map[request][]map[string]any{}
	for _, entity := range entities {
		if entity == nil || entity.Tooltip == nil {
			continue
		}
		for _, block := range entity.Tooltip.Blocks {
			if block["type"] != "achievement_info" {
				continue
			}
			visitAchievementReferences(block, func(ref map[string]any) {
				id, _ := ref["id"].(string)
				if _, err := uuid.Parse(id); err != nil || entity.BuildID == nil {
					delete(ref, "id")
					return
				}
				key := request{id, *entity.BuildID, entity.Product, normalizeLocale(entity.Locale)}
				refs[key] = append(refs[key], ref)
			})
		}
	}
	if len(refs) == 0 {
		return nil
	}
	requests := make([]request, 0, len(refs))
	for key := range refs {
		requests = append(requests, key)
	}
	data, err := json.Marshal(requests)
	if err != nil {
		return err
	}
	rows, err := s.postgres.Query(ctx, `SELECT r.id::text,r.build,r.product,r.locale
 FROM jsonb_to_recordset($1::jsonb) r(id uuid,build bigint,product text,locale text)
 JOIN game_entities e ON e.id=r.id AND e.deleted_at IS NULL
 JOIN game_products p ON p.id=e.product_id AND p.slug=r.product
 JOIN game_entity_versions v ON v.id=e.published_version_id AND v.build_id=r.build
 LEFT JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale=r.locale
 LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US'
 WHERE true `+publicCatalogDisplayNamePredicate("l", "fallback")+publicCatalogUsabilityPredicate("e", "v"), data)
	if err != nil {
		return fmt.Errorf("resolve achievement targets: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var key request
		if err := rows.Scan(&key.ID, &key.Build, &key.Product, &key.Locale); err != nil {
			return err
		}
		delete(refs, key)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	// Keep the source name/text, but no clickable route to a held record.
	for _, maps := range refs {
		for _, ref := range maps {
			delete(ref, "id")
		}
	}
	return nil
}

func visitAchievementReferences(block map[string]any, visit func(map[string]any)) {
	var tree func(any)
	tree = func(value any) {
		node, ok := value.(map[string]any)
		if !ok {
			return
		}
		if target, ok := node["target"].(map[string]any); ok {
			visit(target)
		}
		if children, ok := node["children"].([]any); ok {
			for _, child := range children {
				tree(child)
			}
		}
	}
	tree(block["criteria"])
	if previous, ok := block["previous"].(map[string]any); ok {
		visit(previous)
	}
	for _, field := range []string{"rewards", "next"} {
		if records, ok := block[field].([]any); ok {
			for _, record := range records {
				if ref, ok := record.(map[string]any); ok {
					visit(ref)
				}
			}
		}
	}
}
