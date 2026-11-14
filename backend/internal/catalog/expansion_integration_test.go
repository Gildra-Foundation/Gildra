//go:build integration

package catalog

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestMidnightScopeFullSchema seeds the cases where the old
// projection disagreed with the public API and checks that every cached
// counter equals what Summaries returns. It needs a throwaway database with
// every migration applied: MIDNIGHT_SCOPE_FULL_DATABASE_URL.
func TestMidnightScopeFullSchema(t *testing.T) {
	databaseURL := os.Getenv("MIDNIGHT_SCOPE_FULL_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("MIDNIGHT_SCOPE_FULL_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}

	var productID int16
	if err := db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	exec(`DELETE FROM catalog_entity_expansions WHERE product_id=$1 AND external_id BETWEEN 919001 AND 919013`, productID)
	exec(`DELETE FROM catalog_entity_usability WHERE product_id=$1 AND external_id BETWEEN 919001 AND 919013`, productID)
	exec(`DELETE FROM catalog_entity_media WHERE external_id BETWEEN 919001 AND 919013`)
	exec(`DELETE FROM game_entities WHERE product_id=$1 AND external_id BETWEEN 919001 AND 919013`, productID)
	var buildID, futureBuildID int64
	var snapshotID, artifactID uuid.UUID
	if err := db.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,9190001,'99.1.0.9190001',true) ON CONFLICT(product_id,build_number) DO UPDATE SET version=EXCLUDED.version RETURNING id`, productID).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version)
		VALUES($1,9190002,'99.1.0.9190002') ON CONFLICT(product_id,build_number) DO UPDATE SET version=EXCLUDED.version RETURNING id`, productID).Scan(&futureBuildID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata)
		VALUES($1,$2,'blizzard_api','published',now(),now(),'{}') RETURNING id`, productID, buildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status)
		VALUES($1,$2,'blizzard_api','midnight-scope-fixture','https://example.invalid/fixture',
			decode(repeat('ab',32),'hex'),1,'ready') RETURNING id`, snapshotID, buildID).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO catalog_published_source_dependencies(source) VALUES('blizzard_api') ON CONFLICT DO NOTHING`)

	type fixture struct {
		entityType string
		externalID int64
		nameEN     string
		nameRU     string
		subclass   int
		media      string // cached, remote, future or empty
		decision   string // usability decision or empty
	}
	fixtures := []fixture{
		{"item", 919001, "Fixture Ruby", "Рубин", 0, "cached", ""},
		{"item", 919002, "Fixture Topaz", "Топаз", 0, "remote", ""},
		{"item", 919003, "Fixture Opal", "Опал", 0, "future", ""},
		{"item", 919004, "Fixture Test Gem", "Test самоцвет", 0, "cached", ""},
		{"item", 919005, "Fixture Held Gem", "Задержанный", 0, "cached", "review"},
		{"item", 919006, "Fixture Relic", "Реликвия", 11, "cached", ""},
		{"item", 919007, "Fixture Iron Relic", "", 11, "", ""},
		{"spell", 919011, "Fixture Fireball", "Огненный шар", 0, "cached", ""},
		{"spell", 919012, "Fixture DNT Spell", "Заклинание DNT", 0, "cached", ""},
		{"spell", 919013, "Fixture Frostbolt", "", 0, "remote", ""},
	}
	for _, item := range fixtures {
		var entityID, versionID uuid.UUID
		if err := db.QueryRow(ctx, `
			INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			VALUES($1,$2,$3,$4,$5,$5) RETURNING id`, productID, item.entityType, item.externalID,
			fmt.Sprintf("midnight-scope-%d", item.externalID), buildID).Scan(&entityID); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
			VALUES($1,$2,digest($3,'sha256'),'{}','https://example.invalid/fixture',$4,$5,'blizzard_api') RETURNING id`,
			entityID, buildID, fmt.Sprintf("midnight-scope-%d", item.externalID), snapshotID, artifactID).Scan(&versionID); err != nil {
			t.Fatal(err)
		}
		exec(`UPDATE game_entities SET latest_version_id=$2,published_version_id=$2 WHERE id=$1`, entityID, versionID)
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name) VALUES($1,'en_US',$2)`, versionID, item.nameEN)
		if item.nameRU != "" {
			exec(`INSERT INTO game_entity_localizations(version_id,locale,name) VALUES($1,'ru_RU',$2)`, versionID, item.nameRU)
		}
		if item.entityType == "item" {
			exec(`INSERT INTO catalog_items(version_id,item_class_id,item_subclass_id) VALUES($1,3,$2)`, versionID, item.subclass)
		}
		if item.decision != "" {
			exec(`INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code,source_artifact_id)
				VALUES($1,$2,$3,$4,$5,'fixture',$6)`, productID, buildID, item.entityType, item.externalID, item.decision, artifactID)
		}
		if item.media == "" {
			continue
		}
		mediaBuild := buildID
		if item.media == "future" {
			mediaBuild = futureBuildID
		}
		if item.media == "remote" {
			exec(`INSERT INTO catalog_entity_media(build_id,entity_type,external_id,entity_id,media_kind,asset_key,source,source_url,source_artifact_id,is_primary)
				VALUES($1,$2,$3,$4,'icon','fixture','blizzard_api','https://example.invalid/icon.jpg',$5,true)`,
				mediaBuild, item.entityType, item.externalID, entityID, artifactID)
			continue
		}
		exec(`INSERT INTO catalog_entity_media(build_id,entity_type,external_id,entity_id,media_kind,asset_key,source,source_url,
				source_artifact_id,is_primary,cache_status,mime_type,cache_key,cached_url,cached_content_hash,cached_byte_size,cached_at)
			VALUES($1,$2,$3,$4,'icon','fixture','blizzard_api','https://example.invalid/icon.jpg',$5,true,'cached','image/jpeg',
				'ab/'||repeat('c',64)||'.jpg','https://example.invalid/media/fixture.jpg',decode(repeat('cd',32),'hex'),10,now())`,
			mediaBuild, item.entityType, item.externalID, entityID, artifactID)
	}
	exec(`INSERT INTO catalog_entity_expansions(product_id,build_id,entity_type,external_id,expansion_id,classification,evidence_kind,evidence_build_id,source_artifact_id)
 SELECT $1,$2,'item',external_id,(SELECT id FROM catalog_expansions WHERE expansion_key='midnight'),'confirmed','curated',$2,$3
 FROM game_entities WHERE product_id=$1 AND external_id IN (919001,919005)`, productID, buildID, artifactID)
	exec(`INSERT INTO catalog_entity_expansions(product_id,build_id,entity_type,external_id,expansion_id,classification,evidence_kind,evidence_build_id,source_artifact_id)
 VALUES($1,$2,'item',919002,(SELECT id FROM catalog_expansions WHERE expansion_key='midnight'),'confirmed','curated',$2,$3)`, productID, futureBuildID, artifactID)
	exec(`UPDATE catalog_entity_usability SET decision='eligible',reason_code='fixture_verified' WHERE product_id=$1 AND external_id=919001`, productID)
	exec(`SELECT refresh_catalog_read_models($1)`, productID)
	service := NewService(db)
	for _, locale := range []string{"en_US", "ru_RU"} {
		for _, p := range []SummaryParams{
			{Product: "wow", Dataset: "gems", Expansion: "midnight", Locale: locale, Limit: 100, IncludeTotal: true},
			{Product: "wow", Type: "item", Expansion: "midnight", Locale: locale, Limit: 100, Query: "919001", IncludeTotal: true},
			{Product: "wow", Type: "item", Expansion: "midnight", Locale: locale, Limit: 100, ExternalIDs: []int64{919001, 919002}},
		} {
			page, err := service.Summaries(ctx, p)
			if err != nil {
				t.Fatal(err)
			}
			if len(page.Entities) != 1 || page.Entities[0].ExternalID != 919001 {
				t.Fatalf("scope mismatch params=%+v page=%+v", p, page)
			}
			if p.IncludeTotal && (page.Total == nil || *page.Total != 1) {
				t.Fatalf("bad scoped total %+v", page.Total)
			}
			if _, err := service.GetInExpansion(ctx, page.Entities[0].ID, locale, "midnight"); err != nil {
				t.Fatal(err)
			}
		}
		datasets, err := service.LibraryDatasetsInExpansion(ctx, "wow", locale, "midnight")
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range datasets {
			if d.Slug == "gems" && (d.EntityCount != 1 || d.ImageCount != 1) {
				t.Fatalf("scoped stats %+v", d)
			}
		}
		var legacyID uuid.UUID
		if err := db.QueryRow(ctx, `SELECT id FROM game_entities WHERE product_id=$1 AND entity_type='item' AND external_id=919002`, productID).Scan(&legacyID); err != nil {
			t.Fatal(err)
		}
		if _, err := service.GetInExpansion(ctx, legacyID, locale, "midnight"); err != ErrNotFound {
			t.Fatalf("wrong build detail should be404: %v", err)
		}
		if _, err := service.Get(ctx, legacyID, locale); err != nil {
			t.Fatalf("legacy detail broken: %v", err)
		}
	}
	// A read-model publication changes the cache epoch; no 30s stale count survives.
	exec(`UPDATE catalog_entity_expansions SET classification='unclassified', expansion_id=NULL WHERE product_id=$1 AND external_id=919001`, productID)
	exec(`UPDATE catalog_read_model_state SET generation=generation+1 WHERE product_id=$1`, productID)
	datasets, err := service.LibraryDatasetsInExpansion(ctx, "wow", "ru_RU", "midnight")
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range datasets {
		if d.Slug == "gems" && d.EntityCount != 0 {
			t.Fatalf("publication failed to invalidate scoped cache: %+v", d)
		}
	}
	exec(`UPDATE catalog_entity_expansions SET classification='confirmed', expansion_id=(SELECT id FROM catalog_expansions WHERE expansion_key='midnight') WHERE product_id=$1 AND external_id=919001`, productID)

}
