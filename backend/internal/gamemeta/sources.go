package gamemeta

import (
	"context"
	"time"
)

// Per-source tier lists back the source tabs on /tier-lists. Each one is the
// source's own ranking as published, never blended with the Gildra consensus.
const (
	SourceGildra      = ""
	SourceUgg         = "ugg"
	SourceMythicStats = "mythicstats"
)

var sourceDatasets = map[string]string{
	SourceUgg:         "tierlist-ugg",
	SourceMythicStats: "tierlist-mythicstats",
}

// uggDifficulty maps the public difficulty filter to u.gg's stored slices.
// u.gg's own raid page defaults to Heroic; Mythic+ has one all-keys slice.
func uggDifficulty(activity, difficulty string) (string, bool) {
	if activity == "mythic_plus" {
		return "all", difficulty == "" || difficulty == "all"
	}
	switch difficulty {
	case "", "raid_hero", "heroic":
		return "heroic", true
	case "raid_myth", "mythic":
		return "mythic", true
	case "raid_normal", "normal":
		return "normal", true
	case "all":
		return "all", true
	}
	return "", false
}

func (s *Service) sourceTierList(ctx context.Context, query Query) (Snapshot, error) {
	dataset := sourceDatasets[query.Source]
	sources, updatedAt, err := s.sourceStatuses(ctx, []string{dataset})
	if err != nil {
		return Snapshot{}, err
	}
	if len(sources) == 0 || sources[0].Status == "empty" {
		return Snapshot{}, ErrSnapshotNotFound
	}

	var entries []Entry
	var snapshotContext *Context
	switch query.Source {
	case SourceUgg:
		difficulty, _ := uggDifficulty(query.Activity, query.Difficulty)
		entries, err = s.uggEntries(ctx, query, difficulty)
		snapshotContext = &Context{Activity: query.Activity, SelectionType: "all", Difficulty: difficulty}
	case SourceMythicStats:
		entries, err = s.mythicStatsEntries(ctx, query)
	}
	if err != nil {
		return Snapshot{}, err
	}
	if len(entries) == 0 {
		return Snapshot{}, ErrSnapshotNotFound
	}
	return Snapshot{
		Game: "wow", Status: sources[0].Status, Source: query.Source, Activity: query.Activity,
		Role: query.Role, UpdatedAt: updatedAt, RecordCount: len(entries), Sources: sources,
		Entries: entries, Context: snapshotContext,
	}, nil
}

func (s *Service) uggEntries(ctx context.Context, query Query, difficulty string) ([]Entry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT e.rank, e.tier, e.role, e.class_name, e.class_slug, e.spec_name, e.spec_slug,
		       e.score::float8, e.dps::float8, e.hps::float8, e.popularity::float8, e.source_url
		FROM datasets d
		JOIN ugg_tierlist_entries e ON e.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-ugg' AND e.activity = $1 AND e.difficulty = $2 AND e.role = $3
		ORDER BY e.rank
		LIMIT $4
	`, query.Activity, difficulty, query.Role, query.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0, query.Limit)
	for rows.Next() {
		var entry Entry
		var rank int16
		if err := rows.Scan(
			&rank, &entry.Tier, &entry.Role, &entry.ClassName, &entry.ClassSlug, &entry.SpecName,
			&entry.SpecSlug, &entry.Score, &entry.AverageDPS, &entry.AverageHPS, &entry.Popularity,
			&entry.SourceURL,
		); err != nil {
			return nil, err
		}
		entry.Rank = int(rank)
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// mythicStatsEntries reads the mythicstats.com/spec tier list. DPS merges its
// melee and ranged columns tier by tier; Group keeps which column a spec is in.
func (s *Service) mythicStatsEntries(ctx context.Context, query Query) ([]Entry, error) {
	categories := []string{query.Role}
	if query.Role == "dps" {
		categories = []string{"melee", "ranged"}
	}
	rows, err := s.db.Query(ctx, `
		SELECT e.tier, e.category, e.class_name, e.class_slug, e.spec_name, e.spec_slug,
		       e.spec_url, e.source_url
		FROM datasets d
		JOIN mythicstats_spec_tier_entries e ON e.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-mythicstats' AND e.category = ANY($1)
		ORDER BY array_position(ARRAY['S','A','B','C','D','F'], e.tier), e.rank_in_tier, e.category
		LIMIT $2
	`, categories, query.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0, query.Limit)
	for rows.Next() {
		entry := Entry{Role: query.Role}
		if err := rows.Scan(
			&entry.Tier, &entry.Group, &entry.ClassName, &entry.ClassSlug, &entry.SpecName,
			&entry.SpecSlug, &entry.GuideURL, &entry.SourceURL,
		); err != nil {
			return nil, err
		}
		entry.Rank = len(entries) + 1
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (s *Service) sourceStatuses(ctx context.Context, slugs []string) ([]Source, time.Time, error) {
	rows, err := s.db.Query(ctx, `
		SELECT d.slug, d.name, d.source_name, d.last_success_at,
		       COALESCE(snapshot.record_count, 0)
		FROM datasets d
		LEFT JOIN dataset_snapshots snapshot ON snapshot.id = d.current_snapshot_id
		WHERE d.slug = ANY($1)
		ORDER BY array_position($1, d.slug)
	`, slugs)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer rows.Close()
	return s.scanSources(rows)
}
