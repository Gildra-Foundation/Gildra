package catalogtaxonomy

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReleaseSetting is the session setting that names the release whose build
// the indexer projects. The pipeline passes it to every stage as
// CATALOG_RELEASE_ID; catalog-index copies it into this setting on each
// connection.
const ReleaseSetting = "gildra.projection_release"

// TargetBuild is the SQL condition that marks the build projections are
// computed for, given the alias of a game_builds row.
//
// Without a release that is the product's active build, as before. Inside a
// staged release it is the release's own build: a staged build is not active
// until publication (the live API reads the active build), so "active" alone
// selected the published build and every candidate projection wrote nothing.
// The first full import through a release, 12.1.5.70783, reached validation
// with spell facts for 2% of spells and no relationship rows at all.
// A release that is no longer in staging selects no build.
func TargetBuild(alias string) string {
	return `(CASE WHEN NULLIF(current_setting('` + ReleaseSetting + `',true),'') IS NULL THEN ` + alias + `.is_active
 ELSE ` + alias + `.id=(SELECT staged.build_id FROM catalog_releases staged
  WHERE staged.id=NULLIF(current_setting('` + ReleaseSetting + `',true),'')::uuid AND staged.status='staging') END)`
}

// Projection candidates belong to one product and its target build, as long as
// that build is unpublished. A live or rollback build is immutable, even when
// latest still points at it.
var projectionBuilds = `SELECT build.id FROM game_builds build
 JOIN game_products product ON product.id=build.product_id
 WHERE ` + TargetBuild("build") + ` AND product.slug=COALESCE(NULLIF(current_setting('gildra.projection_product',true),''),'wow')
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
