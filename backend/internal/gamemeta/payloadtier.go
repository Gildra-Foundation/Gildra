package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5"
)

// payloadDoc is a JSON-payload tier list (schema_version 1) as validated and
// published by scraper/parsers/tierlist_payload.py: one ranked list per
// activity × role (× PvP bracket × region) with the source's own tiers.
type payloadDoc struct {
	SchemaVersion int           `json:"schema_version"`
	Source        string        `json:"source"`
	SourceURL     string        `json:"source_url"`
	Lists         []payloadList `json:"lists"`
}

type payloadList struct {
	Activity     string         `json:"activity"`
	Role         string         `json:"role"`
	Bracket      string         `json:"bracket"`
	Region       string         `json:"region"`
	SourceURL    string         `json:"source_url"`
	TiersDerived bool           `json:"tiers_derived"`
	Entries      []payloadEntry `json:"entries"`
}

type payloadEntry struct {
	Rank      int                `json:"rank"`
	Tier      string             `json:"tier"`
	ClassSlug string             `json:"class_slug"`
	SpecSlug  string             `json:"spec_slug"`
	ClassName string             `json:"class_name"`
	SpecName  string             `json:"spec_name"`
	Metrics   map[string]float64 `json:"metrics"`
	Change    string             `json:"change"`
}

// payloadCache keeps the parsed current snapshot of each payload dataset; a
// new snapshot id replaces it, so a refresh is visible on the next request.
type payloadCache struct {
	mu    sync.Mutex
	items map[string]cachedPayload
}

type cachedPayload struct {
	snapshotID string
	doc        *payloadDoc
}

var payloads = &payloadCache{items: map[string]cachedPayload{}}

func (s *Service) payloadDocument(ctx context.Context, dataset string) (*payloadDoc, error) {
	var snapshotID string
	err := s.db.QueryRow(ctx, `SELECT current_snapshot_id::text FROM datasets WHERE slug = $1 AND current_snapshot_id IS NOT NULL`, dataset).Scan(&snapshotID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSnapshotNotFound
	}
	if err != nil {
		return nil, err
	}
	payloads.mu.Lock()
	cached, ok := payloads.items[dataset]
	payloads.mu.Unlock()
	if ok && cached.snapshotID == snapshotID {
		return cached.doc, nil
	}
	var raw []byte
	if err := s.db.QueryRow(ctx, `SELECT payload FROM dataset_snapshots WHERE id = $1::uuid`, snapshotID).Scan(&raw); err != nil {
		return nil, err
	}
	doc, err := parsePayloadDoc(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", dataset, err)
	}
	payloads.mu.Lock()
	payloads.items[dataset] = cachedPayload{snapshotID: snapshotID, doc: doc}
	payloads.mu.Unlock()
	return doc, nil
}

func parsePayloadDoc(raw []byte) (*payloadDoc, error) {
	var doc payloadDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("decode tier-list payload: %w", err)
	}
	if doc.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported tier-list payload schema %d", doc.SchemaVersion)
	}
	return &doc, nil
}

// findList picks the list for a query. Lists without a region match any
// region; a missing region falls back to "all".
func (doc *payloadDoc) findList(query Query) *payloadList {
	region := query.Region
	if region == "" {
		region = "all"
	}
	var fallback *payloadList
	for index := range doc.Lists {
		list := &doc.Lists[index]
		if list.Activity != query.Activity || list.Role != query.Role {
			continue
		}
		if query.Activity == "pvp" && list.Bracket != query.Bracket {
			continue
		}
		if list.Region == "" || list.Region == region {
			return list
		}
		if list.Region == "all" {
			fallback = list
		}
	}
	return fallback
}

func metric(metrics map[string]float64, key string) *float64 {
	if value, ok := metrics[key]; ok {
		return &value
	}
	return nil
}

func (list *payloadList) entries(limit int) []Entry {
	entries := make([]Entry, 0, min(limit, len(list.Entries)))
	for _, item := range list.Entries {
		if len(entries) >= limit {
			break
		}
		entry := Entry{
			Rank: item.Rank, Tier: item.Tier, Role: list.Role, ClassName: item.ClassName, ClassSlug: item.ClassSlug,
			SpecName: item.SpecName, SpecSlug: item.SpecSlug, Score: metric(item.Metrics, "score"),
			Popularity: metric(item.Metrics, "popularity"), Rating: metric(item.Metrics, "rating"),
			WinRate: metric(item.Metrics, "win_rate"), Change: item.Change, SourceURL: list.SourceURL,
		}
		if value, ok := item.Metrics["players"]; ok {
			players := int(value)
			entry.Players = &players
		}
		if value, ok := item.Metrics["max_key"]; ok {
			maxKey := int16(value)
			entry.MaxKey = &maxKey
		}
		entries = append(entries, entry)
	}
	return entries
}

func (s *Service) payloadEntries(ctx context.Context, dataset string, query Query) ([]Entry, bool, error) {
	doc, err := s.payloadDocument(ctx, dataset)
	if err != nil {
		return nil, false, err
	}
	list := doc.findList(query)
	if list == nil {
		return nil, false, ErrSnapshotNotFound
	}
	return list.entries(query.Limit), list.TiersDerived, nil
}
