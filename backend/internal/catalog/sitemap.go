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
	ID   uuid.UUID
	Type string
	// Slug is the English record slug (what Get returns for en_US).
	Slug string
	// SlugRu is the Russian record slug, set only when the Russian page shows a
	// genuine Russian name; nil means the record has only an English URL.
	SlugRu    *string
	UpdatedAt time.Time
}

// sitemapLocalizationProof mirrors the localization_proof lateral of
// publicEntitySelectTemplate: an imported ready artifact proves that a Russian
// name equal to the English one is the real Russian name, not a copied
// fallback.
func sitemapLocalizationProof(versionExpr, localeExpr string) string {
	return `SELECT 1
			FROM catalog_entity_localization_artifacts observation
			JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
			WHERE observation.version_id=` + versionExpr + ` AND observation.locale=` + localeExpr + `
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
			  AND (artifact.locale='' OR artifact.locale=observation.locale)`
}

// sitemapScriptExempt mirrors apps/web/lib/catalogLocale.ts wrongName: these
// names are shown as-is in both locales.
func sitemapScriptExempt(entityAlias, nameExpr string) string {
	return `(` + entityAlias + `.entity_type IN ('expansion','product') OR ` + nameExpr + `='World of Warcraft')`
}

// sitemapEntriesQuery lists exactly the records GET /v1/game/entities/{id}
// serves (published, not deleted, displayable name, usable) whose English name
// the web renders. slugRu is the ru_RU slug Get returns, only when the ru_RU
// response is not a locale fallback and its name passes the same junk and
// script checks the web applies.
var sitemapEntriesQuery = `
		SELECT entity.id,entity.entity_type,
			COALESCE(NULLIF(en.slug,''),entity.canonical_slug),
			CASE WHEN NULLIF(ru.name,'') IS NOT NULL
				AND (ru.name<>en.name OR EXISTS (` + sitemapLocalizationProof("version.id", "'ru_RU'") + `))
				AND ru.name !~* ` + publicCatalogJunkNamePattern + `
				AND (ru.name !~ '[A-Za-z]' OR ` + sitemapScriptExempt("entity", "ru.name") + `)
				THEN COALESCE(NULLIF(ru.slug,''),NULLIF(en.slug,''),entity.canonical_slug) END,
			entity.updated_at
		FROM game_entities entity
		JOIN game_products product ON product.id=entity.product_id
		JOIN game_entity_versions version ON version.id=entity.published_version_id
		LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
		LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
		JOIN catalog_entity_type_registry registry ON registry.product_id=entity.product_id
			AND registry.entity_type=entity.entity_type AND registry.is_public
		WHERE product.slug=$1 AND entity.entity_type=$2
			AND entity.deleted_at IS NULL AND entity.published_version_id IS NOT NULL
			AND entity.id >= $3 AND ($4::uuid IS NULL OR entity.id < $4)
			` + publicCatalogDisplayNamePredicate("en", "en") + `
			` + publicCatalogUsabilityPredicate("entity", "version") + `
			AND (en.name !~ '[А-Яа-яЁё]' OR ` + sitemapScriptExempt("entity", "en.name") + `)
		ORDER BY entity.id
		LIMIT 50001`

func (s *Service) SitemapEntries(ctx context.Context, product, entityType, shard string) ([]SitemapEntry, error) {
	product = strings.TrimSpace(product)
	if product == "" {
		product = "wow"
	}
	entityType = strings.TrimSpace(entityType)
	if entityType == "" {
		return nil, invalidRequest("type is required")
	}
	lower, upper, err := sitemapShardBounds(shard)
	if err != nil {
		return nil, err
	}
	rows, err := s.postgres.Query(ctx, sitemapEntriesQuery, product, entityType, lower, upper)
	if err != nil {
		return nil, fmt.Errorf("list sitemap entries: %w", err)
	}
	defer rows.Close()
	entries := make([]SitemapEntry, 0, 4096)
	for rows.Next() {
		var entry SitemapEntry
		if err := rows.Scan(&entry.ID, &entry.Type, &entry.Slug, &entry.SlugRu, &entry.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan sitemap entry: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sitemap entries: %w", err)
	}
	if len(entries) > 50000 {
		return nil, invalidRequest("sitemap shard exceeds 50000 entries; use a longer shard prefix")
	}
	return entries, nil
}

func sitemapShardBounds(shard string) (uuid.UUID, *uuid.UUID, error) {
	shard = strings.ToLower(strings.TrimSpace(shard))
	if len(shard) > 2 {
		return uuid.Nil, nil, invalidRequest("shard must contain at most two hexadecimal characters")
	}
	if shard == "" {
		return uuid.Nil, nil, nil
	}
	value, err := strconv.ParseUint(shard, 16, 8)
	if err != nil {
		return uuid.Nil, nil, invalidRequest("shard must contain lowercase hexadecimal characters")
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
