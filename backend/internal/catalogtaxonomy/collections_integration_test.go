package catalogtaxonomy

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func TestCollectionProjection(t *testing.T) {
	dsn := os.Getenv("COLLECTIONS_TEST_DATABASE_URL")
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
	if err := tx.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,919191,$2,true) RETURNING id`, product, uuid.NewString()).Scan(&build); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($1,$2,'wago_tools','staging') RETURNING id`, product, build).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) VALUES($1,$2,'wago_tools','collection-fixture','https://example.invalid/fixture',digest('fixture','sha256'),1,'ready') RETURNING id`, snapshot, build).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	raw := func(table, locale string, id int, payload map[string]string) {
		t.Helper()
		p, _ := json.Marshal(payload)
		exec(`INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,source_artifact_id,snapshot_id) VALUES($1,$2,$3,$4,$5::jsonb,digest($5::text,'sha256'),'https://example.invalid/fixture',$6,$7)`, build, table, locale, id, string(p), artifact, snapshot)
	}
	entities := map[string]uuid.UUID{}
	versions := map[string]uuid.UUID{}
	for n, typ := range []string{"mount", "battle_pet", "toy", "transmog_set", "item_set", "item", "spell", "class"} {
		var e, v uuid.UUID
		if err := tx.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug) VALUES($1,$2,$3,$2) RETURNING id`, product, typ, n+1).Scan(&e); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id) VALUES($1::uuid,$2,digest($1::text,'sha256'),'{}','wago_tools',$3,$4) RETURNING id`, e, build, snapshot, artifact).Scan(&v); err != nil {
			t.Fatal(err)
		}
		exec(`UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`, e, v)
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name,slug) VALUES($1,'en_US',$2,$2),($1,'ru_RU',$2,$2)`, v, typ)
		entities[typ] = e
		versions[typ] = v
	}
	for _, loc := range []string{"en_US", "ru_RU"} {
		raw("Mount", loc, 1, map[string]string{"Description_lang": "mount-" + loc, "SourceText_lang": "source-" + loc, "SourceSpellID": "7", "MountTypeID": "100"})
		raw("BattlePetSpecies", loc, 2, map[string]string{"Description_lang": "pet-" + loc, "SummonSpellID": "7", "PetTypeEnum": "7"})
		raw("Toy", loc, 3, map[string]string{"ItemID": "6", "SourceText_lang": "toy-source-" + loc})
		raw("ItemSparse", loc, 6, map[string]string{"Description_lang": "item-" + loc})
		raw("TransmogSet", loc, 4, map[string]string{"ClassMask": "128", "ExpansionID": "11", "TransmogSetGroupID": "1", "ParentTransmogSetID": "0", "ItemNameDescriptionID": "2"})
		raw("TransmogSetGroup", loc, 1, map[string]string{"Name_lang": "group-" + loc})
		raw("ItemNameDescription", loc, 2, map[string]string{"Description_lang": "variant-" + loc})
		raw("ChrClasses", loc, 8, map[string]string{"Name_lang": "class-" + loc})
		raw("ItemSet", loc, 5, map[string]string{"ItemID_0": "6", "ItemID_1": "0"})
		raw("BattlePetAbility", loc, 9, map[string]string{"Name_lang": "ability-" + loc, "Description_lang": "ability-effect-" + loc})
	}
	raw("Spell", "en_US", 7, map[string]string{"Description_lang": "use-effect-en"})
	raw("SpellEffect", "en_US", 1, map[string]string{"SpellID": "7", "Effect": "36", "EffectTriggerSpell": "0"})
	raw("Item", "en_US", 6, map[string]string{"InventoryType": "1", "ClassID": "4", "SubclassID": "4"})
	raw("ItemEffect", "en_US", 1, map[string]string{"SpellID": "7", "TriggerType": "0"})
	raw("ItemXItemEffect", "en_US", 1, map[string]string{"ItemID": "6", "ItemEffectID": "1"})
	raw("TransmogSetItem", "en_US", 1, map[string]string{"TransmogSetID": "4", "ItemModifiedAppearanceID": "1"})
	raw("ItemModifiedAppearance", "en_US", 1, map[string]string{"ItemID": "6", "ItemAppearanceModifierID": "2"})
	raw("ItemSetSpell", "en_US", 1, map[string]string{"ItemSetID": "5", "SpellID": "7", "Threshold": "2"})
	raw("BattlePetSpeciesXAbility", "en_US", 1, map[string]string{"BattlePetSpeciesID": "2", "BattlePetAbilityID": "9", "RequiredLevel": "10", "SlotEnum": "1"})
	raw("MountTypeXCapability", "en_US", 1, map[string]string{"MountTypeID": "100", "MountCapabilityID": "1"})
	raw("MountCapability", "en_US", 1, map[string]string{"Flags": "3"})
	run := func() {
		t.Helper()
		if err := rebuildCollectionDetails(ctx, tx); err != nil {
			t.Fatal(err)
		}
		if err := rebuildCollectionLinks(ctx, tx); err != nil {
			t.Fatal(err)
		}
	}
	run()
	scalar := func(q string, args ...any) string {
		t.Helper()
		var s string
		if err := tx.QueryRow(ctx, q, args...).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	for _, check := range []struct{ typ, locale, want string }{{"toy", "en_US", "item-en_US\nuse-effect-en"}, {"toy", "ru_RU", "item-ru_RU"}, {"item_set", "en_US", "(2) use-effect-en"}, {"item_set", "ru_RU", ""}} {
		if got := scalar(`SELECT description FROM game_entity_localizations WHERE version_id=$1 AND locale=$2`, versions[check.typ], check.locale); got != check.want {
			t.Fatalf("%+v got %q", check, got)
		}
	}
	for typ, path := range map[string]string{"mount": "mount_modes", "battle_pet": "abilities", "transmog_set": "members", "item_set": "bonuses"} {
		if got := scalar(`SELECT jsonb_array_length(attributes->'collection'->$2)::text FROM game_entity_localizations WHERE version_id=$1 AND locale='en_US'`, versions[typ], path); got == "0" {
			t.Fatalf("%s empty %s", typ, path)
		}
	}
	for relation, want := range map[string]string{"belongs_to": "2", "obtained_from": "3"} {
		if got := scalar(`SELECT count(*)::text FROM game_entity_links WHERE build_id=$1 AND relation_type=$2`, build, relation); got != want {
			t.Fatalf("%s = %s", relation, got)
		}
	}
	fingerprint := func() string {
		return scalar(`SELECT md5(string_agg(attributes::text||description,'' ORDER BY version_id,locale)) FROM game_entity_localizations WHERE version_id=ANY($1::uuid[])`, []uuid.UUID{versions["mount"], versions["battle_pet"], versions["toy"], versions["transmog_set"], versions["item_set"]})
	}
	if got := scalar(`SELECT attributes->>'slot' FROM game_entity_links WHERE build_id=$1 AND target_entity_id=$2 AND relation_type='belongs_to'`, build, entities["transmog_set"]); got != "1" {
		t.Fatal("missing member slot", got)
	}
	if got := scalar(`SELECT count(*)::text FROM catalog_entity_localization_artifacts WHERE version_id=ANY($1::uuid[])`, []uuid.UUID{versions["mount"], versions["battle_pet"], versions["toy"], versions["transmog_set"], versions["item_set"]}); got != "10" {
		t.Fatal("missing locale provenance", got)
	}
	exec(`UPDATE catalog_db2_rows SET payload=payload||'{"SummonSpellID":"0"}' WHERE build_id=$1 AND table_name='BattlePetSpecies'`, build)
	run()
	if got := scalar(`SELECT count(*)::text FROM game_entity_links WHERE build_id=$1 AND source_entity_id=$2 AND relation_type IN ('grants','obtained_from')`, build, entities["battle_pet"]); got != "0" {
		t.Fatal("zero spell ID created teaching links", got)
	}
	exec(`UPDATE catalog_db2_rows SET payload=payload||'{"SummonSpellID":"7"}' WHERE build_id=$1 AND table_name='BattlePetSpecies'`, build)
	run()
	before := fingerprint()
	run()
	if after := fingerprint(); before != after {
		t.Fatal("non-idempotent facts")
	}
	exec(`UPDATE catalog_db2_rows SET payload='{"Flags":"0"}' WHERE build_id=$1 AND table_name='MountCapability'`, build)
	run()
	if got := scalar(`SELECT attributes#>>'{collection,mount_modes}' FROM game_entity_localizations WHERE version_id=$1 AND locale='en_US'`, versions["mount"]); got != "[]" {
		t.Fatal("invented mount mode", got)
	}
	exec(`UPDATE catalog_db2_rows SET payload='{"Flags":"3"}' WHERE build_id=$1 AND table_name='MountCapability'`, build)
	run()
	exec(`UPDATE game_entities SET published_version_id=latest_version_id WHERE id=$1`, entities["mount"])
	exec(`UPDATE catalog_db2_rows SET payload=payload||'{"SourceText_lang":"changed"}' WHERE build_id=$1`, build)
	run()
	if after := fingerprint(); before != after {
		t.Fatal("rewrote a published build")
	}
}
