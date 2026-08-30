//go:build integration

package integration

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogrelease"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const latestCatalogSchemaVersion int64 = 106

func TestPostgresProductionBaselineUpgrade(t *testing.T) {
	ctx := context.Background()
	migrations, err := filepath.Abs("../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	postgres, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase("gildra"),
		pgcontainer.WithUsername("gildra"),
		pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, postgres)
	postgresURL, err := postgres.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpToContext(ctx, database, migrations, 15); err != nil {
		t.Fatalf("apply immutable production baseline: %v", err)
	}

	const proofEmail = "migration-proof@example.invalid"
	var proofUserID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO users(email,display_name) VALUES($1,'Migration proof')
		RETURNING id::text`, proofEmail).Scan(&proofUserID); err != nil {
		t.Fatal(err)
	}
	assertMigrationVersion(t, ctx, database, 15)
	assertTablePresent(t, ctx, database, "mythicstats_pages")

	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatalf("upgrade production baseline to Warcraft catalog: %v", err)
	}
	assertMigrationVersion(t, ctx, database, latestCatalogSchemaVersion)
	if err := goose.DownToContext(ctx, database, migrations, latestCatalogSchemaVersion-1); err != nil {
		t.Fatalf("roll back newest catalog migration: %v", err)
	}
	assertMigrationVersion(t, ctx, database, latestCatalogSchemaVersion-1)
	if err := goose.UpToContext(ctx, database, migrations, latestCatalogSchemaVersion); err != nil {
		t.Fatalf("reapply newest catalog migration: %v", err)
	}
	assertMigrationVersion(t, ctx, database, latestCatalogSchemaVersion)

	if err := goose.DownToContext(ctx, database, migrations, 96); err != nil {
		t.Fatalf("prepare UI map migration proof: %v", err)
	}
	seedStaleATTMapResolution(t, ctx, database)
	if err := goose.UpToContext(ctx, database, migrations, 97); err != nil {
		t.Fatalf("apply UI map migration: %v", err)
	}
	assertMigrationVersion(t, ctx, database, 97)
	for _, table := range []string{
		"catalog_completeness_expectations",
		"catalog_entity_media",
		"catalog_backup_manifests",
		"catalog_profession_recipes",
		"catalog_npc_roles",
		"catalog_quest_rewards",
		"catalog_releases",
		"catalog_public_release_state",
		"catalog_file_asset_versions",
		"catalog_staged_source_nodes",
		"catalog_source_entity_type_mappings",
		"catalog_source_resolution_runs",
		"catalog_entity_version_artifacts",
		"catalog_entity_localization_artifacts",
		"catalog_release_profiles",
		"catalog_release_profile_entity_types",
		"catalog_library_dataset_definitions",
		"catalog_library_dataset_stats",
		"catalog_loot_tables",
		"catalog_loot_entries",
		"catalog_fact_projection_runs",
		"catalog_library_dataset_applicability",
		"catalog_published_source_dependencies",
	} {
		assertTablePresent(t, ctx, database, table)
	}
	var activeProfileCount, requiredEntityTypeCount int
	if err := database.QueryRowContext(ctx, `
		SELECT
			count(*) FILTER (WHERE profile.status='active'),
			count(scope.entity_type) FILTER (WHERE scope.requirement='required')
		FROM catalog_release_profiles profile
		LEFT JOIN catalog_release_profile_entity_types scope ON scope.profile_key=profile.profile_key
		WHERE profile.profile_key='retail-foundation-v1'`).Scan(&activeProfileCount, &requiredEntityTypeCount); err != nil {
		t.Fatal(err)
	}
	if activeProfileCount == 0 || requiredEntityTypeCount == 0 {
		t.Fatalf("Retail v1 release profile was not seeded: active=%d required_types=%d", activeProfileCount, requiredEntityTypeCount)
	}
	var attMapTarget string
	var uiMapDatasets, uiMapRegistries, uiMapProfileTypes int
	if err := database.QueryRowContext(ctx, `
		SELECT canonical_entity_type
		FROM catalog_source_entity_type_mappings
		WHERE source='all_the_things' AND source_type='map' AND disposition='resolve'`).Scan(&attMapTarget); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM catalog_library_dataset_definitions
			 WHERE slug='ui-maps' AND entity_type='ui_map' AND is_public),
			(SELECT count(*) FROM catalog_entity_type_registry
			 WHERE entity_type='ui_map' AND is_public),
			(SELECT count(*) FROM catalog_release_profile_entity_types
			 WHERE profile_key='retail-foundation-v1' AND entity_type='ui_map'
			   AND requirement='required' AND minimum_count=1)`).Scan(
		&uiMapDatasets, &uiMapRegistries, &uiMapProfileTypes,
	); err != nil {
		t.Fatal(err)
	}
	if attMapTarget != "ui_map" || uiMapDatasets != 1 || uiMapRegistries != 4 || uiMapProfileTypes != 1 {
		t.Fatalf("UI map semantics are incomplete: ATT target=%q datasets=%d registries=%d profile_types=%d",
			attMapTarget, uiMapDatasets, uiMapRegistries, uiMapProfileTypes)
	}
	var staleNodes, staleReferences int
	if err := database.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM catalog_staged_source_nodes
			 WHERE source='all_the_things' AND node_kind='map'
			   AND (resolution_status<>'pending' OR resolved_entity_id IS NOT NULL)),
			(SELECT count(*) FROM catalog_staged_source_references reference
			 JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
			 WHERE node.source='all_the_things' AND reference.target_type='map'
			   AND (reference.resolution_status<>'pending' OR reference.target_entity_id IS NOT NULL))`).Scan(
		&staleNodes, &staleReferences,
	); err != nil {
		t.Fatal(err)
	}
	if staleNodes != 0 || staleReferences != 0 {
		t.Fatalf("stale ATT map resolutions survived mapping change: nodes=%d references=%d",
			staleNodes, staleReferences)
	}
	if err := goose.UpToContext(ctx, database, migrations, latestCatalogSchemaVersion); err != nil {
		t.Fatalf("apply media cache migrations: %v", err)
	}
	assertMigrationVersion(t, ctx, database, latestCatalogSchemaVersion)
	assertTablePresent(t, ctx, database, "catalog_media_cache_runs")
	var previewColumn, rewardPackageDataset int
	if err := database.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM information_schema.columns
			 WHERE table_schema='public' AND table_name='catalog_library_dataset_stats'
			   AND column_name='preview_media_id'),
			(SELECT count(*) FROM catalog_library_dataset_definitions
			 WHERE slug='quest-reward-packages' AND entity_type='quest_reward_package' AND is_public)`).Scan(
		&previewColumn, &rewardPackageDataset,
	); err != nil {
		t.Fatal(err)
	}
	if previewColumn != 1 || rewardPackageDataset != 1 {
		t.Fatalf("latest library migrations are incomplete: preview_column=%d reward_dataset=%d",
			previewColumn, rewardPackageDataset)
	}
	assertSourceApprovalEvidenceGate(t, ctx, database)
	var restoredUserID string
	if err := database.QueryRowContext(ctx, `SELECT id::text FROM users WHERE email=$1`, proofEmail).Scan(&restoredUserID); err != nil {
		t.Fatalf("read baseline row after upgrade: %v", err)
	}
	if restoredUserID != proofUserID {
		t.Fatalf("baseline row changed during upgrade: got=%s want=%s", restoredUserID, proofUserID)
	}
	assertProductionRecoveryGate(t, ctx, database, postgresURL)
	assertAtomicCatalogRelease(t, ctx, database, postgresURL)
}

func seedStaleATTMapResolution(t *testing.T, ctx context.Context, database *sql.DB) {
	t.Helper()
	if _, err := database.ExecContext(ctx, `
		WITH product AS (
			SELECT id FROM game_products WHERE slug='wow'
		), namespace AS (
			INSERT INTO game_namespaces(product_id,region,kind,slug)
			SELECT id,'us','static','static-us' FROM product
			ON CONFLICT(product_id,slug) DO UPDATE SET region=EXCLUDED.region
			RETURNING id,product_id
		), build AS (
			INSERT INTO game_builds(product_id,build_number,version,is_active)
			SELECT product_id,999997,'99.0.0.999997',false FROM namespace
			RETURNING id,product_id
		), snapshot AS (
			INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,metadata)
			SELECT product_id,id,'all_the_things','validated',now(),'{"migration_test":true}'::jsonb FROM build
			RETURNING id,build_id,product_id
		), artifact AS (
			INSERT INTO catalog_source_artifacts(
				snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
			)
			SELECT id,build_id,'all_the_things','migration-ui-map-proof',
				'https://github.com/ATT/repository',decode(repeat('ab',32),'hex'),1,'ready'
			FROM snapshot
			RETURNING id,build_id
		), entity AS (
			INSERT INTO game_entities(
				product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id
			)
			SELECT snapshot.product_id,namespace.id,'map',424242,'stale-map',snapshot.build_id,snapshot.build_id
			FROM snapshot CROSS JOIN namespace
			RETURNING id
		), node AS (
			INSERT INTO catalog_staged_source_nodes(
				build_id,source,source_artifact_id,record_key,node_kind,external_id,
				source_line,raw_source,content_hash,resolution_status,resolved_entity_id
			)
			SELECT artifact.build_id,'all_the_things',artifact.id,'map:424242','map',424242,
				1,'map proof',decode(repeat('cd',32),'hex'),'resolved',entity.id
			FROM artifact CROSS JOIN entity
			RETURNING id
		)
		INSERT INTO catalog_staged_source_references(
			node_id,reference_kind,target_type,target_external_id,content_hash,
			target_entity_id,resolution_status
		)
		SELECT node.id,'map','map',424242,decode(repeat('ef',32),'hex'),entity.id,'resolved'
		FROM node CROSS JOIN entity`,
	); err != nil {
		t.Fatalf("seed stale ATT map resolution: %v", err)
	}
}

func assertSourceApprovalEvidenceGate(t *testing.T, ctx context.Context, database *sql.DB) {
	t.Helper()
	var evidenceCount int
	if err := database.QueryRowContext(ctx, `
		SELECT count(*) FROM catalog_source_policy_reviews
		WHERE review_kind='evidence' AND decision='blocked'`).Scan(&evidenceCount); err != nil {
		t.Fatal(err)
	}
	if evidenceCount != 5 {
		t.Fatalf("source-policy evidence rows=%d, want 5", evidenceCount)
	}

	if _, err := database.ExecContext(ctx, `
		UPDATE catalog_publication_grants
		SET decision='allowed',approved_by='migration-test',reviewed_at=now(),reason='missing review must fail'
		WHERE source='blizzard_api' AND environment='production' AND surface='public_api'`); err == nil {
		t.Fatal("publication grant without a linked owner/legal review unexpectedly succeeded")
	}

	var blizzardEvidenceID string
	if err := database.QueryRowContext(ctx, `
		SELECT id::text FROM catalog_source_policy_reviews
		WHERE source='blizzard_api' AND environment='production' AND surface='public_api'
		  AND review_kind='evidence' ORDER BY created_at DESC,id DESC LIMIT 1`).Scan(&blizzardEvidenceID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_source_policy_reviews(
			source,environment,surface,review_kind,decision,reviewer,reason,observed_at,parent_review_id
		) VALUES('wago_tools','production','public_api','owner_approval','allowed',
			'migration-test','mismatched evidence must fail',now(),$1)`, blizzardEvidenceID); err == nil {
		t.Fatal("owner approval with mismatched evidence unexpectedly succeeded")
	}

	transaction, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer transaction.Rollback()
	var approvalID string
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO catalog_source_policy_reviews(
			source,environment,surface,review_kind,decision,reviewer,reason,observed_at,expires_at,parent_review_id
		) VALUES('blizzard_api','production','public_api','owner_approval','allowed',
			'migration-test','explicit integration approval',now(),now()+interval '1 day',$1)
		RETURNING id::text`, blizzardEvidenceID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx, `
		UPDATE catalog_publication_grants
		SET decision='allowed',approved_by='migration-test',reviewed_at=now(),expires_at=now()+interval '1 day',
			reason='explicit integration approval',policy_review_id=$1
		WHERE source='blizzard_api' AND environment='production' AND surface='public_api'`, approvalID); err != nil {
		t.Fatal(err)
	}
	var eventCount int
	if err := transaction.QueryRowContext(ctx, `
		SELECT count(*) FROM catalog_publication_grant_events
		WHERE source='blizzard_api' AND environment='production' AND surface='public_api'
		  AND operation='update' AND actor='migration-test'`).Scan(&eventCount); err != nil {
		t.Fatal(err)
	}
	if eventCount != 1 {
		t.Fatalf("publication grant audit events=%d, want 1", eventCount)
	}
	if err := transaction.Rollback(); err != nil {
		t.Fatal(err)
	}

	if _, err := database.ExecContext(ctx, `
		UPDATE catalog_source_policy_reviews SET reason='mutation must fail' WHERE id=$1`, blizzardEvidenceID); err == nil {
		t.Fatal("immutable source-policy evidence unexpectedly changed")
	}
}

func assertProductionRecoveryGate(t *testing.T, ctx context.Context, database *sql.DB, postgresURL string) {
	t.Helper()
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	runner := &catalogpipeline.Runner{DB: pool, Stdout: io.Discard, Stderr: io.Discard}
	options := catalogpipeline.Options{
		PipelineKey: "catalog-refresh-test", Trigger: "manual", Mode: "apply",
		Profile: catalogpipeline.ProfileRetailFoundation, Product: "wow",
		BuildVersion: "12.1.0.69404", MaxRecords: 0, ConfirmFullImport: true,
		BinaryDirectory: t.TempDir(), PublicationEnvironment: "production",
	}
	result, err := runner.Run(ctx, options)
	if !errors.Is(err, catalogpipeline.ErrRecoveryGate) {
		t.Fatalf("production import without backup proof error = %v, want ErrRecoveryGate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "failed", "verified_backup_missing")

	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_backup_manifests(
			component,backup_kind,status,storage_uri,content_hash,byte_size,database_version,
			completed_at,restore_started_at,restore_completed_at,verification)
		VALUES(
			'postgres','logical','verified','file:///local-only.dump',decode(repeat('aa',32),'hex'),1,$1,
			now(),now(),now(),'{"restore_verified":true,"source_restore_match":true}')`, latestCatalogSchemaVersion); err != nil {
		t.Fatal(err)
	}
	result, err = runner.Run(ctx, options)
	if !errors.Is(err, catalogpipeline.ErrRecoveryGate) {
		t.Fatalf("local-only backup error = %v, want ErrRecoveryGate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "failed", "verified_backup_missing")

	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_backup_manifests(
			component,backup_kind,status,storage_uri,content_hash,byte_size,database_version,
			completed_at,restore_started_at,restore_completed_at,verification)
		VALUES(
			'postgres','logical','verified','r2://gildra-backups/catalog.dump',decode(repeat('bb',32),'hex'),1,$1,
			now(),now(),now(),'{"restore_verified":true,"source_restore_match":true}')`, latestCatalogSchemaVersion); err != nil {
		t.Fatal(err)
	}
	result, err = runner.Run(ctx, options)
	if err == nil || !strings.Contains(err.Error(), "import-wago") {
		t.Fatalf("production import with valid recovery proof error = %v, want importer lookup failure after the gate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "succeeded", "")
}

func assertAtomicCatalogRelease(t *testing.T, ctx context.Context, database *sql.DB, postgresURL string) {
	t.Helper()
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	store := catalogimport.NewStore(pool)
	service := catalog.NewService(pool)
	releases := catalogrelease.NewManager(pool)

	legacy, err := store.Begin(ctx, "wow", 100001, "1.0.0.100001", "us", "wago_tools", nil, map[string]any{"test": "published"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, legacy, catalogTestItem("Published item", "1.0.0.100001")); err != nil {
		t.Fatal(err)
	}
	readyMediaArtifact, err := store.RegisterArtifact(ctx, legacy, "blizzard_api", "battlenet-media/item", "en_US",
		"https://us.api.blizzard.com/data/wow/media/item/900001", map[string]any{"test": "proved media"})
	if err != nil {
		t.Fatal(err)
	}
	readyMediaProof := []byte("proved-media")
	readyMediaDigest := sha256.Sum256(readyMediaProof)
	if err := store.CompleteArtifact(ctx, readyMediaArtifact, readyMediaDigest[:], int64(len(readyMediaProof)), ""); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertEntityMedia(ctx, legacy, "item", 900001, "en_US", "blizzard_api", catalogimport.EntityMedia{
		Kind: "icon", AssetKey: "icon", SourceURL: "https://render.worldofwarcraft.com/us/icons/56/proved.jpg",
		MIMEType: "image/jpeg", Primary: true,
	}, readyMediaArtifact); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, legacy.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	entityID := catalogEntityID(t, ctx, database, 900001)
	assertCatalogName(t, ctx, service, entityID, "Published item")

	failedMedia, err := store.Begin(ctx, "wow", 100001, "1.0.0.100001", "us", "battlenet", nil, map[string]any{"test": "failed media refresh"})
	if err != nil {
		t.Fatal(err)
	}
	failedMediaArtifact, err := store.RegisterPendingArtifact(ctx, failedMedia, "blizzard_api", "battlenet-media/item", "en_US",
		"https://us.api.blizzard.com/data/wow/media/item/900001", map[string]any{"test": "failed media"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertEntityMedia(ctx, failedMedia, "item", 900001, "en_US", "blizzard_api", catalogimport.EntityMedia{
		Kind: "icon", AssetKey: "icon", SourceURL: "https://render.worldofwarcraft.com/us/icons/56/unproved.jpg",
		MIMEType: "image/jpeg", Primary: true,
	}, failedMediaArtifact); err != nil {
		t.Fatal(err)
	}
	failedMediaErr := errors.New("synthetic media refresh failure")
	if err := store.FailArtifact(ctx, failedMediaArtifact, failedMediaErr); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, failedMedia.RunID, "FAILED", 1, 0, failedMediaErr); err != nil {
		t.Fatal(err)
	}
	mediaEntity, err := service.Get(ctx, entityID, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if len(mediaEntity.Media) != 0 || mediaEntity.IconURL != nil {
		t.Fatalf("uncached source media became public: media=%#v icon_url=%v", mediaEntity.Media, mediaEntity.IconURL)
	}
	var readyObservations, failedObservations int
	if err := database.QueryRowContext(ctx, `
		SELECT
			count(*) FILTER (WHERE artifact.status='ready' AND media.source_url LIKE '%/proved.jpg'),
			count(*) FILTER (WHERE artifact.status='failed' AND media.source_url LIKE '%/unproved.jpg')
		FROM catalog_entity_media media
		JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
		WHERE media.entity_id=$1`, entityID).Scan(&readyObservations, &failedObservations); err != nil {
		t.Fatal(err)
	}
	if readyObservations != 1 || failedObservations != 1 {
		t.Fatalf("media observations were not preserved: ready=%d failed=%d", readyObservations, failedObservations)
	}
	if err := service.RefreshReadModels(ctx, nil); err != nil {
		t.Fatal(err)
	}
	assertPublishedItemReadModelCount(t, ctx, database, 1)

	failedRunID := insertPipelineRun(t, ctx, database, "1.0.0.100002")
	failedReleaseID, err := releases.Start(ctx, failedRunID, "wow", "1.0.0.100002", []string{"wago"})
	if err != nil {
		t.Fatal(err)
	}
	staging, err := store.Begin(ctx, "wow", 100002, "1.0.0.100002", "us", "wago_tools", &failedReleaseID, map[string]any{"test": "failed"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, staging, catalogTestItem("Unpublished item", "1.0.0.100002")); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, staging, catalogTestItemWithID(900002, "Candidate-only item", "1.0.0.100002")); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, staging.RunID, "SUCCEEDED", 2, 2, nil); err != nil {
		t.Fatal(err)
	}
	if err := service.RefreshReadModels(ctx, nil); err != nil {
		t.Fatal(err)
	}
	assertPublishedItemReadModelCount(t, ctx, database, 1)
	assertCatalogName(t, ctx, service, entityID, "Published item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, true)
	versions, err := service.Versions(ctx, entityID, "en_US", 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(versions) != 1 || versions[0].Name != "Published item" {
		t.Fatalf("public version history leaked staging data: %#v", versions)
	}
	if err := releases.Fail(ctx, failedReleaseID, errors.New("synthetic importer failure")); err != nil {
		t.Fatal(err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, false)

	publishedRunID := insertPipelineRun(t, ctx, database, "1.0.0.100003")
	publishedReleaseID, err := releases.Start(ctx, publishedRunID, "wow", "1.0.0.100003", []string{"wago", "listfile"})
	if err != nil {
		t.Fatal(err)
	}
	publication, err := catalog.NewPublicationService(pool, 0).ReleaseStatus(
		ctx, "development", "public_api", publishedReleaseID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if publication.Ready || len(publication.Sources) != 2 ||
		publication.Sources[0].Source != "wago_tools" || publication.Sources[1].Source != "wow_listfile" {
		t.Fatalf("candidate publication sources = %#v, want blocked wago_tools and wow_listfile", publication)
	}
	candidate, err := store.Begin(ctx, "wow", 100003, "1.0.0.100003", "us", "wago_tools", &publishedReleaseID, map[string]any{"test": "publish"})
	if err != nil {
		t.Fatal(err)
	}
	artifactID, err := store.RegisterArtifact(ctx, candidate, "wago_tools", "ItemSparse", "en_US",
		"https://wago.tools/db2/ItemSparse/csv?build=1.0.0.100003", map[string]any{"test": "atomic release"})
	if err != nil {
		t.Fatal(err)
	}
	wagoProof := []byte("25,Released item\n")
	wagoDigest := sha256.Sum256(wagoProof)
	if err := store.CompleteArtifact(ctx, artifactID, wagoDigest[:], int64(len(wagoProof)), `"integration-wago-etag"`); err != nil {
		t.Fatal(err)
	}
	releasedItem := catalogTestItem("Released item", "1.0.0.100003")
	releasedItem.SourceArtifactID = &artifactID
	if err := store.UpsertCanonical(ctx, candidate, releasedItem); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, candidate.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	listfile, err := store.Begin(ctx, "wow", 100003, "1.0.0.100003", "us", "wow_listfile", &publishedReleaseID, map[string]any{"test": "atomic assets"})
	if err != nil {
		t.Fatal(err)
	}
	listfileArtifactID, err := store.RegisterPendingArtifact(ctx, listfile, "wow_listfile", "community-listfile.csv", "",
		"https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv", map[string]any{"test": "atomic assets"})
	if err != nil {
		t.Fatal(err)
	}
	listfileProof := []byte("987654321;Interface/Icons/inv_test.blp\n")
	listfileDigest := sha256.Sum256(listfileProof)
	if err := store.CompleteArtifact(ctx, listfileArtifactID, listfileDigest[:], int64(len(listfileProof)), `"integration-etag"`); err != nil {
		t.Fatal(err)
	}
	const fileDataID int64 = 987654321
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_file_asset_versions(
			snapshot_id,file_data_id,path,icon_name,source_url,content_hash,source_artifact_id
		) VALUES($1,$2,'Interface/Icons/inv_test.blp','inv_test',
			'https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv',
			decode(repeat('cc',32),'hex'),$3)`, listfile.SnapshotID, fileDataID, listfileArtifactID); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, listfile.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	var activeAssetCount int
	if err := database.QueryRowContext(ctx, `SELECT count(*) FROM catalog_file_assets WHERE file_data_id=$1`, fileDataID).Scan(&activeAssetCount); err != nil {
		t.Fatal(err)
	}
	if activeAssetCount != 0 {
		t.Fatalf("staged listfile asset leaked before release publication: count=%d", activeAssetCount)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	var previousVersionID, candidateVersionID uuid.UUID
	if err := database.QueryRowContext(ctx, `
		SELECT published_version_id,latest_version_id
		FROM game_entities WHERE id=$1`, entityID).Scan(&previousVersionID, &candidateVersionID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_stats(version_id,slot,stat_type,source_artifact_id)
		VALUES($1,0,1,$2)`, previousVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); !errors.Is(err, catalogrelease.ErrReleaseNotPublishable) ||
		!strings.Contains(err.Error(), "item_stats_regression=1") {
		t.Fatalf("item stats regression error = %v, want item_stats_regression=1", err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, false)
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_stats(version_id,slot,stat_type,source_artifact_id)
		VALUES($1,0,1,$2)`, candidateVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_effects(version_id,item_effect_id,slot,spell_id,source_artifact_id)
		VALUES($1,1,0,1337,$2)`, previousVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,source_artifact_id)
		VALUES($1,'blizzard_api',900001,$2)`, previousVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); !errors.Is(err, catalogrelease.ErrReleaseNotPublishable) ||
		!strings.Contains(err.Error(), "item_acquisition_regression=1") ||
		!strings.Contains(err.Error(), "item_effects_regression=1") {
		t.Fatalf("item enrichment regression error = %v, want acquisition and effects regressions", err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, false)
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_effects(version_id,item_effect_id,slot,spell_id,source_artifact_id)
		VALUES($1,1,0,1337,$2)`, candidateVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,source_artifact_id)
		VALUES($1,'blizzard_api',900001,$2)`, candidateVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	spell := catalogTestSpell("Test spell", "1.0.0.100001", nil)
	if err := store.UpsertCanonical(ctx, legacy, spell); err != nil {
		t.Fatal(err)
	}
	candidateSpell := catalogTestSpell("Test spell", "1.0.0.100003", &artifactID)
	if err := store.UpsertCanonical(ctx, candidate, candidateSpell); err != nil {
		t.Fatal(err)
	}
	var previousSpellVersionID, candidateSpellVersionID uuid.UUID
	if err := database.QueryRowContext(ctx, `
		SELECT published_version_id,latest_version_id
		FROM game_entities WHERE entity_type='spell' AND external_id=900010`).Scan(&previousSpellVersionID, &candidateSpellVersionID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_spells(version_id,school,cast_time,cooldown_ms)
		VALUES($1,'Fire','1.5 sec',1000)`, previousSpellVersionID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_spell_effects(spell_version_id,effect_index,effect_type,source,source_artifact_id)
		VALUES($1,0,2,'db2',$2)`, previousSpellVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); !errors.Is(err, catalogrelease.ErrReleaseNotPublishable) ||
		!strings.Contains(err.Error(), "spell_effects_regression=1") ||
		!strings.Contains(err.Error(), "spell_registry_regression=1") {
		t.Fatalf("spell enrichment regression error = %v, want spell facts and effects regressions", err)
	}
	var publishedSpellName string
	if err := database.QueryRowContext(ctx, `
		SELECT localized.name
		FROM game_entities entity
		JOIN game_entity_localizations localized ON localized.version_id=entity.published_version_id
		WHERE entity.entity_type='spell' AND entity.external_id=900010 AND localized.locale='en_US'`).Scan(&publishedSpellName); err != nil {
		t.Fatal(err)
	}
	if publishedSpellName != "Test spell" {
		t.Fatalf("spell candidate leaked through failed quality gate: %q", publishedSpellName)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_spells(version_id,school,cast_time,cooldown_ms)
		VALUES($1,'Fire','1.5 sec',1000)`, candidateSpellVersionID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_spell_effects(spell_version_id,effect_index,effect_type,source,source_artifact_id)
		VALUES($1,0,2,'db2',$2)`, candidateSpellVersionID, artifactID); err != nil {
		t.Fatal(err)
	}
	var missingCachedMedia int64
	if err := database.QueryRowContext(ctx, `
		SELECT COALESCE((SELECT failed_count FROM catalog_release_quality_gate($1)
			WHERE check_key='missing_cached_media'),0)`, publishedReleaseID).Scan(&missingCachedMedia); err != nil {
		t.Fatal(err)
	}
	if missingCachedMedia == 0 {
		t.Fatal("release quality gate did not report missing cached media warning")
	}
	if _, err := database.ExecContext(ctx, `UPDATE catalog_source_artifacts SET content_hash=NULL WHERE id=$1`, listfileArtifactID); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); !errors.Is(err, catalogrelease.ErrReleaseNotPublishable) ||
		!strings.Contains(err.Error(), "invalid_artifacts=1") {
		t.Fatalf("unverified artifact error = %v, want invalid_artifacts=1", err)
	}
	if err := store.CompleteArtifact(ctx, listfileArtifactID, listfileDigest[:], int64(len(listfileProof)), `"integration-etag"`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		UPDATE game_entity_versions SET source_artifact_id=NULL
		WHERE id=(SELECT latest_version_id FROM game_entities WHERE id=$1)`, entityID); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); !errors.Is(err, catalogrelease.ErrReleaseNotPublishable) ||
		!strings.Contains(err.Error(), "versions=1") {
		t.Fatalf("unproven version error = %v, want versions=1", err)
	}
	if _, err := database.ExecContext(ctx, `
		UPDATE game_entity_versions SET source_artifact_id=$2
		WHERE id=(SELECT latest_version_id FROM game_entities WHERE id=$1)`, entityID, artifactID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,attributes)
		SELECT latest_version_id,'world_drop',1,'{"test":"missing provenance"}'::jsonb
		FROM game_entities WHERE id=$1`, entityID); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); !errors.Is(err, catalogrelease.ErrReleaseNotPublishable) ||
		!strings.Contains(err.Error(), "normalized_facts=1") {
		t.Fatalf("unproven fact error = %v, want normalized_facts=1", err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	if _, err := database.ExecContext(ctx, `
		UPDATE catalog_item_acquisition_sources SET source_artifact_id=$2
		WHERE version_id=(SELECT latest_version_id FROM game_entities WHERE id=$1)`, entityID, artifactID); err != nil {
		t.Fatal(err)
	}
	var generationBeforePublish int64
	if err := database.QueryRowContext(ctx, `
		SELECT state.generation
		FROM catalog_read_model_state state
		JOIN game_products product ON product.id=state.product_id
		WHERE product.slug='wow'`).Scan(&generationBeforePublish); err != nil {
		t.Fatal(err)
	}
	if err := releases.Publish(ctx, publishedReleaseID); err != nil {
		t.Fatal(err)
	}
	var generationAfterPublish int64
	if err := database.QueryRowContext(ctx, `
		SELECT state.generation
		FROM catalog_read_model_state state
		JOIN game_products product ON product.id=state.product_id
		WHERE product.slug='wow'`).Scan(&generationAfterPublish); err != nil {
		t.Fatal(err)
	}
	if generationAfterPublish <= generationBeforePublish {
		t.Fatalf("published read-model generation did not advance: before=%d after=%d",
			generationBeforePublish, generationAfterPublish)
	}
	assertCatalogName(t, ctx, service, entityID, "Released item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, false)
	var activeAssetPath string
	var activeAssetArtifactID uuid.UUID
	if err := database.QueryRowContext(ctx, `
		SELECT path,source_artifact_id FROM catalog_file_assets WHERE file_data_id=$1`, fileDataID).
		Scan(&activeAssetPath, &activeAssetArtifactID); err != nil {
		t.Fatal(err)
	}
	if activeAssetPath != "Interface/Icons/inv_test.blp" || activeAssetArtifactID != listfileArtifactID {
		t.Fatalf("published listfile asset = (%q,%s), want source artifact %s", activeAssetPath, activeAssetArtifactID, listfileArtifactID)
	}

	var releaseStatus, snapshotStatus string
	var publicReleaseID uuid.UUID
	if err := database.QueryRowContext(ctx, `SELECT status FROM catalog_releases WHERE id=$1`, publishedReleaseID).Scan(&releaseStatus); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `SELECT status FROM catalog_snapshots WHERE id=$1`, candidate.SnapshotID).Scan(&snapshotStatus); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT state.release_id
		FROM catalog_public_release_state state
		JOIN game_products product ON product.id=state.product_id
		WHERE product.slug='wow'`).Scan(&publicReleaseID); err != nil {
		t.Fatal(err)
	}
	if releaseStatus != "published" || snapshotStatus != "published" || publicReleaseID != publishedReleaseID {
		t.Fatalf("release state = (%s,%s,%s), want published release %s", releaseStatus, snapshotStatus, publicReleaseID, publishedReleaseID)
	}
	assertLocaleFallbackContract(t, ctx, database, service, store, candidate, entityID)
	sameBuildRunID := insertPipelineRun(t, ctx, database, "1.0.0.100003")
	if _, err := releases.Start(ctx, sameBuildRunID, "wow", "1.0.0.100003", []string{"wago"}); !errors.Is(err, catalogrelease.ErrBuildAlreadyPublished) {
		t.Fatalf("same-build release error = %v, want ErrBuildAlreadyPublished", err)
	}
	unchanged, err := (&catalogpipeline.Runner{DB: pool, Stdout: io.Discard, Stderr: io.Discard}).Run(ctx, catalogpipeline.Options{
		PipelineKey: "same-build-test", Trigger: "manual", Mode: "apply", Profile: "custom",
		Product: "wow", Sources: []string{"wago"}, BuildVersion: "1.0.0.100003",
		MaxRecords: 10, BinaryDirectory: t.TempDir(), PublicationEnvironment: "development",
	})
	if err != nil || unchanged.Status != "succeeded" || unchanged.ReleaseID != "" {
		t.Fatalf("same-build pipeline = (%#v,%v), want successful no-op", unchanged, err)
	}
	assertPipelineStage(t, ctx, database, unchanged.RunID, "release-start", "skipped", "")
}

func assertLocaleFallbackContract(
	t *testing.T,
	ctx context.Context,
	database *sql.DB,
	service *catalog.Service,
	store *catalogimport.Store,
	run catalogimport.ImportContext,
	entityID uuid.UUID,
) {
	t.Helper()
	var versionID uuid.UUID
	if err := database.QueryRowContext(ctx, `SELECT published_version_id FROM game_entities WHERE id=$1`, entityID).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO game_entity_localizations(version_id,locale,slug,name,description)
		VALUES($1,'ru_RU','released-item-ru','Released item','Atomic release test')
		ON CONFLICT (version_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`, versionID); err != nil {
		t.Fatal(err)
	}
	entity, err := service.Get(ctx, entityID, "ru_RU")
	if err != nil {
		t.Fatal(err)
	}
	if !entity.LocaleFallback || entity.ResolvedLocale != "en_US" {
		t.Fatalf("unproven Russian value must be an English fallback: %#v", entity)
	}
	ruArtifactID, err := store.RegisterArtifact(ctx, run, "wago_tools", "ItemSparse", "ru_RU",
		"https://wago.tools/db2/ItemSparse/csv?build=1.0.0.100003&locale=ru_RU", map[string]any{"test": "Russian proof"})
	if err != nil {
		t.Fatal(err)
	}
	proof := []byte("25,Released item\n")
	digest := sha256.Sum256(proof)
	if err := store.CompleteArtifact(ctx, ruArtifactID, digest[:], int64(len(proof)), `"integration-ru-etag"`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
		VALUES($1,'ru_RU',$2) ON CONFLICT DO NOTHING`, versionID, ruArtifactID); err != nil {
		t.Fatal(err)
	}
	entity, err = service.Get(ctx, entityID, "ru_RU")
	if err != nil {
		t.Fatal(err)
	}
	if entity.LocaleFallback || entity.ResolvedLocale != "ru_RU" {
		t.Fatalf("proven Russian value must remain Russian: %#v", entity)
	}
}

func catalogTestItem(name, build string) catalogimport.Record {
	return catalogTestItemWithID(900001, name, build)
}

func catalogTestItemWithID(externalID int64, name, build string) catalogimport.Record {
	payload := `{"name":{"en_US":"` + name + `"},"description":{"en_US":"Atomic release test"},"level":100}`
	return catalogimport.Record{
		Type: "item", ExternalID: externalID, Locale: "en_US", Payload: []byte(payload),
		SourceURL: "https://wago.tools/db2/ItemSparse/csv?build=" + build,
	}
}

func catalogTestSpell(name, build string, sourceArtifactID *uuid.UUID) catalogimport.Record {
	return catalogimport.Record{
		Type: "spell", ExternalID: 900010, Locale: "en_US",
		Payload:          []byte(`{"name":{"en_US":"` + name + `"},"description":{"en_US":"Atomic release spell"}}`),
		SourceURL:        "https://wago.tools/db2/SpellName?build=" + build,
		SourceArtifactID: sourceArtifactID,
	}
}

func assertPublishedItemReadModelCount(t *testing.T, ctx context.Context, database *sql.DB, want int64) {
	t.Helper()
	var count int64
	if err := database.QueryRowContext(ctx, `
		SELECT stats.entity_count
		FROM catalog_entity_type_stats stats
		JOIN game_products product ON product.id=stats.product_id
		WHERE product.slug='wow' AND stats.entity_type='item' AND stats.locale='en_US'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("published item read-model count = %d, want %d", count, want)
	}
}

func insertPipelineRun(t *testing.T, ctx context.Context, database *sql.DB, buildVersion string) int64 {
	t.Helper()
	var runID int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_pipeline_runs(
			pipeline_key,trigger_kind,mode,status,product,requested_sources,build_version,
			publication_environment,started_at,current_stage
		) VALUES('atomic-release-test','manual','apply','running','wow',ARRAY['wago'],$1,'development',now(),'release-start')
		RETURNING id`, buildVersion).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	return runID
}

func catalogEntityID(t *testing.T, ctx context.Context, database *sql.DB, externalID int64) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := database.QueryRowContext(ctx, `SELECT id FROM game_entities WHERE entity_type='item' AND external_id=$1`, externalID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func assertCatalogName(t *testing.T, ctx context.Context, service *catalog.Service, entityID uuid.UUID, want string) {
	t.Helper()
	entity, err := service.Get(ctx, entityID, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if entity.Name != want {
		t.Fatalf("public entity name = %q, want %q", entity.Name, want)
	}
}

func assertCatalogPointersDiffer(t *testing.T, ctx context.Context, database *sql.DB, entityID uuid.UUID, want bool) {
	t.Helper()
	var differ bool
	if err := database.QueryRowContext(ctx, `
		SELECT latest_version_id IS DISTINCT FROM published_version_id
		FROM game_entities WHERE id=$1`, entityID).Scan(&differ); err != nil {
		t.Fatal(err)
	}
	if differ != want {
		t.Fatalf("catalog pointers differ = %t, want %t", differ, want)
	}
}

func assertPipelineStage(t *testing.T, ctx context.Context, database *sql.DB, runID int64, stageKey, wantStatus, wantCode string) {
	t.Helper()
	var status, code string
	if err := database.QueryRowContext(ctx, `SELECT status,error_code FROM catalog_pipeline_stages WHERE run_id=$1 AND stage_key=$2`, runID, stageKey).Scan(&status, &code); err != nil {
		t.Fatal(err)
	}
	if status != wantStatus || code != wantCode {
		t.Fatalf("stage %s = (%s,%s), want (%s,%s)", stageKey, status, code, wantStatus, wantCode)
	}
}

func assertMigrationVersion(t *testing.T, ctx context.Context, database *sql.DB, expected int64) {
	t.Helper()
	var actual int64
	if err := database.QueryRowContext(ctx, `SELECT max(version_id) FROM goose_db_version WHERE is_applied`).Scan(&actual); err != nil {
		t.Fatal(err)
	}
	if actual != expected {
		t.Fatalf("migration version = %d, want %d", actual, expected)
	}
}

func assertTablePresent(t *testing.T, ctx context.Context, database *sql.DB, table string) {
	t.Helper()
	var present bool
	if err := database.QueryRowContext(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&present); err != nil {
		t.Fatal(err)
	}
	if !present {
		t.Fatalf("expected table %q to exist", table)
	}
}
