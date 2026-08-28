package catalog

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Service) DatasetContainsEntity(ctx context.Context, dataset string, entityID uuid.UUID) (bool, error) {
	dataset = strings.TrimSpace(dataset)
	if len(dataset) < 2 || len(dataset) > 64 {
		return false, errors.New("dataset must be between 2 and 64 characters")
	}
	var contains bool
	err := s.postgres.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM catalog_library_dataset_definitions definition
			JOIN game_entities entity ON entity.id=$2 AND entity.entity_type=definition.entity_type
			JOIN game_entity_versions version ON version.id=entity.published_version_id
			LEFT JOIN catalog_items item ON item.version_id=version.id
			WHERE definition.slug=$1 AND definition.is_public AND entity.deleted_at IS NULL
				AND (
					(definition.category_path='' AND definition.item_class_id IS NULL)
					OR (definition.item_class_id IS NOT NULL AND item.item_class_id=definition.item_class_id)
					OR (definition.item_class_id IS NULL AND definition.category_path<>'' AND EXISTS (
						SELECT 1 FROM game_entity_categories assignment
						JOIN catalog_categories category ON category.id=assignment.category_id
						WHERE assignment.version_id=version.id AND category.product_id=entity.product_id
							AND category.entity_type=definition.entity_type
							AND (category.path=definition.category_path OR category.path LIKE definition.category_path||'/%')
					))
				)
		)`, dataset, entityID).Scan(&contains)
	if err != nil {
		return false, fmt.Errorf("check public dataset membership: %w", err)
	}
	return contains, nil
}

const libraryFreshnessWindow = 36 * time.Hour

type LibraryDataset struct {
	Slug                   string
	Product                string
	EntityType             string
	CategoryPath           string
	ItemClassID            *int
	Group                  string
	IconSymbol             string
	SortOrder              int
	Name                   string
	Description            string
	BuildVersion           *string
	PreviewIconName        *string
	PreviewImageURL        *string
	EntityCount            int64
	LocalizedCount         int64
	VerifiedLocalizedCount int64
	TooltipCount           int64
	ImageCount             int64
	Applicability          string
	ApplicabilityReason    string
	Freshness              string
	FreshnessReason        string
	CoverageUpdatedAt      *time.Time
}

func (s *Service) LibraryDatasets(ctx context.Context, product, locale string) ([]LibraryDataset, error) {
	product = strings.TrimSpace(product)
	if product == "" {
		product = "wow"
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT definition.slug,product.slug,definition.entity_type,definition.category_path,definition.item_class_id,
			definition.group_key,definition.icon_symbol,definition.sort_order,
			COALESCE(localized.name,fallback.name,definition.slug),
			COALESCE(localized.description,fallback.description,''),build.version,stats.preview_icon_name,
			CASE WHEN preview_artifact.id IS NOT NULL THEN preview_media.cached_url END,
			COALESCE(stats.entity_count,0),COALESCE(stats.localized_count,0),COALESCE(stats.verified_localized_count,0),
			COALESCE(stats.tooltip_count,0),COALESCE(stats.image_count,0),
			COALESCE(applicability.status,'pending_source'),
			CASE WHEN $2='ru_RU' THEN COALESCE(applicability.reason_ru,applicability.reason_en,'')
				ELSE COALESCE(applicability.reason_en,'') END,
			state.status,state.error_message,stats.refreshed_at
		FROM catalog_library_dataset_definitions definition
		JOIN game_products product ON product.slug=$1
		LEFT JOIN catalog_library_dataset_localizations localized
			ON localized.dataset_slug=definition.slug AND localized.locale=$2
		LEFT JOIN catalog_library_dataset_localizations fallback
			ON fallback.dataset_slug=definition.slug AND fallback.locale='en_US'
		LEFT JOIN catalog_library_dataset_stats stats
			ON stats.dataset_slug=definition.slug AND stats.product_id=product.id AND stats.locale=$2
		LEFT JOIN game_builds build ON build.id=stats.build_id
		LEFT JOIN catalog_entity_media preview_media ON preview_media.id=stats.preview_media_id
		  AND preview_media.cache_status='cached' AND preview_media.cached_url IS NOT NULL
		LEFT JOIN catalog_source_artifacts preview_artifact ON preview_artifact.id=preview_media.source_artifact_id
		  AND preview_artifact.status='ready' AND preview_artifact.content_hash IS NOT NULL
		  AND preview_artifact.byte_size IS NOT NULL
		LEFT JOIN catalog_library_dataset_applicability applicability
			ON applicability.dataset_slug=definition.slug AND applicability.product_id=product.id
		LEFT JOIN catalog_read_model_state state ON state.product_id=product.id
		WHERE definition.is_public
		ORDER BY definition.sort_order,definition.slug`, product, normalizeLocale(locale))
	if err != nil {
		return nil, fmt.Errorf("list library datasets: %w", err)
	}
	defer rows.Close()

	now := time.Now()
	result := make([]LibraryDataset, 0, 16)
	for rows.Next() {
		var item LibraryDataset
		var readModelStatus, readModelError *string
		if err := rows.Scan(&item.Slug, &item.Product, &item.EntityType, &item.CategoryPath, &item.ItemClassID,
			&item.Group, &item.IconSymbol, &item.SortOrder, &item.Name, &item.Description,
			&item.BuildVersion, &item.PreviewIconName, &item.PreviewImageURL, &item.EntityCount, &item.LocalizedCount, &item.VerifiedLocalizedCount, &item.TooltipCount,
			&item.ImageCount, &item.Applicability, &item.ApplicabilityReason,
			&readModelStatus, &readModelError, &item.CoverageUpdatedAt); err != nil {
			return nil, fmt.Errorf("scan library dataset: %w", err)
		}
		item.Freshness, item.FreshnessReason = libraryFreshness(
			readModelStatus, readModelError, item.CoverageUpdatedAt, item.EntityCount, now,
		)
		item.FreshnessReason = localizeFreshnessReason(item.FreshnessReason, normalizeLocale(locale))
		if item.Applicability == "applicable" && item.EntityCount == 0 && strings.TrimSpace(item.ApplicabilityReason) == "" {
			item.ApplicabilityReason = "This dataset has no entities in the current published release."
			if normalizeLocale(locale) == "ru_RU" {
				item.ApplicabilityReason = "В текущем опубликованном релизе этого датасета ещё нет записей."
			}
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate library datasets: %w", err)
	}
	return result, nil
}

func localizeFreshnessReason(reason, locale string) string {
	if locale != "ru_RU" {
		return reason
	}
	translations := map[string]string{
		"read model refresh failed":                            "Не удалось обновить публичное представление данных.",
		"a new catalog generation is being prepared":           "Подготавливается новое поколение каталога.",
		"catalog read model is marked stale":                   "Публичное представление каталога отмечено как устаревшее.",
		"no published entities are available for this product": "Для этой версии игры пока нет опубликованных записей.",
		"coverage has not been calculated":                     "Покрытие данных ещё не рассчитано.",
		"coverage is older than the freshness window":          "Расчёт покрытия устарел.",
		"catalog read model is not confirmed fresh":            "Свежесть публичного представления не подтверждена.",
		"published data and coverage are current":              "Опубликованные данные и показатели покрытия актуальны.",
	}
	if translated, ok := translations[reason]; ok {
		return translated
	}
	return reason
}

func libraryFreshness(status, failure *string, refreshedAt *time.Time, entityCount int64, now time.Time) (string, string) {
	if status != nil {
		switch *status {
		case "failed":
			if failure != nil && strings.TrimSpace(*failure) != "" {
				return "failed", strings.TrimSpace(*failure)
			}
			return "failed", "read model refresh failed"
		case "refreshing":
			return "refreshing", "a new catalog generation is being prepared"
		case "stale":
			return "stale", "catalog read model is marked stale"
		}
	}
	if entityCount == 0 {
		return "empty", "no published entities are available for this product"
	}
	if refreshedAt == nil {
		return "stale", "coverage has not been calculated"
	}
	if now.Sub(*refreshedAt) > libraryFreshnessWindow {
		return "stale", "coverage is older than the freshness window"
	}
	if status == nil || *status != "fresh" {
		return "stale", "catalog read model is not confirmed fresh"
	}
	return "fresh", "published data and coverage are current"
}
