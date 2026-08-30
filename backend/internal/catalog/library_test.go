package catalog

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestLibraryFreshness(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	fresh := "fresh"
	failed := "failed"
	failure := "source artifact missing"
	recent := now.Add(-time.Hour)
	old := now.Add(-48 * time.Hour)

	tests := []struct {
		name      string
		status    *string
		failure   *string
		refreshed *time.Time
		count     int64
		want      string
	}{
		{name: "fresh", status: &fresh, refreshed: &recent, count: 10, want: "fresh"},
		{name: "old coverage", status: &fresh, refreshed: &old, count: 10, want: "stale"},
		{name: "empty", status: &fresh, refreshed: &recent, count: 0, want: "empty"},
		{name: "failed wins", status: &failed, failure: &failure, refreshed: &recent, count: 10, want: "failed"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, _ := libraryFreshness(test.status, test.failure, test.refreshed, test.count, now)
			if got != test.want {
				t.Fatalf("freshness = %q, want %q", got, test.want)
			}
		})
	}
}

func TestLocalizeFreshnessReason(t *testing.T) {
	const reason = "published data and coverage are current"
	if got := localizeFreshnessReason(reason, "ru_RU"); got != "Опубликованные данные и показатели покрытия актуальны." {
		t.Fatalf("Russian freshness reason = %q", got)
	}
	if got := localizeFreshnessReason(reason, "en_US"); got != reason {
		t.Fatalf("English freshness reason = %q", got)
	}
	const sourceError = "source artifact missing"
	if got := localizeFreshnessReason(sourceError, "ru_RU"); got != sourceError {
		t.Fatalf("source error must remain verbatim, got %q", got)
	}
}

func TestDatasetContainsEntityRejectsInvalidDatasetBeforeQuery(t *testing.T) {
	_, err := NewService(nil).DatasetContainsEntity(context.Background(), "x", uuid.Nil)
	if err == nil || err.Error() != "dataset must be between 2 and 64 characters" {
		t.Fatalf("unexpected validation result: %v", err)
	}
}

func TestLibraryDatasetsIntegration(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_LIBRARY_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_LIBRARY_INTEGRATION_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	datasets, err := NewService(db).LibraryDatasets(ctx, "wow", "ru_RU")
	if err != nil {
		t.Fatal(err)
	}
	bySlug := make(map[string]LibraryDataset, len(datasets))
	for _, dataset := range datasets {
		bySlug[dataset.Slug] = dataset
	}
	for _, slug := range []string{"items", "weapons", "armor", "spells", "quests", "npcs", "recipes", "mounts"} {
		if _, ok := bySlug[slug]; !ok {
			t.Fatalf("public dataset %q is missing", slug)
		}
	}
	weapons := bySlug["weapons"]
	if weapons.EntityCount != 1 || weapons.TooltipCount != 1 || weapons.ImageCount != 1 || weapons.Freshness != "fresh" {
		t.Fatalf("unexpected real dataset projection: %#v", weapons)
	}
}

func TestLibraryDatasetSummaryIntegration(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_LIBRARY_REAL_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_LIBRARY_REAL_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	service := NewService(db)
	for _, product := range []string{"wow", "wow_classic", "wow_classic_era", "wow_classic_hardcore"} {
		datasets, err := service.LibraryDatasets(ctx, product, "ru_RU")
		if err != nil {
			t.Fatal(err)
		}
		if len(datasets) != 29 {
			t.Fatalf("%s datasets=%d, want 29", product, len(datasets))
		}
		for _, dataset := range datasets {
			if dataset.VerifiedLocalizedCount > dataset.LocalizedCount || dataset.LocalizedCount > dataset.EntityCount || dataset.TooltipCount > dataset.EntityCount || dataset.ImageCount > dataset.EntityCount {
				t.Fatalf("%s dataset %s has invalid coverage: %#v", product, dataset.Slug, dataset)
			}
			if dataset.Applicability != "applicable" && dataset.Applicability != "pending_source" && dataset.Applicability != "not_applicable" {
				t.Fatalf("%s dataset %s has invalid applicability: %#v", product, dataset.Slug, dataset)
			}
			if dataset.EntityCount == 0 && dataset.Applicability == "applicable" && strings.TrimSpace(dataset.ApplicabilityReason) == "" {
				t.Fatalf("%s dataset %s has an unexplained empty state: %#v", product, dataset.Slug, dataset)
			}
			if dataset.EntityCount > 0 && dataset.Applicability != "applicable" {
				t.Fatalf("%s dataset %s has data but is marked %s: %#v", product, dataset.Slug, dataset.Applicability, dataset)
			}
			if dataset.EntityCount > 0 {
				page, err := service.Summaries(ctx, SummaryParams{
					Product: product, Dataset: dataset.Slug, Locale: "ru_RU", Limit: 1, IncludeTotal: true,
				})
				if err != nil {
					t.Fatalf("%s dataset %s summary: %v", product, dataset.Slug, err)
				}
				if page.Total == nil || *page.Total != dataset.EntityCount || len(page.Entities) != 1 {
					t.Fatalf("%s dataset %s summary total=%v entities=%d, dataset count=%d",
						product, dataset.Slug, page.Total, len(page.Entities), dataset.EntityCount)
				}
			}
		}
		var weapons LibraryDataset
		for _, dataset := range datasets {
			if dataset.Slug == "weapons" {
				weapons = dataset
				break
			}
		}
		if weapons.ItemClassID == nil || *weapons.ItemClassID != 2 || weapons.EntityCount == 0 {
			t.Fatalf("%s weapons dataset is invalid: %#v", product, weapons)
		}
		if weapons.ImageCount > 0 && (weapons.PreviewIconName == nil || *weapons.PreviewIconName == "") {
			t.Fatalf("%s weapons dataset has source-backed images but no card preview: %#v", product, weapons)
		}
		if weapons.PreviewImageURL != nil && !strings.HasPrefix(*weapons.PreviewImageURL, "https://api.gildra.net/v1/media/") {
			t.Fatalf("%s weapons dataset exposes a non-local preview URL: %#v", product, weapons)
		}
		page, err := service.Summaries(ctx, SummaryParams{
			Product: product, Dataset: weapons.Slug, Locale: "ru_RU", Limit: 1, IncludeTotal: true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total == nil || *page.Total != weapons.EntityCount || len(page.Entities) != 1 {
			t.Fatalf("%s summary total=%v entities=%d, dataset count=%d", product, page.Total, len(page.Entities), weapons.EntityCount)
		}
		item, err := service.Get(ctx, page.Entities[0].ID, "ru_RU")
		if err != nil {
			t.Fatal(err)
		}
		if item.Tooltip == nil || !hasTooltipBlock(item.Tooltip.Blocks, "item_variants") {
			t.Fatalf("%s item %d has no structured variant tooltip", product, item.ExternalID)
		}
		contains, err := service.DatasetContainsEntity(ctx, weapons.Slug, item.ID)
		if err != nil || !contains {
			t.Fatalf("%s weapon %d dataset membership=%t, error=%v", product, item.ExternalID, contains, err)
		}
		armorPage, err := service.Summaries(ctx, SummaryParams{
			Product: product, Dataset: "armor", Locale: "ru_RU", Limit: 1,
		})
		if err != nil || len(armorPage.Entities) != 1 {
			t.Fatalf("%s armor sample: entities=%d error=%v", product, len(armorPage.Entities), err)
		}
		contains, err = service.DatasetContainsEntity(ctx, weapons.Slug, armorPage.Entities[0].ID)
		if err != nil || contains {
			t.Fatalf("%s armor unexpectedly belongs to weapons: contains=%t error=%v", product, contains, err)
		}

		var uiMaps LibraryDataset
		for _, dataset := range datasets {
			if dataset.Slug == "ui-maps" {
				uiMaps = dataset
				break
			}
		}
		if uiMaps.EntityType != "ui_map" || uiMaps.EntityCount == 0 || uiMaps.TooltipCount > uiMaps.EntityCount {
			t.Fatalf("%s UI maps dataset is invalid: %#v", product, uiMaps)
		}
		uiMapPage, err := service.Summaries(ctx, SummaryParams{
			Product: product, Dataset: uiMaps.Slug, Locale: "ru_RU", Limit: 1, IncludeTotal: true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if uiMapPage.Total == nil || *uiMapPage.Total != uiMaps.EntityCount || len(uiMapPage.Entities) != 1 {
			t.Fatalf("%s UI map summary total=%v entities=%d, dataset count=%d",
				product, uiMapPage.Total, len(uiMapPage.Entities), uiMaps.EntityCount)
		}
		uiMap, err := service.Get(ctx, uiMapPage.Entities[0].ID, "ru_RU")
		if err != nil {
			t.Fatal(err)
		}
		if uiMap.Tooltip == nil || !hasTooltipBlock(uiMap.Tooltip.Blocks, "provenance") {
			t.Fatalf("%s UI map %d has no structured provenance tooltip", product, uiMap.ExternalID)
		}

		var quests LibraryDataset
		for _, dataset := range datasets {
			if dataset.Slug == "quests" {
				quests = dataset
				break
			}
		}
		if quests.EntityCount == 0 {
			t.Fatalf("%s quest dataset is empty: %#v", product, quests)
		}
		questPage, err := service.Summaries(ctx, SummaryParams{
			Product: product, Dataset: quests.Slug, Locale: "ru_RU", Limit: 1, IncludeTotal: true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if questPage.Total == nil || *questPage.Total != quests.EntityCount || len(questPage.Entities) != 1 {
			t.Fatalf("%s quest summary total=%v entities=%d, dataset count=%d",
				product, questPage.Total, len(questPage.Entities), quests.EntityCount)
		}
		quest, err := service.Get(ctx, questPage.Entities[0].ID, "ru_RU")
		if err != nil {
			t.Fatal(err)
		}
		if quest.Tooltip == nil || !hasTooltipBlock(quest.Tooltip.Blocks, "quest_info") || !hasTooltipBlock(quest.Tooltip.Blocks, "provenance") {
			t.Fatalf("%s quest %d has no structured quest/provenance tooltip", product, quest.ExternalID)
		}
	}
}

func TestCreatureLootTooltipRequiresSourceProof(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_LOOT_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_LOOT_INTEGRATION_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var ownerID, ownerVersionID, artifactID, itemID uuid.UUID
	var itemExternalID int64
	err = db.QueryRow(ctx, `
		SELECT owner.id,owner_version.id,artifact.id,item.id,item.external_id
		FROM game_entities owner
		JOIN game_entity_versions owner_version ON owner_version.id=owner.published_version_id
		JOIN catalog_creatures creature ON creature.version_id=owner_version.id
		JOIN catalog_source_artifacts artifact ON artifact.id=owner_version.source_artifact_id
		CROSS JOIN LATERAL (
			SELECT candidate.id,candidate.external_id
			FROM game_entities candidate
			JOIN game_entity_versions candidate_version ON candidate_version.id=candidate.published_version_id
			WHERE candidate.product_id=owner.product_id AND candidate.entity_type='item'
			  AND candidate_version.build_id=owner_version.build_id
			ORDER BY candidate.external_id LIMIT 1
		) item
		WHERE owner.entity_type='creature' AND owner.deleted_at IS NULL
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		ORDER BY owner.external_id LIMIT 1`).Scan(&ownerID, &ownerVersionID, &artifactID, &itemID, &itemExternalID)
	if err != nil {
		t.Fatal(err)
	}

	var lootTableID uuid.UUID
	err = db.QueryRow(ctx, `
		INSERT INTO catalog_loot_tables(owner_version_id,table_kind,external_id,source_artifact_id,attributes)
		VALUES ($1,'other',0,$2,'{"integration_test":true}'::jsonb)
		RETURNING id`, ownerVersionID, artifactID).Scan(&lootTableID)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.Exec(context.Background(), `DELETE FROM catalog_loot_tables WHERE id=$1`, lootTableID)
	}()
	_, err = db.Exec(ctx, `
		INSERT INTO catalog_loot_entries(
			loot_table_id,entry_index,item_external_id,item_entity_id,resolution_status,
			min_quantity,max_quantity,quantity_basis,chance_percent,chance_basis,source_artifact_id,attributes
		) VALUES ($1,0,$2,$3,'resolved',1,2,'source_exact',12.5,'source_exact',$4,'{"integration_test":true}'::jsonb)`,
		lootTableID, itemExternalID, itemID, artifactID)
	if err != nil {
		t.Fatal(err)
	}

	entity, err := NewService(db).Get(ctx, ownerID, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if entity.Tooltip == nil {
		t.Fatal("creature tooltip is nil")
	}
	for _, block := range entity.Tooltip.Blocks {
		if block["type"] != "creature_info" {
			continue
		}
		tables, ok := block["loot_tables"].([]any)
		if !ok || len(tables) != 1 {
			t.Fatalf("loot tables = %#v, want one source-proven table", block["loot_tables"])
		}
		table, ok := tables[0].(map[string]any)
		if !ok {
			t.Fatalf("loot table = %#v", tables[0])
		}
		entries, ok := table["entries"].([]any)
		if !ok || len(entries) != 1 {
			t.Fatalf("loot entries = %#v, want one entry", table["entries"])
		}
		return
	}
	t.Fatal("creature_info block is missing")
}

func TestCreatureTooltipShowsProjectedLoot(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_LOOT_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_LOOT_INTEGRATION_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var ownerID uuid.UUID
	if err := db.QueryRow(ctx, `
		SELECT owner.id
		FROM catalog_loot_tables loot
		JOIN game_entity_versions version ON version.id=loot.owner_version_id
		JOIN game_entities owner ON owner.id=version.entity_id
		JOIN catalog_loot_entries entry ON entry.loot_table_id=loot.id
		WHERE loot.attributes->>'projection'='att_crs'
		  AND owner.published_version_id=loot.owner_version_id
		ORDER BY owner.external_id LIMIT 1`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}

	entity, err := NewService(db).Get(ctx, ownerID, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if entity.Tooltip == nil {
		t.Fatal("creature tooltip is nil")
	}
	for _, block := range entity.Tooltip.Blocks {
		if block["type"] != "creature_info" {
			continue
		}
		tables, ok := block["loot_tables"].([]any)
		if !ok || len(tables) == 0 {
			t.Fatalf("projected loot tables = %#v, want at least one", block["loot_tables"])
		}
		table, ok := tables[0].(map[string]any)
		if !ok {
			t.Fatalf("projected loot table = %#v", tables[0])
		}
		entries, ok := table["entries"].([]any)
		if !ok || len(entries) == 0 {
			t.Fatalf("projected loot entries = %#v, want at least one", table["entries"])
		}
		entry, ok := entries[0].(map[string]any)
		if !ok {
			t.Fatalf("projected loot entry = %#v", entries[0])
		}
		if entry["quantity_basis"] != "unknown" || entry["chance_basis"] != "unknown" ||
			entry["min_quantity"] != nil || entry["max_quantity"] != nil || entry["chance_percent"] != nil {
			t.Fatalf("unproven quantity or chance was invented: %#v", entry)
		}
		return
	}
	t.Fatal("creature_info block is missing")
}

func hasTooltipBlock(blocks []map[string]any, blockType string) bool {
	for _, block := range blocks {
		if block["type"] == blockType {
			return true
		}
	}
	return false
}
