package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// SimTierListDataset is the simulated DPS tier list from mythistone.com,
// published by scraper/parsers/mythistone_simtier_dataset_service.py: per
// role (dps, tank) and target count (1/3/5/8) the source's ranking, tiers and
// damage for three gear sets. It backs the "Sim" source tab on /tier-lists.
const SimTierListDataset = "tierlist-mythistone-sim"

// simTierStaleAfter: refreshes run daily, so three days without a success
// means the source or the collector is down.
const simTierStaleAfter = 72 * time.Hour

// SimTierList is the last good snapshot exactly as validated by the collector
// (Data is the stored payload, schema_version 1).
type SimTierList struct {
	Game      string          `json:"game"`
	Status    string          `json:"status"`
	Source    Source          `json:"source"`
	FetchedAt time.Time       `json:"fetchedAt"`
	CheckedAt *time.Time      `json:"checkedAt,omitempty"`
	Data      json.RawMessage `json:"data"`
}

func (s *Service) WoWSimTierList(ctx context.Context) (SimTierList, error) {
	list := SimTierList{Game: "wow"}
	var payload []byte
	err := s.db.QueryRow(ctx, `
		SELECT d.slug, d.name, d.source_name, d.last_success_at,
		       snapshot.record_count, snapshot.source_fetched_at, snapshot.payload
		FROM datasets d
		JOIN dataset_snapshots snapshot ON snapshot.id = d.current_snapshot_id
		WHERE d.slug = $1
	`, SimTierListDataset).Scan(
		&list.Source.Slug, &list.Source.Name, &list.Source.Provider, &list.CheckedAt,
		&list.Source.RecordCount, &list.FetchedAt, &payload,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return SimTierList{}, ErrSnapshotNotFound
	}
	if err != nil {
		return SimTierList{}, err
	}
	list.Data = payload
	list.Source.UpdatedAt = list.CheckedAt
	list.Status = simTierStatus(list.CheckedAt, s.now())
	list.Source.Status = list.Status
	return list, nil
}

func simTierStatus(checkedAt *time.Time, now time.Time) string {
	if checkedAt == nil || now.Sub(checkedAt.UTC()) > simTierStaleAfter {
		return "stale"
	}
	return "live"
}
