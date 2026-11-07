//go:build integration

package catalog

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestSitemapEntriesListOnlyServedRecords seeds every reason a record page
// answers 404 or renders a blank name and checks the sitemap against Get. It
// needs a throwaway database with every migration applied:
// CATALOG_SITEMAP_DATABASE_URL.
func TestSitemapEntriesListOnlyServedRecords(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_SITEMAP_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_SITEMAP_DATABASE_URL is not set")
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
	exec(`INSERT INTO catalog_entity_type_registry(product_id,entity_type,is_public) VALUES($1,'spell',true)
		ON CONFLICT (product_id,entity_type) DO UPDATE SET is_public=true`, productID)
	var buildID int64
	var snapshotID, artifactID, ruArtifactID uuid.UUID
	if err := db.QueryRow(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,9178001,'99.1.0.9178001',true) RETURNING id`, productID).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata)
		VALUES($1,$2,'blizzard_api','published',now(),now(),'{}') RETURNING id`, productID, buildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	for key, target := range map[string]*uuid.UUID{"sitemap-fixture": &artifactID, "sitemap-fixture-ru": &ruArtifactID} {
		locale := ""
		if key == "sitemap-fixture-ru" {
			locale = "ru_RU"
		}
		if err := db.QueryRow(ctx, `
			INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,locale,source_url,content_hash,byte_size,status)
			VALUES($1,$2,'blizzard_api',$3,$4,'https://example.invalid/fixture',decode(repeat('ab',32),'hex'),1,'ready')
			RETURNING id`, snapshotID, buildID, key, locale).Scan(target); err != nil {
			t.Fatal(err)
		}
	}

	type fixture struct {
		externalID         int64
		nameEN, slugEN     string
		nameRU, slugRU     string
		ruProof            bool
		unpublished        bool
		deleted            bool
		decision           string
		wantListed         bool
		wantSlug, wantSlRu string // wantSlRu "" means null
	}
	fixtures := []fixture{
		{externalID: 917801, nameEN: "Sitemap Fireball", slugEN: "sitemap-fireball", nameRU: "Огненный шар", slugRU: "ognennyj-shar",
			wantListed: true, wantSlug: "sitemap-fireball", wantSlRu: "ognennyj-shar"},
		// Russian slug missing: the ru_RU page uses the English slug.
		{externalID: 917802, nameEN: "Sitemap Frostbolt", slugEN: "sitemap-frostbolt", nameRU: "Ледяная стрела",
			wantListed: true, wantSlug: "sitemap-frostbolt", wantSlRu: "sitemap-frostbolt"},
		// No Russian name: locale fallback.
		{externalID: 917803, nameEN: "Sitemap Arcane", slugEN: "sitemap-arcane", wantListed: true, wantSlug: "sitemap-arcane"},
		// Russian name copied from English without proof: locale fallback.
		{externalID: 917804, nameEN: "1000", slugEN: "sitemap-1000", nameRU: "1000", slugRU: "ru-1000",
			wantListed: true, wantSlug: "sitemap-1000"},
		// Same name, but an imported ru_RU artifact proves it.
		{externalID: 917805, nameEN: "2000", slugEN: "sitemap-2000", nameRU: "2000", slugRU: "ru-2000", ruProof: true,
			wantListed: true, wantSlug: "sitemap-2000", wantSlRu: "ru-2000"},
		// Latin letters in the Russian name: the web blanks it.
		{externalID: 917806, nameEN: "Sitemap Shadow", slugEN: "sitemap-shadow", nameRU: "Shadow стрела", slugRU: "shadow-strela",
			wantListed: true, wantSlug: "sitemap-shadow"},
		// Junk Russian name: Get answers 404 for ru_RU.
		{externalID: 917807, nameEN: "Sitemap Holy", slugEN: "sitemap-holy", nameRU: "Свет [ph]", slugRU: "svet-ph",
			wantListed: true, wantSlug: "sitemap-holy"},
		// English slug missing: canonical slug.
		{externalID: 917808, nameEN: "Sitemap Nature", nameRU: "Природа",
			wantListed: true, wantSlug: "sitemap-917808", wantSlRu: "sitemap-917808"},
		{externalID: 917811, nameEN: "Sitemap Unpublished", unpublished: true},
		{externalID: 917812, nameEN: "Sitemap Deleted", deleted: true},
		{externalID: 917813, nameEN: "Sitemap DNT Spell", nameRU: "Заклинание"},
		{externalID: 917814, nameEN: "Sitemap Held", nameRU: "Задержанный", decision: "review"},
		{externalID: 917815, nameEN: "Огненный шар", nameRU: "Огненный шар"},
		{externalID: 917816, nameEN: ""},
	}
	ids := make(map[int64]uuid.UUID, len(fixtures))
	for _, item := range fixtures {
		var entityID, versionID uuid.UUID
		if err := db.QueryRow(ctx, `
			INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			VALUES($1,'spell',$2,$3,$4,$4) RETURNING id`, productID, item.externalID,
			fmt.Sprintf("sitemap-%d", item.externalID), buildID).Scan(&entityID); err != nil {
			t.Fatal(err)
		}
		ids[item.externalID] = entityID
		if err := db.QueryRow(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
			VALUES($1,$2,digest($3,'sha256'),'{}','https://example.invalid/fixture',$4,$5,'blizzard_api') RETURNING id`,
			entityID, buildID, fmt.Sprintf("sitemap-%d", item.externalID), snapshotID, artifactID).Scan(&versionID); err != nil {
			t.Fatal(err)
		}
		exec(`UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`, entityID, versionID)
		if !item.unpublished {
			exec(`UPDATE game_entities SET published_version_id=$2 WHERE id=$1`, entityID, versionID)
		}
		if item.deleted {
			exec(`UPDATE game_entities SET deleted_at=now() WHERE id=$1`, entityID)
		}
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name,slug) VALUES($1,'en_US',$2,$3)`,
			versionID, item.nameEN, item.slugEN)
		if item.nameRU != "" {
			exec(`INSERT INTO game_entity_localizations(version_id,locale,name,slug) VALUES($1,'ru_RU',$2,$3)`,
				versionID, item.nameRU, item.slugRU)
		}
		if item.ruProof {
			exec(`INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id) VALUES($1,'ru_RU',$2)`,
				versionID, ruArtifactID)
		}
		if item.decision != "" {
			exec(`INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code,source_artifact_id)
				VALUES($1,$2,'spell',$3,$4,'fixture',$5)`, productID, buildID, item.externalID, item.decision, artifactID)
		}
	}

	service := NewService(db)
	entries, err := service.SitemapEntries(ctx, "wow", "spell", "")
	if err != nil {
		t.Fatal(err)
	}
	listed := make(map[uuid.UUID]SitemapEntry, len(entries))
	for index, entry := range entries {
		if index > 0 && entries[index-1].ID.String() >= entry.ID.String() {
			t.Fatal("sitemap entries are not ordered by id")
		}
		listed[entry.ID] = entry
	}
	for _, item := range fixtures {
		id := ids[item.externalID]
		entry, ok := listed[id]
		if ok != item.wantListed {
			t.Fatalf("%d (%q) listed=%v, want %v", item.externalID, item.nameEN, ok, item.wantListed)
		}
		en, getErr := service.Get(ctx, id, "en_US")
		if !item.wantListed {
			// Every excluded fixture except the Cyrillic English name is a 404.
			if item.externalID != 917815 && !errors.Is(getErr, ErrNotFound) {
				t.Fatalf("%d excluded from sitemap but Get(en_US) err=%v", item.externalID, getErr)
			}
			continue
		}
		if getErr != nil {
			t.Fatalf("%d listed but Get(en_US) failed: %v", item.externalID, getErr)
		}
		if entry.Slug != item.wantSlug || en.Slug != entry.Slug {
			t.Fatalf("%d slug=%q Get slug=%q, want %q", item.externalID, entry.Slug, en.Slug, item.wantSlug)
		}
		if item.wantSlRu == "" {
			if entry.SlugRu != nil {
				t.Fatalf("%d slugRu=%q, want null", item.externalID, *entry.SlugRu)
			}
			continue
		}
		if entry.SlugRu == nil || *entry.SlugRu != item.wantSlRu {
			t.Fatalf("%d slugRu=%v, want %q", item.externalID, entry.SlugRu, item.wantSlRu)
		}
		ru, err := service.Get(ctx, id, "ru_RU")
		if err != nil {
			t.Fatalf("%d slugRu set but Get(ru_RU) failed: %v", item.externalID, err)
		}
		if ru.Slug != *entry.SlugRu || ru.LocaleFallback {
			t.Fatalf("%d Get(ru_RU) slug=%q fallback=%v, sitemap slugRu=%q", item.externalID, ru.Slug, ru.LocaleFallback, *entry.SlugRu)
		}
	}

	exec(`UPDATE catalog_entity_type_registry SET is_public=false WHERE product_id=$1 AND entity_type='spell'`, productID)
	hidden, err := service.SitemapEntries(ctx, "wow", "spell", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(hidden) != 0 {
		t.Fatalf("non-public entity type listed %d entries", len(hidden))
	}
}
