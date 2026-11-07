package catalogtaxonomy

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"math/rand/v2"
	"os"
	"testing"
)

func TestCandidateRebuildPreservesPublishedFacts(t *testing.T) {
	url := os.Getenv("LIBFIX_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("disposable database required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	var product int16
	if err := db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&product); err != nil {
		t.Fatal(err)
	}
	build := func(n int) int64 {
		var id int64
		if err := db.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,$2,$3,true) RETURNING id`, product, n, uuid.NewString()).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	seed := rand.IntN(100000000) + 1000000
	old, next := build(seed), build(seed+1)
	var entity uuid.UUID
	if err := db.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id) VALUES($1,'spell',$2) RETURNING id`, product, seed).Scan(&entity); err != nil {
		t.Fatal(err)
	}
	version := func(b int64) uuid.UUID {
		var id uuid.UUID
		if err := db.QueryRow(ctx, `WITH snapshot AS (INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($3,$2,'wago_tools','staging') RETURNING id), artifact AS (INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) SELECT id,$2,'wago_tools',$1::text,'https://example.invalid',decode(repeat('ab',32),'hex'),1,'ready' FROM snapshot RETURNING id,snapshot_id) INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id) SELECT $1::uuid,$2,decode(repeat('ab',32),'hex'),'{}','wago_tools',snapshot_id,id FROM artifact RETURNING id`, entity, b, product).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	live, candidate := version(old), version(next)
	exec(`UPDATE game_entities SET published_version_id=$2,latest_version_id=$3 WHERE id=$1`, entity, live, candidate)
	exec(`INSERT INTO catalog_spell_effects(spell_version_id,effect_index,base_points,source) VALUES($1,0,123,'db2'),($2,0,456,'db2')`, live, candidate)
	exec(`INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type) VALUES($1,$1,$2,'mentions')`, entity, old)
	exec(`INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,content_hash) VALUES($1,'en_US','Live tooltip',decode(repeat('ab',32),'hex'))`, live)
	retailProduct, retailEntity := product, entity
	if err := db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow_classic'`).Scan(&product); err != nil {
		t.Fatal(err)
	}
	classicBuild := build(seed + 2)
	if err := db.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id) VALUES($1,'spell',$2) RETURNING id`, product, seed).Scan(&entity); err != nil {
		t.Fatal(err)
	}
	classicVersion := version(classicBuild)
	exec(`UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`, entity, classicVersion)
	exec(`INSERT INTO catalog_spell_effects(spell_version_id,effect_index,base_points,source) VALUES($1,0,789,'db2')`, classicVersion)
	product, entity = retailProduct, retailEntity

	i := NewForProduct(db, "wow")
	if _, err := i.RebuildSpellEffects(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := i.RebuildGraph(ctx); err != nil {
		t.Fatal(err)
	}
	// Model a publication failure: the release is recorded, public pointer stays old.
	exec(`INSERT INTO catalog_releases(product_id,build_id,build_version,status,failed_at,error_summary) VALUES($1,$2,'fixture','failed',now(),'fixture publication failure')`, product, next)
	var publicVersion uuid.UUID
	if err := db.QueryRow(ctx, `SELECT published_version_id FROM game_entities WHERE id=$1`, entity).Scan(&publicVersion); err != nil || publicVersion != live {
		t.Fatalf("public pointer changed: %v %v", publicVersion, err)
	}

	var points, links, count int
	if err := db.QueryRow(ctx, `SELECT base_points FROM catalog_spell_effects WHERE spell_version_id=$1`, live).Scan(&points); err != nil || points != 123 {
		t.Fatalf("live effects: %d %v", points, err)
	}
	if err := db.QueryRow(ctx, `SELECT count(*) FROM game_entity_links WHERE build_id=$1`, old).Scan(&links); err != nil || links != 1 {
		t.Fatalf("live links: %d %v", links, err)
	}
	if err := db.QueryRow(ctx, `SELECT count(*) FROM catalog_spell_effects WHERE spell_version_id=$1`, candidate).Scan(&count); err != nil || count != 0 {
		t.Fatalf("candidate cleanup: %d %v", count, err)
	}
	if _, err := i.RebuildItemVariants(ctx); err != nil {
		t.Fatal(err)
	}
	var text string
	if err := db.QueryRow(ctx, `SELECT plain_text FROM catalog_entity_tooltips WHERE version_id=$1`, live).Scan(&text); err != nil || text != "Live tooltip" {
		t.Fatalf("live tooltip changed: %q %v", text, err)
	}
	if err := db.QueryRow(ctx, `SELECT base_points FROM catalog_spell_effects WHERE spell_version_id=$1`, classicVersion).Scan(&points); err != nil || points != 789 {
		t.Fatalf("another product changed: %d %v", points, err)
	}

}
