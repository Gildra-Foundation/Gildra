//go:build integration

package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// This opt-in test projects a bounded, build-pinned export of real source rows.
// It never reads DATABASE_URL and always creates its own disposable PostgreSQL.
func TestMidnightProfessionSourceBackfill(t *testing.T) {
	path := os.Getenv("MIDNIGHT_PROFESSION_SOURCE")
	if path == "" {
		t.Skip("set MIDNIGHT_PROFESSION_SOURCE to B-source-92.jsonl")
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	pg, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23", pgcontainer.WithDatabase("gildra"), pgcontainer.WithUsername("gildra"), pgcontainer.WithPassword("test-password"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, pg)
	url, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	goose.SetDialect("postgres")
	goose.SetLogger(goose.NopLogger())
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	store := catalogimport.NewStore(pool)
	ic, err := store.Begin(ctx, "wow", 69587, "12.1.0.69587", "us", "wago_tools", nil, map[string]any{"bounded_source_test": true})
	if err != nil {
		t.Fatal(err)
	}
	artifacts := map[string]uuid.UUID{}
	artifactBytes := map[string][]byte{}
	expected := map[int64]map[int64]bool{}
	names := map[int64]bool{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	for scanner.Scan() {
		var r struct {
			Table     string
			ID        int64
			Locale    string
			Payload   json.RawMessage
			SourceURL string `json:"source_url"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &r); err != nil {
			t.Fatal(err)
		}
		if r.Table == "SpellName" && r.Locale == "en_US" {
			names[r.ID] = true
		}
		key := r.Table + "/" + r.Locale
		artifactBytes[key] = append(artifactBytes[key], scanner.Bytes()...)
		artifactBytes[key] = append(artifactBytes[key], byte(10))
		artifact, ok := artifacts[key]
		if !ok {
			artifact, err = store.RegisterArtifact(ctx, ic, "wago_tools", r.Table, r.Locale, r.SourceURL, map[string]any{"bounded_export": true})
			if err != nil {
				t.Fatal(err)
			}
			artifacts[key] = artifact
		}
		hash := sha256.Sum256(r.Payload)
		_, err = pool.Exec(ctx, `INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,snapshot_id,source_artifact_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, ic.BuildID, r.Table, r.Locale, r.ID, r.Payload, hash[:], r.SourceURL, ic.SnapshotID, artifact)
		if err != nil {
			t.Fatal(err)
		}
		if r.Table == "SkillLineAbility" {
			var p map[string]string
			json.Unmarshal(r.Payload, &p)
			skill, _ := strconv.ParseInt(p["SkillupSkillLineID"], 10, 64)
			spell, _ := strconv.ParseInt(p["Spell"], 10, 64)
			category, _ := strconv.Atoi(p["TradeSkillCategoryID"])
			if category > 0 {
				if expected[skill] == nil {
					expected[skill] = map[int64]bool{}
				}
				expected[skill][spell] = true
			}
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	for key, id := range artifacts {
		h := sha256.Sum256(artifactBytes[key])
		if err := store.CompleteArtifact(ctx, id, h[:], int64(len(artifactBytes[key])), ""); err != nil {
			t.Fatal(err)
		}
	}
	// Preserve unknown-name source links in the preparation artifact, but never invent spell names.
	for skill, spells := range expected {
		for spell := range spells {
			if !names[spell] {
				delete(expected[skill], spell)
			}
		}
	}
	var relations struct {
		Inputs  [][]int64
		Outputs [][]json.RawMessage
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(path), "B-relations.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &relations); err != nil {
		t.Fatal(err)
	}
	itemIDs := map[int64]bool{}
	expectedInputs, expectedOutputs := 0, 0
	for _, r := range relations.Inputs {
		if names[r[0]] {
			expectedInputs++
			itemIDs[r[2]] = true
		}
	}
	for _, r := range relations.Outputs {
		var spell, item int64
		json.Unmarshal(r[0], &spell)
		json.Unmarshal(r[1], &item)
		if names[spell] {
			expectedOutputs++
			itemIDs[item] = true
		}
	}
	for id := range itemIDs {
		if _, err := pool.Exec(ctx, `INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id) VALUES($1,$2,'item',$3,$4,$5,$5)`, ic.ProductID, ic.NamespaceID, id, "item-"+strconv.FormatInt(id, 10), ic.BuildID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := projectSpells(ctx, pool, ic); err != nil {
		t.Fatal(err)
	}
	// Projection must resolve the requested build, not depend on a mutable latest pointer.
	if _, err := pool.Exec(ctx, "UPDATE game_entities SET latest_version_id=NULL WHERE entity_type='spell'"); err != nil {
		t.Fatal(err)
	}
	var previous int
	for pass := 0; pass < 2; pass++ {
		if _, err := projectProfessions(ctx, pool, ic); err != nil {
			t.Fatal(err)
		}
		if err := projectMidnightMembership(ctx, pool, ic); err != nil {
			t.Fatal(err)
		}
		var professionMembers, recipeMembers int
		if err := pool.QueryRow(ctx, `SELECT count(*) FILTER(WHERE entity_type='profession'),count(*) FILTER(WHERE entity_type='recipe') FROM catalog_entity_expansions WHERE build_id=$1 AND classification='confirmed'`, ic.BuildID).Scan(&professionMembers, &recipeMembers); err != nil {
			t.Fatal(err)
		}
		if professionMembers != 13 || recipeMembers != 1013 {
			t.Fatalf("membership %d/%d, want13/1013", professionMembers, recipeMembers)
		}

		var branches, versions int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_professions WHERE skill_line_id BETWEEN 2906 AND 2918`).Scan(&branches); err != nil {
			t.Fatal(err)
		}
		if branches != 13 {
			t.Fatalf("branches=%d want 13 including Cooking/Fishing", branches)
		}
		for skill, spells := range expected {
			var count int
			err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_profession_recipes r JOIN catalog_professions p ON p.version_id=r.profession_version_id WHERE p.skill_line_id=$1`, skill).Scan(&count)
			if err != nil {
				t.Fatal(err)
			}
			if count != len(spells) {
				t.Fatalf("skill %d links=%d source=%d", skill, count, len(spells))
			}
			if pass == 0 {
				t.Logf("skill %d recipes %d", skill, count)
			}
		}
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM game_entity_versions").Scan(&versions); err != nil {
			t.Fatal(err)
		}
		if pass == 1 && versions != previous {
			t.Fatalf("rerun created versions: %d -> %d", previous, versions)
		}
		previous = versions
	}
	var missing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_profession_recipes r JOIN catalog_professions p ON p.version_id=r.profession_version_id WHERE p.skill_line_id BETWEEN 2906 AND 2918 AND (r.trade_skill_category_id IS NULL OR r.source_artifact_id IS NULL)`).Scan(&missing); err != nil {
		t.Fatal(err)
	}
	if missing != 0 {
		t.Fatalf("missing category/provenance %d", missing)
	}
	for _, table := range []string{"catalog_recipe_reagents", "catalog_recipe_outputs"} {
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		want := expectedInputs
		if table == "catalog_recipe_outputs" {
			want = expectedOutputs
		}
		if count != want {
			t.Fatalf("%s count=%d source=%d", table, count, want)
		}
		var dangling int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE item_entity_id IS NULL OR source_artifact_id IS NULL").Scan(&dangling); err != nil {
			t.Fatal(err)
		}
		if dangling != 0 {
			t.Fatalf("%s dangling=%d", table, dangling)
		}
		t.Logf("%s=%d", table, count)
	}
}
