package catalog

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// SQLExecutor is implemented by both pgxpool.Pool and pgx.Tx. Keeping the
// quality refresh as a regular query (rather than a migration-defined
// function) lets a running service repair stale coverage immediately after a
// deployment, including databases that already have schema version 117.
type SQLExecutor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

const refreshFieldCoverageQualitySQL = `
WITH reset AS (
	UPDATE catalog_field_coverage coverage
	SET unresolved_count=0
	WHERE $1::smallint IS NULL OR coverage.product_id=$1::smallint
)
, unresolved AS (
	SELECT
		entity.product_id,
		version.build_id,
		entity.entity_type,
		localization.locale,
		'description'::text AS field_key,
		count(*)::bigint AS unresolved_count
	FROM game_entities entity
	JOIN game_entity_versions version ON version.id=entity.published_version_id
	JOIN game_entity_localizations localization ON localization.version_id=version.id
	WHERE entity.deleted_at IS NULL
	  AND ($1::smallint IS NULL OR entity.product_id=$1::smallint)
	  AND localization.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'
	GROUP BY entity.product_id,version.build_id,entity.entity_type,localization.locale
	UNION ALL
	SELECT
		entity.product_id,
		version.build_id,
		entity.entity_type,
		tooltip.locale,
		'tooltip'::text AS field_key,
		count(*)::bigint AS unresolved_count
	FROM game_entities entity
	JOIN game_entity_versions version ON version.id=entity.published_version_id
	JOIN catalog_entity_tooltips tooltip ON tooltip.version_id=version.id
	WHERE entity.deleted_at IS NULL
	  AND ($1::smallint IS NULL OR entity.product_id=$1::smallint)
	  AND (tooltip.plain_text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'
	       OR tooltip.blocks::text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])')
	GROUP BY entity.product_id,version.build_id,entity.entity_type,tooltip.locale
)
UPDATE catalog_field_coverage coverage
SET unresolved_count=unresolved.unresolved_count
FROM unresolved
WHERE coverage.product_id=unresolved.product_id
  AND coverage.build_id=unresolved.build_id
  AND coverage.entity_type=unresolved.entity_type
  AND coverage.locale=unresolved.locale
  AND coverage.field_key=unresolved.field_key;
`

// RefreshFieldCoverageQuality records unresolved Blizzard template tokens in
// the same coverage rows returned by the API. It is intentionally idempotent
// and scoped to a product when productID is non-nil.
func RefreshFieldCoverageQuality(ctx context.Context, executor SQLExecutor, productID *int16) error {
	if executor == nil {
		return fmt.Errorf("catalog field coverage executor is nil")
	}
	if _, err := executor.Exec(ctx, refreshFieldCoverageQualitySQL, productID); err != nil {
		return fmt.Errorf("refresh catalog field coverage quality: %w", err)
	}
	return nil
}
