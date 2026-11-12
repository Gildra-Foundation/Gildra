//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Uses the explicit disposable full-schema fixture created by
// catalog.TestMidnightScopeFullSchema, never implicit production configuration.
func TestMidnightHTTPFullSchema(t *testing.T) {
	dsn := os.Getenv("MIDNIGHT_SCOPE_FULL_DATABASE_URL")
	if dsn == "" {
		t.Skip("explicit disposable full-schema database required")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var ruby, legacy string
	if err := db.QueryRow(context.Background(), `SELECT id::text FROM game_entities WHERE external_id=919001 AND entity_type='item'`).Scan(&ruby); err != nil {
		t.Fatal("run catalog.TestMidnightScopeFullSchema first: ", err)
	}
	if err := db.QueryRow(context.Background(), `SELECT id::text FROM game_entities WHERE external_id=919002 AND entity_type='item'`).Scan(&legacy); err != nil {
		t.Fatal(err)
	}
	handler := api.Handler(api.NewStrictHandler(NewServer(nil, catalog.NewService(db), nil), nil))
	for _, locale := range []string{"en_US", "ru_RU"} {
		for _, tc := range []struct {
			path   string
			status int
		}{
			{"/v1/game/entity-summaries?dataset=gems&expansion=midnight&locale=" + locale, 200},
			{"/v1/game/entities?type=item&expansion=midnight&locale=" + locale, 200},
			{"/v1/game/entities/" + ruby + "?expansion=midnight&locale=" + locale, 200},
			{"/v1/game/entities/" + legacy + "?expansion=midnight&locale=" + locale, 404},
			{"/v1/game/entities/" + legacy + "?locale=" + locale, 200},
			{"/v1/library/datasets?expansion=midnight&locale=" + locale, 200},
			{"/v1/game/entity-summaries?expansion=midnight&product=wow_classic&locale=" + locale, 200},
			// Delivery accepts well-formed registry keys across products; absent membership is empty.
			{"/v1/library/datasets?expansion=unknown&locale=" + locale, 200},
			{"/v1/library/datasets?expansion=INVALID&locale=" + locale, 400},
		} {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if recorder.Code != tc.status {
				t.Fatalf("%s got%d want%d: %s", tc.path, recorder.Code, tc.status, recorder.Body.String())
			}
			if !json.Valid(recorder.Body.Bytes()) {
				t.Fatalf("invalid JSON %s", tc.path)
			}
			t.Logf("%s %d", tc.path, recorder.Code)
		}
	}
}
