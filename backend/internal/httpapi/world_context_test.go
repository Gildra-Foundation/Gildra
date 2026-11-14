package httpapi

import (
	"context"
	"encoding/json"
	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestWorldDetailHTTP(t *testing.T) {
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
		t.Fatal("unsafe fixture")
	}
	server := &Server{catalog: catalog.NewService(db)}
	samples := []any{}
	for _, typ := range []string{"area", "map", "ui_map", "creature", "faction", "currency", "instance", "encounter"} {
		rows, err := db.Query(ctx, `SELECT id FROM game_entities e WHERE entity_type=$1 AND NOT EXISTS(SELECT 1 FROM catalog_entity_usability u WHERE u.product_id=e.product_id AND u.build_id=92 AND u.entity_type=e.entity_type AND u.external_id=e.external_id AND u.decision<>'eligible') ORDER BY external_id LIMIT 6`, typ)
		if err != nil {
			t.Fatal(err)
		}
		var ids []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err = rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			ids = append(ids, id)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids {
			for _, locale := range []api.GetGameEntityParamsLocale{"en_US", "ru_RU"} {
				response, err := server.GetGameEntity(ctx, api.GetGameEntityRequestObject{Id: id, Params: api.GetGameEntityParams{Locale: &locale}})
				if err != nil {
					t.Fatal(err)
				}
				recorder := httptest.NewRecorder()
				if err = response.VisitGetGameEntityResponse(recorder); err != nil {
					t.Fatal(err)
				}
				if recorder.Code != 200 {
					t.Fatalf("%s %s %s: %d %s", typ, id, locale, recorder.Code, recorder.Body.String())
				}
				var data map[string]any
				if err = json.Unmarshal(recorder.Body.Bytes(), &data); err != nil {
					t.Fatal(err)
				}
				if typ != "encounter" {
					tooltip, ok := data["tooltip"].(map[string]any)
					if !ok {
						t.Fatal("missing tooltip")
					}
					found := false
					for _, block := range tooltip["blocks"].([]any) {
						if block, ok := block.(map[string]any); ok && block["type"] == "world_info" {
							found = true
							if _, raw := block["source"]; raw {
								t.Fatal("raw source escaped into public block")
							}
						}
					}
					if !found {
						t.Fatal("world_info not exposed by HTTP")
					}
				}
				samples = append(samples, data)
			}
		}
	}
	if len(samples) != 96 {
		t.Fatalf("expected 96, got %d", len(samples))
	}
	if directory := os.Getenv("WORLD_EVIDENCE_DIRECTORY"); directory != "" {
		raw, _ := json.MarshalIndent(samples, "", "  ")
		if err = os.WriteFile(filepath.Join(directory, "http-after.json"), raw, 0644); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("%d actual detail HTTP responses", len(samples))
}
