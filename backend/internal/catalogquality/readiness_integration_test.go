//go:build integration

package catalogquality

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestProductionGrantCountsIncludeCompatibleCarryForwardMedia(t *testing.T) {
	ctx := context.Background()
	container, err := postgres.Run(ctx,
		"postgres:17.11-alpine3.23",
		postgres.WithDatabase("gildra"),
		postgres.WithUsername("gildra"),
		postgres.WithPassword("test-password"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	databaseURL, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	var productID int16
	if err := database.QueryRowContext(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		UPDATE catalog_release_profiles SET publication_sources=ARRAY['blizzard_api']
		WHERE profile_key='retail-foundation-v1' AND product_id=$1`, productID); err != nil {
		t.Fatal(err)
	}
	var previousBuild, currentBuild, futureBuild int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,900001,'90.0.0.900001',false) RETURNING id`, productID).Scan(&previousBuild); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,900002,'90.0.0.900002',true) RETURNING id`, productID).Scan(&currentBuild); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,900003,'90.0.0.900003',false) RETURNING id`, productID).Scan(&futureBuild); err != nil {
		t.Fatal(err)
	}

	seedGrantArtifact(t, ctx, database, productID, currentBuild, "blizzard_api", "current")
	previousArtifact := seedGrantArtifact(t, ctx, database, productID, previousBuild, "blizzard_api", "previous")
	futureArtifact := seedGrantArtifact(t, ctx, database, productID, futureBuild, "all_the_things", "future")
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_entity_media(
			build_id,entity_type,external_id,media_kind,asset_key,source,source_url,
			mime_type,cache_status,source_artifact_id,is_primary
		) VALUES
			($1,'item',900001,'icon','previous','blizzard_api','https://example.com/previous.png','image/png','remote',$2,true),
			($3,'item',900003,'icon','future','all_the_things','https://example.com/future.png','image/png','remote',$4,true)`,
		previousBuild, previousArtifact, futureBuild, futureArtifact); err != nil {
		t.Fatal(err)
	}

	blockedAPI, err := countBlockedProductionPublicAPIGrants(ctx, pool, currentBuild, "wow")
	if err != nil {
		t.Fatal(err)
	}
	if blockedAPI != 1 {
		t.Fatalf("blocked public API grants=%d, want 1", blockedAPI)
	}
	allowGrant(t, ctx, database, "blizzard_api", "public_api")
	blockedAPI, err = countBlockedProductionPublicAPIGrants(ctx, pool, currentBuild, "wow")
	if err != nil {
		t.Fatal(err)
	}
	if blockedAPI != 0 {
		t.Fatalf("blocked public API grants after approval=%d, want 0", blockedAPI)
	}

	blockedAssets, err := countBlockedProductionAssetCacheGrants(ctx, pool, currentBuild)
	if err != nil {
		t.Fatal(err)
	}
	if blockedAssets != 1 {
		t.Fatalf("blocked asset-cache grants=%d, want one carry-forward source and no future source", blockedAssets)
	}
	allowGrant(t, ctx, database, "blizzard_api", "asset_cache")
	blockedAssets, err = countBlockedProductionAssetCacheGrants(ctx, pool, currentBuild)
	if err != nil {
		t.Fatal(err)
	}
	if blockedAssets != 0 {
		t.Fatalf("blocked asset-cache grants after approval=%d, want 0", blockedAssets)
	}
}

func seedGrantArtifact(
	t *testing.T,
	ctx context.Context,
	database *sql.DB,
	productID int16,
	buildID int64,
	source string,
	key string,
) string {
	t.Helper()
	var snapshotID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,metadata)
		VALUES($1,$2,$3,'validated',now(),'{"integration_test":true}'::jsonb) RETURNING id`,
		productID, buildID, source).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	var artifactID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
		) VALUES($1,$2,$3,$4,'https://example.com/source',decode(repeat('ab',32),'hex'),1,'ready') RETURNING id`,
		snapshotID, buildID, source, key).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	return artifactID
}

func allowGrant(t *testing.T, ctx context.Context, database *sql.DB, source, surface string) {
	t.Helper()
	var evidenceID, approvalID string
	if err := database.QueryRowContext(ctx, `
		SELECT id::text FROM catalog_source_policy_reviews
		WHERE source=$1 AND environment='production' AND surface=$2 AND review_kind='evidence'
		ORDER BY created_at DESC,id DESC LIMIT 1`, source, surface).Scan(&evidenceID); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_source_policy_reviews(
			source,environment,surface,review_kind,decision,reviewer,reason,observed_at,expires_at,parent_review_id
		) VALUES($1,'production',$2,'owner_approval','allowed','integration-test',
			'integration test approval',now(),now()+interval '1 day',$3) RETURNING id::text`,
		source, surface, evidenceID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		UPDATE catalog_publication_grants
		SET decision='allowed',reason='integration test approval',approved_by='integration-test',
			reviewed_at=now(),expires_at=now()+interval '1 day',policy_review_id=$3,updated_at=now()
		WHERE source=$1 AND environment='production' AND surface=$2`, source, surface, approvalID); err != nil {
		t.Fatal(err)
	}
}
