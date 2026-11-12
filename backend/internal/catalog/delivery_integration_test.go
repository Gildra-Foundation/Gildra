//go:build integration

package catalog

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Requires a disposable database with migrations including 00188/00189.
func TestDeliveryOrderingAndSearch(t *testing.T) {
	url := os.Getenv("DELIVERY_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("DELIVERY_TEST_DATABASE_URL required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
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
	slug := "delivery-" + uuid.NewString()[:8]
	var product int16
	var build int64
	var snapshot, artifact uuid.UUID
	if err := db.QueryRow(ctx, `INSERT INTO game_products(slug,name) VALUES($1,'Delivery fixture') RETURNING id`, slug).Scan(&product); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,123456,'fixture',true) RETURNING id`, product).Scan(&build); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata) VALUES($1,$2,'blizzard_api','published',now(),now(),'{}') RETURNING id`, product, build).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) VALUES($1,$2,'blizzard_api','delivery-fixture','https://example.invalid/source',digest('fixture','sha256'),1,'ready') RETURNING id`, snapshot, build).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO catalog_expansions(product_id,expansion_key,external_expansion_id,name_en,name_ru) VALUES($1,'older',1,'Older','Старое'),($1,'newer',2,'Newer','Новое'),($1,'empty',3,'Empty','Пустое')`, product)
	entities := map[int64]uuid.UUID{}
	versions := map[int64]uuid.UUID{}
	seed := func(kind string, id int64, name, ru string, level, required *int, expansion string) {
		t.Helper()
		e, v := uuid.New(), uuid.New()
		entities[id] = e
		versions[id] = v
		exec(`INSERT INTO game_entities(id,product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id) VALUES($1,$2,$3,$4,$5,$6,$6)`, e, product, kind, id, fmt.Sprint(id), build)
		exec(`INSERT INTO game_entity_versions(id,entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source) VALUES($1,$2,$3,digest($4,'sha256'),'{}','https://example.invalid/source',$5,$6,'blizzard_api')`, v, e, build, fmt.Sprint(id), snapshot, artifact)
		exec(`UPDATE game_entities SET published_version_id=$2,latest_version_id=$2 WHERE id=$1`, e, v)
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name,description) VALUES($1,'en_US',$2,'Player description'),($1,'ru_RU',$3,'Описание')`, v, name, ru)
		if kind == "item" {
			exec(`INSERT INTO catalog_items(version_id,item_class_id,item_subclass_id,quality,item_level,required_level) VALUES($1,2,1,'EPIC',$2,$3)`, v, level, required)
		}
		if expansion != "" {
			exec(`INSERT INTO catalog_entity_expansions(product_id,build_id,entity_type,external_id,expansion_id,classification,evidence_kind,evidence_build_id,source_artifact_id) VALUES($1,$2,$3,$4,(SELECT id FROM catalog_expansions WHERE product_id=$1 AND expansion_key=$5),'confirmed','curated',$2,$6)`, product, build, kind, id, expansion, artifact)
		}
	}
	n := func(v int) *int { return &v }
	seed("item", 10, "Alpha", "Альфа", n(900), n(70), "older")
	seed("item", 20, "Beta", "Бета", n(250), n(80), "newer")
	seed("item", 30, "Gamma", "Гамма", n(285), n(80), "newer")
	seed("item", 40, "Delta", "Дельта", n(285), n(80), "newer")
	seed("item", 50, "Epsilon", "Эпсилон", nil, nil, "")
	seed("item", 60, "Hidden", "Скрыто", n(999), n(90), "newer")
	exec(`INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code,source_artifact_id) VALUES($1,$2,'item',60,'review','fixture',$3)`, product, build, artifact)
	seed("spell", 100, "Fireball", "Огненный шар", nil, nil, "")
	seed("spell", 101, "Fireball", "Огненный шар", nil, nil, "")
	exec(`INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source) VALUES($1,'class',8,'db2')`, versions[101])
	seed("item", 200, "Healing Potion", "Лечебное зелье", n(1), n(1), "")
	seed("spell", 201, "Healing Potion", "Лечебное зелье", nil, nil, "")
	seed("transmog_set", 300, "Gladiator Armor", "Доспехи гладиатора", nil, nil, "")
	var parent, child, second int64
	for i, path := range []string{"equipment", "equipment/weapons", "color"} {
		var id int64
		if err := db.QueryRow(ctx, `INSERT INTO catalog_categories(product_id,entity_type,facet,slug,path) VALUES($1,'item','delivery',replace($2,'/','-'),$2) RETURNING id`, product, path).Scan(&id); err != nil {
			t.Fatal(err)
		}
		switch i {
		case 0:
			parent = id
		case 1:
			child = id
		case 2:
			second = id
		}
	}
	exec(`UPDATE catalog_categories SET parent_id=$2 WHERE id=$1`, child, parent)
	exec(`INSERT INTO game_entity_categories(version_id,category_id,source) VALUES($1,$2,'db2'),($1,$3,'db2'),($4,$2,'db2')`, versions[30], child, second, versions[20])
	exec(`SELECT refresh_catalog_delivery_order($1)`, product)
	service := NewService(db)
	ids := func(p SummaryParams) []int64 {
		t.Helper()
		p.Product = slug
		p.Limit = 2
		var result []int64
		seen := map[uuid.UUID]bool{}
		for i := 0; i < 20; i++ {
			page, err := service.Summaries(ctx, p)
			if err != nil {
				t.Fatal(err)
			}
			for _, e := range page.Entities {
				if seen[e.ID] {
					t.Fatal("duplicate page record")
				}
				seen[e.ID] = true
				result = append(result, e.ExternalID)
				if e.Type == "item" && (e.Quality == nil || *e.Quality != 4) {
					t.Fatal("quality missing")
				}
			}
			if !page.HasMore {
				return result
			}
			p.Cursor = page.NextCursor
		}
		t.Fatal("pagination did not end")
		return nil
	}
	// Equal levels are stably resolved by UUID, and reverse scans invert ties too.
	for _, sort := range []string{"current", "item_level_desc", "item_level_asc", "required_level_desc", "required_level_asc", "name_asc", "name_desc"} {
		t.Run(sort, func(t *testing.T) {
			got := ids(SummaryParams{Type: "item", Sort: sort})
			if len(got) != 6 {
				t.Fatalf("got %v", got)
			}
			if sort == "current" && !reflect.DeepEqual(got, []int64{40, 30, 20, 10, 200, 50}) {
				t.Fatalf("default %v", got)
			}
			if sort == "name_asc" && !reflect.DeepEqual(got, []int64{10, 20, 40, 50, 30, 200}) {
				t.Fatalf("names %v", got)
			}
		})
	}
	for _, c := range []struct {
		scope string
		want  int
	}{{"older", 1}, {"newer", 3}, {"empty", 0}, {"missing", 0}} {
		if got := ids(SummaryParams{Type: "item", Expansion: c.scope}); len(got) != c.want {
			t.Fatalf("scope %s: %v", c.scope, got)
		}
	}
	for _, sort := range []string{"id", "current"} {
		got := ids(SummaryParams{Type: "item", Sort: sort, Facets: []string{"equipment", "color"}})
		if !reflect.DeepEqual(got, []int64{30}) {
			t.Fatalf("facet intersection %s %v", sort, got)
		}
		got = ids(SummaryParams{Type: "item", Sort: sort, Facets: []string{"equipment"}})
		if len(got) != 2 {
			t.Fatalf("recursive facet %s %v", sort, got)
		}
		total, err := service.summaryCount(ctx, SummaryParams{Type: "item", Facets: []string{"equipment", "color"}}, slug, "en_US")
		if err != nil || total != 1 {
			t.Fatalf("facet total %d %v", total, err)
		}
	}
	if got := ids(SummaryParams{Dataset: "weapons", MinRequiredLevel: n(80)}); !reflect.DeepEqual(got, []int64{40, 30, 20}) {
		t.Fatalf("dataset class/level filter: %v", got)
	}
	if got := ids(SummaryParams{Type: "item", Facets: []string{"missing-category"}}); len(got) != 0 {
		t.Fatalf("missing category: %v", got)
	}
	for _, pair := range [][2]string{{"item_level_asc", "item_level_desc"}, {"required_level_asc", "required_level_desc"}, {"name_asc", "name_desc"}} {
		asc, desc := ids(SummaryParams{Type: "item", Sort: pair[0]}), ids(SummaryParams{Type: "item", Sort: pair[1]})
		for i := range asc {
			if asc[i] != desc[len(desc)-1-i] {
				t.Fatalf("reverse sort and tie order: %v %v", asc, desc)
			}
		}
	}
	// Cache keys must not share the first expansion's result.
	for _, scope := range []string{"newer", "older", "empty"} {
		d, err := service.LibraryDatasetsInExpansion(ctx, slug, "en_US", scope)
		if err != nil {
			t.Fatal(err)
		}
		for _, dataset := range d {
			if dataset.Slug == "items" {
				want := map[string]int64{"newer": 3, "older": 1, "empty": 0}[scope]
				if dataset.EntityCount != want {
					t.Fatalf("%s count=%d", scope, dataset.EntityCount)
				}
			}
		}
	}
	for _, c := range []struct {
		q, kind string
		id      int64
	}{{"Fireball", "spell", 101}, {"healing potion", "", 200}, {"гладиатор", "transmog_set", 300}} {
		page, err := service.Summaries(ctx, SummaryParams{Product: slug, Type: c.kind, Query: c.q, Locale: "ru_RU", Limit: 24})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Entities) == 0 || page.Entities[0].ExternalID != c.id {
			t.Fatalf("query %s: %+v", c.q, page.Entities)
		}
	}
	p := SummaryParams{Product: slug, Type: "item", Limit: 2}
	page, err := service.Summaries(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	p.Cursor = page.NextCursor
	exec(`SELECT refresh_catalog_delivery_order($1)`, product)
	if _, err := service.Summaries(ctx, p); err == nil {
		t.Fatal("stale generation cursor accepted")
	}
}
