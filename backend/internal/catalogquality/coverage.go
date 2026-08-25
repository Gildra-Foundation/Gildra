package catalogquality

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MeasurementInput struct {
	Product       string
	BuildVersion  string
	ScopeKey      string
	EntityType    string
	Locale        string
	Source        string
	CountMode     string
	ExpectedCount int64
	Record        bool
}

type Measurement struct {
	Product         string  `json:"product"`
	BuildID         int64   `json:"buildId"`
	BuildVersion    string  `json:"buildVersion"`
	ScopeKey        string  `json:"scopeKey"`
	EntityType      string  `json:"entityType"`
	Locale          string  `json:"locale,omitempty"`
	Source          string  `json:"source"`
	CountMode       string  `json:"countMode"`
	ExpectedCount   int64   `json:"expectedCount"`
	ImportedCount   int64   `json:"importedCount"`
	ExcludedCount   int64   `json:"excludedCount"`
	MissingCount    int64   `json:"missingCount"`
	Status          string  `json:"status"`
	CoveragePercent float64 `json:"coveragePercent"`
	Recorded        bool    `json:"recorded"`
}

func Measure(ctx context.Context, db *pgxpool.Pool, input MeasurementInput) (Measurement, error) {
	input.Product = strings.TrimSpace(input.Product)
	input.BuildVersion = strings.TrimSpace(input.BuildVersion)
	input.ScopeKey = strings.TrimSpace(input.ScopeKey)
	input.EntityType = strings.TrimSpace(input.EntityType)
	input.Locale = strings.TrimSpace(input.Locale)
	input.Source = strings.TrimSpace(input.Source)
	input.CountMode = strings.TrimSpace(input.CountMode)
	if input.Product == "" || input.ScopeKey == "" || input.EntityType == "" || input.Source == "" {
		return Measurement{}, errors.New("product, scope key, entity type, and source are required")
	}
	if input.ExpectedCount < 0 {
		return Measurement{}, errors.New("expected count cannot be negative")
	}
	if input.Locale != "" && input.Locale != "en_US" && input.Locale != "ru_RU" {
		return Measurement{}, fmt.Errorf("unsupported locale %q", input.Locale)
	}

	result := Measurement{
		Product: input.Product, ScopeKey: input.ScopeKey, EntityType: input.EntityType,
		Locale: input.Locale, Source: input.Source, CountMode: input.CountMode,
		ExpectedCount: input.ExpectedCount,
	}
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if err := loadBuild(ctx, tx, input, &result); err != nil {
			return err
		}
		imported, err := countImported(ctx, tx, result.BuildID, input)
		if err != nil {
			return err
		}
		result.ImportedCount = imported

		var expectationID uuid.UUID
		if input.Record {
			if err := tx.QueryRow(ctx, `
				INSERT INTO catalog_completeness_expectations(
					product_id,build_id,scope_key,entity_type,locale,source,expected_count,attributes,observed_at
				) SELECT product.id,$2,$3,$4,$5,$6,$7,jsonb_build_object('count_mode',$8::text),now()
				FROM game_products product WHERE product.slug=$1
				ON CONFLICT(build_id,scope_key,locale,source) DO UPDATE SET
					entity_type=EXCLUDED.entity_type,expected_count=EXCLUDED.expected_count,
					attributes=EXCLUDED.attributes,observed_at=now()
				RETURNING id`, input.Product, result.BuildID, input.ScopeKey, input.EntityType,
				input.Locale, input.Source, input.ExpectedCount, input.CountMode).Scan(&expectationID); err != nil {
				return fmt.Errorf("record completeness expectation: %w", err)
			}
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM catalog_completeness_exclusions WHERE expectation_id=$1`,
				expectationID).Scan(&result.ExcludedCount); err != nil {
				return fmt.Errorf("count completeness exclusions: %w", err)
			}
		} else if err := tx.QueryRow(ctx, `
			SELECT count(*)
			FROM catalog_completeness_exclusions exclusion
			JOIN catalog_completeness_expectations expectation ON expectation.id=exclusion.expectation_id
			WHERE expectation.build_id=$1 AND expectation.scope_key=$2
			  AND expectation.locale=$3 AND expectation.source=$4`,
			result.BuildID, input.ScopeKey, input.Locale, input.Source).Scan(&result.ExcludedCount); err != nil {
			return fmt.Errorf("count existing completeness exclusions: %w", err)
		}
		result.MissingCount, result.Status, result.CoveragePercent = calculate(
			input.ExpectedCount, result.ImportedCount, result.ExcludedCount,
		)
		if input.Record {
			if _, err := tx.Exec(ctx, `
				INSERT INTO catalog_completeness_measurements(
					expectation_id,imported_count,excluded_count,missing_count,status,coverage_percent,details
				) VALUES($1,$2,$3,$4,$5,$6,jsonb_build_object('count_mode',$7::text))`,
				expectationID, result.ImportedCount, result.ExcludedCount, result.MissingCount,
				result.Status, result.CoveragePercent, input.CountMode); err != nil {
				return fmt.Errorf("record completeness measurement: %w", err)
			}
			result.Recorded = true
		}
		return nil
	})
	return result, err
}

func loadBuild(ctx context.Context, tx pgx.Tx, input MeasurementInput, result *Measurement) error {
	query := `
		SELECT build.id,build.version
		FROM game_builds build
		JOIN game_products product ON product.id=build.product_id
		WHERE product.slug=$1`
	arguments := []any{input.Product}
	if input.BuildVersion != "" {
		query += ` AND build.version=$2`
		arguments = append(arguments, input.BuildVersion)
	}
	query += ` ORDER BY build.is_active DESC,build.build_number DESC LIMIT 1`
	if err := tx.QueryRow(ctx, query, arguments...).Scan(&result.BuildID, &result.BuildVersion); err != nil {
		return fmt.Errorf("load catalog build: %w", err)
	}
	return nil
}

func countImported(ctx context.Context, tx pgx.Tx, buildID int64, input MeasurementInput) (int64, error) {
	var query string
	arguments := []any{buildID, input.EntityType}
	switch input.CountMode {
	case "entities":
		query = `SELECT count(DISTINCT entity.id) FROM game_entities entity
			JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1
			WHERE entity.entity_type=$2 AND entity.deleted_at IS NULL`
	case "documents":
		query = `SELECT count(DISTINCT external_id) FROM catalog_entity_source_documents
			WHERE build_id=$1 AND entity_type=$2 AND source=$3 AND ($4='' OR locale=$4)`
		arguments = append(arguments, input.Source, input.Locale)
	case "icons":
		query = `SELECT count(DISTINCT external_id) FROM catalog_entity_icons WHERE build_id=$1 AND entity_type=$2`
	case "media":
		query = `SELECT count(DISTINCT external_id) FROM catalog_entity_media
			WHERE build_id=$1 AND entity_type=$2 AND source=$3 AND ($4='' OR locale=$4)`
		arguments = append(arguments, input.Source, input.Locale)
	case "quest_registry":
		if input.EntityType != "quest" {
			return 0, errors.New("quest_registry count mode requires entity type quest")
		}
		query = `SELECT count(*) FROM catalog_quest_registry WHERE build_id=$1`
		arguments = arguments[:1]
	default:
		return 0, fmt.Errorf("unsupported count mode %q", input.CountMode)
	}
	var count int64
	if err := tx.QueryRow(ctx, query, arguments...).Scan(&count); err != nil {
		return 0, fmt.Errorf("count imported %s: %w", input.CountMode, err)
	}
	return count, nil
}

func calculate(expected, imported, excluded int64) (missing int64, status string, percent float64) {
	accounted := imported + excluded
	if accounted > expected {
		status = "overfull"
	} else if accounted == expected {
		status = "complete"
	} else {
		status = "incomplete"
		missing = expected - accounted
	}
	if expected == 0 {
		if accounted == 0 {
			percent = 100
		}
		return missing, status, percent
	}
	percent = math.Round((float64(accounted)/float64(expected))*1000000) / 10000
	return missing, status, percent
}
