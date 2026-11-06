package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// MythicPlusRunsDataset is the Raider.IO sample of top timed Mythic+ runs with
// rosters and the season's rating cutoffs, published by
// scraper/parsers/raiderio_mplus_dataset_service.py every twelve hours.
const MythicPlusRunsDataset = "mplus-runs-raiderio"

// mythicPlusRunsStaleAfter: refreshes run every twelve hours, so thirty hours
// without a success means two missed refreshes.
const mythicPlusRunsStaleAfter = 30 * time.Hour

// RunsSeason is the season the sample belongs to.
type RunsSeason struct {
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	Starts    string `json:"starts"`
}

// RunsDungeon is one dungeon of the season; ID is the challenge mode id.
type RunsDungeon struct {
	ID        int    `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	TimerMS   int64  `json:"timer_ms"`
}

// RunsSpec is a specialization seen in the sample (Blizzard spec id).
type RunsSpec struct {
	ID        int    `json:"id"`
	ClassSlug string `json:"class_slug"`
	SpecSlug  string `json:"spec_slug"`
	ClassName string `json:"class_name"`
	SpecName  string `json:"spec_name"`
	Role      string `json:"role"`
}

// Run is one compact leaderboard run (timed by definition: 1–3 upgrades).
type Run struct {
	ID          int64  `json:"id"`
	Dungeon     int    `json:"dg"`
	Level       int    `json:"lv"`
	Chests      int    `json:"ch"`
	ClearMS     int64  `json:"ms"`
	TimerMS     int64  `json:"tm"`
	CompletedAt string `json:"at"`
	Region      string `json:"rg"`
	Tank        int    `json:"t"`
	Healer      int    `json:"h"`
	DPS         [3]int `json:"d"`
	Video       bool   `json:"v"`
}

// RunsPayload is the stored snapshot (schema_version 1).
type RunsPayload struct {
	SchemaVersion int                        `json:"schema_version"`
	SourceName    string                     `json:"source_name"`
	SourceURL     string                     `json:"source_url"`
	FetchedAt     string                     `json:"fetched_at"`
	Season        RunsSeason                 `json:"season"`
	Dungeons      []RunsDungeon              `json:"dungeons"`
	Specs         []RunsSpec                 `json:"specs"`
	Regions       []string                   `json:"regions"`
	Runs          []Run                      `json:"runs"`
	Cutoffs       map[string]json.RawMessage `json:"cutoffs"`
	WorldCutoffs  json.RawMessage            `json:"world_cutoffs,omitempty"`
	// Sample depth, rating cohorts per spec and the daily spec presence
	// history carried from one snapshot to the next (mythicplusruns_stats.go).
	Sample          RunsSampleDepth      `json:"sample"`
	SpecCohorts     map[string]CohortSet `json:"spec_cohorts,omitempty"`
	PresenceHistory []PresenceDay        `json:"presence_history,omitempty"`
}

// RunsSnapshot is the parsed current snapshot plus its freshness.
type RunsSnapshot struct {
	Status    string
	Source    Source
	FetchedAt time.Time
	CheckedAt *time.Time
	Payload   *RunsPayload
	specs     map[int]RunsSpec
	dungeons  map[int]RunsDungeon
	bySlug    map[string]RunsDungeon
}

// NewRunsSnapshot indexes a parsed payload (used by the store and by tests).
func NewRunsSnapshot(payload *RunsPayload) *RunsSnapshot {
	snapshot := &RunsSnapshot{Payload: payload, specs: map[int]RunsSpec{}, dungeons: map[int]RunsDungeon{}, bySlug: map[string]RunsDungeon{}}
	for _, spec := range payload.Specs {
		snapshot.specs[spec.ID] = spec
	}
	for _, dungeon := range payload.Dungeons {
		snapshot.dungeons[dungeon.ID] = dungeon
		snapshot.bySlug[dungeon.Slug] = dungeon
	}
	return snapshot
}

// The payload is ~1 MB of JSON; parse it once per published snapshot.
var runsCache struct {
	sync.Mutex
	snapshotID string
	payload    *RunsPayload
}

func (s *Service) WoWMythicPlusRuns(ctx context.Context) (*RunsSnapshot, error) {
	var (
		snapshotID string
		source     Source
		checkedAt  *time.Time
		fetchedAt  time.Time
	)
	err := s.db.QueryRow(ctx, `
		SELECT snapshot.id::text, d.slug, d.name, d.source_name, d.last_success_at,
		       snapshot.record_count, snapshot.source_fetched_at
		FROM datasets d
		JOIN dataset_snapshots snapshot ON snapshot.id = d.current_snapshot_id
		WHERE d.slug = $1
	`, MythicPlusRunsDataset).Scan(&snapshotID, &source.Slug, &source.Name, &source.Provider, &checkedAt, &source.RecordCount, &fetchedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSnapshotNotFound
	}
	if err != nil {
		return nil, err
	}
	runsCache.Lock()
	defer runsCache.Unlock()
	if runsCache.snapshotID != snapshotID || runsCache.payload == nil {
		var raw []byte
		if err := s.db.QueryRow(ctx, `SELECT payload FROM dataset_snapshots WHERE id = $1::uuid`, snapshotID).Scan(&raw); err != nil {
			return nil, err
		}
		payload := &RunsPayload{}
		if err := json.Unmarshal(raw, payload); err != nil {
			return nil, fmt.Errorf("decode %s snapshot: %w", MythicPlusRunsDataset, err)
		}
		runsCache.snapshotID, runsCache.payload = snapshotID, payload
	}
	snapshot := NewRunsSnapshot(runsCache.payload)
	snapshot.Source = source
	snapshot.Source.UpdatedAt = checkedAt
	snapshot.FetchedAt = fetchedAt
	snapshot.CheckedAt = checkedAt
	snapshot.Status = freshness(checkedAt, s.now(), mythicPlusRunsStaleAfter)
	snapshot.Source.Status = snapshot.Status
	return snapshot, nil
}

func freshness(checkedAt *time.Time, now time.Time, after time.Duration) string {
	if checkedAt == nil || now.Sub(checkedAt.UTC()) > after {
		return "stale"
	}
	return "live"
}
