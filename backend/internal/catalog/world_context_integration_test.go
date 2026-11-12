package catalog

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"path/filepath"
	"testing"
)

func TestWorldContextBoundaries(t *testing.T) {
	creature := Entity{Type: "creature", Locale: "ru_RU"}
	facts := map[string]any{"source": map[string]any{"Classification": "3", "CreatureType": "7", "DisplayID_0": "9"}}
	enrichWorldFacts(&creature, facts)
	if _, ok := facts["classification"]; ok {
		t.Fatal("obsolete classification presented as boss")
	}
	if len(facts["displays"].([]any)) != 1 {
		t.Fatal("display missing")
	}
	facts["content_tuning"] = map[string]any{"MinLevelSquish": "1", "MaxLevelSquish": "80"}
	enrichWorldFacts(&creature, facts)
	if _, ok := facts["level_range"]; ok {
		t.Fatal("unknown tuning interpreted as fixed level")
	}
	tuning := facts["content_tuning"].(map[string]any)
	tuning["Flags"] = "0"
	tuning["MinLevelScalingOffset"] = "0"
	tuning["MaxLevelScalingOffset"] = "2"
	enrichWorldFacts(&creature, facts)
	if _, ok := facts["level_range"]; ok {
		t.Fatal("relative level presented as absolute")
	}
	tuning["MaxLevelScalingOffset"] = "0"
	enrichWorldFacts(&creature, facts)
	if facts["level_range"] == nil {
		t.Fatal("fixed level missing")
	}
	currency := Entity{Type: "currency"}
	caps := map[string]any{"source": map[string]any{"Flags_0": "8", "Flags_1": "0", "MaxQtyWorldStateID": "0", "MaxQty": "12000", "MaxEarnablePerWeek": "5000"}}
	enrichWorldFacts(&currency, caps)
	if caps["max_quantity"] != float64(120) || caps["weekly_cap"] != float64(50) {
		t.Fatal("currency 100 scaler ignored")
	}
	caps = map[string]any{"source": map[string]any{"Flags_0": "262148", "Flags_1": "0", "MaxQtyWorldStateID": "1", "MaxQty": "12000", "MaxEarnablePerWeek": "5000"}}
	enrichWorldFacts(&currency, caps)
	if caps["max_quantity"] != nil || caps["weekly_cap"] != nil {
		t.Fatal("dynamic currency cap treated as fixed")
	}
	faction := Entity{Type: "faction", Description: "12.0 Silvermoon - NPC Faction Only", RawDescription: "original", Tooltip: &Tooltip{Blocks: []map[string]any{{"type": "description", "text": "NPC Faction Only"}}}}
	appendWorldTooltip(&faction, map[string]any{})
	if faction.Description != "" || len(faction.Tooltip.Blocks) != 0 || faction.RawDescription != "original" {
		t.Fatal("internal note not suppressed or raw evidence changed")
	}
}

func TestWorldRealSourceDetails(t *testing.T) {
	dsn := os.Getenv("WORLD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated WORLD fixture required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var safe bool
	if err = db.QueryRow(ctx, `SELECT current_database()='world'`).Scan(&safe); err != nil || !safe {
		t.Fatalf("unsafe fixture %v", err)
	}
	service := NewService(db)
	samples := []any{}
	for _, typ := range []string{"area", "map", "ui_map", "creature", "faction", "currency", "instance", "encounter"} {
		rows, err := db.Query(ctx, `SELECT id,external_id FROM game_entities WHERE entity_type=$1 AND NOT EXISTS(SELECT 1 FROM catalog_entity_usability u WHERE u.product_id=game_entities.product_id AND u.build_id=92 AND u.entity_type=game_entities.entity_type AND u.external_id=game_entities.external_id AND u.decision<>'eligible') ORDER BY external_id LIMIT 6`, typ)
		if err != nil {
			t.Fatal(err)
		}
		type entry struct {
			id       uuid.UUID
			external int64
		}
		var ids []entry
		for rows.Next() {
			var e entry
			if err = rows.Scan(&e.id, &e.external); err != nil {
				t.Fatal(err)
			}
			ids = append(ids, e)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids {
			for _, locale := range []string{"en_US", "ru_RU"} {
				e, err := service.Get(ctx, id.id, locale)
				if err != nil {
					t.Fatalf("%s %d %s: %v", typ, id.external, locale, err)
				}
				if typ != "encounter" && e.Payload["world"] == nil {
					t.Fatal("world context missing")
				}
				samples = append(samples, e)
			}
		}
	}
	if directory := os.Getenv("WORLD_EVIDENCE_DIRECTORY"); directory != "" {
		b, _ := json.MarshalIndent(samples, "", "  ")
		if err = os.WriteFile(filepath.Join(directory, "detail-after.json"), b, 0644); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("%d detail reads across eight types and two locales", len(samples))
}
