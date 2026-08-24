package catalog

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type SitemapEntry struct {
	ID        uuid.UUID
	Type      string
	Slug      string
	UpdatedAt time.Time
}

func (s *Service) SitemapEntries(ctx context.Context, product, entityType, shard string) ([]SitemapEntry, error) {
	product = strings.TrimSpace(product)
	if product == "" {
		product = "wow"
	}
	entityType = strings.TrimSpace(entityType)
	if entityType == "" {
		return nil, fmt.Errorf("type is required")
	}
	lower, upper, err := sitemapShardBounds(shard)
	if err != nil {
		return nil, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT entity.id,entity.entity_type,entity.canonical_slug,entity.updated_at
		FROM game_entities entity
		JOIN game_products product ON product.id=entity.product_id
		JOIN catalog_entity_type_registry registry ON registry.product_id=entity.product_id
			AND registry.entity_type=entity.entity_type AND registry.is_public
		WHERE product.slug=$1 AND entity.entity_type=$2 AND entity.deleted_at IS NULL
			AND entity.id >= $3 AND ($4::uuid IS NULL OR entity.id < $4)
		ORDER BY entity.id
		LIMIT 50001`, product, entityType, lower, upper)
	if err != nil {
		return nil, fmt.Errorf("list sitemap entries: %w", err)
	}
	defer rows.Close()
	entries := make([]SitemapEntry, 0, 4096)
	for rows.Next() {
		var entry SitemapEntry
		if err := rows.Scan(&entry.ID, &entry.Type, &entry.Slug, &entry.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan sitemap entry: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sitemap entries: %w", err)
	}
	if len(entries) > 50000 {
		return nil, fmt.Errorf("sitemap shard exceeds 50000 entries; use a longer shard prefix")
	}
	return entries, nil
}

func sitemapShardBounds(shard string) (uuid.UUID, *uuid.UUID, error) {
	shard = strings.ToLower(strings.TrimSpace(shard))
	if len(shard) > 2 {
		return uuid.Nil, nil, fmt.Errorf("shard must contain at most two hexadecimal characters")
	}
	if shard == "" {
		return uuid.Nil, nil, nil
	}
	value, err := strconv.ParseUint(shard, 16, 8)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("shard must contain lowercase hexadecimal characters")
	}
	lowerText := shard + strings.Repeat("0", 32-len(shard))
	lower, err := parseCompactUUID(lowerText)
	if err != nil {
		return uuid.Nil, nil, err
	}
	maxValue := uint64(1)<<(4*len(shard)) - 1
	if value == maxValue {
		return lower, nil, nil
	}
	nextPrefix := fmt.Sprintf("%0*x", len(shard), value+1)
	upper, err := parseCompactUUID(nextPrefix + strings.Repeat("0", 32-len(nextPrefix)))
	if err != nil {
		return uuid.Nil, nil, err
	}
	return lower, &upper, nil
}

func parseCompactUUID(value string) (uuid.UUID, error) {
	return uuid.Parse(value[0:8] + "-" + value[8:12] + "-" + value[12:16] + "-" + value[16:20] + "-" + value[20:32])
}
