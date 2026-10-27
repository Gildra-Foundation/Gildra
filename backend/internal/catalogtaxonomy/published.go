package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// alignClassifiedCategories finishes a classification pass over the
// categories of productID.
//
// Most classifiers read only the latest imported version of every entity,
// which is what the next publication will expose. The public catalog reads the
// published version, and the two differ while an imported build waits for
// publication, so the latest version's categories are copied to the published
// version of the same entity. Items are classified on both versions by their
// own facts (classifyItem) and are not copied. The classifiers other than
// classifyItem do not filter by product either; assignments of another
// product's entities to these categories are removed.
func alignClassifiedCategories(ctx context.Context, tx pgx.Tx, productID int16, entityType string) (removed, mirrored int64, err error) {
	command, err := tx.Exec(ctx, `
		DELETE FROM game_entity_categories assignment
		USING catalog_categories category, game_entity_versions version, game_entities entity
		WHERE category.id=assignment.category_id AND category.product_id=$1
		  AND ($2='' OR category.entity_type=$2)
		  AND assignment.source='gildra_classifier'
		  AND version.id=assignment.version_id AND entity.id=version.entity_id
		  AND entity.product_id<>category.product_id`, productID, entityType)
	if err != nil {
		return 0, 0, fmt.Errorf("remove cross-product categories: %w", err)
	}
	removed = command.RowsAffected()
	command, err = tx.Exec(ctx, `
		INSERT INTO game_entity_categories(version_id,category_id,source,confidence,attributes)
		SELECT entity.published_version_id,assignment.category_id,assignment.source,assignment.confidence,assignment.attributes
		FROM game_entity_categories assignment
		JOIN catalog_categories category ON category.id=assignment.category_id AND category.product_id=$1
		  AND ($2='' OR category.entity_type=$2) AND category.entity_type<>'item'
		JOIN game_entities entity ON entity.latest_version_id=assignment.version_id
		  AND entity.product_id=category.product_id
		WHERE assignment.source='gildra_classifier' AND entity.deleted_at IS NULL
		  AND entity.published_version_id IS NOT NULL AND entity.published_version_id<>entity.latest_version_id
		ON CONFLICT (version_id,category_id) DO NOTHING`, productID, entityType)
	if err != nil {
		return removed, 0, fmt.Errorf("copy categories to published versions: %w", err)
	}
	return removed, command.RowsAffected(), nil
}
