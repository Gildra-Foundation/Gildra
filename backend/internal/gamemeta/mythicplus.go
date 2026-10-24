package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// MythicPlusMetaDataset is the weekly Mythic+ spec diversity summary from
// mythicstats.com, published by scraper/parsers/mythicstats_meta_dataset_service.py.
const MythicPlusMetaDataset = "mplus-meta-mythicstats"

// mythicPlusMetaStaleAfter: refreshes run every six hours, so a day and a half
// without a success means the source or the collector is down.
const mythicPlusMetaStaleAfter = 36 * time.Hour

// MythicPlusMeta is the last good snapshot exactly as validated by the
// collector (Data is the stored payload, schema_version 1).
type MythicPlusMeta struct {
	Game      string          `json:"game"`
	Status    string          `json:"status"`
	Source    Source          `json:"source"`
	FetchedAt time.Time       `json:"fetchedAt"`
	CheckedAt *time.Time      `json:"checkedAt,omitempty"`
	Data      json.RawMessage `json:"data"`
}

func (s *Service) WoWMythicPlusMeta(ctx context.Context) (MythicPlusMeta, error) {
	meta := MythicPlusMeta{Game: "wow"}
	var payload []byte
	err := s.db.QueryRow(ctx, `
		SELECT d.slug, d.name, d.source_name, d.last_success_at,
		       snapshot.record_count, snapshot.source_fetched_at, snapshot.payload
		FROM datasets d
		JOIN dataset_snapshots snapshot ON snapshot.id = d.current_snapshot_id
		WHERE d.slug = $1
	`, MythicPlusMetaDataset).Scan(
		&meta.Source.Slug, &meta.Source.Name, &meta.Source.Provider, &meta.CheckedAt,
		&meta.Source.RecordCount, &meta.FetchedAt, &payload,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return MythicPlusMeta{}, ErrSnapshotNotFound
	}
	if err != nil {
		return MythicPlusMeta{}, err
	}
	meta.Data = payload
	meta.Source.UpdatedAt = meta.CheckedAt
	meta.Status = mythicPlusMetaStatus(meta.CheckedAt, s.now())
	meta.Source.Status = meta.Status
	return meta, nil
}

func mythicPlusMetaStatus(checkedAt *time.Time, now time.Time) string {
	if checkedAt == nil || now.Sub(checkedAt.UTC()) > mythicPlusMetaStaleAfter {
		return "stale"
	}
	return "live"
}
