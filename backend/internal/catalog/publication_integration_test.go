package catalog

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPublicationStatusIncludesPublishedFactArtifacts(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_PUBLICATION_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_PUBLICATION_INTEGRATION_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	status, err := NewPublicationService(db, time.Minute).Status(ctx, "staging", "public_api")
	if err != nil {
		t.Fatal(err)
	}
	if !status.Ready {
		t.Fatalf("publication is open by owner decision, got %#v", status)
	}
	for _, source := range status.Sources {
		if source.Source != "all_the_things" {
			continue
		}
		if !source.Allowed || len(source.BlockingReasons) != 0 {
			t.Fatalf("ATT fact source must be publishable: %#v", source)
		}
		return
	}
	t.Fatal("published ATT-backed facts were omitted from publication dependencies")
}
