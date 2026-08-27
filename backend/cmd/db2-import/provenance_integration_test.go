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
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
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
		{"SpellMisc", 9000, map[string]any{"SpellID": "100", "DifficultyID": "0", "SchoolMask": "4", "CastingTimeIndex": "1", "RangeIndex": "1", "SpellIconFileDataID": "134399"}},
		{"SpellCastTimes", 1, map[string]any{"Base": "1500", "Minimum": "1500"}},
		{"SpellRange", 1, map[string]any{"RangeMin_0": "0", "RangeMax_0": "40"}},
		{"SpellCooldowns", 9001, map[string]any{"SpellID": "100", "DifficultyID": "0", "RecoveryTime": "3000", "StartRecoveryTime": "1500", "CategoryRecoveryTime": "0"}},
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
		{"Creature", 900, map[string]any{"Name_lang": "Provenance Keeper", "Title_lang": "Source guardian", "DisplayID_0": "901", "DisplayProbability_0": "1"}},
		{"CreatureDisplayInfo", 901, map[string]any{"ModelID": "902", "PortraitTextureFileDataID": "134402", "CreatureModelScale": "1", "CreatureModelAlpha": "255"}},
		{"CreatureModelData", 902, map[string]any{"FileDataID": "134403", "ModelScale": "1"}},
		{"CreatureDifficulty", 903, map[string]any{"CreatureID": "900", "FactionTemplateID": "35", "ContentTuningID": "1"}},
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
	listfileArtifact, err := store.RegisterArtifact(ctx, ic, "wow_listfile", "community-listfile", "",
		"https://github.com/wowdev/wow-listfile/blob/master/community-listfile.csv", map[string]any{"test": true})
	if err != nil {
		t.Fatal(err)
	}
	listfileHash := sha256.Sum256([]byte("integration-listfile"))
	if err := store.CompleteArtifact(ctx, listfileArtifact, listfileHash[:], int64(len("integration-listfile")), ""); err != nil {
		t.Fatal(err)
	}
	for fileDataID, iconName := range map[int64]string{134399: "spell_test_provenance", 999999: "inv_test_provenance"} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO catalog_file_assets(
				file_data_id,path,icon_name,source_url,content_hash,snapshot_id,source_artifact_id)
			VALUES($1,$2,$3,'https://github.com/wowdev/wow-listfile/blob/master/community-listfile.csv',
				$4,$5,$6)`, fileDataID, "interface/icons/"+iconName+".blp", iconName,
			listfileHash[:], ic.SnapshotID, listfileArtifact); err != nil {
			t.Fatalf("insert listfile asset %d: %v", fileDataID, err)
		}
	}
	itemProofHash := sha256.Sum256([]byte("complete-item-artifact"))
	if err := recordDB2Completeness(ctx, pool, ic, artifacts["Item"], "Item", "en_US",
		"https://wago.tools/db2/Item/csv?build=99.0.0.990001", 2,
		wago.ContentProof{SHA256: itemProofHash[:], ByteSize: 42, Complete: true}, nil); err != nil {
		t.Fatalf("record DB2 completeness: %v", err)
	}
	var completenessStatus string
	var expectedCount, importedCount, excludedCount, missingCount int64
	if err := pool.QueryRow(ctx, `
		SELECT status,expected_count,imported_count,excluded_count,missing_count
		FROM catalog_completeness_latest
		WHERE build_id=$1 AND scope_key='db2.item' AND locale='en_US'`, ic.BuildID).Scan(
		&completenessStatus, &expectedCount, &importedCount, &excludedCount, &missingCount,
	); err != nil {
		t.Fatalf("read DB2 completeness: %v", err)
	}
	if completenessStatus != "complete" || expectedCount != 2 || importedCount != 2 || excludedCount != 0 || missingCount != 0 {
		t.Fatalf("unexpected DB2 completeness: status=%s expected=%d imported=%d excluded=%d missing=%d",
			completenessStatus, expectedCount, importedCount, excludedCount, missingCount)
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
	if err := observeDB2LocalizationArtifacts(ctx, pool, ic); err != nil {
		t.Fatalf("observe DB2 localization artifacts: %v", err)
	}

	assertEntityArtifact(t, ctx, pool, "spell", 100, artifacts["SpellName"])
	assertEntityArtifact(t, ctx, pool, "item", 200, artifacts["ItemSparse"])
	assertEntityArtifact(t, ctx, pool, "profession", 500, artifacts["SkillLine"])
	assertEntityArtifact(t, ctx, pool, "recipe", 100, artifacts["SkillLineAbility"])
	assertEntityArtifact(t, ctx, pool, "creature", 900, artifacts["Creature"])
	assertEntityArtifact(t, ctx, pool, "quest", 1000, artifacts["QuestV2CliTask"])
	assertVersionObservation(t, ctx, pool, "item", 200, artifacts["ItemSparse"])
	assertVersionObservation(t, ctx, pool, "recipe", 100, artifacts["SpellName"])
	for _, proof := range []struct {
		entityType string
		externalID int64
		locale     string
		artifact   uuid.UUID
	}{
		{"item", 200, "en_US", artifacts["ItemSparse"]},
		{"spell", 100, "en_US", artifacts["SpellName"]},
		{"profession", 500, "en_US", artifacts["SkillLine"]},
		{"creature", 900, "en_US", artifacts["Creature"]},
		{"quest", 1000, "en_US", artifacts["QuestV2CliTask"]},
		{"recipe", 100, "en_US", artifacts["SpellName"]},
	} {
		assertLocalizationArtifact(t, ctx, pool, proof.entityType, proof.externalID,
			proof.locale, proof.artifact)
	}

	assertFactArtifact(t, ctx, pool, "profession recipe", `SELECT source_artifact_id FROM catalog_profession_recipes LIMIT 1`, artifacts["SkillLineAbility"])
	assertFactArtifact(t, ctx, pool, "recipe reagent", `SELECT source_artifact_id FROM catalog_recipe_reagents LIMIT 1`, artifacts["SpellReagents"])
	assertFactArtifact(t, ctx, pool, "recipe currency", `SELECT source_artifact_id FROM catalog_recipe_currencies LIMIT 1`, artifacts["SpellReagentsCurrency"])
	assertFactArtifact(t, ctx, pool, "recipe output", `SELECT source_artifact_id FROM catalog_recipe_outputs LIMIT 1`, artifacts["SpellEffect"])
	assertFactArtifact(t, ctx, pool, "item effect", `SELECT source_artifact_id FROM catalog_item_effects LIMIT 1`, artifacts["ItemXItemEffect"])
	assertFactArtifact(t, ctx, pool, "spell effect", `SELECT source_artifact_id FROM catalog_spell_effects WHERE source='db2' LIMIT 1`, artifacts["SpellEffect"])
	assertFactArtifact(t, ctx, pool, "creature display", `SELECT source_artifact_id FROM catalog_creature_displays LIMIT 1`, artifacts["Creature"])
	assertFactArtifact(t, ctx, pool, "creature display info", `SELECT source_artifact_id FROM catalog_creature_display_info LIMIT 1`, artifacts["CreatureDisplayInfo"])
	assertFactArtifact(t, ctx, pool, "creature model", `SELECT source_artifact_id FROM catalog_creature_models LIMIT 1`, artifacts["CreatureModelData"])
	assertFactArtifact(t, ctx, pool, "creature difficulty", `SELECT source_artifact_id FROM catalog_creature_difficulties LIMIT 1`, artifacts["CreatureDifficulty"])
	var school string
	var schoolMask, castTimeMS, cooldownMS int
	var maxRange float64
	var miscArtifact, castArtifact, cooldownArtifact, rangeArtifact uuid.UUID
	if err := pool.QueryRow(ctx, `
		SELECT detail.school,detail.school_mask,detail.cast_time_ms,detail.cooldown_ms,detail.max_range,
			detail.misc_source_artifact_id,detail.cast_time_source_artifact_id,
			detail.cooldown_source_artifact_id,detail.range_source_artifact_id
		FROM catalog_spells detail
		JOIN game_entities entity ON entity.latest_version_id=detail.version_id
		WHERE entity.entity_type='spell' AND entity.external_id=100`).Scan(
		&school, &schoolMask, &castTimeMS, &cooldownMS, &maxRange,
		&miscArtifact, &castArtifact, &cooldownArtifact, &rangeArtifact,
	); err != nil {
		t.Fatalf("read spell mechanics: %v", err)
	}
	if school != "fire" || schoolMask != 4 || castTimeMS != 1500 || cooldownMS != 3000 || maxRange != 40 {
		t.Fatalf("unexpected spell mechanics: school=%s mask=%d cast=%d cooldown=%d range=%v",
			school, schoolMask, castTimeMS, cooldownMS, maxRange)
	}
	if miscArtifact != artifacts["SpellMisc"] || castArtifact != artifacts["SpellCastTimes"] ||
		cooldownArtifact != artifacts["SpellCooldowns"] || rangeArtifact != artifacts["SpellRange"] {
		t.Fatal("spell mechanic artifact provenance does not match source DB2 tables")
	}
	assertFactArtifact(t, ctx, pool, "crafting acquisition", `SELECT source_artifact_id FROM catalog_item_acquisition_sources WHERE source_type='crafting_recipe' LIMIT 1`, artifacts["SpellEffect"])
	var recipeSpellID int64
	var recipeEntityType, recipeSpellEntityType string
	if err := pool.QueryRow(ctx, `
		SELECT recipe.spell_id,recipe_entity.entity_type,spell_entity.entity_type
		FROM catalog_recipes recipe
		JOIN game_entity_versions recipe_version ON recipe_version.id=recipe.version_id
		JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id
		JOIN game_entity_versions spell_version ON spell_version.id=recipe.source_spell_version_id
		JOIN game_entities spell_entity ON spell_entity.id=spell_version.entity_id
		WHERE recipe_entity.external_id=100`).Scan(&recipeSpellID, &recipeEntityType, &recipeSpellEntityType); err != nil {
		t.Fatalf("read normalized recipe identity: %v", err)
	}
	if recipeSpellID != 100 || recipeEntityType != "recipe" || recipeSpellEntityType != "spell" {
		t.Fatalf("unexpected recipe identity: spell=%d recipe_type=%s source_type=%s",
			recipeSpellID, recipeEntityType, recipeSpellEntityType)
	}
	var acquisitionSourceType string
	if err := pool.QueryRow(ctx, `
		SELECT source_entity.entity_type
		FROM catalog_item_acquisition_sources acquisition
		JOIN game_entities source_entity ON source_entity.id=acquisition.source_entity_id
		WHERE acquisition.source_type='crafting_recipe' LIMIT 1`).Scan(&acquisitionSourceType); err != nil {
		t.Fatalf("read crafting acquisition entity: %v", err)
	}
	if acquisitionSourceType != "recipe" {
		t.Fatalf("crafting acquisition source type=%s, want recipe", acquisitionSourceType)
	}

	if _, err := pool.Exec(ctx, `
		UPDATE catalog_db2_rows
		SET payload=payload || '{"IconFileDataID":"999999"}'::jsonb,
			content_hash=digest(convert_to((payload || '{"IconFileDataID":"999999"}'::jsonb)::text,'UTF8'),'sha256')
		WHERE build_id=$1 AND table_name='Item' AND locale='en_US' AND row_id=200`, ic.BuildID); err != nil {
		t.Fatalf("change item icon source fact: %v", err)
	}
	if _, err := projectItems(ctx, pool, ic); err != nil {
		t.Fatalf("reproject changed item: %v", err)
	}
	var itemRevisions int
	var latestIconID int64
	if err := pool.QueryRow(ctx, `
		SELECT count(*),MAX(CASE WHEN version.id=entity.latest_version_id
			THEN (version.payload->>'icon_file_data_id')::bigint END)
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1
		WHERE entity.entity_type='item' AND entity.external_id=200
		GROUP BY entity.id`, ic.BuildID).Scan(&itemRevisions, &latestIconID); err != nil {
		t.Fatalf("read reprojected item revisions: %v", err)
	}
	if itemRevisions != 2 || latestIconID != 999999 {
		t.Fatalf("item revisions=%d latest icon=%d, want 2 and 999999", itemRevisions, latestIconID)
	}
	if _, err := catalogtaxonomy.New(pool).RebuildIcons(ctx); err != nil {
		t.Fatalf("rebuild icons: %v", err)
	}
	assertIconProvenance(t, ctx, pool, "spell", 100, "spell_test_provenance", 134399,
		artifacts["SpellMisc"], listfileArtifact)
	assertIconProvenance(t, ctx, pool, "recipe", 100, "spell_test_provenance", 134399,
		artifacts["SpellMisc"], listfileArtifact)
	assertIconProvenance(t, ctx, pool, "item", 200, "inv_test_provenance", 999999,
		artifacts["Item"], listfileArtifact)

	officialContext, err := store.Begin(ctx, "wow", 990000, "99.0.0.990000", "us", "battlenet", nil,
		map[string]any{"integration_test": "quest_reward_carry_forward"})
	if err != nil {
		t.Fatal(err)
	}
	officialArtifact, err := store.RegisterArtifact(ctx, officialContext, "blizzard_api", "quest", "en_US",
		"https://us.api.blizzard.com/data/wow/quest/1000", map[string]any{"test": true})
	if err != nil {
		t.Fatal(err)
	}
	itemID := int64(200)
	if err := store.ReplaceBattleNetQuestRewards(ctx, officialContext, 1000, "en_US", []catalogimport.QuestReward{{
		Type: "item", Index: 0, ExternalID: &itemID, Amount: 1, Name: "Provenance Output",
	}}, officialArtifact); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE game_builds SET is_active=(build_number=990001)
		WHERE product_id=$1`, ic.ProductID); err != nil {
		t.Fatal(err)
	}
	rewardResult, err := catalogtaxonomy.New(pool).RebuildQuestRewards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if rewardResult.QuestRewards != 1 {
		t.Fatalf("carried quest rewards=%d, want 1", rewardResult.QuestRewards)
	}
	var rewardSourceBuild int64
	var rewardArtifact uuid.UUID
	if err := pool.QueryRow(ctx, `
		SELECT source_build.build_number,reward.source_artifact_id
		FROM catalog_quest_rewards reward
		JOIN game_builds target_build ON target_build.id=reward.build_id
		JOIN game_builds source_build ON source_build.id=reward.source_build_id
		WHERE target_build.build_number=990001 AND reward.quest_id=1000
		  AND reward.reward_type='item' AND reward.reward_index=0`).Scan(
		&rewardSourceBuild, &rewardArtifact,
	); err != nil {
		t.Fatalf("read carried quest reward: %v", err)
	}
	if rewardSourceBuild != 990000 || rewardArtifact != officialArtifact {
		t.Fatalf("quest reward source build=%d artifact=%s, want 990000 and %s",
			rewardSourceBuild, rewardArtifact, officialArtifact)
	}
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

func assertVersionObservation(t *testing.T, ctx context.Context, pool *pgxpool.Pool, entityType string, externalID int64, expected uuid.UUID) {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM game_entities entity
			JOIN catalog_entity_version_artifacts observation
			  ON observation.version_id=entity.latest_version_id
			WHERE entity.entity_type=$1 AND entity.external_id=$2
			  AND observation.source_artifact_id=$3
		)`, entityType, externalID, expected).Scan(&exists); err != nil {
		t.Fatalf("read %s version provenance: %v", entityType, err)
	}
	if !exists {
		t.Fatalf("missing %s %d version artifact %s", entityType, externalID, expected)
	}
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

func assertIconProvenance(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	entityType string,
	externalID int64,
	iconName string,
	fileDataID int64,
	referenceArtifact uuid.UUID,
	assetArtifact uuid.UUID,
) {
	t.Helper()
	var actualName string
	var actualFileDataID int64
	var actualReferenceArtifact, actualAssetArtifact uuid.UUID
	if err := pool.QueryRow(ctx, `
		SELECT icon_name,file_data_id,source_artifact_id,asset_source_artifact_id
		FROM catalog_entity_icons
		WHERE entity_type=$1 AND external_id=$2`, entityType, externalID).Scan(
		&actualName, &actualFileDataID, &actualReferenceArtifact, &actualAssetArtifact,
	); err != nil {
		t.Fatalf("read %s icon provenance: %v", entityType, err)
	}
	if actualName != iconName || actualFileDataID != fileDataID ||
		actualReferenceArtifact != referenceArtifact || actualAssetArtifact != assetArtifact {
		t.Fatalf("unexpected %s icon provenance: name=%s file=%d reference=%s asset=%s",
			entityType, actualName, actualFileDataID, actualReferenceArtifact, actualAssetArtifact)
	}
}

func assertLocalizationArtifact(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	entityType string,
	externalID int64,
	locale string,
	expected uuid.UUID,
) {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM game_entities entity
			JOIN catalog_entity_localization_artifacts observation
			  ON observation.version_id=entity.latest_version_id AND observation.locale=$3
			WHERE entity.entity_type=$1 AND entity.external_id=$2
			  AND observation.source_artifact_id=$4
		)`, entityType, externalID, locale, expected).Scan(&exists); err != nil {
		t.Fatalf("read %s %s localization provenance: %v", entityType, locale, err)
	}
	if !exists {
		t.Fatalf("missing %s %d %s localization artifact %s", entityType, externalID, locale, expected)
	}
}
