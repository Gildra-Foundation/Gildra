package catalog

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"math/rand/v2"
	"os"
	"testing"
)

func TestRelationshipPublicIntegrity(t *testing.T) {
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
	var product, classic int16
	db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&product)
	db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow_classic'`).Scan(&classic)
	for name, want := range map[string]bool{"Conversation (DNT)": false, "<DNT> Eons Fringe": false, "[PH] Reward": false, "11.0 Warband Testing 2": false, "Temple of Elune": true, "Fishing contest": true} {
		var visible bool
		err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM (VALUES($1::text)) l(name) CROSS JOIN (VALUES(NULL::text)) fallback(name) WHERE true `+publicCatalogDisplayNamePredicate("l", "fallback")+`)`, name).Scan(&visible)
		if err != nil || visible != want {
			t.Fatalf("display name %q: %v %v", name, visible, err)
		}
	}

	seed := rand.IntN(8000000) + 1000000
	var build int64
	if err := db.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version) VALUES($1,$2,'fixture') RETURNING id`, product, seed).Scan(&build); err != nil {
		t.Fatal(err)
	}
	entity := func(name string, p int16) (uuid.UUID, uuid.UUID) {
		t.Helper()
		seed++
		var id, version uuid.UUID
		if err := db.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id) VALUES($1,'item',$2) RETURNING id`, p, seed).Scan(&id); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, `WITH snapshot AS (INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($3,$2,'wago_tools','staging') RETURNING id), artifact AS (INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) SELECT id,$2,'wago_tools',$1::text,'https://example.invalid',decode(repeat('ab',32),'hex'),1,'ready' FROM snapshot RETURNING id,snapshot_id) INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id) SELECT $1::uuid,$2,decode(repeat('ab',32),'hex'),'{}','wago_tools',snapshot_id,id FROM artifact RETURNING id`, id, build, p).Scan(&version); err != nil {
			t.Fatal(err)
		}
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name) VALUES($1,'en_US',$2),($1,'ru_RU',$2)`, version, name)
		exec(`UPDATE game_entities SET latest_version_id=$2,published_version_id=$2 WHERE id=$1`, id, version)
		return id, version
	}
	source, _ := entity("Source", product)
	good, _ := entity("Temple of contest", product)
	hidden, _ := entity("Conversation (DNT)", product)
	unpublished, _ := entity("Unpublished", product)
	deleted, _ := entity("Deleted", product)
	excluded, _ := entity("Excluded", product)
	foreign, _ := entity("Classic target", classic)
	exec(`UPDATE game_entities SET published_version_id=NULL WHERE id=$1`, unpublished)
	exec(`UPDATE game_entities SET deleted_at=now() WHERE id=$1`, deleted)
	exec(`INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code) SELECT product_id,$2,entity_type,external_id,'excluded','fixture' FROM game_entities WHERE id=$1`, excluded, build)
	for _, id := range []uuid.UUID{good, hidden, unpublished, deleted, excluded, foreign} {
		exec(`INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type) VALUES($1,$2,$3,'creates')`, source, id, build)
	}
	exec(`UPDATE game_entities SET external_id=(SELECT external_id FROM game_entities WHERE id=$2) WHERE id=$1`, foreign, good)
	service := NewService(db)
	for _, locale := range []string{"en_US", "ru_RU"} {
		page, err := service.Relationships(ctx, RelationshipParams{EntityID: source, Locale: locale, Limit: 1})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != 1 || len(page.Relationships) != 1 || page.Relationships[0].Entity.ID != good || page.HasMore {
			t.Fatalf("incorrect public page: %#v", page)
		}
		if _, err := service.Get(ctx, good, locale); err != nil {
			t.Fatal(err)
		}
		for _, id := range []uuid.UUID{hidden, unpublished, deleted, excluded} {
			if _, err := service.Get(ctx, id, locale); !errors.Is(err, ErrNotFound) {
				t.Fatalf("hidden target detail: %v", err)
			}
		}
	}
	// Both API paths use the same resolver, including retention and review status.
	exec(`UPDATE catalog_source_policies SET review_status='reviewed',retention_days=1 WHERE source='wago_tools'`)
	exec(`INSERT INTO catalog_published_source_dependencies(source) VALUES('wago_tools') ON CONFLICT DO NOTHING`)
	exec(`INSERT INTO catalog_entity_media(build_id,entity_id,entity_type,external_id,media_kind,asset_key,source,source_url,cached_url,cache_status,source_artifact_id,cached_content_hash,cached_byte_size,cached_at,is_primary,cache_key,mime_type)
 SELECT $2,e.id,'item',e.external_id,'icon','fixture','wago_tools','https://example.invalid/icon','https://example.invalid/cached','cached',v.source_artifact_id,decode(repeat('ab',32),'hex'),1,now(),true,'ab/'||replace(e.id::text,'-','')||replace(e.id::text,'-','')||'.png','image/png'
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id WHERE e.id=$1`, good, build)
	var externalID int64
	db.QueryRow(ctx, `SELECT external_id FROM game_entities WHERE id=$1`, good).Scan(&externalID)
	for _, state := range []string{"reviewed", "expired_cache", "blocked"} {
		if state == "expired_cache" {
			exec(`UPDATE catalog_entity_media SET cached_at=now()-interval '2 days' WHERE entity_id=$1`, good)
		}
		if state == "blocked" {
			exec(`UPDATE catalog_source_policies SET review_status='blocked' WHERE source='wago_tools'`)
		}
		detail, err := service.Get(ctx, good, "en_US")
		if err != nil {
			t.Fatal(err)
		}
		summary, err := service.Summaries(ctx, SummaryParams{Product: "wow", Type: "item", Locale: "en_US", ExternalIDs: []int64{externalID}, Limit: 100})
		if err != nil {
			t.Fatal(err)
		}
		if len(summary.Entities) != 1 {
			t.Fatalf("summary missing: %#v", summary)
		}
		a, b := detail.IconURL, summary.Entities[0].IconURL
		if (a == nil) != (b == nil) || (a != nil && *a != *b) {
			t.Fatalf("media disagrees: %v %v", a, b)
		}
		if (state == "reviewed") != (a != nil) {
			t.Fatalf("policy %s ignored: %v", state, a)
		}
	}

}
