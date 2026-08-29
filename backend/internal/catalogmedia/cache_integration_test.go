//go:build integration

package catalogmedia

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestCacheRequiresGrantRetriesAndRevokesServing(t *testing.T) {
	ctx := context.Background()
	container, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase("gildra"),
		pgcontainer.WithUsername("gildra"),
		pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies(),
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

	media := seedMediaCandidate(t, ctx, database)
	root := t.TempDir()
	var caches []*Cache
	t.Cleanup(func() {
		for _, item := range caches {
			_ = item.Close()
		}
	})
	calls := 0
	blockedClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		calls++
		return nil, io.ErrUnexpectedEOF
	})}
	cache, err := New(pool, root, "https://api.gildra.net", blockedClient)
	if err != nil {
		t.Fatal(err)
	}
	caches = append(caches, cache)
	result, err := cache.Run(ctx, "staging", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 0 || calls != 0 {
		t.Fatalf("blocked cache run = %#v calls=%d, want no eligible assets and no network", result, calls)
	}

	approveMediaGrant(t, ctx, database, "asset_cache")
	failingClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusBadGateway, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
	})}
	cache, err = New(pool, root, "https://api.gildra.net", failingClient)
	if err != nil {
		t.Fatal(err)
	}
	caches = append(caches, cache)
	result, err = cache.Run(ctx, "staging", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 3 || result.Failed != 3 {
		t.Fatalf("failed cache run = %#v, want three recorded failures", result)
	}
	var latestStatus string
	if err := database.QueryRowContext(ctx, `SELECT status FROM catalog_media_cache_runs ORDER BY started_at DESC,id DESC LIMIT 1`).Scan(&latestStatus); err != nil {
		t.Fatal(err)
	}
	if latestStatus != "partial" {
		t.Fatalf("failed asset run status=%q, want partial", latestStatus)
	}

	png := validTestPNG(t)
	workingClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(png)), Header: make(http.Header)}, nil
	})}
	cache, err = New(pool, root, "https://api.gildra.net", workingClient)
	if err != nil {
		t.Fatal(err)
	}
	caches = append(caches, cache)
	result, err = cache.Run(ctx, "staging", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 3 || result.Cached != 3 || result.Bytes != 3*int64(len(png)) {
		t.Fatalf("retry cache run = %#v, want three cached observations", result)
	}
	objectCount := 0
	if err := filepath.WalkDir(root, func(_ string, entry fs.DirEntry, walkErr error) error {
		if walkErr == nil && entry.Type().IsRegular() {
			objectCount++
		}
		return walkErr
	}); err != nil {
		t.Fatal(err)
	}
	if objectCount != 1 {
		t.Fatalf("content-addressed object count=%d, want one deduplicated file", objectCount)
	}
	privateHandler, err := NewHandlerWithAccessMode(pool, root, "staging", "private")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = privateHandler.Close() })
	privateRequest := httptest.NewRequest(http.MethodGet, "/v1/media/"+media.published.String(), nil)
	privateResponse := httptest.NewRecorder()
	privateHandler.ServeHTTP(privateResponse, privateRequest)
	if privateResponse.Code != http.StatusOK || privateResponse.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("private media status=%d cache=%q", privateResponse.Code, privateResponse.Header().Get("Cache-Control"))
	}
	if _, err := database.ExecContext(ctx, `UPDATE catalog_entity_media SET cached_at=now()-interval '31 days' WHERE cache_status='cached'`); err != nil {
		t.Fatal(err)
	}
	privateResponse = httptest.NewRecorder()
	privateHandler.ServeHTTP(privateResponse, privateRequest)
	if privateResponse.Code != http.StatusNotFound {
		t.Fatalf("expired private media status=%d, want 404", privateResponse.Code)
	}
	staleFailureCache, err := New(pool, root, "https://api.gildra.net", failingClient)
	if err != nil {
		t.Fatal(err)
	}
	caches = append(caches, staleFailureCache)
	failedRefresh, err := staleFailureCache.RunWithAccessMode(ctx, "staging", 10, "private")
	if err != nil {
		t.Fatal(err)
	}
	if failedRefresh.Eligible != 3 || failedRefresh.Failed != 3 {
		t.Fatalf("failed private refresh=%#v, want three retained failures", failedRefresh)
	}
	var retainedCached int
	if err := database.QueryRowContext(ctx, `SELECT count(*) FROM catalog_entity_media WHERE cache_status='cached' AND cache_key IS NOT NULL`).Scan(&retainedCached); err != nil {
		t.Fatal(err)
	}
	if retainedCached != 3 {
		t.Fatalf("cached observations retained after refresh failure=%d, want 3", retainedCached)
	}
	result, err = cache.RunWithAccessMode(ctx, "staging", 10, "private")
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 3 || result.Cached != 3 {
		t.Fatalf("private refresh run=%#v, want three refreshed observations", result)
	}
	privateResponse = httptest.NewRecorder()
	privateHandler.ServeHTTP(privateResponse, privateRequest)
	if privateResponse.Code != http.StatusOK {
		t.Fatalf("refreshed private media status=%d, want 200", privateResponse.Code)
	}

	handler, err := NewHandler(pool, root, "staging")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = handler.Close() })
	request := httptest.NewRequest(http.MethodGet, "/v1/media/"+media.published.String(), nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("media without public API grant status=%d, want 404", response.Code)
	}
	approveMediaGrant(t, ctx, database, "public_api")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), png) {
		t.Fatalf("served media status=%d bytes=%d", response.Code, response.Body.Len())
	}
	var cacheKey string
	if err := database.QueryRowContext(ctx, `SELECT cache_key FROM catalog_entity_media WHERE id=$1`, media.published).Scan(&cacheKey); err != nil {
		t.Fatal(err)
	}
	futureRequest := httptest.NewRequest(http.MethodGet, "/v1/media/"+media.future.String(), nil)
	futureResponse := httptest.NewRecorder()
	handler.ServeHTTP(futureResponse, futureRequest)
	if futureResponse.Code != http.StatusNotFound {
		t.Fatalf("future candidate media status=%d, want 404", futureResponse.Code)
	}
	entity, err := catalog.NewService(pool).Get(ctx, media.entity, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	for _, asset := range entity.Media {
		if asset.URL != "https://api.gildra.net/v1/media/"+media.published.String() && asset.AssetKey == "icon" {
			t.Fatalf("catalog media URL=%q, want local cached URL", asset.URL)
		}
		if asset.AssetKey == "future" {
			t.Fatal("future candidate media leaked through catalog service")
		}
	}
	if entity.IconURL == nil || *entity.IconURL != "https://api.gildra.net/v1/media/"+media.published.String() {
		t.Fatalf("catalog icon URL=%#v, want local cached URL", entity.IconURL)
	}
	if _, err := database.ExecContext(ctx, `
		SELECT refresh_catalog_library_datasets((SELECT id FROM game_products WHERE slug='wow'));
		SELECT refresh_catalog_published_source_dependencies();
		SELECT refresh_catalog_library_media_coverage((SELECT id FROM game_products WHERE slug='wow'));
		SELECT refresh_catalog_library_media_previews((SELECT id FROM game_products WHERE slug='wow'))`); err != nil {
		t.Fatalf("refresh media coverage: %v", err)
	}
	var entityCount, imageCount int64
	var previewMediaID uuid.UUID
	if err := database.QueryRowContext(ctx, `
		SELECT entity_count,image_count,preview_media_id
		FROM catalog_library_dataset_stats
		WHERE dataset_slug='items' AND locale='en_US'
		  AND product_id=(SELECT id FROM game_products WHERE slug='wow')`).Scan(&entityCount, &imageCount, &previewMediaID); err != nil {
		t.Fatal(err)
	}
	if entityCount != 1 || imageCount != 1 || previewMediaID != media.published {
		t.Fatalf("media coverage entities=%d images=%d preview=%s, want 1/1/%s", entityCount, imageCount, previewMediaID, media.published)
	}
	datasets, err := catalog.NewService(pool).LibraryDatasets(ctx, "wow", "en_US")
	if err != nil {
		t.Fatal(err)
	}
	for _, dataset := range datasets {
		if dataset.Slug == "items" && (dataset.PreviewImageURL == nil || *dataset.PreviewImageURL != "https://api.gildra.net/v1/media/"+media.published.String()) {
			t.Fatalf("local dataset preview URL = %#v", dataset.PreviewImageURL)
		}
	}
	target := filepath.Join(root, filepath.FromSlash(cacheKey))
	outside := filepath.Join(t.TempDir(), "outside.png")
	if err := os.WriteFile(outside, png, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(target, target+".object"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, target); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("symlink escape status=%d, want 404", response.Code)
	}

	if _, err := database.ExecContext(ctx, `
		UPDATE catalog_publication_grants
		SET decision='blocked',reason='integration test revocation',updated_at=now()
		WHERE source='blizzard_api' AND environment='staging' AND surface='asset_cache'`); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("revoked media status=%d, want 404", response.Code)
	}

	if err := goose.DownToContext(ctx, database, migrations, 102); err != nil {
		t.Fatalf("roll back local-preview migrations: %v", err)
	}
	if err := goose.UpToContext(ctx, database, migrations, 104); err != nil {
		t.Fatalf("reapply local-preview migrations: %v", err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT preview_media_id
		FROM catalog_library_dataset_stats
		WHERE dataset_slug='items' AND locale='en_US'
		  AND product_id=(SELECT id FROM game_products WHERE slug='wow')`).Scan(&previewMediaID); err != nil {
		t.Fatalf("read preview after migration reapply: %v", err)
	}
	if previewMediaID != media.published {
		t.Fatalf("preview after migration reapply=%s, want %s", previewMediaID, media.published)
	}
}

func TestSeedOfficialIconsCachesOnceAndLinksSharedEntities(t *testing.T) {
	ctx := context.Background()
	container, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase("gildra"),
		pgcontainer.WithUsername("gildra"),
		pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies(),
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
	t.Cleanup(func() { _ = database.Close() })
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
	t.Cleanup(pool.Close)

	var productID int16
	if err := database.QueryRowContext(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	var buildID int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,9999999,'99.0.0.9999999',true) RETURNING id`, productID).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	var snapshotID, artifactID uuid.UUID
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata)
		VALUES($1,$2,'wago_tools','published',now(),now(),'{}') RETURNING id`, productID, buildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
		) VALUES($1,$2,'wago_tools','shared-icon-source','https://wago.tools/test',
			decode(repeat('ab',32),'hex'),1,'ready') RETURNING id`, snapshotID, buildID).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	for index, externalID := range []int64{700001, 700002} {
		var entityID, versionID uuid.UUID
		if err := database.QueryRowContext(ctx, `
			INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			VALUES($1,'spell',$2,$3,$4,$4) RETURNING id`, productID, externalID,
			fmt.Sprintf("shared-icon-spell-%d", index), buildID).Scan(&entityID); err != nil {
			t.Fatal(err)
		}
		if err := database.QueryRowContext(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
			VALUES($1,$2,digest($3,'sha256'),'{}','https://wago.tools/test',$4,$5,'wago_tools') RETURNING id`,
			entityID, buildID, fmt.Sprintf("spell-%d", externalID), snapshotID, artifactID).Scan(&versionID); err != nil {
			t.Fatal(err)
		}
		if _, err := database.ExecContext(ctx, `UPDATE game_entities SET latest_version_id=$2,published_version_id=$2 WHERE id=$1`, entityID, versionID); err != nil {
			t.Fatal(err)
		}
		if _, err := database.ExecContext(ctx, `
			INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id,file_data_id,asset_source_artifact_id)
			VALUES($1,'spell',$2,'spell_fire_flamebolt',$3,135812,$3)`, buildID, externalID, artifactID); err != nil {
			t.Fatal(err)
		}
	}

	png := validTestPNG(t)
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		if request.URL.String() != "https://render.worldofwarcraft.com/eu/icons/56/spell_fire_flamebolt.jpg" {
			t.Fatalf("unexpected icon URL %q", request.URL.String())
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(png)), Header: make(http.Header)}, nil
	})}
	cache, err := New(pool, t.TempDir(), "https://api.gildra.net", client)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cache.Close() })
	result, err := cache.SeedOfficialIcons(ctx, "wow", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 1 || result.IconsCached != 1 || result.Entities != 2 || result.Failed != 0 || calls != 1 {
		t.Fatalf("icon seed result=%#v calls=%d, want one download linked to two entities", result, calls)
	}
	var observations, distinctObjects int
	if err := database.QueryRowContext(ctx, `
		SELECT count(*),count(DISTINCT cache_key)
		FROM catalog_entity_media
		WHERE source='blizzard_api' AND asset_key='official_render_56' AND cache_status='cached'`).Scan(&observations, &distinctObjects); err != nil {
		t.Fatal(err)
	}
	if observations != 2 || distinctObjects != 1 {
		t.Fatalf("cached media observations=%d objects=%d, want 2 and 1", observations, distinctObjects)
	}
}

type seededMedia struct {
	entity    uuid.UUID
	published uuid.UUID
	future    uuid.UUID
}

func approveMediaGrant(t *testing.T, ctx context.Context, database *sql.DB, surface string) {
	t.Helper()
	transaction, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer transaction.Rollback()
	var evidenceID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_source_policy_reviews(
			source,environment,surface,review_kind,decision,reviewer,reason,
			terms_url,terms_content_sha256,observed_at,evidence
		) VALUES(
			'blizzard_api','staging',$1,'evidence','blocked','integration-test',
			'integration test evidence','https://example.invalid/terms',decode(repeat('ab',32),'hex'),
			now(),'{"integration_test":true}'::jsonb
		) RETURNING id`, surface).Scan(&evidenceID); err != nil {
		t.Fatal(err)
	}
	var approvalID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_source_policy_reviews(
			source,environment,surface,review_kind,decision,reviewer,reason,
			observed_at,expires_at,parent_review_id,evidence
		) VALUES(
			'blizzard_api','staging',$1,'owner_approval','allowed','integration-test',
			'integration test approval',now(),now()+interval '1 day',$2,
			'{"integration_test":true}'::jsonb
		) RETURNING id`, surface, evidenceID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx, `
		UPDATE catalog_publication_grants
		SET decision='allowed',reason='integration test approval',approved_by='integration-test',
			reviewed_at=now(),expires_at=now()+interval '1 day',policy_review_id=$2,updated_at=now()
		WHERE source='blizzard_api' AND environment='staging' AND surface=$1`, surface, approvalID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.Commit(); err != nil {
		t.Fatal(err)
	}
}

func seedMediaCandidate(t *testing.T, ctx context.Context, database *sql.DB) seededMedia {
	t.Helper()
	transaction, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer transaction.Rollback()
	var productID int16
	if err := transaction.QueryRowContext(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	var mediaBuildID int64
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,999997,'99.0.0.999997',false) RETURNING id`, productID).Scan(&mediaBuildID); err != nil {
		t.Fatal(err)
	}
	var publishedBuildID, futureBuildID int64
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,999998,'99.0.0.999998',false) RETURNING id`, productID).Scan(&publishedBuildID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,999999,'99.0.0.999999',false) RETURNING id`, productID).Scan(&futureBuildID); err != nil {
		t.Fatal(err)
	}
	var snapshotID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,metadata)
		VALUES($1,$2,'blizzard_api','validated',now(),'{"integration_test":true}'::jsonb)
		RETURNING id`, productID, mediaBuildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	var artifactID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
		) VALUES($1,$2,'blizzard_api','media-test','https://us.api.blizzard.com/media-test',
			decode(repeat('ab',32),'hex'),1,'ready') RETURNING id`, snapshotID, mediaBuildID).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	var publishedSnapshotID, publishedArtifactID, futureSnapshotID, futureArtifactID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,metadata)
		VALUES($1,$2,'blizzard_api','validated',now(),'{"integration_test":true}'::jsonb)
		RETURNING id`, productID, publishedBuildID).Scan(&publishedSnapshotID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
		) VALUES($1,$2,'blizzard_api','published-test','https://us.api.blizzard.com/published-test',
			decode(repeat('bc',32),'hex'),1,'ready') RETURNING id`, publishedSnapshotID, publishedBuildID).Scan(&publishedArtifactID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,metadata)
		VALUES($1,$2,'blizzard_api','validated',now(),'{"integration_test":true}'::jsonb)
		RETURNING id`, productID, futureBuildID).Scan(&futureSnapshotID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
		) VALUES($1,$2,'blizzard_api','future-media-test','https://us.api.blizzard.com/future-media-test',
			decode(repeat('ef',32),'hex'),1,'ready') RETURNING id`, futureSnapshotID, futureBuildID).Scan(&futureArtifactID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx, `
		INSERT INTO catalog_published_source_dependencies(source) VALUES('blizzard_api')
		ON CONFLICT(source) DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	var entityID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO game_entities(
			product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id
		) VALUES($1,'item',999998,'integration-item',$2,$3) RETURNING id`, productID, mediaBuildID, futureBuildID).Scan(&entityID); err != nil {
		t.Fatal(err)
	}
	var versionID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO game_entity_versions(
			entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source
		) VALUES($1,$2,decode(repeat('cd',32),'hex'),'{"integration_test":true}'::jsonb,
			'https://us.api.blizzard.com/item/999998',$3,$4,'blizzard_api') RETURNING id`,
		entityID, publishedBuildID, publishedSnapshotID, publishedArtifactID).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx, `
		UPDATE game_entities SET latest_version_id=$2,published_version_id=$2,updated_at=now()
		WHERE id=$1`, entityID, versionID); err != nil {
		t.Fatal(err)
	}
	var mediaID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_entity_media(
			build_id,entity_id,entity_type,external_id,media_kind,asset_key,source,source_url,
			mime_type,cache_status,source_artifact_id,is_primary
		) VALUES($1,$2,'item',999998,'icon','icon','blizzard_api',
			'https://render.worldofwarcraft.com/us/icons/56/integration.png','image/png','remote',$3,true)
		RETURNING id`, mediaBuildID, entityID, artifactID).Scan(&mediaID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx, `
		INSERT INTO catalog_entity_media(
			build_id,entity_id,entity_type,external_id,media_kind,asset_key,source,source_url,
			mime_type,cache_status,source_artifact_id,is_primary
		) VALUES($1,$2,'item',999998,'icon','icon-copy','blizzard_api',
			'https://render.worldofwarcraft.com/us/icons/56/integration-copy.png','image/png','remote',$3,false)`,
		mediaBuildID, entityID, artifactID); err != nil {
		t.Fatal(err)
	}
	var futureMediaID uuid.UUID
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_entity_media(
			build_id,entity_id,entity_type,external_id,media_kind,asset_key,source,source_url,
			mime_type,cache_status,source_artifact_id,is_primary
		) VALUES($1,$2,'item',999998,'icon','future','blizzard_api',
			'https://render.worldofwarcraft.com/us/icons/56/future.png','image/png','remote',$3,true)
		RETURNING id`, futureBuildID, entityID, futureArtifactID).Scan(&futureMediaID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.Commit(); err != nil {
		t.Fatal(err)
	}
	return seededMedia{entity: entityID, published: mediaID, future: futureMediaID}
}

func validTestPNG(t *testing.T) []byte {
	t.Helper()
	value, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	return value
}
