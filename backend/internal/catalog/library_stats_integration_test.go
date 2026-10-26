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

// TestLibraryStatsMatchPublicSummaries seeds the cases where the old
// projection disagreed with the public API and checks that every cached
// counter equals what Summaries returns. It needs a throwaway database with
// every migration applied: CATALOG_LIBRARY_STATS_DATABASE_URL.
func TestLibraryStatsMatchPublicSummaries(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_LIBRARY_STATS_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_LIBRARY_STATS_DATABASE_URL is not set")
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
	var buildID, futureBuildID int64
	var snapshotID, artifactID uuid.UUID
	if err := db.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,9177001,'99.1.0.9177001',true) RETURNING id`, productID).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version)
		VALUES($1,9177002,'99.1.0.9177002') RETURNING id`, productID).Scan(&futureBuildID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata)
		VALUES($1,$2,'blizzard_api','published',now(),now(),'{}') RETURNING id`, productID, buildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status)
		VALUES($1,$2,'blizzard_api','library-stats-fixture','https://example.invalid/fixture',
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
		{"item", 917701, "Fixture Ruby", "Рубин", 0, "cached", ""},
		{"item", 917702, "Fixture Topaz", "Топаз", 0, "remote", ""},
		{"item", 917703, "Fixture Opal", "Опал", 0, "future", ""},
		{"item", 917704, "Fixture Test Gem", "Test самоцвет", 0, "cached", ""},
		{"item", 917705, "Fixture Held Gem", "Задержанный", 0, "cached", "review"},
		{"item", 917706, "Fixture Relic", "Реликвия", 11, "cached", ""},
		{"item", 917707, "Fixture Iron Relic", "", 11, "", ""},
		{"spell", 917711, "Fixture Fireball", "Огненный шар", 0, "cached", ""},
		{"spell", 917712, "Fixture DNT Spell", "Заклинание DNT", 0, "cached", ""},
		{"spell", 917713, "Fixture Frostbolt", "", 0, "remote", ""},
	}
	for _, item := range fixtures {
		var entityID, versionID uuid.UUID
		if err := db.QueryRow(ctx, `
			INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			VALUES($1,$2,$3,$4,$5,$5) RETURNING id`, productID, item.entityType, item.externalID,
			fmt.Sprintf("library-stats-%d", item.externalID), buildID).Scan(&entityID); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
			VALUES($1,$2,digest($3,'sha256'),'{}','https://example.invalid/fixture',$4,$5,'blizzard_api') RETURNING id`,
			entityID, buildID, fmt.Sprintf("library-stats-%d", item.externalID), snapshotID, artifactID).Scan(&versionID); err != nil {
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
	// Every gem fixture, visible or not, is assigned to one facet category.
	var categoryID int64
	if err := db.QueryRow(ctx, `INSERT INTO catalog_categories(product_id,entity_type,facet,slug,path)
		VALUES($1,'item','item_subclass','library-stats-fixture','library-stats-fixture') RETURNING id`, productID).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO game_entity_categories(version_id,category_id,source)
		SELECT entity.published_version_id,$1,'gildra_classifier' FROM game_entities entity
		WHERE entity.product_id=$2 AND entity.external_id BETWEEN 917701 AND 917705`, categoryID, productID)
	exec(`SELECT refresh_catalog_read_models($1)`, productID)
	exec(`SELECT refresh_catalog_public_summary_stats($1)`, productID)
	exec(`SELECT refresh_catalog_library_datasets($1)`, productID)
	exec(`SELECT refresh_catalog_library_media_previews($1)`, productID)

	// Visible: Ruby/Topaz/Opal (gems), Relic/Iron Relic (relics),
	// Fireball/Frostbolt (spells); images only for cached media of the
	// published or an older build.
	want := map[string][2]int64{"gems": {3, 1}, "artifact-relics": {2, 1}, "spells": {2, 1}}
	service := NewService(db)
	for _, locale := range []string{"en_US", "ru_RU"} {
		datasets, err := service.LibraryDatasets(ctx, "wow", locale)
		if err != nil {
			t.Fatal(err)
		}
		bySlug := make(map[string]LibraryDataset, len(datasets))
		for _, dataset := range datasets {
			bySlug[dataset.Slug] = dataset
		}
		for slug, expected := range want {
			var listed, withIcon int64
			cursor := ""
			for {
				page, err := service.Summaries(ctx, SummaryParams{Product: "wow", Locale: locale, Dataset: slug, Limit: 100, Cursor: cursor})
				if err != nil {
					t.Fatal(err)
				}
				for _, entity := range page.Entities {
					listed++
					if entity.IconURL != nil {
						withIcon++
					}
				}
				if !page.HasMore {
					break
				}
				cursor = page.NextCursor
			}
			stats := bySlug[slug]
			if listed != expected[0] || withIcon != expected[1] {
				t.Fatalf("%s %s summaries listed=%d icons=%d, want %v", slug, locale, listed, withIcon, expected)
			}
			if stats.EntityCount != listed || stats.ImageCount != withIcon {
				t.Fatalf("%s %s stats entities=%d images=%d, summaries listed=%d icons=%d",
					slug, locale, stats.EntityCount, stats.ImageCount, listed, withIcon)
			}
			page, err := service.Summaries(ctx, SummaryParams{Product: "wow", Locale: locale, Dataset: slug, Limit: 1, IncludeTotal: true})
			if err != nil {
				t.Fatal(err)
			}
			if page.Total == nil || *page.Total != listed {
				t.Fatalf("%s %s total=%v, want %d", slug, locale, page.Total, listed)
			}
		}
		page, err := service.Summaries(ctx, SummaryParams{Product: "wow", Locale: locale, Type: "spell", Limit: 1, IncludeTotal: true})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total == nil || *page.Total != 2 {
			t.Fatalf("spell type total %s = %v, want 2", locale, page.Total)
		}
	}

	// A projection older than its dataset definition is not served: the total
	// is counted exactly instead.
	exec(`UPDATE catalog_library_dataset_stats SET entity_count=999 WHERE dataset_slug='gems'`)
	exec(`UPDATE catalog_library_dataset_definitions SET updated_at=now()+interval '1 minute' WHERE slug='gems'`)
	stalePage, err := NewService(db).Summaries(ctx, SummaryParams{Product: "wow", Locale: "ru_RU", Dataset: "gems", Limit: 1, IncludeTotal: true})
	if err != nil {
		t.Fatal(err)
	}
	if stalePage.Total == nil || *stalePage.Total != want["gems"][0] {
		t.Fatalf("stale gems total=%v, want exact %d", stalePage.Total, want["gems"][0])
	}

	var categoryCount int64
	if err := db.QueryRow(ctx, `SELECT entity_count FROM catalog_category_stats WHERE category_id=$1`, categoryID).Scan(&categoryCount); err != nil {
		t.Fatal(err)
	}
	facetPage, err := service.Summaries(ctx, SummaryParams{Product: "wow", Locale: "ru_RU", Type: "item",
		Facets: []string{"library-stats-fixture"}, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	if categoryCount != 3 || int64(len(facetPage.Entities)) != categoryCount {
		t.Fatalf("category count=%d facet listed=%d, want 3 and equal", categoryCount, len(facetPage.Entities))
	}

	var relicID, gemID uuid.UUID
	if err := db.QueryRow(ctx, `SELECT id FROM game_entities WHERE product_id=$1 AND external_id=917706`, productID).Scan(&relicID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `SELECT id FROM game_entities WHERE product_id=$1 AND external_id=917701`, productID).Scan(&gemID); err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		dataset string
		entity  uuid.UUID
		want    bool
	}{{"gems", relicID, false}, {"artifact-relics", relicID, true}, {"gems", gemID, true}, {"artifact-relics", gemID, false}} {
		contains, err := service.DatasetContainsEntity(ctx, check.dataset, check.entity)
		if err != nil {
			t.Fatal(err)
		}
		if contains != check.want {
			t.Fatalf("DatasetContainsEntity(%s, %s)=%v, want %v", check.dataset, check.entity, contains, check.want)
		}
	}
}
