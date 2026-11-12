package catalogtaxonomy

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func TestItemAliasLocalizations(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated full-schema PostgreSQL required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`SELECT set_config('gildra.projection_product','wow_classic_hardcore',true)`)
	var product int16
	var build int64
	var snapshot, artifact uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow_classic_hardcore'`).Scan(&product); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,919193,$2,true) RETURNING id`, product, uuid.NewString()).Scan(&build); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($1,$2,'wago_tools','staging') RETURNING id`, product, build).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) VALUES($1,$2,'wago_tools','item-alias-fixture','https://example.invalid/fixture',digest('fixture','sha256'),1,'ready') RETURNING id`, snapshot, build).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	raw := func(table, locale string, id int, payload map[string]string) {
		t.Helper()
		p, _ := json.Marshal(payload)
		exec(`INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,source_artifact_id,snapshot_id) VALUES($1,$2,$3,$4,$5::jsonb,digest($5::text,'sha256'),'https://example.invalid/fixture',$6,$7)`, build, table, locale, id, string(p), artifact, snapshot)
	}

	versions := map[string]uuid.UUID{}
	for n, typ := range []string{"gem", "food", "flask", "potion", "enchantment"} {
		var e, v uuid.UUID
		if err := tx.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug) VALUES($1,$2,$3,$2) RETURNING id`, product, typ, n+1).Scan(&e); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id) VALUES($1::uuid,$2,digest($1::text,'sha256'),' {"raidbots":{"spellId":42}}','raidbots',$3,$4) RETURNING id`, e, build, snapshot, artifact).Scan(&v); err != nil {
			t.Fatal(err)
		}
		exec(`UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`, e, v)
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name,slug) VALUES($1,'en_US','Preserved English',$2)`, v, typ)
		versions[typ] = v
		if typ != "enchantment" {
			raw("ItemSparse", "ru_RU", n+1, map[string]string{"Display_lang": "Имя " + typ, "Description_lang": "Текст " + typ})
		}
	}
	raw("SpellName", "ru_RU", 42, map[string]string{"Name_lang": "Чары"})
	raw("Spell", "ru_RU", 42, map[string]string{"Description_lang": "Сила +$s1"})
	for attempt := 0; attempt < 2; attempt++ {
		exec(projectionSQL(itemAliasLocalizationsSQL))
		var count int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_localizations WHERE version_id=ANY($1::uuid[]) AND locale='ru_RU'`, []uuid.UUID{versions["gem"], versions["food"], versions["flask"], versions["potion"], versions["enchantment"]}).Scan(&count); err != nil || count != 5 {
			t.Fatalf("localizations %d: %v", count, err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM catalog_entity_localization_artifacts WHERE source_artifact_id=$1`, artifact).Scan(&count); err != nil || count != 5 {
			t.Fatalf("proofs %d: %v", count, err)
		}
	}
	var name, description string
	if err := tx.QueryRow(ctx, `SELECT name,description FROM game_entity_localizations WHERE version_id=$1 AND locale='ru_RU'`, versions["enchantment"]).Scan(&name, &description); err != nil || name != "Чары" || description != "Сила +$s1" {
		t.Fatalf("enchant: %s %s %v", name, description, err)
	}
	// Existing English names are not replaced by aliases or other locales.
	if err := tx.QueryRow(ctx, `SELECT name FROM game_entity_localizations WHERE version_id=$1 AND locale='en_US'`, versions["gem"]).Scan(&name); err != nil || name != "Preserved English" {
		t.Fatal(name, err)
	}

	// The gem alias reuses numeric source blocks only from its matching item build.
	var item, itemVersion uuid.UUID
	if err := tx.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug) VALUES($1,'item',1,'gem-item') RETURNING id`, product).Scan(&item); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id) VALUES($1::uuid,$2,digest($1::text,'sha256'),'{}','wago_tools',$3,$4) RETURNING id`, item, build, snapshot, artifact).Scan(&itemVersion); err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`, item, itemVersion)
	exec(`INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,blocks,content_hash) VALUES($1,'ru_RU','source','[{"type":"name","text":"source"},{"type":"effect","text":"+7","effect_kind":"socket_bonus"}]',digest('source','sha256')),($2,'ru_RU','target','[]',digest('target','sha256'))`, itemVersion, versions["gem"])
	exec(projectionSQL(itemAliasTooltipsSQL))
	var effect string
	if err := tx.QueryRow(ctx, `SELECT blocks->1->>'text' FROM catalog_entity_tooltips WHERE version_id=$1 AND locale='ru_RU'`, versions["gem"]).Scan(&effect); err != nil || effect != "+7" {
		t.Fatal(effect, err)
	}
	// Published builds are immutable even if raw rows change underneath them.
	exec(`UPDATE game_entities SET published_version_id=latest_version_id WHERE latest_version_id=$1`, versions["gem"])
	exec(`UPDATE catalog_db2_rows SET payload=jsonb_build_object('Display_lang','WRONG') WHERE build_id=$1 AND table_name='ItemSparse'`, build)
	exec(projectionSQL(itemAliasLocalizationsSQL))
	if err := tx.QueryRow(ctx, `SELECT name FROM game_entity_localizations WHERE version_id=$1 AND locale='ru_RU'`, versions["gem"]).Scan(&name); err != nil || name != "Имя gem" {
		t.Fatal(name, err)
	}
}

// Twenty actual published items are copied into a private full-schema fixture.
// This is projection/HTTP evidence, not permission to mutate a published build.
func TestItemRealSourceRehearsal(t *testing.T) {
	dsn := os.Getenv("ITEMS_REPLAY_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated ITEMS replay required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var safe bool
	if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_snapshots WHERE metadata->>'fixture'='ITEMS isolated real-source replay, not original full artifacts')`).Scan(&safe); err != nil || !safe {
		t.Fatal("not ITEMS fixture", err)
	}
	var prior string
	for pass := 0; pass < 2; pass++ {
		if _, err := db.Exec(ctx, tooltipSQLForEntityTypes("item", "spell")); err != nil {
			t.Fatal(err)
		}
		var hash string
		if err := db.QueryRow(ctx, `SELECT md5(string_agg(encode(content_hash,'hex'),'' ORDER BY version_id,locale)) FROM catalog_entity_tooltips`).Scan(&hash); err != nil {
			t.Fatal(err)
		}
		if pass > 0 && hash != prior {
			t.Fatal("non-idempotent tooltip projection")
		}
		prior = hash
	}
	t.Log("two identical projections", prior)
}
