package catalog

import (
	"context"
	"fmt"
)

// Achievement categories are a small, bounded facet set. Count the published
// assignments in one query using the requested locale and the list's exact
// visibility gates. The legacy category cache is RU-only and has older gates.
func (s *Service) achievementCategories(ctx context.Context, product, locale string) ([]Category, error) {
	rows, err := s.postgres.Query(ctx, `WITH RECURSIVE categories AS MATERIALIZED (
 SELECT c.* FROM catalog_categories c JOIN game_products p ON p.id=c.product_id
 WHERE p.slug=$1 AND c.entity_type='achievement'
 ), descendants AS (
 SELECT id ancestor,id descendant FROM categories
 UNION
 SELECT d.ancestor,c.id FROM descendants d JOIN categories c ON c.parent_id=d.descendant
 ), visible AS MATERIALIZED (
 SELECT assignment.category_id,e.id
 FROM categories c JOIN game_entity_categories assignment ON assignment.category_id=c.id
 JOIN game_entities e ON e.published_version_id=assignment.version_id AND e.product_id=c.product_id
 AND e.entity_type='achievement' AND e.deleted_at IS NULL
 JOIN game_entity_versions v ON v.id=assignment.version_id
 LEFT JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale=$2
 LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US'
 WHERE true `+publicCatalogDisplayNamePredicate("l", "fallback")+publicCatalogUsabilityPredicate("e", "v")+`
 ), counts AS (
 SELECT d.ancestor,count(DISTINCT visible.id) entity_count FROM descendants d
 JOIN visible ON visible.category_id=d.descendant GROUP BY d.ancestor
 )
 SELECT c.id,c.entity_type,c.facet,c.slug,c.path,COALESCE(parent.path,''),
 COALESCE(NULLIF(l.name,''),fallback.name,c.slug),COALESCE(NULLIF(l.description,''),fallback.description,''),counts.entity_count,c.sort_order
 FROM categories c JOIN counts ON counts.ancestor=c.id
 LEFT JOIN categories parent ON parent.id=c.parent_id
 LEFT JOIN catalog_category_localizations l ON l.category_id=c.id AND l.locale=$2
 LEFT JOIN catalog_category_localizations fallback ON fallback.category_id=c.id AND fallback.locale='en_US'
 ORDER BY c.path,c.sort_order,c.id`, product, normalizeLocale(locale))
	if err != nil {
		return nil, fmt.Errorf("list achievement categories: %w", err)
	}
	defer rows.Close()
	result := make([]Category, 0, 256)
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Type, &c.Facet, &c.Slug, &c.Path, &c.ParentPath, &c.Name, &c.Description, &c.Count, &c.SortOrder); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
