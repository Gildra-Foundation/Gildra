package catalogtaxonomy

import (
	"context"
	"math/rand/v2"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The pipeline stages a build that is not active: the published build stays
// active until publication. Candidate projections must follow the release the
// stage belongs to, leave the published build alone, and write nothing once
// the release has left staging.
func TestStagedReleaseBuildIsProjected(t *testing.T) {
	url := os.Getenv("LIBFIX_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("disposable database required")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	var product int16
	if err := admin.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&product); err != nil {
		t.Fatal(err)
	}
	// One active build per product, as on production.
	exec(`UPDATE game_builds SET is_active=false WHERE product_id=$1`, product)
	seed := rand.IntN(100000000) + 1000000
	build := func(number int, active bool) int64 {
		var id int64
		if err := admin.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,$2,$3,$4) RETURNING id`, product, number, uuid.NewString(), active).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	published, staged := build(seed, true), build(seed+1, false)
	var release uuid.UUID
	if err := admin.QueryRow(ctx, `INSERT INTO catalog_releases(product_id,build_id,build_version,status) VALUES($1,$2,'fixture-staged','staging') RETURNING id`, product, staged).Scan(&release); err != nil {
		t.Fatal(err)
	}
	var entity uuid.UUID
	if err := admin.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id) VALUES($1,'spell',$2) RETURNING id`, product, seed).Scan(&entity); err != nil {
		t.Fatal(err)
	}
	version := func(b int64) uuid.UUID {
		var id uuid.UUID
		if err := admin.QueryRow(ctx, `WITH snapshot AS (INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($3,$2,'wago_tools','validated') RETURNING id), artifact AS (INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) SELECT id,$2,'wago_tools',$1::text,'https://example.invalid',decode(repeat('ab',32),'hex'),1,'ready' FROM snapshot RETURNING id,snapshot_id) INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id) SELECT $1::uuid,$2,decode(repeat('ab',32),'hex'),'{}','wago_tools',snapshot_id,id FROM artifact RETURNING id`, entity, b, product).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	live, candidate := version(published), version(staged)
	exec(`UPDATE game_entities SET published_version_id=$2,latest_version_id=$3 WHERE id=$1`, entity, live, candidate)
	exec(`INSERT INTO catalog_spells(version_id,school) VALUES($1,'published-fixture')`, live)
	spellRows := func(version uuid.UUID) (count int, school string) {
		t.Helper()
		if err := admin.QueryRow(ctx, `SELECT count(*),COALESCE(max(school),'') FROM catalog_spells WHERE version_id=$1`, version).Scan(&count, &school); err != nil {
			t.Fatal(err)
		}
		return count, school
	}
	indexer := func(releaseID *uuid.UUID) (*Indexer, func()) {
		t.Helper()
		config, err := pgxpool.ParseConfig(url)
		if err != nil {
			t.Fatal(err)
		}
		if releaseID != nil {
			config.ConnConfig.RuntimeParams[ReleaseSetting] = releaseID.String()
		}
		pool, err := pgxpool.NewWithConfig(ctx, config)
		if err != nil {
			t.Fatal(err)
		}
		return NewForProduct(pool, "wow"), pool.Close
	}

	// A run outside the pipeline projects the active build; it is published,
	// so nothing may change, and the staged build is not its business.
	manual, closeManual := indexer(nil)
	if _, err := manual.RebuildSpellEffects(ctx); err != nil {
		t.Fatal(err)
	}
	closeManual()
	if count, _ := spellRows(candidate); count != 0 {
		t.Fatalf("a run without a release projected the staged build: %d spell rows", count)
	}

	// The stage of the staging release projects the staged build.
	stage, closeStage := indexer(&release)
	if _, err := stage.RebuildSpellEffects(ctx); err != nil {
		t.Fatal(err)
	}
	if count, _ := spellRows(candidate); count != 1 {
		t.Fatalf("the staging release's stage wrote %d spell rows for its build, want 1", count)
	}
	if count, school := spellRows(live); count != 1 || school != "published-fixture" {
		t.Fatalf("the published build changed: %d rows, school %q", count, school)
	}

	// Once the release has failed its stages select no build at all.
	exec(`DELETE FROM catalog_spells WHERE version_id=$1`, candidate)
	exec(`UPDATE catalog_releases SET status='failed',failed_at=now(),error_summary='fixture' WHERE id=$1`, release)
	if _, err := stage.RebuildSpellEffects(ctx); err != nil {
		t.Fatal(err)
	}
	closeStage()
	if count, _ := spellRows(candidate); count != 0 {
		t.Fatalf("a failed release was projected: %d spell rows", count)
	}
	if count, school := spellRows(live); count != 1 || school != "published-fixture" {
		t.Fatalf("the published build changed after the release failed: %d rows, school %q", count, school)
	}
}
