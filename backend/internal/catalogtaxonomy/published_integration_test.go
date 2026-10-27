//go:build integration

package catalogtaxonomy

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Needs a throwaway database with every migration applied:
// CATALOG_TAXONOMY_DATABASE_URL.
func TestAlignClassifiedCategories(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_TAXONOMY_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_TAXONOMY_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var retailID, classicID int16
	if err := db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&retailID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow_classic'`).Scan(&classicID); err != nil {
		t.Fatal(err)
	}
	build := func(product int16, number int) int64 {
		var id int64
		if err := db.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version) VALUES($1,$2,$3) RETURNING id`,
			product, number, "9.9.9."+uuid.NewString()[:8]).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	publishedBuild, latestBuild, classicBuild := build(retailID, 9178001), build(retailID, 9178002), build(classicID, 9178003)
	version := func(entityID uuid.UUID, buildID int64, tag string) uuid.UUID {
		var snapshotID, artifactID, id uuid.UUID
		if err := db.QueryRow(ctx, `
			INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata)
			SELECT product_id,id,'blizzard_api','published',now(),now(),'{}' FROM game_builds WHERE id=$1
			RETURNING id`, buildID).Scan(&snapshotID); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, `
			INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status)
			VALUES($1,$2,'blizzard_api',$3,'https://example.invalid/fixture',decode(repeat('ab',32),'hex'),1,'ready')
			RETURNING id`, snapshotID, buildID, tag).Scan(&artifactID); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, `INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
			VALUES($1,$2,digest($3,'sha256'),'{}','https://example.invalid/fixture',$4,$5,'blizzard_api') RETURNING id`,
			entityID, buildID, tag, snapshotID, artifactID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	entity := func(entityType string, product int16, buildID int64, externalID int64) uuid.UUID {
		var id uuid.UUID
		if err := db.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			VALUES($1,$2,$3,$4,$5,$5) RETURNING id`, product, entityType, externalID, "align-fixture-"+uuid.NewString()[:8], buildID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	retail := entity("mount", retailID, publishedBuild, 917801)
	retailPublished := version(retail, publishedBuild, "retail-published")
	retailLatest := version(retail, latestBuild, "retail-latest")
	current := entity("mount", retailID, publishedBuild, 917802)
	currentVersion := version(current, publishedBuild, "retail-current")
	classic := entity("mount", classicID, classicBuild, 917801)
	classicVersion := version(classic, classicBuild, "classic")
	for _, update := range []struct {
		entity, published, latest uuid.UUID
	}{{retail, retailPublished, retailLatest}, {current, currentVersion, currentVersion}, {classic, classicVersion, classicVersion}} {
		if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=$2,latest_version_id=$3 WHERE id=$1`,
			update.entity, update.published, update.latest); err != nil {
			t.Fatal(err)
		}
	}
	var categoryID int64
	if err := db.QueryRow(ctx, `INSERT INTO catalog_categories(product_id,entity_type,facet,slug,path)
		VALUES($1,'mount','value','align-fixture','align-fixture') RETURNING id`, retailID).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	for _, versionID := range []uuid.UUID{retailLatest, currentVersion, classicVersion} {
		if _, err := db.Exec(ctx, `INSERT INTO game_entity_categories(version_id,category_id,source) VALUES($1,$2,'gildra_classifier')`,
			versionID, categoryID); err != nil {
			t.Fatal(err)
		}
	}

	var removed, mirrored int64
	if err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		removed, mirrored, err = alignClassifiedCategories(ctx, tx, retailID, "")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if removed != 1 || mirrored != 1 {
		t.Fatalf("removed=%d mirrored=%d, want 1 and 1", removed, mirrored)
	}
	rows, err := db.Query(ctx, `SELECT version_id FROM game_entity_categories WHERE category_id=$1`, categoryID)
	if err != nil {
		t.Fatal(err)
	}
	got, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		t.Fatal(err)
	}
	want := map[uuid.UUID]bool{retailLatest: true, retailPublished: true, currentVersion: true}
	if len(got) != len(want) {
		t.Fatalf("assigned versions %v, want latest and published retail versions only", got)
	}
	for _, versionID := range got {
		if !want[versionID] {
			t.Fatalf("unexpected assignment of version %s", versionID)
		}
	}

	// Items are classified on both versions by their own facts, for the
	// category's product only.
	item := entity("item", retailID, publishedBuild, 917811)
	itemPublished := version(item, publishedBuild, "item-published")
	itemLatest := version(item, latestBuild, "item-latest")
	classicItem := entity("item", classicID, classicBuild, 917811)
	classicItemVersion := version(classicItem, classicBuild, "item-classic")
	if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=$2,latest_version_id=$3 WHERE id=$1`, item, itemPublished, itemLatest); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=$2,latest_version_id=$2 WHERE id=$1`, classicItem, classicItemVersion); err != nil {
		t.Fatal(err)
	}
	for _, versionID := range []uuid.UUID{itemPublished, itemLatest, classicItemVersion} {
		if _, err := db.Exec(ctx, `INSERT INTO catalog_items(version_id,item_class_id,item_subclass_id) VALUES($1,3,11)`, versionID); err != nil {
			t.Fatal(err)
		}
	}
	var itemCategoryID int64
	if err := db.QueryRow(ctx, `INSERT INTO catalog_categories(product_id,entity_type,facet,slug,path)
		VALUES($1,'item','item_subclass','align-item-fixture','align-item-fixture') RETURNING id`, retailID).Scan(&itemCategoryID); err != nil {
		t.Fatal(err)
	}
	if err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		_, err := classifyItem(ctx, tx, itemCategoryID, "item_subclass", map[string]any{"item_class": 3, "item_subclass": 11})
		return err
	}); err != nil {
		t.Fatal(err)
	}
	rows, err = db.Query(ctx, `SELECT version_id FROM game_entity_categories WHERE category_id=$1 ORDER BY version_id`, itemCategoryID)
	if err != nil {
		t.Fatal(err)
	}
	got, err = pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || !(got[0] == itemPublished || got[1] == itemPublished) || !(got[0] == itemLatest || got[1] == itemLatest) {
		t.Fatalf("item category versions %v, want published %s and latest %s only", got, itemPublished, itemLatest)
	}
}
