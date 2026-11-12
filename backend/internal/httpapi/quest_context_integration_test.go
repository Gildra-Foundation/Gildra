//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Same HTTP handler and serialization as /v1/game/entities/{id}, against an
// explicit disposable replay. samples.json identifies the source-era cohort.
func TestQuestDetailHTTPRealSource(t *testing.T) {
	url, directory := os.Getenv("QUEST_TEST_DATABASE_URL"), os.Getenv("QUEST_SOURCE_DIRECTORY")
	if url == "" || directory == "" {
		t.Skip("explicit quest source replay required")
	}
	raw, err := os.ReadFile(filepath.Join(directory, "samples.json"))
	if err != nil {
		t.Fatal(err)
	}
	var samples []struct {
		ID            int64  `json:"id"`
		UUID          string `json:"uuid"`
		HasObjectives bool   `json:"has_objectives"`
	}
	if err = json.Unmarshal(raw, &samples); err != nil {
		t.Fatal(err)
	}
	if len(samples) != 20 {
		t.Fatalf("want 20 samples, got %d", len(samples))
	}
	db, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler := api.Handler(api.NewStrictHandler(NewServer(nil, catalog.NewService(db), nil), nil))
	for _, sample := range samples {
		for _, locale := range []string{"en_US", "ru_RU"} {
			t.Run(fmt.Sprintf("%d/%s", sample.ID, locale), func(t *testing.T) {
				path := "/v1/game/entities/" + sample.UUID + "?locale=" + locale
				recorder := httptest.NewRecorder()
				handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
				if recorder.Code != 200 {
					t.Fatalf("%s status %d: %s", path, recorder.Code, recorder.Body.String())
				}
				var body struct {
					Tooltip struct {
						Blocks []map[string]json.RawMessage `json:"blocks"`
					} `json:"tooltip"`
				}
				if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
					t.Fatal(err)
				}
				found := false
				for _, block := range body.Tooltip.Blocks {
					if string(block["type"]) != `"quest_info"` {
						continue
					}
					found = true
					for _, key := range []string{"objectives", "locations", "quest_lines", "requirements"} {
						if _, ok := block[key]; !ok {
							t.Fatalf("missing %s", key)
						}
					}
					if sample.HasObjectives && string(block["objectives"]) == "[]" {
						t.Fatal("source objectives missing")
					}
				}
				if !found {
					t.Fatalf("missing quest_info: %s", recorder.Body.String())
				}
				if err := os.WriteFile(filepath.Join(directory, fmt.Sprintf("after-%d-%s.json", sample.ID, locale)), recorder.Body.Bytes(), 0644); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}
