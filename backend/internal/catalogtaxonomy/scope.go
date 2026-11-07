package catalogtaxonomy

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
)

// Projection candidates belong to one product and an active, unpublished build.
// A live or rollback build is immutable, even when latest still points at it.
const projectionBuilds = `SELECT build.id FROM game_builds build
 JOIN game_products product ON product.id=build.product_id
 WHERE build.is_active AND product.slug=COALESCE(NULLIF(current_setting('gildra.projection_product',true),''),'wow')
 AND NOT EXISTS (SELECT 1 FROM game_entities live JOIN game_entity_versions published ON published.id=live.published_version_id WHERE published.build_id=build.id)
 AND NOT EXISTS (SELECT 1 FROM catalog_releases release WHERE release.build_id=build.id AND release.published_at IS NOT NULL)`

func projectionSQL(query string) string {
	query = strings.ReplaceAll(query, "game_entity_versions", `(SELECT candidate.* FROM game_entity_versions candidate WHERE candidate.build_id IN (`+projectionBuilds+`))`)
	return strings.ReplaceAll(query, "{projection_builds}", projectionBuilds)
}

func (i *Indexer) projectionTransaction(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT set_config('gildra.projection_product',$1,true)`, i.product); err != nil {
			return err
		}
		return fn(tx)
	})
}

func NewForProduct(db *pgxpool.Pool, product string) *Indexer {
	return &Indexer{db: db, product: product}
}
