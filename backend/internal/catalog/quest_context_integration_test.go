//go:build integration

package catalog

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Runs against the disposable real-source replay made by db2-import's
// TestQuestRealSourceProjection. It evaluates the same expressions the detail
// endpoint uses for every source-backed quest in both locales.
func TestQuestContextRealSource(t *testing.T) {
	url := os.Getenv("QUEST_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("explicit quest replay database required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var build int64
	if err = db.QueryRow(ctx, "SELECT build_id FROM quest_test_context").Scan(&build); err != nil {
		t.Fatal(err)
	}
	result := map[string]any{}
	for _, locale := range []string{"en_US", "ru_RU"} {
		sql := strings.ReplaceAll(`WITH actual AS (
    SELECT e.external_id,`+questObjectivesSQL+` AS objectives
    FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id
    WHERE e.entity_type='quest' AND v.build_id=$1
    AND EXISTS(SELECT 1 FROM catalog_quest_objectives o WHERE o.build_id=v.build_id AND o.quest_id=e.external_id)
  ) SELECT count(*),sum(jsonb_array_length(objectives)),count(*) FILTER(WHERE jsonb_array_length(objectives)=0),
    (SELECT count(*) FROM actual CROSS JOIN LATERAL jsonb_array_elements(objectives) o
     JOIN catalog_quest_objective_localizations l ON l.build_id=$1 AND l.quest_id=actual.external_id
       AND l.objective_id=(o->>'id')::bigint AND l.locale={locale}
     WHERE (o->>'description') IS DISTINCT FROM l.description),
    (SELECT count(*) FROM actual CROSS JOIN LATERAL jsonb_array_elements(objectives) o WHERE COALESCE(NULLIF(BTRIM(o->>'description'),''),o#>>'{target,name}','')<>''),
    (SELECT count(*) FROM actual CROSS JOIN LATERAL jsonb_array_elements(objectives) o WHERE o->'target'<>'null'::jsonb) FROM actual`, "{locale}", "'"+locale+"'")
		var quests, objectives, empty, mismatches, visible, linked int
		if err = db.QueryRow(ctx, sql, build).Scan(&quests, &objectives, &empty, &mismatches, &visible, &linked); err != nil {
			t.Fatal(err)
		}
		var source int
		if err = db.QueryRow(ctx, "SELECT count(*) FROM catalog_quest_objectives WHERE build_id=$1", build).Scan(&source); err != nil {
			t.Fatal(err)
		}
		if empty != 0 || mismatches != 0 || source != objectives {
			t.Fatalf("%s quests=%d objectives=%d source=%d empty=%d mismatches=%d", locale, quests, objectives, source, empty, mismatches)
		}
		metrics := map[string]int{"quests_with_objectives": quests, "objectives": objectives, "empty_arrays": empty, "text_mismatches": mismatches, "objectives_with_text_or_name": visible, "linked_objectives": linked}
		for _, dimension := range []struct{ name, expression, source string }{
			{"locations", questLocationsSQL, "catalog_quest_poi_blobs"},
			{"storylines", questLinesSQL, "catalog_quest_line_entries"},
		} {
			q := strings.ReplaceAll(`WITH actual AS (SELECT `+dimension.expression+` AS entries
    FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id
    WHERE e.entity_type='quest' AND v.build_id=$1 AND EXISTS(
     SELECT 1 FROM `+dimension.source+` s WHERE s.build_id=v.build_id AND s.quest_id=e.external_id))
    SELECT count(*),count(*) FILTER(WHERE jsonb_array_length(entries)>0) FROM actual`, "{locale}", "'"+locale+"'")
			var total, resolved int
			if err = db.QueryRow(ctx, q, build).Scan(&total, &resolved); err != nil {
				t.Fatal(err)
			}
			metrics[dimension.name+"_quests"] = total
			metrics[dimension.name+"_resolved"] = resolved
			if dimension.name == "storylines" && total != resolved {
				t.Fatal("missing storyline rows")
			}
		}
		result[locale] = metrics
		t.Logf("%s %+v", locale, metrics)
	}
	if directory := os.Getenv("QUEST_SOURCE_DIRECTORY"); directory != "" {
		raw, _ := json.MarshalIndent(result, "", "  ")
		if err = os.WriteFile(filepath.Join(directory, "coverage.json"), raw, 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestQuestContextBoundaries(t *testing.T) {
	url := os.Getenv("QUEST_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("explicit quest replay database required")
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
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	var build int64
	if err = tx.QueryRow(ctx, "SELECT build_id FROM quest_test_context").Scan(&build); err != nil {
		t.Fatal(err)
	}
	const external = 99179999
	exec(`INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
 SELECT 1,type,$1,'quest-context-test-'||type,$2,$2 FROM unnest(ARRAY['creature','item','currency','spell']) type`, external, build)
	exec(`INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
 SELECT e.id,$2,digest(e.entity_type,'sha256'),'{}','https://example.invalid/quest-test',a.snapshot_id,c.artifact_id,'wago_tools' FROM game_entities e CROSS JOIN quest_test_context c JOIN catalog_source_artifacts a ON a.id=c.artifact_id WHERE e.external_id=$1`, external, build)
	exec(`UPDATE game_entities e SET published_version_id=v.id,latest_version_id=v.id FROM game_entity_versions v WHERE v.entity_id=e.id AND e.external_id=$1`, external)
	exec(`INSERT INTO game_entity_localizations(version_id,locale,name)
 SELECT published_version_id,locale,'Target '||entity_type FROM game_entities CROSS JOIN unnest(ARRAY['en_US','ru_RU']) locale WHERE external_id=$1`, external)
	for _, kind := range []int{0, 1, 2, 3, 4, 5, 11, 16, 17, 21} {
		exec(`INSERT INTO catalog_quest_objectives(build_id,quest_id,objective_id,objective_type,object_id,amount,order_index) VALUES($1,33145,$2,$3,$4,2,$3)`, build, external+kind, kind, external)
	}
	query := strings.ReplaceAll(`SELECT `+questObjectivesSQL+` FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id WHERE e.product_id=1 AND e.entity_type='quest' AND e.external_id=33145`, "{locale}", "'ru_RU'")
	read := func() map[int]map[string]any {
		t.Helper()
		var raw []byte
		if err := tx.QueryRow(ctx, query).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var rows []map[string]any
		if err := json.Unmarshal(raw, &rows); err != nil {
			t.Fatal(err)
		}
		out := map[int]map[string]any{}
		for _, row := range rows {
			if row["id"].(float64) >= external {
				out[int(row["type"].(float64))] = row
			}
		}
		return out
	}
	actual := read()
	for kind, want := range map[int]string{0: "creature", 1: "item", 2: "", 3: "creature", 4: "currency", 5: "spell", 11: "creature", 16: "currency", 17: "currency", 21: ""} {
		row := actual[kind]
		if want == "" {
			if row["target"] != nil {
				t.Fatalf("type %d linked unrelated numeric ID", kind)
			}
			continue
		}
		target, ok := row["target"].(map[string]any)
		if !ok || target["entity_type"] != want {
			t.Fatalf("type %d target=%v", kind, row["target"])
		}
	}
	exec(`INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code) VALUES(1,$1,'item',$2,'review','test')`, build, external)
	if read()[1]["target"] != nil {
		t.Fatal("review target leaked")
	}
	exec(`DELETE FROM game_entity_localizations WHERE version_id=(SELECT published_version_id FROM game_entities WHERE entity_type='currency' AND external_id=$1) AND locale='ru_RU'`, external)
	row := read()[4]
	if row["description"] != "" {
		t.Fatal("invented objective description")
	}
	if row["target"].(map[string]any)["resolved_locale"] != "en_US" {
		t.Fatal("missing locale fallback marker")
	}
	exec(`INSERT INTO game_builds(product_id,build_number,version) VALUES(1,99179999,'test-quest-future')`)
	exec(`UPDATE game_entity_versions SET build_id=(SELECT id FROM game_builds WHERE build_number=99179999 AND product_id=1) WHERE entity_id=(SELECT id FROM game_entities WHERE entity_type='spell' AND external_id=$1)`, external)
	if read()[5]["target"] != nil {
		t.Fatal("future-build target leaked")
	}
	exec(`INSERT INTO catalog_quest_lines(build_id,quest_line_id) VALUES($1,99179999)`, build)
	exec(`INSERT INTO catalog_quest_line_entries(build_id,quest_line_id,quest_id,order_index) VALUES($1,99179999,33145,10),($1,99179999,34076,20),($1,99179999,34496,20),($1,99179999,34501,30)`, build)
	lineQuery := strings.ReplaceAll(`SELECT `+questLinesSQL+` FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id WHERE e.entity_type='quest' AND e.external_id=33145 AND e.product_id=1`, "{locale}", "'en_US'")
	var raw []byte
	if err = tx.QueryRow(ctx, lineQuery).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var lines []map[string]any
	if err = json.Unmarshal(raw, &lines); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, line := range lines {
		if line["id"].(float64) != 99179999 {
			continue
		}
		found = true
		if len(line["previous"].([]any)) != 0 || len(line["next"].([]any)) != 2 {
			t.Fatalf("incorrect order ties: %s", raw)
		}
	}
	if !found {
		t.Fatal("missing test storyline")
	}

	exec(`UPDATE game_entity_localizations SET attributes='{}' WHERE locale='ru_RU' AND version_id=(SELECT published_version_id FROM game_entities WHERE product_id=1 AND entity_type='quest' AND external_id=54)`)
	requirementQuery := strings.ReplaceAll(`SELECT `+questRequirementsSQL+` FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id LEFT JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale='ru_RU' LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US' WHERE e.product_id=1 AND e.entity_type='quest' AND e.external_id=$1`, "{locale}", "'ru_RU'")
	if err = tx.QueryRow(ctx, requirementQuery, 54).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var requirements map[string]any
	if err = json.Unmarshal(raw, &requirements); err != nil {
		t.Fatal(err)
	}
	if requirements["min_level"] != float64(1) || requirements["max_level"] != float64(10) {
		t.Fatalf("lost official numeric requirements in locale fallback: %s", raw)
	}
	if err = tx.QueryRow(ctx, requirementQuery, 33145).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	requirements = nil
	if err = json.Unmarshal(raw, &requirements); err != nil {
		t.Fatal(err)
	}
	if requirements["content_tuning_id"] == nil || requirements["min_level"] != nil {
		t.Fatalf("content tuning turned into a character level: %s", raw)
	}
}
