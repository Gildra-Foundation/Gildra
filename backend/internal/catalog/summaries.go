package catalog

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Highlight struct {
	Key   string
	Value string
}

type CardSummary struct {
	ID             uuid.UUID
	Product        string
	Type           string
	ExternalID     int64
	Slug           string
	Locale         string
	LocaleFallback bool
	Name           string
	Description    string
	IconName       *string
	Quality        *int
	ItemLevel      *int
	BuildID        *int64
	UpdatedAt      time.Time
	Highlights     []Highlight
	Acquisition    []string
	SearchRank     int
}

type AcquisitionCount struct {
	Method string
	Count  int64
}

type SummaryParams struct {
	Product          string
	Type             string
	Locale           string
	Query            string
	Category         string
	Facets           []string
	Acquisition      []string
	MinItemLevel     *int
	MaxItemLevel     *int
	MinRequiredLevel *int
	MaxRequiredLevel *int
	Cursor           string
	Limit            int
	IncludeTotal     bool
}

type SummaryPage struct {
	Entities    []CardSummary
	NextCursor  string
	HasMore     bool
	Total       *int64
	Acquisition []AcquisitionCount
}

func (s *Service) Summaries(ctx context.Context, params SummaryParams) (SummaryPage, error) {
	if params.Limit < 1 || params.Limit > 100 {
		return SummaryPage{}, errors.New("limit must be between 1 and 100")
	}
	if params.MinItemLevel != nil && (*params.MinItemLevel < 0 || *params.MinItemLevel > 9999) || params.MaxItemLevel != nil && (*params.MaxItemLevel < 0 || *params.MaxItemLevel > 9999) {
		return SummaryPage{}, errors.New("item level must be between 0 and 9999")
	}
	if params.MinItemLevel != nil && params.MaxItemLevel != nil && *params.MinItemLevel > *params.MaxItemLevel {
		return SummaryPage{}, errors.New("minItemLevel must not exceed maxItemLevel")
	}
	filterPaths, err := summaryFilterPaths(params.Category, params.Facets)
	if err != nil {
		return SummaryPage{}, err
	}
	acquisitionMethods, err := summaryAcquisitionMethods(params.Acquisition)
	if err != nil {
		return SummaryPage{}, err
	}
	params.Acquisition = acquisitionMethods
	summaryQuery := strings.TrimSpace(params.Query)
	cursorID, cursorRank, err := decodeSummaryCursor(params.Cursor, summaryQuery != "")
	if err != nil {
		return SummaryPage{}, err
	}
	if params.MinRequiredLevel != nil && (*params.MinRequiredLevel < 0 || *params.MinRequiredLevel > 9999) || params.MaxRequiredLevel != nil && (*params.MaxRequiredLevel < 0 || *params.MaxRequiredLevel > 9999) {
		return SummaryPage{}, errors.New("required level must be between 0 and 9999")
	}
	if params.MinRequiredLevel != nil && params.MaxRequiredLevel != nil && *params.MinRequiredLevel > *params.MaxRequiredLevel {
		return SummaryPage{}, errors.New("minRequiredLevel must not exceed maxRequiredLevel")
	}
	product := strings.TrimSpace(params.Product)
	if product == "" {
		product = "wow"
	}
	locale := normalizeLocale(params.Locale)
	var total *int64
	if params.IncludeTotal {
		value, err := s.summaryCount(ctx, params, product, locale)
		if err != nil {
			return SummaryPage{}, err
		}
		total = &value
	}
	acquisitionCounts := []AcquisitionCount(nil)
	if strings.TrimSpace(params.Type) == "item" {
		acquisitionCounts, err = s.summaryAcquisitionCounts(ctx, product)
		if err != nil {
			return SummaryPage{}, err
		}
	}
	if total != nil && *total == 0 {
		return SummaryPage{Entities: []CardSummary{}, Total: total, Acquisition: acquisitionCounts}, nil
	}

	pageOrder := "search_match.rank DESC NULLS LAST,entity.id"
	if summaryQuery == "" {
		pageOrder = "entity.id"
	}
	summarySQL := strings.Replace(`
		WITH RECURSIVE search_candidates(version_id,rank) AS MATERIALIZED (
			SELECT candidate.version_id,max(candidate.rank)::int FROM (
				SELECT candidate_locale.version_id,greatest(
					CASE WHEN lower(candidate_locale.name)=lower($5) THEN 9000 ELSE 0 END,
					CASE WHEN candidate_locale.name ILIKE $5||'%' THEN 8000 ELSE 0 END,
					CASE WHEN candidate_locale.search_document @@ websearch_to_tsquery('simple',$5)
						THEN 7000+(ts_rank(candidate_locale.search_document,websearch_to_tsquery('simple',$5))*1000)::int ELSE 0 END,
					CASE WHEN candidate_locale.name % $5 THEN 6000+(similarity(candidate_locale.name,$5)*1000)::int ELSE 0 END
				) AS rank
				FROM game_entity_localizations candidate_locale
				WHERE $5<>'' AND $5!~'^[0-9]+$' AND (
					candidate_locale.name ILIKE $5||'%' OR candidate_locale.search_document @@ websearch_to_tsquery('simple',$5) OR candidate_locale.name % $5)
				UNION ALL
				SELECT alias.version_id,greatest(
					CASE WHEN lower(alias.alias)=lower($5) THEN 8500 ELSE 0 END,
					CASE WHEN alias.alias ILIKE $5||'%' THEN 7500 ELSE 0 END,
					CASE WHEN alias.alias % $5 THEN 5500+(similarity(alias.alias,$5)*1000)::int ELSE 0 END
				)
				FROM catalog_entity_aliases alias
				WHERE $5<>'' AND $5!~'^[0-9]+$' AND (alias.alias ILIKE $5||'%' OR alias.alias % $5)
				UNION ALL
				SELECT numeric_entity.latest_version_id,10000 FROM game_entities numeric_entity
				WHERE $5~'^[0-9]+$' AND numeric_entity.external_id=$5::bigint AND numeric_entity.deleted_at IS NULL
			) candidate WHERE candidate.rank>0 GROUP BY candidate.version_id
		), requested_paths(path) AS (
			SELECT unnest($7::text[])
		), selected_categories(root_path,id) AS (
			SELECT requested.path,category.id
			FROM requested_paths requested
			JOIN catalog_categories category ON category.path=requested.path
			JOIN game_products product ON product.id=category.product_id
			WHERE product.slug=$1 AND category.entity_type=$2
			UNION ALL
			SELECT selected.root_path,child.id FROM catalog_categories child
			JOIN selected_categories selected ON child.parent_id=selected.id
		), selected_versions AS (
			SELECT assignment.version_id FROM game_entity_categories assignment
			JOIN selected_categories selected ON selected.id=assignment.category_id
			GROUP BY assignment.version_id
			HAVING count(DISTINCT selected.root_path)=(SELECT count(*) FROM requested_paths)
		), page_entities AS MATERIALIZED (
			SELECT entity.id,entity.latest_version_id AS version_id,COALESCE(search_match.rank,0) AS rank
			FROM game_entities entity
			JOIN game_products product ON product.id=entity.product_id
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			LEFT JOIN search_candidates search_match ON search_match.version_id=version.id
			LEFT JOIN selected_versions selected ON selected.version_id=version.id
			LEFT JOIN catalog_items item ON item.version_id=version.id
			WHERE entity.deleted_at IS NULL AND product.slug=$1
				AND ($2='' OR entity.entity_type=$2)
				AND (cardinality($7::text[])=0 OR selected.version_id IS NOT NULL)
				AND ($8::int IS NULL OR item.item_level >= $8)
				AND ($9::int IS NULL OR item.item_level <= $9)
				AND ($10::int IS NULL OR item.required_level >= $10)
				AND ($11::int IS NULL OR item.required_level <= $11)
				AND (cardinality($13::text[])=0 OR EXISTS (
					SELECT 1 FROM catalog_item_acquisition_methods selected_acquisition
					WHERE selected_acquisition.entity_id=entity.id AND selected_acquisition.method=ANY($13::text[])
				))
				AND ($5='' OR search_match.rank>0)
				AND (($5='' AND entity.id>$3) OR ($5<>'' AND ($12::int IS NULL OR search_match.rank<$12 OR (search_match.rank=$12 AND entity.id>$3))))
			ORDER BY /*PAGE_ORDER*/ LIMIT $6
		)
		SELECT entity.id,product.slug,entity.entity_type,entity.external_id,entity.canonical_slug,$4::text,
			(localized.version_id IS NULL OR NULLIF(localized.name,'') IS NULL) AS locale_fallback,
			COALESCE(NULLIF(localized.name,''),fallback.name,''),
			COALESCE(NULLIF(localized.description,''),fallback.description,''),
			COALESCE(source_icon.icon_name,direct_icon.icon_name,db2_icon.icon_name,
				NULLIF(version.payload #>> '{raidbots,icon}',''),NULLIF(version.payload #>> '{raidbots,spellIcon}','')),
			CASE WHEN item.quality ~ '^[0-9]+$' THEN item.quality::int END,
			item.item_level,version.build_id,entity.updated_at,
			item.required_level,item.inventory_type,spell.school,spell.cast_time,spell.cooldown_ms,page.rank,
			COALESCE(acquisition.methods,'{}'::text[])
		FROM page_entities page
		JOIN game_entities entity ON entity.id=page.id
		JOIN game_products product ON product.id=entity.product_id
		JOIN game_entity_versions version ON version.id=page.version_id
		LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale=$4
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
		LEFT JOIN catalog_items item ON item.version_id=version.id
		LEFT JOIN catalog_spells spell ON spell.version_id=version.id
		LEFT JOIN LATERAL (
			SELECT array_agg(method.method ORDER BY method.method) AS methods
			FROM catalog_item_acquisition_methods method WHERE method.entity_id=entity.id
		) acquisition ON entity.entity_type='item'
		LEFT JOIN catalog_entity_icons source_icon ON source_icon.build_id=version.build_id
			AND source_icon.entity_type=entity.entity_type AND source_icon.external_id=entity.external_id
		LEFT JOIN catalog_file_assets direct_icon ON direct_icon.file_data_id=CASE
			WHEN version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (version.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets db2_icon ON db2_icon.file_data_id=CASE
			WHEN COALESCE(version.payload #>> '{db2,InventoryIconFileID}',version.payload #>> '{db2,IconFileID}',
				version.payload #>> '{db2,IconFileDataID}',version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(version.payload #>> '{db2,InventoryIconFileID}',version.payload #>> '{db2,IconFileID}',
				version.payload #>> '{db2,IconFileDataID}',version.payload #>> '{db2,SpellIconFileID}')::bigint END
		ORDER BY page.rank DESC,entity.id`, "/*PAGE_ORDER*/", pageOrder, 1)
	rows, err := s.postgres.Query(ctx, summarySQL, product, strings.TrimSpace(params.Type), cursorID, locale,
		summaryQuery, params.Limit+1, filterPaths, params.MinItemLevel, params.MaxItemLevel,
		params.MinRequiredLevel, params.MaxRequiredLevel, cursorRank, acquisitionMethods)
	if err != nil {
		return SummaryPage{}, fmt.Errorf("list game entity summaries: %w", err)
	}
	defer rows.Close()

	entities := make([]CardSummary, 0, params.Limit+1)
	for rows.Next() {
		var entity CardSummary
		var requiredLevel *int
		var inventoryType, school, castTime *string
		var cooldown *int
		if err := rows.Scan(&entity.ID, &entity.Product, &entity.Type, &entity.ExternalID, &entity.Slug,
			&entity.Locale, &entity.LocaleFallback, &entity.Name, &entity.Description, &entity.IconName,
			&entity.Quality, &entity.ItemLevel, &entity.BuildID, &entity.UpdatedAt, &requiredLevel,
			&inventoryType, &school, &castTime, &cooldown, &entity.SearchRank, &entity.Acquisition); err != nil {
			return SummaryPage{}, fmt.Errorf("scan game entity summary: %w", err)
		}
		entity.Highlights = summaryHighlights(locale, requiredLevel, inventoryType, school, castTime, cooldown)
		entities = append(entities, entity)
	}
	if err := rows.Err(); err != nil {
		return SummaryPage{}, fmt.Errorf("iterate game entity summaries: %w", err)
	}
	hasMore := len(entities) > params.Limit
	if hasMore {
		entities = entities[:params.Limit]
	}
	nextCursor := ""
	if hasMore && len(entities) > 0 {
		last := entities[len(entities)-1]
		nextCursor = encodeSummaryCursor(last.ID, last.SearchRank, summaryQuery != "")
	}
	return SummaryPage{Entities: entities, NextCursor: nextCursor, HasMore: hasMore, Total: total, Acquisition: acquisitionCounts}, nil
}

func (s *Service) summaryCount(ctx context.Context, params SummaryParams, product, locale string) (int64, error) {
	query := strings.TrimSpace(params.Query)
	category := strings.TrimSpace(params.Category)
	entityType := strings.TrimSpace(params.Type)
	filterPaths, err := summaryFilterPaths(category, params.Facets)
	if err != nil {
		return 0, err
	}
	if query == "" && len(filterPaths) == 0 && len(params.Acquisition) == 0 && params.MinItemLevel == nil && params.MaxItemLevel == nil && params.MinRequiredLevel == nil && params.MaxRequiredLevel == nil {
		var total int64
		err := s.postgres.QueryRow(ctx, `
			SELECT COALESCE(sum(stats.entity_count),0)
			FROM catalog_entity_type_stats stats
			JOIN game_products product ON product.id=stats.product_id
			WHERE product.slug=$1 AND stats.locale=$2 AND ($3='' OR stats.entity_type=$3)`,
			product, locale, entityType).Scan(&total)
		if err != nil {
			return 0, fmt.Errorf("read cached entity summary count: %w", err)
		}
		return total, nil
	}
	if query == "" && (entityType == "" || entityType == "item") && len(filterPaths) == 0 && len(params.Acquisition) > 0 && params.MinItemLevel == nil && params.MaxItemLevel == nil && params.MinRequiredLevel == nil && params.MaxRequiredLevel == nil {
		var total int64
		err := s.postgres.QueryRow(ctx, `
			SELECT count(DISTINCT acquisition.entity_id)
			FROM catalog_item_acquisition_methods acquisition
			JOIN game_products product ON product.id=acquisition.product_id
			WHERE product.slug=$1 AND acquisition.method=ANY($2::text[])`, product, params.Acquisition).Scan(&total)
		if err != nil {
			return 0, fmt.Errorf("read cached acquisition summary count: %w", err)
		}
		return total, nil
	}
	if query == "" && category != "" && len(params.Facets) == 0 && len(params.Acquisition) == 0 && params.MinItemLevel == nil && params.MaxItemLevel == nil && params.MinRequiredLevel == nil && params.MaxRequiredLevel == nil {
		var total int64
		err := s.postgres.QueryRow(ctx, `
			SELECT COALESCE(stats.entity_count,0) FROM catalog_categories category
			JOIN game_products product ON product.id=category.product_id
			LEFT JOIN catalog_category_stats stats ON stats.category_id=category.id
			WHERE product.slug=$1 AND category.entity_type=$2 AND category.path=$3`,
			product, entityType, category).Scan(&total)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		if err != nil {
			return 0, fmt.Errorf("read cached category summary count: %w", err)
		}
		return total, nil
	}
	var total int64
	err = s.postgres.QueryRow(ctx, `
		WITH RECURSIVE search_candidates(version_id) AS MATERIALIZED (
			SELECT candidate.version_id FROM (
				SELECT search_locale.version_id FROM game_entity_localizations search_locale
				WHERE $3<>'' AND $3!~'^[0-9]+$' AND (
					search_locale.search_document @@ websearch_to_tsquery('simple',$3) OR search_locale.name % $3)
				UNION ALL
				SELECT alias.version_id FROM catalog_entity_aliases alias
				WHERE $3<>'' AND $3!~'^[0-9]+$' AND alias.alias % $3
				UNION ALL
				SELECT numeric_entity.latest_version_id FROM game_entities numeric_entity
				WHERE $3~'^[0-9]+$' AND numeric_entity.external_id=$3::bigint AND numeric_entity.deleted_at IS NULL
			) candidate GROUP BY candidate.version_id
		), requested_paths(path) AS (
			SELECT unnest($4::text[])
		), selected_categories(root_path,id) AS (
			SELECT requested.path,category.id FROM requested_paths requested
			JOIN catalog_categories category ON category.path=requested.path
			JOIN game_products product ON product.id=category.product_id
			WHERE product.slug=$1 AND category.entity_type=$2
			UNION ALL SELECT selected.root_path,child.id FROM catalog_categories child
			JOIN selected_categories selected ON child.parent_id=selected.id
		), selected_versions AS (
			SELECT assignment.version_id FROM game_entity_categories assignment
			JOIN selected_categories selected ON selected.id=assignment.category_id
			GROUP BY assignment.version_id
			HAVING count(DISTINCT selected.root_path)=(SELECT count(*) FROM requested_paths)
		)
		SELECT count(*) FROM game_entities entity
		JOIN game_products product ON product.id=entity.product_id
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		LEFT JOIN catalog_items item ON item.version_id=version.id
		LEFT JOIN search_candidates search ON search.version_id=version.id
		LEFT JOIN selected_versions selected ON selected.version_id=version.id
		WHERE entity.deleted_at IS NULL AND product.slug=$1 AND ($2='' OR entity.entity_type=$2)
			AND (cardinality($4::text[])=0 OR selected.version_id IS NOT NULL)
			AND ($5::int IS NULL OR item.item_level >= $5)
			AND ($6::int IS NULL OR item.item_level <= $6)
			AND ($7::int IS NULL OR item.required_level >= $7)
			AND ($8::int IS NULL OR item.required_level <= $8)
			AND ($3='' OR search.version_id IS NOT NULL)
			AND (cardinality($9::text[])=0 OR EXISTS (
				SELECT 1 FROM catalog_item_acquisition_methods acquisition
				WHERE acquisition.entity_id=entity.id AND acquisition.method=ANY($9::text[])
			))`, product, entityType, query, filterPaths, params.MinItemLevel, params.MaxItemLevel,
		params.MinRequiredLevel, params.MaxRequiredLevel, params.Acquisition).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("count game entity summaries: %w", err)
	}
	return total, nil
}

func (s *Service) summaryAcquisitionCounts(ctx context.Context, product string) ([]AcquisitionCount, error) {
	rows, err := s.postgres.Query(ctx, `
		WITH method_order(method,sort_order) AS (VALUES
			('drop'::text,1),('quest'::text,2),('vendor'::text,3),('crafting'::text,4)
		), counts AS (
			SELECT acquisition.method,count(*)::bigint AS entity_count
			FROM catalog_item_acquisition_methods acquisition
			JOIN game_products selected_product ON selected_product.id=acquisition.product_id AND selected_product.slug=$1
			GROUP BY acquisition.method
		)
		SELECT method_order.method,COALESCE(counts.entity_count,0)
		FROM method_order LEFT JOIN counts USING(method) ORDER BY method_order.sort_order`, product)
	if err != nil {
		return nil, fmt.Errorf("count item acquisition methods: %w", err)
	}
	defer rows.Close()
	counts := make([]AcquisitionCount, 0, 4)
	for rows.Next() {
		var count AcquisitionCount
		if err := rows.Scan(&count.Method, &count.Count); err != nil {
			return nil, fmt.Errorf("scan item acquisition method count: %w", err)
		}
		counts = append(counts, count)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate item acquisition method counts: %w", err)
	}
	return counts, nil
}

func summaryFilterPaths(category string, facets []string) ([]string, error) {
	seen := make(map[string]struct{}, len(facets)+1)
	paths := make([]string, 0, len(facets)+1)
	for _, raw := range append([]string{category}, facets...) {
		path := strings.TrimSpace(raw)
		if path == "" {
			continue
		}
		if len(path) > 192 {
			return nil, errors.New("facet path must not exceed 192 characters")
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		paths = append(paths, path)
	}
	if len(paths) > 8 {
		return nil, errors.New("at most 8 facet paths are allowed")
	}
	return paths, nil
}

func summaryAcquisitionMethods(values []string) ([]string, error) {
	allowed := map[string]struct{}{"drop": {}, "quest": {}, "vendor": {}, "crafting": {}}
	seen := make(map[string]struct{}, len(values))
	methods := make([]string, 0, len(values))
	for _, raw := range values {
		method := strings.ToLower(strings.TrimSpace(raw))
		if method == "" {
			continue
		}
		if _, ok := allowed[method]; !ok {
			return nil, fmt.Errorf("unsupported acquisition method %q", method)
		}
		if _, ok := seen[method]; ok {
			continue
		}
		seen[method] = struct{}{}
		methods = append(methods, method)
	}
	return methods, nil
}

func encodeSummaryCursor(id uuid.UUID, rank int, ranked bool) string {
	if !ranked {
		return encodeCursor(id)
	}
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(rank) + "\x1f" + id.String()))
}

func decodeSummaryCursor(cursor string, ranked bool) (uuid.UUID, *int, error) {
	if cursor == "" {
		return uuid.Nil, nil, nil
	}
	if !ranked {
		id, err := decodeCursor(cursor)
		return id, nil, err
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return uuid.Nil, nil, errors.New("cursor is invalid")
	}
	parts := strings.Split(string(decoded), "\x1f")
	if len(parts) != 2 {
		return uuid.Nil, nil, errors.New("cursor is invalid for ranked search")
	}
	rank, err := strconv.Atoi(parts[0])
	if err != nil || rank < 0 {
		return uuid.Nil, nil, errors.New("cursor is invalid for ranked search")
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return uuid.Nil, nil, errors.New("cursor is invalid for ranked search")
	}
	return id, &rank, nil
}

func summaryHighlights(locale string, requiredLevel *int, inventoryType, school, castTime *string, cooldown *int) []Highlight {
	highlights := make([]Highlight, 0, 3)
	if requiredLevel != nil && *requiredLevel > 0 {
		key := "Requires level"
		if locale == "ru_RU" {
			key = "Требуется уровень"
		}
		highlights = append(highlights, Highlight{Key: "required_level", Value: key + " " + strconv.Itoa(*requiredLevel)})
	}
	if inventoryType != nil {
		if value := inventoryTypeSummary(strings.TrimSpace(*inventoryType), locale); value != "" {
			highlights = append(highlights, Highlight{Key: "inventory_type", Value: value})
		}
	}
	if school != nil && strings.TrimSpace(*school) != "" {
		highlights = append(highlights, Highlight{Key: "school", Value: strings.TrimSpace(*school)})
	}
	if castTime != nil && strings.TrimSpace(*castTime) != "" {
		highlights = append(highlights, Highlight{Key: "cast_time", Value: strings.TrimSpace(*castTime)})
	}
	if cooldown != nil && *cooldown > 0 {
		highlights = append(highlights, Highlight{Key: "cooldown_ms", Value: strconv.Itoa(*cooldown) + " ms"})
	}
	if len(highlights) > 3 {
		return highlights[:3]
	}
	return highlights
}

func inventoryTypeSummary(raw, locale string) string {
	code, err := strconv.Atoi(raw)
	if err != nil || code == 0 {
		return ""
	}
	en := map[int]string{
		1: "Head", 2: "Neck", 3: "Shoulder", 5: "Chest", 6: "Waist", 7: "Legs",
		8: "Feet", 9: "Wrist", 10: "Hands", 11: "Finger", 12: "Trinket", 13: "One-Hand",
		14: "Shield", 15: "Ranged", 16: "Back", 17: "Two-Hand", 21: "Main Hand",
		22: "Off Hand", 23: "Held In Off-hand", 26: "Ranged",
	}
	ru := map[int]string{
		1: "Голова", 2: "Шея", 3: "Плечи", 5: "Грудь", 6: "Пояс", 7: "Ноги",
		8: "Ступни", 9: "Запястья", 10: "Кисти рук", 11: "Палец", 12: "Аксессуар",
		13: "Одноручное", 14: "Щит", 15: "Дальний бой", 16: "Спина", 17: "Двуручное",
		21: "Правая рука", 22: "Левая рука", 23: "Левая рука", 26: "Дальний бой",
	}
	if locale == "ru_RU" {
		return ru[code]
	}
	return en[code]
}
