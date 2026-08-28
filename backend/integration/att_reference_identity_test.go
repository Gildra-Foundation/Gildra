//go:build integration

package integration

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/attimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestATTReferenceIdentityProjectionIsMinimalAndIdempotent(t *testing.T) {
	ctx := t.Context()
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
	t.Cleanup(func() { _ = database.Close() })
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	var productID, snapshotBuildID, newerBuildID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,100,'12.0.0.100',false) RETURNING id`, productID).Scan(&snapshotBuildID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,200,'12.0.0.200',true) RETURNING id`, productID).Scan(&newerBuildID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO game_namespaces(product_id,region,kind,slug)
		VALUES($1,'us','static','static-us')`, productID); err != nil {
		t.Fatal(err)
	}

	var spellID, newerVersionID uuid.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,
			first_seen_build_id,last_seen_build_id)
		VALUES($1,'spell',7002,'spell-7002',$2,$2) RETURNING id`,
		productID, newerBuildID).Scan(&spellID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO game_entity_versions(
		entity_id,build_id,content_hash,payload,source_url,source)
		VALUES($1,$2,digest('newer-spell','sha256'),'{}',
		'https://us.api.blizzard.com/data/wow/spell/7002','blizzard_api')`, spellID, newerBuildID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM game_entity_versions
		WHERE entity_id=$1 AND build_id=$2`, spellID, newerBuildID).Scan(&newerVersionID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`,
		spellID, newerVersionID); err != nil {
		t.Fatal(err)
	}

	var snapshotID, artifactID uuid.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,content_hash,validated_at)
		VALUES($1,$2,'all_the_things','validated','fixture',now()) RETURNING id`,
		productID, snapshotBuildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,locale,source_url,
			content_hash,byte_size,status)
		VALUES($1,$2,'all_the_things','fixture.lua','en_US',
			'https://github.com/ATTWoWAddon/AllTheThings/blob/master/fixture.lua',
			digest('fixture','sha256'),7,'ready') RETURNING id`,
		snapshotID, snapshotBuildID).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	var nodeID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO catalog_staged_source_nodes(
			build_id,source,source_artifact_id,record_key,node_kind,external_id,
			source_line,ancestor_path,fields,raw_source,content_hash,
			resolution_status,resolution_reason)
		VALUES($1,'all_the_things',$2,'item:7001','item',7001,1,'[]','{}','fixture',
			digest('item:7001','sha256'),'unresolved','canonical_identity_missing')
		RETURNING id`, snapshotBuildID, artifactID).Scan(&nodeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO catalog_staged_source_references(
			node_id,reference_kind,target_type,target_external_id,ordinal,
			attributes,content_hash,resolution_status,resolution_reason)
		VALUES($1,'spell','spell',7002,0,'{}',digest('spell:7002','sha256'),
			'unresolved','canonical_identity_missing')`, nodeID); err != nil {
		t.Fatal(err)
	}

	store := attimport.NewStore(pool)
	report, err := store.ProjectReferencedIdentities(ctx, snapshotID)
	if err != nil {
		t.Fatal(err)
	}
	if report.Evidence != 2 || report.IdentityIDs != 2 || report.CreatedEntities != 1 ||
		report.CreatedVersions != 2 || report.Observations != 2 {
		t.Fatalf("projection report = %+v", report)
	}
	resolved, err := store.ResolveSnapshot(ctx, snapshotID)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Nodes.Resolved != 1 || resolved.References.Resolved != 1 {
		t.Fatalf("resolution after projection = %+v", resolved)
	}

	projected := countATTProjectionRows(t, pool, snapshotID, "")
	localized := countATTProjectionRows(t, pool, snapshotID,
		"AND EXISTS (SELECT 1 FROM game_entity_localizations l WHERE l.version_id=v.id)")
	published := countATTProjectionRows(t, pool, snapshotID,
		"AND e.published_version_id=v.id")
	missingProvenance := countATTProjectionRows(t, pool, snapshotID,
		"AND NOT EXISTS (SELECT 1 FROM catalog_entity_version_artifacts a WHERE a.version_id=v.id)")
	missingItemType := countATTProjectionRows(t, pool, snapshotID,
		"AND e.entity_type='item' AND NOT EXISTS (SELECT 1 FROM catalog_items i WHERE i.version_id=v.id)")
	missingSpellType := countATTProjectionRows(t, pool, snapshotID,
		"AND e.entity_type='spell' AND NOT EXISTS (SELECT 1 FROM catalog_spells s WHERE s.version_id=v.id)")
	wrongTyped := missingItemType + missingSpellType
	if projected != 2 || localized != 0 || published != 0 ||
		missingProvenance != 0 || wrongTyped != 0 {
		t.Fatalf("minimal projection = versions:%d localized:%d published:%d provenance_missing:%d wrong_typed:%d",
			projected, localized, published, missingProvenance, wrongTyped)
	}
	var latest uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT latest_version_id FROM game_entities WHERE id=$1`,
		spellID).Scan(&latest); err != nil {
		t.Fatal(err)
	}
	if latest != newerVersionID {
		t.Fatalf("older ATT version replaced newer latest: got %s want %s", latest, newerVersionID)
	}

	repeated, err := store.ProjectReferencedIdentities(ctx, snapshotID)
	if err != nil {
		t.Fatal(err)
	}
	if repeated.IdentityIDs != 0 || repeated.CreatedEntities != 0 ||
		repeated.CreatedVersions != 0 || repeated.Observations != 0 {
		t.Fatalf("repeated projection was not idempotent: %+v", repeated)
	}
}

func countATTProjectionRows(
	t *testing.T,
	pool *pgxpool.Pool,
	snapshotID uuid.UUID,
	predicate string,
) int64 {
	t.Helper()
	query := `SELECT count(*)
		FROM game_entity_versions v
		JOIN game_entities e ON e.id=v.entity_id
		WHERE v.snapshot_id=$1 AND v.source='all_the_things' ` + predicate
	var count int64
	if err := pool.QueryRow(t.Context(), query, snapshotID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
