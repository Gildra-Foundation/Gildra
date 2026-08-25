//go:build integration

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogtaxonomy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestDB2ProjectionPreservesArtifactProvenance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	postgres, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase("gildra"),
		pgcontainer.WithUsername("gildra"),
		pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, postgres)
	postgresURL, err := postgres.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	store := catalogimport.NewStore(pool)
	ic, err := store.Begin(ctx, "wow", 990001, "99.0.0.990001", "us", "wago_tools", nil,
		map[string]any{"integration_test": "db2_projection_provenance"})
	if err != nil {
		t.Fatal(err)
	}

	rows := []db2ProofRow{
		{"SpellName", 100, map[string]any{"Name_lang": "Provenance Recipe"}},
		{"Spell", 100, map[string]any{"Description_lang": "Creates a provenanced item."}},
		{"SpellEffect", 800, map[string]any{"SpellID": "100", "EffectIndex": "0", "DifficultyID": "0", "Effect": "24", "EffectItemType": "200"}},
		{"ItemSparse", 200, proofItem("Provenance Output")},
		{"ItemSparse", 201, proofItem("Provenance Reagent")},
		{"Item", 200, map[string]any{"ClassID": "7", "SubclassID": "0", "IconFileDataID": "134400"}},
		{"Item", 201, map[string]any{"ClassID": "7", "SubclassID": "0", "IconFileDataID": "134401"}},
		{"ItemXItemEffect", 301, map[string]any{"ItemID": "200", "ItemEffectID": "300"}},
		{"ItemEffect", 300, map[string]any{"SpellID": "100", "LegacySlotIndex": "0", "TriggerType": "0"}},
		{"SkillLine", 500, map[string]any{"DisplayName_lang": "Provenance Craft", "Description_lang": "Integration profession", "CategoryID": "11"}},
		{"TradeSkillCategory", 600, map[string]any{"SkillLineID": "500", "Name_lang": "Proof Recipes", "OrderIndex": "1"}},
		{"SkillLineAbility", 700, map[string]any{"SkillLine": "500", "Spell": "100", "TradeSkillCategoryID": "600", "MinSkillLineRank": "1"}},
		{"SpellReagents", 701, map[string]any{"SpellID": "100", "Reagent_0": "201", "ReagentCount_0": "2"}},
		{"SpellReagentsCurrency", 702, map[string]any{"SpellID": "100", "CurrencyTypesID": "1", "CurrencyCount": "3"}},
		{"Creature", 900, map[string]any{"Name_lang": "Provenance Keeper", "Title_lang": "Source guardian"}},
		{"QuestV2", 1000, map[string]any{"UniqueBitFlag": "1"}},
		{"QuestV2CliTask", 1000, map[string]any{"QuestTitle_lang": "Prove the Source", "BulletText_lang": "Keep the artifact link."}},
	}
	artifacts := make(map[string]uuid.UUID)
	for _, proof := range rows {
		artifactID, ok := artifacts[proof.table]
		if !ok {
			artifactID, err = store.RegisterArtifact(ctx, ic, "wago_tools", proof.table, "en_US",
				"https://wago.tools/db2/"+proof.table+"/csv?build=99.0.0.990001", map[string]any{"test": true})
			if err != nil {
				t.Fatal(err)
			}
			artifacts[proof.table] = artifactID
		}
		insertDB2ProofRow(t, ctx, pool, ic, artifactID, proof)
	}

	projectors := []struct {
		name string
		run  func(context.Context, *pgxpool.Pool, catalogimport.ImportContext) (int64, error)
	}{
		{"spells", projectSpells},
		{"items", projectItems},
		{"professions", projectProfessions},
		{"creatures", projectCreatures},
		{"quests", projectQuests},
	}
	for _, projector := range projectors {
		if _, err := projector.run(ctx, pool, ic); err != nil {
			t.Fatalf("project %s: %v", projector.name, err)
		}
	}
	if _, err := catalogtaxonomy.New(pool).RebuildSpellEffects(ctx); err != nil {
		t.Fatalf("rebuild spell effects: %v", err)
	}
	// Crafting acquisition rows depend on recipe outputs created by the
	// profession projector, so rebuild item details once after that projection.
	if _, err := projectItems(ctx, pool, ic); err != nil {
		t.Fatalf("rebuild item acquisition: %v", err)
	}

	assertEntityArtifact(t, ctx, pool, "spell", 100, artifacts["SpellName"])
	assertEntityArtifact(t, ctx, pool, "item", 200, artifacts["ItemSparse"])
	assertEntityArtifact(t, ctx, pool, "profession", 500, artifacts["SkillLine"])
	assertEntityArtifact(t, ctx, pool, "creature", 900, artifacts["Creature"])
	assertEntityArtifact(t, ctx, pool, "quest", 1000, artifacts["QuestV2CliTask"])

	assertFactArtifact(t, ctx, pool, "profession recipe", `SELECT source_artifact_id FROM catalog_profession_recipes LIMIT 1`, artifacts["SkillLineAbility"])
	assertFactArtifact(t, ctx, pool, "recipe reagent", `SELECT source_artifact_id FROM catalog_recipe_reagents LIMIT 1`, artifacts["SpellReagents"])
	assertFactArtifact(t, ctx, pool, "recipe currency", `SELECT source_artifact_id FROM catalog_recipe_currencies LIMIT 1`, artifacts["SpellReagentsCurrency"])
	assertFactArtifact(t, ctx, pool, "recipe output", `SELECT source_artifact_id FROM catalog_recipe_outputs LIMIT 1`, artifacts["SpellEffect"])
	assertFactArtifact(t, ctx, pool, "item effect", `SELECT source_artifact_id FROM catalog_item_effects LIMIT 1`, artifacts["ItemXItemEffect"])
	assertFactArtifact(t, ctx, pool, "spell effect", `SELECT source_artifact_id FROM catalog_spell_effects WHERE source='db2' LIMIT 1`, artifacts["SpellEffect"])
	assertFactArtifact(t, ctx, pool, "crafting acquisition", `SELECT source_artifact_id FROM catalog_item_acquisition_sources WHERE source_type='crafting_recipe' LIMIT 1`, artifacts["SpellEffect"])
}

type db2ProofRow struct {
	table   string
	rowID   int64
	payload map[string]any
}

func proofItem(name string) map[string]any {
	return map[string]any{
		"Display_lang": name, "Description_lang": "Integration test item",
		"OverallQualityID": "1", "ItemLevel": "10", "RequiredLevel": "1",
		"InventoryType": "0", "Stackable": "20", "MaxCount": "0",
		"BuyPrice": "0", "SellPrice": "0",
	}
}

func insertDB2ProofRow(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	ic catalogimport.ImportContext,
	artifactID uuid.UUID,
	proof db2ProofRow,
) {
	t.Helper()
	payload, err := json.Marshal(proof.payload)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(payload)
	if _, err := pool.Exec(ctx, `
		INSERT INTO catalog_db2_rows(
			build_id,table_name,locale,row_id,payload,content_hash,source_url,snapshot_id,source_artifact_id)
		VALUES($1,$2,'en_US',$3,$4,$5,$6,$7,$8)`,
		ic.BuildID, proof.table, proof.rowID, payload, hash[:],
		"https://wago.tools/db2/"+proof.table+"/csv?build=99.0.0.990001", ic.SnapshotID, artifactID); err != nil {
		t.Fatalf("insert %s %d: %v", proof.table, proof.rowID, err)
	}
}

func assertEntityArtifact(t *testing.T, ctx context.Context, pool *pgxpool.Pool, entityType string, externalID int64, expected uuid.UUID) {
	t.Helper()
	assertFactArtifact(t, ctx, pool, entityType, `
		SELECT version.source_artifact_id
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		WHERE entity.entity_type=$1 AND entity.external_id=$2`, expected, entityType, externalID)
}

func assertFactArtifact(t *testing.T, ctx context.Context, pool *pgxpool.Pool, label, query string, expected uuid.UUID, args ...any) {
	t.Helper()
	var actual uuid.UUID
	if err := pool.QueryRow(ctx, query, args...).Scan(&actual); err != nil {
		t.Fatalf("read %s provenance: %v", label, err)
	}
	if actual != expected {
		t.Fatalf("%s artifact = %s, want %s", label, actual, expected)
	}
}
