//go:build integration

package catalogtaxonomy

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/httpapi"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Requires a fully migrated disposable database and exported build-92 rows.
func TestAchievementRealSourceProjection(t *testing.T) {
	dir, url := os.Getenv("ACHIEVEMENT_SOURCE_DIR"), os.Getenv("ACHIEVEMENT_TEST_DATABASE_URL")
	if dir == "" || url == "" {
		t.Skip("real-source disposable rehearsal is opt-in")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var product int16
	var build int64
	if os.Getenv("ACHIEVEMENT_REUSE_FIXTURE") == "" {
		tx, err := db.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		exec := func(sql string, args ...any) {
			t.Helper()
			if _, err := tx.Exec(ctx, sql, args...); err != nil {
				t.Fatal(err)
			}
		}
		exec(`CREATE TEMP TABLE achievement_fixture_raw(data jsonb) ON COMMIT DROP; CREATE TEMP TABLE achievement_fixture_targets(data jsonb) ON COMMIT DROP;`)
		copyFile := func(file, table string, unescape bool) {
			t.Helper()
			f, err := os.Open(filepath.Join(dir, file))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			scanner := bufio.NewScanner(f)
			scanner.Buffer(make([]byte, 65536), 8*1024*1024)
			_, err = tx.CopyFrom(ctx, pgx.Identifier{table}, []string{"data"}, pgx.CopyFromFunc(func() ([]any, error) {
				if !scanner.Scan() {
					return nil, scanner.Err()
				}
				line := scanner.Text()
				if unescape {
					line = strings.ReplaceAll(line, `\\`, `\`)
				}
				if !json.Valid([]byte(line)) {
					t.Fatalf("invalid source JSON in %s", file)
				}
				return []any{[]byte(line)}, nil
			}))
			if err != nil {
				t.Fatal(err)
			}
		}
		copyFile("achievement-source.jsonl.fixed", "achievement_fixture_raw", false)
		copyFile("achievement-reward-source.copy", "achievement_fixture_raw", true)
		copyFile("achievement-targets.copy", "achievement_fixture_targets", true)
		var snapshot, artifact uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&product); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,69587,'achievement-rehearsal-'||gen_random_uuid(),true) RETURNING id`, product).Scan(&build); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($1,$2,'wago_tools','staging') RETURNING id`, product, build).Scan(&snapshot); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) VALUES($1,$2,'wago_tools','achievement-rehearsal','https://wago.tools/db2/Achievement?build=12.1.0.69587',decode(repeat('ab',32),'hex'),1,'ready') RETURNING id`, snapshot, build).Scan(&artifact); err != nil {
			t.Fatal(err)
		}
		exec(`INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,snapshot_id,source_artifact_id)
 SELECT $1,data->>'table',data->>'locale',(data->>'id')::bigint,data->'payload',digest(convert_to((data->'payload')::text,'UTF8'),'sha256'),'https://wago.tools/db2/'||(data->>'table')||'?build=12.1.0.69587',$2,$3 FROM achievement_fixture_raw`, build, snapshot, artifact)
		exec(`INSERT INTO game_entities(id,product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
 SELECT DISTINCT ON (data->>'id') (data->>'id')::uuid,$1,data->>'type',(data->>'external_id')::bigint,COALESCE(data->>'slug',''),$2,$2 FROM achievement_fixture_targets ORDER BY data->>'id',data->>'locale'`, product, build)
		exec(`INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source,snapshot_id,source_artifact_id,source_url)
 SELECT DISTINCT ON (data->>'id') (data->>'id')::uuid,$1,digest(convert_to((data->'payload')::text,'UTF8'),'sha256'),data->'payload','wago_tools',$2,$3,'https://wago.tools/db2/Achievement?build=12.1.0.69587' FROM achievement_fixture_targets ORDER BY data->>'id',data->>'locale'`, build, snapshot, artifact)
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name,description,slug)
 SELECT v.id,data->>'locale',data->>'name',COALESCE(data->>'description',''),COALESCE(data->>'slug','') FROM achievement_fixture_targets JOIN game_entity_versions v ON v.entity_id=(data->>'id')::uuid AND v.build_id=$1`, build)
		exec(`UPDATE game_entities e SET latest_version_id=v.id FROM game_entity_versions v WHERE v.entity_id=e.id AND v.build_id=$1`, build)

		exec(`UPDATE game_entities e SET published_version_id=latest_version_id WHERE last_seen_build_id=$1`, build)
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	} else {
		if err := db.QueryRow(ctx, `SELECT id,product_id FROM game_builds WHERE version LIKE 'achievement-rehearsal-%' ORDER BY id DESC LIMIT 1`).Scan(&build, &product); err != nil {
			t.Fatal(err)
		}
	}
	if file := os.Getenv("ACHIEVEMENT_RUSSIAN_CSV"); file != "" {
		if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=NULL WHERE last_seen_build_id=$1`, build); err != nil {
			t.Fatal(err)
		}
		importAchievementRussianCriteria(t, ctx, db, build, file)
	}
	// Achievements previously use only the generic name/description blocks.
	if _, err := db.Exec(ctx, `INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,blocks,content_hash,source_url)
 SELECT v.id,l.locale,concat_ws(E'\n',l.name,NULLIF(l.description,'')),
 jsonb_build_array(jsonb_build_object('type','name','text',l.name,'quality',NULL)) || CASE WHEN l.description<>'' THEN jsonb_build_array(jsonb_build_object('type','description','text',l.description)) ELSE '[]'::jsonb END,
 digest(convert_to(l.name||l.description,'UTF8'),'sha256'),v.source_url
 FROM game_entity_versions v JOIN game_entities e ON e.id=v.entity_id AND e.entity_type='achievement' JOIN game_entity_localizations l ON l.version_id=v.id WHERE v.build_id=$1
 ON CONFLICT(version_id,locale) DO UPDATE SET plain_text=EXCLUDED.plain_text,blocks=EXCLUDED.blocks,content_hash=EXCLUDED.content_hash`, build); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=latest_version_id WHERE last_seen_build_id=$1`, build); err != nil {
		t.Fatal(err)
	}
	service := catalog.NewService(db)
	sampleIDs := []int64{5154, 6, 7, 8, 9, 10, 614, 619, 1017, 2144, 20525, 20596, 20597, 40194, 40231, 42045, 61091, 61366, 61380, 61839}
	samples := map[int64]map[string]any{}
	for _, id := range sampleIDs {
		var entity uuid.UUID
		if err := db.QueryRow(ctx, `SELECT id FROM game_entities WHERE entity_type='achievement' AND external_id=$1 AND product_id=$2`, id, product).Scan(&entity); err != nil {
			t.Fatalf("sample %d: %v", id, err)
		}
		samples[id] = map[string]any{"uuid": entity}
		for _, locale := range []string{"en_US", "ru_RU"} {
			before, err := achievementHTTPDetail(ctx, service, entity, locale)
			if err != nil {
				t.Fatal(err)
			}
			samples[id]["before_"+locale] = before
		}
	}
	if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=NULL WHERE last_seen_build_id=$1`, build); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	result, err := NewForProduct(db, "wow").RebuildAchievements(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("projection=%+v duration=%s", result, time.Since(started))
	var firstHash string
	if err := db.QueryRow(ctx, `SELECT md5(string_agg(encode(content_hash,'hex'),'' ORDER BY version_id,locale)) FROM catalog_entity_tooltips`).Scan(&firstHash); err != nil {
		t.Fatal(err)
	}
	again, err := NewForProduct(db, "wow").RebuildAchievements(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var secondHash string
	db.QueryRow(ctx, `SELECT md5(string_agg(encode(content_hash,'hex'),'' ORDER BY version_id,locale)) FROM catalog_entity_tooltips`).Scan(&secondHash)
	if firstHash != secondHash || result.Tooltips != again.Tooltips || result.Links != again.Links {
		t.Fatalf("not idempotent: %+v %+v hashes %s %s", result, again, firstHash, secondHash)
	}
	if _, err := db.Exec(ctx, `UPDATE game_entities SET published_version_id=latest_version_id WHERE last_seen_build_id=$1`, build); err != nil {
		t.Fatal(err)
	}
	if err := service.RefreshReadModels(ctx, &product); err != nil {
		t.Fatal(err)
	}
	for id, sample := range samples {
		entity := sample["uuid"].(uuid.UUID)
		for _, locale := range []string{"en_US", "ru_RU"} {
			after, err := achievementHTTPDetail(ctx, service, entity, locale)
			if err != nil {
				t.Fatal(err)
			}
			sample["after_"+locale] = after
			if after["tooltip"] == nil {
				t.Fatalf("sample %d lacks tooltip", id)
			}
		}
		relationships, err := service.Relationships(ctx, catalog.RelationshipParams{EntityID: entity, Locale: "en_US", Limit: 100})
		if err != nil {
			t.Fatal(err)
		}
		sample["relationships"] = relationships
	}
	data, err := json.MarshalIndent(samples, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "achievement-endpoint-samples.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
	protected, err := NewForProduct(db, "wow").RebuildAchievements(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if protected.Tooltips != 0 || protected.Links != 0 {
		t.Fatalf("published build was rewritten: %+v", protected)
	}
	categories, err := service.Categories(ctx, "wow", "achievement", "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if len(categories) < 200 {
		t.Fatalf("categories: %d", len(categories))
	}
	verifyAchievementPublicFilters(t, ctx, db, service, build)
	t.Logf("categories=%d samples=%d build=%d", len(categories), len(samples), build)
}

func TestAchievementProjectionContracts(t *testing.T) {
	url := os.Getenv("CATALOG_TAXONOMY_DATABASE_URL")
	if url == "" {
		t.Skip("disposable database required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
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
	var product int16
	var build int64
	var snapshot, artifact uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow_classic'`).Scan(&product); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,999999,'achievement-test-'||gen_random_uuid(),true) RETURNING id`, product).Scan(&build); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_snapshots(product_id,build_id,source,status) VALUES($1,$2,'wago_tools','staging') RETURNING id`, product, build).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status) VALUES($1,$2,'wago_tools','achievement-contracts','https://example.invalid/achievement',decode(repeat('bc',32),'hex'),1,'ready') RETURNING id`, snapshot, build).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	raw := func(table string, id int64, locale string, payload string) {
		exec(`INSERT INTO catalog_db2_rows(build_id,table_name,row_id,locale,payload,content_hash,source_url,snapshot_id,source_artifact_id) VALUES($1,$2,$3,$4,$5::jsonb,digest(convert_to($5::jsonb::text,'UTF8'),'sha256'),'https://example.invalid/achievement',$6,$7)`, build, table, id, locale, payload, snapshot, artifact)
	}
	raw("Achievement", 900000001, "en_US", `{"Title_lang":"Test achievement","Description_lang":"Complete the quests.","Points":"10","Faction":"1","Flags":"131072","Category":"900000001","Criteria_tree":"1"}`)
	raw("Achievement", 900000001, "ru_RU", `{"Title_lang":"Тестовое достижение","Description_lang":"Выполните задания.","Reward_lang":"Звание"}`)
	raw("Achievement_Category", 900000001, "en_US", `{"Name_lang":"Test category","Parent":"-1"}`)
	raw("Achievement_Category", 900000001, "ru_RU", `{"Name_lang":"Тестовая категория","Parent":"-1"}`)
	raw("CriteriaTree", 1, "en_US", `{"Parent":"0","Operator":"4","Amount":"0"}`)
	raw("CriteriaTree", 2, "en_US", `{"Parent":"1","OrderIndex":"1","CriteriaID":"100","Description_lang":"A quest","Amount":"1"}`)
	raw("CriteriaTree", 2, "ru_RU", `{"Parent":"1","Description_lang":"Задание"}`)
	raw("CriteriaTree", 3, "en_US", `{"Parent":"1","Flags":"2","CriteriaID":"100","Description_lang":"Hidden"}`)
	raw("Criteria", 100, "en_US", `{"Type":"27","Asset":"900000001"}`)
	entity := func(kind string) (uuid.UUID, uuid.UUID) {
		t.Helper()
		var e, v uuid.UUID
		if err := tx.QueryRow(ctx, `INSERT INTO game_entities(product_id,entity_type,external_id) VALUES($1,$2,900000001) RETURNING id`, product, kind).Scan(&e); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `INSERT INTO game_entity_versions(entity_id,build_id,payload,content_hash,source,snapshot_id,source_artifact_id) VALUES($1,$2,'{}',decode(repeat('bc',32),'hex'),'wago_tools',$3,$4) RETURNING id`, e, build, snapshot, artifact).Scan(&v); err != nil {
			t.Fatal(err)
		}
		exec(`INSERT INTO game_entity_localizations(version_id,locale,name) VALUES($1,'en_US','Test record'),($1,'ru_RU','Тестовая запись')`, v)
		exec(`UPDATE game_entities SET latest_version_id=$2 WHERE id=$1`, e, v)
		return e, v
	}
	achievement, version := entity("achievement")
	quest, _ := entity("quest")
	exec(`SELECT set_config('gildra.projection_product','wow_classic',true)`)
	result, err := rebuildAchievements(ctx, tx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Tooltips != 2 || result.Links != 1 {
		t.Fatalf("projection result %+v", result)
	}
	var block map[string]any
	if err := tx.QueryRow(ctx, `SELECT blocks->1 FROM catalog_entity_tooltips WHERE version_id=$1 AND locale='ru_RU'`, version).Scan(&block); err != nil {
		t.Fatal(err)
	}
	// Description is emitted before the detail block.
	if err := tx.QueryRow(ctx, `SELECT value FROM catalog_entity_tooltips t CROSS JOIN LATERAL jsonb_array_elements(t.blocks) value WHERE t.version_id=$1 AND t.locale='ru_RU' AND value->>'type'='achievement_info'`, version).Scan(&block); err != nil {
		t.Fatal(err)
	}
	criteria := block["criteria"].(map[string]any)
	children := criteria["children"].([]any)
	if len(children) != 1 || children[0].(map[string]any)["text"] != "Задание" || block["points"] != float64(10) || block["account_wide"] != true {
		t.Fatalf("detail block %+v", block)
	}
	var links int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links WHERE source_entity_id=$1 AND target_entity_id=$2 AND relation_type='achievement_criteria'`, achievement, quest).Scan(&links); err != nil || links != 1 {
		t.Fatalf("link %d: %v", links, err)
	}
	if _, err := rebuildAchievements(ctx, tx); err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE game_entities SET published_version_id=latest_version_id WHERE id=$1`, achievement)
	protected, err := rebuildAchievements(ctx, tx)
	if err != nil || protected.Tooltips != 0 {
		t.Fatalf("published guard %+v: %v", protected, err)
	}
}

func achievementHTTPDetail(ctx context.Context, service *catalog.Service, entity uuid.UUID, locale string) (map[string]any, error) {
	lang := api.GetGameEntityParamsLocale(locale)
	response, err := httpapi.NewServer(nil, service, nil).GetGameEntity(ctx, api.GetGameEntityRequestObject{Id: entity, Params: api.GetGameEntityParams{Locale: &lang}})
	if err != nil {
		return nil, err
	}
	recorder := httptest.NewRecorder()
	if err := response.VisitGetGameEntityResponse(recorder); err != nil {
		return nil, err
	}
	if recorder.Code != 200 {
		return nil, fmt.Errorf("detail endpoint %s %s: %d %s", entity, locale, recorder.Code, recorder.Body.String())
	}
	var detail map[string]any
	err = json.Unmarshal(recorder.Body.Bytes(), &detail)
	return detail, err
}

func importAchievementRussianCriteria(t *testing.T, ctx context.Context, db *pgxpool.Pool, build int64, file string) {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	records, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var snapshot, artifact uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT snapshot_id FROM catalog_db2_rows WHERE build_id=$1 AND table_name='Achievement' LIMIT 1`, build).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(data)
	if err := tx.QueryRow(ctx, `INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,locale,source_url,content_hash,byte_size,status,metadata)
 VALUES($1,$2,'wago_tools','CriteriaTree','ru_RU','https://wago.tools/db2/CriteriaTree/csv?build=12.1.0.69587&locale=ruRU',$3,$4,'ready','{"build":"12.1.0.69587","locale":"ru_RU"}')
 ON CONFLICT(snapshot_id,artifact_key,locale) DO UPDATE SET content_hash=EXCLUDED.content_hash,byte_size=EXCLUDED.byte_size,status=EXCLUDED.status RETURNING id`, snapshot, build, digest[:], len(data)).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `CREATE TEMP TABLE achievement_russian_stage(row_id bigint,payload jsonb) ON COMMIT DROP`); err != nil {
		t.Fatal(err)
	}
	values := make([][]any, 0, len(records)-1)
	for _, record := range records[1:] {
		p := map[string]string{}
		for index, key := range records[0] {
			p[key] = record[index]
		}
		id, err := strconv.ParseInt(p["ID"], 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		payload, err := json.Marshal(p)
		if err != nil {
			t.Fatal(err)
		}
		values = append(values, []any{id, payload})
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"achievement_russian_stage"}, []string{"row_id", "payload"}, pgx.CopyFromRows(values)); err != nil {
		t.Fatal(err)
	}
	var mismatch int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM achievement_russian_stage ru LEFT JOIN catalog_db2_rows en ON en.build_id=$1 AND en.table_name='CriteriaTree' AND en.locale='en_US' AND en.row_id=ru.row_id WHERE en.row_id IS NULL OR (ru.payload-'Description_lang') IS DISTINCT FROM (en.payload-'Description_lang')`, build).Scan(&mismatch); err != nil || mismatch != 0 {
		t.Fatalf("RU CSV build mismatch %d: %v", mismatch, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,snapshot_id,source_artifact_id)
 SELECT $1,'CriteriaTree','ru_RU',row_id,payload,digest(convert_to(payload::text,'UTF8'),'sha256'),'https://wago.tools/db2/CriteriaTree/csv?build=12.1.0.69587&locale=ruRU',$2,$3 FROM achievement_russian_stage
 ON CONFLICT(build_id,table_name,locale,row_id) DO UPDATE SET payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,source_artifact_id=EXCLUDED.source_artifact_id`, build, snapshot, artifact); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	t.Logf("Imported %d matching-build Russian CriteriaTree rows, SHA256 %x", len(values), digest)
}

func TestAchievementPublicFilters(t *testing.T) {
	url := os.Getenv("ACHIEVEMENT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires real-source disposable fixture")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var build int64
	if err := db.QueryRow(ctx, `SELECT max(id) FROM game_builds WHERE version LIKE 'achievement-rehearsal-%'`).Scan(&build); err != nil {
		t.Fatal(err)
	}
	verifyAchievementPublicFilters(t, ctx, db, catalog.NewService(db), build)
}
func verifyAchievementPublicFilters(t *testing.T, ctx context.Context, db *pgxpool.Pool, service *catalog.Service, build int64) {
	t.Helper()
	// Parent and leaf counts must agree with the requested locale and public gates.
	for _, locale := range []string{"en_US", "ru_RU"} {
		ruCategories, err := service.Categories(ctx, "wow", "achievement", locale)
		if err != nil {
			t.Fatal(err)
		}
		checked := 0
		for _, category := range ruCategories {
			if category.Path != "categorys/category-92" && category.Path != "categorys/category-15088" && category.Path != "categorys/category-15076" && category.Path != "categorys/category-15566" {
				continue
			}
			page, err := service.Summaries(ctx, catalog.SummaryParams{Product: "wow", Type: "achievement", Dataset: "achievements", Locale: locale, Facets: []string{category.Path}, Limit: 10, IncludeTotal: true})
			if err != nil {
				t.Fatal(err)
			}
			if page.Total == nil {
				t.Fatal("missing total")
			}
			if *page.Total != category.Count {
				t.Fatalf("category %s count %d != total %v", category.Path, category.Count, *page.Total)
			}
			t.Logf("%s %s: category=count=%d", locale, category.Path, category.Count)
			checked++
		}
		if checked != 4 {
			t.Fatalf("checked %d category facets", checked)
		}
	}
	// The existing relationship endpoint serves both directions of one edge.
	var sourceID, targetID uuid.UUID
	if err := db.QueryRow(ctx, `SELECT link.source_entity_id,link.target_entity_id FROM game_entity_links link JOIN game_entities e ON e.id=link.source_entity_id WHERE e.entity_type='achievement' AND e.external_id=20525 AND link.relation_type='achievement_reward' AND link.build_id=$1 LIMIT 1`, build).Scan(&sourceID, &targetID); err != nil {
		t.Fatal(err)
	}
	for _, locale := range []string{"en_US", "ru_RU"} {
		page, err := service.Relationships(ctx, catalog.RelationshipParams{EntityID: targetID, Locale: locale, Direction: "incoming", Relation: "achievement_reward", Limit: 100})
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, link := range page.Relationships {
			if link.Entity.ID == sourceID {
				found = true
			}
		}
		if !found {
			t.Fatal("missing incoming achievement reward")
		}
	}

}
