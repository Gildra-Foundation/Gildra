package platformhome

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSnapshotNotFound = errors.New("platform home snapshot not found")

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// Snapshot returns the most recently published dashboard document. The JSON
// contract is intentionally owned by the web page so sections can evolve
// without coupling editorial dashboard changes to generated API structs.
func (s *Service) Snapshot(ctx context.Context, locale string) (json.RawMessage, error) {
	var payload []byte
	err := s.db.QueryRow(ctx, `
		SELECT data
		FROM platform_home_snapshots
		WHERE slug = 'default' AND locale = $1 AND published_at IS NOT NULL
		ORDER BY published_at DESC, updated_at DESC
		LIMIT 1
	`, locale).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSnapshotNotFound
	}
	if err != nil {
		return nil, err
	}
	if !json.Valid(payload) {
		return nil, errors.New("platform home snapshot contains invalid json")
	}
	return json.RawMessage(payload), nil
}
