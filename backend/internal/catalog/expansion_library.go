package catalog

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type midnightCountEntry struct {
	epoch   string
	expires time.Time
	counts  map[string][5]int64
}
type midnightCountCache struct {
	mu      sync.Mutex
	entries map[string]midnightCountEntry
}

func (s *Service) expansionCounts(ctx context.Context, product, locale string) (map[string][5]int64, error) {
	// Read the publication epoch on every request. A promotion or read-model repair
	// invalidates previous counts immediately; TTL also bounds media expiration.
	var epoch string
	if err := s.postgres.QueryRow(ctx, `SELECT coalesce(p.release_id::text,'')||':'||coalesce(m.generation::text,'')||':'||coalesce(m.refreshed_at::text,'')
 FROM game_products g LEFT JOIN catalog_public_release_state p ON p.product_id=g.id
 LEFT JOIN catalog_read_model_state m ON m.product_id=g.id WHERE g.slug=$1`, product).Scan(&epoch); err != nil {
		return nil, err
	}
	cache := &s.midnightCounts
	cache.mu.Lock()
	defer cache.mu.Unlock()
	key := product + ":" + locale
	if entry, ok := cache.entries[key]; ok && entry.epoch == epoch && time.Now().Before(entry.expires) {
		return entry.counts, nil
	}
	rows, err := s.postgres.Query(ctx, midnightLibraryCounts, product, locale)
	if err != nil {
		return nil, fmt.Errorf("count Midnight library: %w", err)
	}
	defer rows.Close()
	counts := map[string][5]int64{}
	for rows.Next() {
		var slug string
		var n [5]int64
		if err := rows.Scan(&slug, &n[0], &n[1], &n[2], &n[3], &n[4]); err != nil {
			return nil, err
		}
		counts[slug] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if cache.entries == nil {
		cache.entries = map[string]midnightCountEntry{}
	}
	cache.entries[key] = midnightCountEntry{epoch: epoch, expires: time.Now().Add(30 * time.Second), counts: counts}
	return counts, nil
}

// LibraryDatasetsInExpansion reports the confirmed published cohort only.
// A zero is not a claim that the official expansion contains no such records.
func (s *Service) LibraryDatasetsInExpansion(ctx context.Context, product, locale, expansion string) ([]LibraryDataset, error) {
	if err := validateExpansion(product, expansion); err != nil {
		return nil, err
	}
	datasets, err := s.LibraryDatasets(ctx, product, locale)
	if err != nil || expansion == "" {
		return datasets, err
	}
	if product == "" {
		product = "wow"
	}
	counts, err := s.expansionCounts(ctx, product, normalizeLocale(locale))
	if err != nil {
		return nil, err
	}
	for i := range datasets {
		d := &datasets[i]
		n := counts[d.Slug]
		d.EntityCount = n[0]
		d.LocalizedCount = n[1]
		d.VerifiedLocalizedCount = n[2]
		d.TooltipCount = n[3]
		d.ImageCount = n[4]
		// Retail preview selection cannot stand in for a scoped preview.
		d.PreviewIconName = nil
		d.PreviewImageURL = nil
		if d.EntityCount == 0 {
			d.Applicability = "pending_source"
			d.ApplicabilityReason = "Confirmed Midnight membership is not available for this dataset."
		}
	}
	return datasets, nil
}

var midnightLibraryCounts = `
 WITH eligible AS MATERIALIZED (
 SELECT e.id,e.entity_type,e.external_id,v.id version_id,v.build_id,e.product_id,
 item.item_class_id,item.item_subclass_id,
 (localized.version_id IS NOT NULL) localized
 FROM catalog_entity_expansions cohort
 JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id AND expansion.expansion_key='midnight'
 JOIN game_products product ON product.id=cohort.product_id AND product.slug=$1
 JOIN game_entities e ON e.product_id=cohort.product_id AND e.entity_type=cohort.entity_type AND e.external_id=cohort.external_id
 JOIN game_entity_versions v ON v.id=e.published_version_id AND v.build_id=cohort.build_id
 LEFT JOIN catalog_items item ON item.version_id=v.id
 LEFT JOIN game_entity_localizations localized ON localized.version_id=v.id AND localized.locale=$2
 LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US'
 WHERE e.deleted_at IS NULL AND cohort.classification='confirmed'
 ` + publicCatalogDisplayNamePredicate("localized", "fallback") + publicCatalogUsabilityPredicate("e", "v") + `
 ), facts AS MATERIALIZED (
 SELECT e.*,
 EXISTS(SELECT 1 FROM catalog_entity_localization_artifacts proof JOIN catalog_source_artifacts a ON a.id=proof.source_artifact_id
 WHERE proof.version_id=e.version_id AND proof.locale=$2 AND a.status='ready' AND a.content_hash IS NOT NULL AND a.byte_size IS NOT NULL AND (a.locale='' OR a.locale=proof.locale)) verified,
 EXISTS(SELECT 1 FROM catalog_entity_tooltips t WHERE t.version_id=e.version_id AND t.locale=$2) tooltip,
 EXISTS(SELECT 1 FROM (SELECT DISTINCT ON (m.media_kind,m.asset_key,m.locale,m.source)
 m.cache_status,m.cached_url,m.cached_content_hash,m.cached_byte_size FROM catalog_entity_media m
 JOIN game_builds mb ON mb.id=m.build_id AND mb.product_id=e.product_id
 JOIN game_builds pb ON pb.id=e.build_id AND pb.product_id=e.product_id
 JOIN catalog_source_artifacts a ON a.id=m.source_artifact_id
 JOIN catalog_published_source_dependencies dep ON dep.source=m.source
 JOIN catalog_source_policies policy ON policy.source=m.source
 WHERE m.entity_id=e.id AND policy.review_status='reviewed'
 AND (m.cache_status='remote' OR policy.retention_days IS NULL OR m.cached_at>now()-make_interval(days=>policy.retention_days))
 AND a.status='ready' AND a.content_hash IS NOT NULL AND a.byte_size IS NOT NULL
 AND mb.build_number<=pb.build_number
 ORDER BY m.media_kind,m.asset_key,m.locale,m.source,mb.build_number DESC,a.fetched_at DESC,m.updated_at DESC,m.id DESC
 ) delivered WHERE delivered.cache_status='cached' AND NULLIF(delivered.cached_url,'') IS NOT NULL
 AND delivered.cached_content_hash IS NOT NULL AND delivered.cached_byte_size IS NOT NULL) image
 FROM eligible e
 )
 SELECT d.slug,count(*),count(*) FILTER(WHERE e.localized),
 count(*) FILTER(WHERE e.localized AND e.verified),count(*) FILTER(WHERE e.tooltip),count(*) FILTER(WHERE e.image)
 FROM catalog_library_dataset_definitions d JOIN facts e ON e.entity_type=d.entity_type
 WHERE d.is_public AND (
 (d.category_path='' AND d.item_class_id IS NULL)
 OR (d.item_class_id IS NOT NULL AND e.item_class_id=d.item_class_id
 AND (d.item_subclass_ids IS NULL OR e.item_subclass_id=ANY(d.item_subclass_ids))
 AND (e.item_subclass_id IS NULL OR e.item_subclass_id<>ALL(d.excluded_item_subclass_ids)))
 OR (d.item_class_id IS NULL AND d.category_path<>'' AND EXISTS(
 SELECT 1 FROM game_entity_categories assignment JOIN catalog_categories c ON c.id=assignment.category_id
 WHERE assignment.version_id=e.version_id AND c.product_id=e.product_id AND c.entity_type=e.entity_type
 AND (c.path=d.category_path OR c.path LIKE d.category_path||'/%'))))
 GROUP BY d.slug`
