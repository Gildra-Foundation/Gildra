package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type FieldCoverage struct {
	Product         string
	BuildID         int64
	Type            string
	Locale          string
	Field           string
	Source          string
	EntityCount     int64
	PopulatedCount  int64
	UnresolvedCount int64
	ConflictCount   int64
	RefreshedAt     time.Time
}

type SourcePolicy struct {
	Source              string
	DisplayName         string
	HomepageURL         string
	TermsURL            string
	LicenseIdentifier   string
	CommercialUseStatus string
	PublicAPIStatus     string
	AssetCachingStatus  string
	RetentionDays       *int
	AttributionRequired bool
	AttributionText     string
	ReviewedAt          *time.Time
	ReviewStatus        string
	Notes               string
}

type RelationType struct {
	Relation           string
	Label              string
	Description        string
	InverseRelation    *string
	AllowedSourceTypes []string
	AllowedTargetTypes []string
	AttributeSchema    map[string]any
	SchemaVersion      int
}

func (s *Service) Coverage(ctx context.Context, product, locale, entityType string) ([]FieldCoverage, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT product.slug,coverage.build_id,coverage.entity_type,coverage.locale,coverage.field_key,
			coverage.source,coverage.entity_count,coverage.populated_count,coverage.unresolved_count,
			coverage.conflict_count,coverage.refreshed_at
		FROM catalog_field_coverage coverage
		JOIN game_products product ON product.id=coverage.product_id
		WHERE product.slug=$1 AND coverage.locale=$2 AND ($3='' OR coverage.entity_type=$3)
		ORDER BY coverage.entity_type,coverage.field_key,coverage.source`, strings.TrimSpace(product), normalizeLocale(locale), strings.TrimSpace(entityType))
	if err != nil {
		return nil, fmt.Errorf("list catalog coverage: %w", err)
	}
	defer rows.Close()
	result := make([]FieldCoverage, 0, 128)
	for rows.Next() {
		var item FieldCoverage
		if err := rows.Scan(&item.Product, &item.BuildID, &item.Type, &item.Locale, &item.Field, &item.Source,
			&item.EntityCount, &item.PopulatedCount, &item.UnresolvedCount, &item.ConflictCount, &item.RefreshedAt); err != nil {
			return nil, fmt.Errorf("scan catalog coverage: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate catalog coverage: %w", err)
	}
	return result, nil
}

func (s *Service) SourcePolicies(ctx context.Context) ([]SourcePolicy, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT source,display_name,homepage_url,terms_url,license_identifier,commercial_use_status,
			public_api_status,asset_caching_status,retention_days,attribution_required,attribution_text,
			reviewed_at,review_status,notes
		FROM catalog_source_policies ORDER BY display_name,source`)
	if err != nil {
		return nil, fmt.Errorf("list catalog source policies: %w", err)
	}
	defer rows.Close()
	result := make([]SourcePolicy, 0, 16)
	for rows.Next() {
		var item SourcePolicy
		if err := rows.Scan(&item.Source, &item.DisplayName, &item.HomepageURL, &item.TermsURL,
			&item.LicenseIdentifier, &item.CommercialUseStatus, &item.PublicAPIStatus,
			&item.AssetCachingStatus, &item.RetentionDays, &item.AttributionRequired,
			&item.AttributionText, &item.ReviewedAt, &item.ReviewStatus, &item.Notes); err != nil {
			return nil, fmt.Errorf("scan catalog source policy: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate catalog source policies: %w", err)
	}
	return result, nil
}

func (s *Service) RelationTypes(ctx context.Context, locale string) ([]RelationType, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT relation.relation_type,COALESCE(localized.name,initcap(replace(relation.relation_type,'_',' '))),
			COALESCE(localized.description,''),relation.inverse_relation_type,relation.allowed_source_types,
			relation.allowed_target_types,relation.attribute_schema,relation.schema_version
		FROM catalog_relation_types relation
		LEFT JOIN catalog_relation_type_localizations localized ON localized.relation_type=relation.relation_type
			AND localized.locale=$1
		WHERE relation.is_public ORDER BY relation.relation_type`, normalizeLocale(locale))
	if err != nil {
		return nil, fmt.Errorf("list catalog relation types: %w", err)
	}
	defer rows.Close()
	result := make([]RelationType, 0, 16)
	for rows.Next() {
		var item RelationType
		var schema []byte
		if err := rows.Scan(&item.Relation, &item.Label, &item.Description, &item.InverseRelation,
			&item.AllowedSourceTypes, &item.AllowedTargetTypes, &schema, &item.SchemaVersion); err != nil {
			return nil, fmt.Errorf("scan catalog relation type: %w", err)
		}
		if err := json.Unmarshal(schema, &item.AttributeSchema); err != nil {
			return nil, fmt.Errorf("decode relation attribute schema: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate catalog relation types: %w", err)
	}
	return result, nil
}

func (s *Service) RefreshReadModels(ctx context.Context, productID *int16) error {
	if _, err := s.postgres.Exec(ctx, `SELECT refresh_catalog_read_models($1)`, productID); err != nil {
		return fmt.Errorf("refresh catalog read models: %w", err)
	}
	return nil
}
