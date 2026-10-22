package catalog

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestValidationErrorsAreInvalidRequests(t *testing.T) {
	service := NewService(nil)
	ctx := context.Background()
	for name, run := range map[string]func() error{
		"list limit":      func() error { _, err := service.List(ctx, ListParams{Limit: 0}); return err },
		"list cursor":     func() error { _, err := service.List(ctx, ListParams{Limit: 10, Cursor: "%%%"}); return err },
		"summary limit":   func() error { _, err := service.Summaries(ctx, SummaryParams{Limit: 101}); return err },
		"summary dataset": func() error { _, err := service.Summaries(ctx, SummaryParams{Limit: 10, Dataset: "x"}); return err },
		"summary facets": func() error {
			_, err := service.Summaries(ctx, SummaryParams{Limit: 10, Facets: []string{"a", "b", "c", "d", "e", "f", "g", "h", "i"}})
			return err
		},
		"relationship dir": func() error {
			_, err := service.Relationships(ctx, RelationshipParams{Limit: 10, Direction: "sideways"})
			return err
		},
	} {
		if err := run(); !errors.Is(err, ErrInvalidRequest) {
			t.Errorf("%s: error %v is not an invalid request", name, err)
		}
	}
}

// A database failure whose message happens to contain a validation keyword
// ("resolve public dataset: ...") used to be reported as HTTP 400 with the raw
// driver error. It must stay an internal error.
func TestDatabaseErrorsAreNotInvalidRequests(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://nobody@127.0.0.1:1/none?connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	_, err = NewService(pool).Summaries(ctx, SummaryParams{Limit: 10, Dataset: "weapons"})
	if err == nil {
		t.Fatal("expected a connection error")
	}
	if errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("database failure %q was classified as invalid input", err)
	}
}
