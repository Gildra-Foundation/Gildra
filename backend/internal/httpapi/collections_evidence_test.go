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
	"time"
)

// Captures the actual generated detail and relationship HTTP response bodies
// against an explicitly prepared disposable real-source rehearsal database.
func TestCollectionDetailEvidence(t *testing.T) {
	dsn, dir, phase := os.Getenv("COLLECTIONS_REAL_DATABASE_URL"), os.Getenv("COLLECTIONS_EVIDENCE_DIR"), os.Getenv("COLLECTIONS_EVIDENCE_PHASE")
	if dsn == "" || dir == "" || (phase != "before" && phase != "after") {
		t.Skip("isolated collection evidence fixture required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	input, err := os.ReadFile(filepath.Join(dir, "samples.json"))
	if err != nil {
		t.Fatal(err)
	}
	var samples []struct {
		ID         uuid.UUID `json:"id"`
		Type       string    `json:"type"`
		ExternalID int64     `json:"external_id"`
	}
	if err = json.Unmarshal(input, &samples); err != nil {
		t.Fatal(err)
	}
	s := &Server{catalog: catalog.NewService(db)}
	for _, sample := range samples {
		for _, locale := range []string{"en_US", "ru_RU"} {
			t.Run(sample.Type+"/"+sample.ID.String()+"/"+locale, func(t *testing.T) {
				l := api.GetGameEntityParamsLocale(locale)
				response, err := s.GetGameEntity(ctx, api.GetGameEntityRequestObject{Id: sample.ID, Params: api.GetGameEntityParams{Locale: &l}})
				if err != nil {
					t.Fatal(err)
				}
				w := httptest.NewRecorder()
				if err = response.VisitGetGameEntityResponse(w); err != nil {
					t.Fatal(err)
				}
				if w.Code != 200 {
					t.Fatalf("detail %d: %s", w.Code, w.Body.String())
				}
				prefix := phase + "-" + sample.Type + "-" + sample.ID.String() + "-" + locale
				if err = os.WriteFile(filepath.Join(dir, prefix+".json"), w.Body.Bytes(), 0600); err != nil {
					t.Fatal(err)
				}
				rl := api.ListGameEntityRelationshipsParamsLocale(locale)
				limit := 100
				relations, err := s.ListGameEntityRelationships(ctx, api.ListGameEntityRelationshipsRequestObject{Id: sample.ID, Params: api.ListGameEntityRelationshipsParams{Locale: &rl, Limit: &limit}})
				if err != nil {
					t.Fatal(err)
				}
				rw := httptest.NewRecorder()
				if err = relations.VisitListGameEntityRelationshipsResponse(rw); err != nil {
					t.Fatal(err)
				}
				if rw.Code != 200 {
					t.Fatalf("relationships %d: %s", rw.Code, rw.Body.String())
				}
				if err = os.WriteFile(filepath.Join(dir, prefix+"-relationships.json"), rw.Body.Bytes(), 0600); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}
