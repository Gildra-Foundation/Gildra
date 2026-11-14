package catalog

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func validateSummarySort(sort string) error {
	switch sort {
	case "", "current", "id", "item_level_desc", "item_level_asc", "required_level_desc", "required_level_asc", "name_asc", "name_desc":
		return nil
	default:
		return invalidRequest("unsupported summary sort")
	}
}

func summaryUsesOrdering(p SummaryParams) bool {
	if strings.TrimSpace(p.Query) != "" || len(p.ExternalIDs) > 0 || p.Sort == "id" {
		return false
	}
	// UUID cursors issued before this release continue their original order.
	if p.Cursor != "" {
		if _, err := decodeCursor(p.Cursor); err == nil {
			return false
		}
	}
	// Preserve the heterogeneous legacy feed; datasets/types have meaningful order.
	return strings.TrimSpace(p.Type) != "" || p.Sort != ""
}

// Ordering is indexed per entity type only. Indexes without the type made the
// planner walk every higher-ranked item before the first spell.
func validateSummaryOrderingScope(p SummaryParams) error {
	if summaryUsesOrdering(p) && strings.TrimSpace(p.Type) == "" {
		return invalidRequest("sort requires a dataset or type")
	}
	return nil
}

type deliveryCursor struct {
	V         int       `json:"v"`
	Scope     string    `json:"scope"`
	ID        uuid.UUID `json:"id"`
	Expansion int       `json:"expansion"`
	Level     int       `json:"level"`
	Required  int       `json:"required"`
	External  int64     `json:"external"`
	Name      string    `json:"name"`
}

func deliveryScope(p SummaryParams, product, locale, epoch string) string {
	raw := summaryTotalKey(p, product, locale, false) + "\x00" + p.Sort + "\x00" + epoch
	return fmt.Sprintf("%x", sha256.Sum256([]byte(raw)))
}
func decodeDeliveryCursor(raw, scope string) (deliveryCursor, error) {
	var c deliveryCursor
	if raw == "" {
		return c, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil || json.Unmarshal(b, &c) != nil || c.V != 2 || c.Scope != scope || c.ID == uuid.Nil {
		return c, invalidRequest("cursor does not match this sort, filters or catalog generation")
	}
	return c, nil
}
func encodeDeliveryCursor(c deliveryCursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func (s *Service) orderedSummaries(ctx context.Context, p SummaryParams, product, locale string, paths []string, total *int64) (SummaryPage, error) {
	if len(paths) > 0 {
		var found int
		if err := s.postgres.QueryRow(ctx, `SELECT count(*) FROM catalog_categories c JOIN game_products p ON p.id=c.product_id WHERE p.slug=$1 AND c.entity_type=$2 AND c.path=ANY($3::text[])`, product, p.Type, paths).Scan(&found); err != nil {
			return SummaryPage{}, err
		}
		if found != len(paths) {
			if p.IncludeTotal {
				zero := int64(0)
				total = &zero
			}
			return SummaryPage{Entities: []CardSummary{}, Total: total}, nil
		}
	}
	if p.Sort == "" {
		p.Sort = "current"
	}
	var epoch string
	if err := s.postgres.QueryRow(ctx, `SELECT state.refreshed_at::text FROM catalog_delivery_state state JOIN game_products p ON p.id=state.product_id WHERE p.slug=$1`, product).Scan(&epoch); err != nil {
		return SummaryPage{}, fmt.Errorf("catalog delivery projection must be refreshed: %w", err)
	}
	scope := deliveryScope(p, product, locale, epoch)
	cursor, err := decodeDeliveryCursor(p.Cursor, scope)
	if err != nil {
		return SummaryPage{}, err
	}
	args := []any{product, locale, strings.TrimSpace(p.Type), paths, p.ItemClassID, p.ItemSubclassIDs, p.ExcludedItemSubclassIDs, p.MinItemLevel, p.MaxItemLevel, p.MinRequiredLevel, p.MaxRequiredLevel, p.Expansion, p.Limit + 1}
	key, values, direction := "(d.expansion_order,COALESCE(d.item_level,-1),d.external_id,d.entity_id)", "($14::int,$15::int,$16::bigint,$17::uuid)", "DESC"
	args = append(args, cursor.Expansion, cursor.Level, cursor.External, cursor.ID)
	switch p.Sort {
	case "item_level_asc", "item_level_desc":
		key = "(COALESCE(d.item_level,-1),d.entity_id)"
		values = "($14::int,$15::uuid)"
		args = append(args[:13], cursor.Level, cursor.ID)
	case "required_level_asc", "required_level_desc":
		key = "(COALESCE(d.required_level,-1),d.entity_id)"
		values = "($14::int,$15::uuid)"
		args = append(args[:13], cursor.Required, cursor.ID)
	case "name_asc", "name_desc":
		key = `(d.name COLLATE "C",d.entity_id)`
		values = `($14::text COLLATE "C",$15::uuid)`
		args = append(args[:13], cursor.Name, cursor.ID)
	}
	if strings.HasSuffix(p.Sort, "_asc") {
		direction = "ASC"
	}
	op := "<"
	if direction == "ASC" {
		op = ">"
	}
	// Individual ORDER BY terms (rather than a composite record expression)
	// exactly match the btree, including the reverse scan for ascending levels.
	order := strings.TrimSuffix(strings.TrimPrefix(key, "("), ")")
	if p.Sort == "current" {
		order = "d.expansion_order DESC,COALESCE(d.item_level,-1) DESC,d.external_id DESC,d.entity_id DESC"
	} else {
		pos := strings.LastIndex(order, ",")
		order = order[:pos] + " " + direction + "," + order[pos+1:] + " " + direction
	}
	seek := ""
	if p.Cursor != "" {
		seek = " AND " + key + op + values
	} else {
		args = args[:13]
	}
	query := `WITH RECURSIVE requested_paths(path) AS (SELECT unnest($4::text[])), selected_categories(root_path,id) AS (
 SELECT r.path,c.id FROM requested_paths r JOIN catalog_categories c ON c.path=r.path
 WHERE c.product_id=(SELECT id FROM game_products WHERE slug=$1) AND c.entity_type=$3
 UNION ALL SELECT s.root_path,c.id FROM catalog_categories c JOIN selected_categories s ON c.parent_id=s.id
 )
 SELECT d.entity_id,d.expansion_order,COALESCE(d.item_level,-1),COALESCE(d.required_level,-1),d.external_id,d.name
 FROM catalog_delivery_order d
 JOIN LATERAL (SELECT e.id FROM game_entities e
 JOIN game_entity_versions v ON v.id=d.version_id
 LEFT JOIN catalog_items item ON item.version_id=d.version_id
 LEFT JOIN game_entity_localizations l ON l.version_id=d.version_id AND l.locale=$2
 LEFT JOIN game_entity_localizations fallback ON fallback.version_id=d.version_id AND fallback.locale='en_US'
 WHERE e.id=d.entity_id AND e.published_version_id=d.version_id AND e.deleted_at IS NULL
 ` + publicCatalogDisplayNamePredicate("l", "fallback") + publicCatalogUsabilityPredicate("e", "v") + expansionPredicate(p.Expansion, "e", "v", "$12") + `
 AND $12::text IS NOT NULL
 AND ($5::int IS NULL OR item.item_class_id=$5)
 AND ($6::int[] IS NULL OR item.item_subclass_id=ANY($6))
 AND (item.item_subclass_id IS NULL OR item.item_subclass_id<>ALL(COALESCE($7::int[],'{}')))
 AND ($8::int IS NULL OR item.item_level >= $8) AND ($9::int IS NULL OR item.item_level <= $9)
 AND ($10::int IS NULL OR item.required_level >= $10) AND ($11::int IS NULL OR item.required_level <= $11)
 AND NOT EXISTS (SELECT 1 FROM requested_paths r WHERE NOT EXISTS (
 SELECT 1 FROM game_entity_categories a JOIN selected_categories c ON c.id=a.category_id WHERE a.version_id=d.version_id AND c.root_path=r.path))
  OFFSET 0) visible ON true
 WHERE d.product_id=(SELECT id FROM game_products WHERE slug=$1) AND d.locale=$2 AND ($3='' OR d.entity_type=$3)
 AND d.name<>'' AND d.name !~* ` + publicCatalogJunkNamePattern + `
 AND ($5::int IS NULL OR d.item_class_id=$5)
 AND ($6::int[] IS NULL OR d.item_subclass_id=ANY($6))
 AND (d.item_subclass_id IS NULL OR d.item_subclass_id<>ALL(COALESCE($7::int[],'{}')))
 AND ($8::int IS NULL OR d.item_level >= $8) AND ($9::int IS NULL OR d.item_level <= $9)
 AND ($10::int IS NULL OR d.required_level >= $10) AND ($11::int IS NULL OR d.required_level <= $11)
 ` + seek + " ORDER BY " + order + " LIMIT $13"
	keys := []deliveryCursor{}
	err = s.inSearchTransaction(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("select ordered summary page: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			c := deliveryCursor{V: 2, Scope: scope}
			if err := rows.Scan(&c.ID, &c.Expansion, &c.Level, &c.Required, &c.External, &c.Name); err != nil {
				return err
			}
			keys = append(keys, c)
		}
		return rows.Err()
	})
	if err != nil {
		return SummaryPage{}, err
	}
	more := len(keys) > p.Limit
	if more {
		keys = keys[:p.Limit]
	}
	page := SummaryPage{Entities: []CardSummary{}, Total: total, HasMore: more}
	if len(keys) == 0 {
		return page, nil
	}
	ids := make([]uuid.UUID, len(keys))
	for i, k := range keys {
		ids[i] = k.ID
	}
	hydration := strings.Replace(summaryFastQuery, "AND entity.id>$3", "AND entity.id=ANY($14::uuid[]) AND $3::uuid IS NOT NULL", 1)
	hydration = strings.Replace(hydration, "WHERE entity.deleted_at IS NULL", "WHERE entity.deleted_at IS NULL"+expansionPredicate(p.Expansion, "entity", "version", "$13")+" AND $13::text IS NOT NULL", 1)
	rows, err := s.postgres.Query(ctx, hydration, product, p.Type, uuid.Nil, locale, len(ids), p.MinItemLevel, p.MaxItemLevel, p.MinRequiredLevel, p.MaxRequiredLevel, p.ItemClassID, p.ItemSubclassIDs, p.ExcludedItemSubclassIDs, p.Expansion, ids)
	if err != nil {
		return SummaryPage{}, fmt.Errorf("hydrate ordered summary page: %w", err)
	}
	byID := map[uuid.UUID]CardSummary{}
	for rows.Next() {
		var e CardSummary
		var required, cooldown *int
		var inventory, school, cast *string
		if err := rows.Scan(&e.ID, &e.Product, &e.Type, &e.ExternalID, &e.Slug, &e.Locale, &e.LocaleFallback, &e.Name, &e.Description, &e.IconName, &e.Quality, &e.ItemLevel, &e.BuildID, &e.UpdatedAt, &required, &inventory, &school, &cast, &cooldown, &e.SearchRank); err != nil {
			rows.Close()
			return SummaryPage{}, err
		}
		e.RequiredLevel = required
		e.InventoryType = inventory
		e.Highlights = summaryHighlights(locale, required, inventory, school, cast, cooldown)
		byID[e.ID] = e
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return SummaryPage{}, err
	}
	icons, err := s.cachedIconURLs(ctx, ids)
	if err != nil {
		return SummaryPage{}, err
	}
	for _, id := range ids {
		if e, ok := byID[id]; ok {
			if icon, ok := icons[id]; ok {
				e.IconURL = &icon
			}
			page.Entities = append(page.Entities, e)
		}
	}
	if more {
		page.NextCursor = encodeDeliveryCursor(keys[len(keys)-1])
	}
	return page, nil
}
