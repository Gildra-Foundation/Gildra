package gamemeta

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"time"
)

// Per-source tier lists back the source tabs on /tier-lists. Each one is the
// source's own ranking as published, never blended with another source; the
// Gildra tab is the consensus of all of them (PvE) or the Blizzard ladder
// representation (PvP).
const (
	SourceGildra      = ""
	SourceWowhead     = "wowhead"
	SourceIcyVeins    = "icyveins"
	SourceWowGG       = "wowgg"
	SourceUgg         = "ugg"
	SourceMythicStats = "mythicstats"
	SourceWowMeta     = "wowmeta"
	SourceWythic      = "wythic"
	SourceMethod      = "method"
	SourceMurlok      = "murlok"
	SourceLadder      = "ladder"
)

// TierSource describes one source tab: its dataset and the modes it ranks.
type TierSource struct {
	ID         string   `json:"id"`
	Dataset    string   `json:"-"`
	Activities []string `json:"activities"`
	// AnyBracket: the PvP list is not per bracket (an editorial arena list).
	AnyBracket bool `json:"anyBracket,omitempty"`
	// Regions: the PvP lists exist per region (all/eu/us).
	Regions bool `json:"regions,omitempty"`
	payload bool
}

var tierSources = []TierSource{
	{ID: SourceWowhead, Dataset: "tierlist-wowhead", Activities: []string{"mythic_plus", "raid"}},
	{ID: SourceIcyVeins, Dataset: "tierlist-icyveins", Activities: []string{"mythic_plus", "raid", "pvp"}, AnyBracket: true},
	{ID: SourceWowGG, Dataset: "tierlist-wowgg", Activities: []string{"mythic_plus", "raid", "pvp"}, Regions: true},
	{ID: SourceUgg, Dataset: "tierlist-ugg", Activities: []string{"mythic_plus", "raid"}},
	{ID: SourceMythicStats, Dataset: "tierlist-mythicstats", Activities: []string{"mythic_plus"}},
	{ID: SourceWowMeta, Dataset: "tierlist-wowmeta", Activities: []string{"mythic_plus"}, payload: true},
	{ID: SourceWythic, Dataset: "tierlist-wythic", Activities: []string{"mythic_plus"}, payload: true},
	{ID: SourceMethod, Dataset: "tierlist-method", Activities: []string{"mythic_plus"}, payload: true},
	{ID: SourceMurlok, Dataset: "tierlist-murlok", Activities: []string{"pvp"}, payload: true},
	{ID: SourceLadder, Dataset: "tierlist-pvp-ladder", Activities: []string{"pvp"}, Regions: true, payload: true},
}

// PvPBrackets are the rated PvP brackets, in the order the page offers them.
var PvPBrackets = []string{"3v3", "2v2", "shuffle", "blitz", "rbg"}

func findSource(id string) (TierSource, bool) {
	for _, source := range tierSources {
		if source.ID == id {
			return source, true
		}
	}
	return TierSource{}, false
}

func (source TierSource) covers(activity string) bool {
	return slices.Contains(source.Activities, activity)
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

// wowggDifficulty maps the public filter to wow.gg's raid slices (no "all").
func wowggDifficulty(difficulty string) string {
	switch difficulty {
	case "raid_myth", "mythic":
		return "raid_myth"
	case "raid_normal", "normal":
		return "raid_normal"
	}
	return "raid_hero"
}

// sourceEntries reads one source's own list for the query.
func (s *Service) sourceEntries(ctx context.Context, source TierSource, query Query) ([]Entry, *Context, bool, error) {
	if source.payload {
		entries, derived, err := s.payloadEntries(ctx, source.Dataset, query)
		return entries, nil, derived, err
	}
	switch source.ID {
	case SourceUgg:
		difficulty, _ := uggDifficulty(query.Activity, query.Difficulty)
		entries, err := s.uggEntries(ctx, query, difficulty)
		return entries, &Context{Activity: query.Activity, SelectionType: "all", Difficulty: difficulty}, false, err
	case SourceMythicStats:
		entries, err := s.mythicStatsEntries(ctx, query)
		return entries, nil, false, err
	case SourceWowhead:
		entries, err := s.wowheadEntries(ctx, query)
		return entries, nil, false, err
	case SourceIcyVeins:
		entries, err := s.icyVeinsEntries(ctx, query)
		return entries, nil, false, err
	case SourceWowGG:
		entries, context, err := s.wowggEntries(ctx, query)
		return entries, context, false, err
	}
	return nil, nil, false, ErrSnapshotNotFound
}

func (s *Service) sourceTierList(ctx context.Context, query Query) (Snapshot, error) {
	source, ok := findSource(query.Source)
	if !ok {
		return Snapshot{}, ErrSnapshotNotFound
	}
	sources, updatedAt, err := s.sourceStatuses(ctx, []string{source.Dataset})
	if err != nil {
		return Snapshot{}, err
	}
	if len(sources) == 0 || sources[0].Status == "empty" {
		return Snapshot{}, ErrSnapshotNotFound
	}
	entries, snapshotContext, derived, err := s.sourceEntries(ctx, source, query)
	if err != nil {
		return Snapshot{}, err
	}
	// A live source that does not rank this role answers an empty list, not a 404.
	if entries == nil {
		entries = []Entry{}
	}
	snapshot := Snapshot{
		Game: "wow", Status: sources[0].Status, Source: query.Source, Activity: query.Activity, Bracket: query.Bracket,
		Role: query.Role, UpdatedAt: updatedAt, RecordCount: len(entries), Sources: sources,
		Entries: entries, Context: snapshotContext, TiersDerived: derived,
	}
	if source.Regions && query.Activity == "pvp" {
		snapshot.Region = regionOrAll(query.Region)
	}
	return snapshot, nil
}

func regionOrAll(region string) string {
	if region == "" {
		return "all"
	}
	return region
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

// tierOrderSQL sorts S+ < S < A+ < A < A- < B … in SQL.
const tierOrderSQL = `array_position(ARRAY['S+','S','S-','A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'], %s)`

// wowheadEntries reads Wowhead's editorial list exactly as the site orders it.
func (s *Service) wowheadEntries(ctx context.Context, query Query) ([]Entry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT e.tier, e.class_name, e.class_slug, e.spec_name, e.spec_slug, e.guide_url, e.source_url
		FROM datasets d
		JOIN tierlist_entries e ON e.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-wowhead' AND e.activity = $1 AND e.role = $2
		ORDER BY `+sprintfTier("e.tier")+`, e.rank_in_tier, e.class_name, e.spec_name
		LIMIT $3
	`, query.Activity, query.Role, query.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0, query.Limit)
	for rows.Next() {
		entry := Entry{Role: query.Role}
		if err := rows.Scan(&entry.Tier, &entry.ClassName, &entry.ClassSlug, &entry.SpecName, &entry.SpecSlug,
			&entry.GuideURL, &entry.SourceURL); err != nil {
			return nil, err
		}
		entry.Rank = len(entries) + 1
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// icyVeinsEntries reads Icy Veins' editorial list; its PvP list covers arena
// as a whole (no bracket), so it answers every bracket.
func (s *Service) icyVeinsEntries(ctx context.Context, query Query) ([]Entry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT e.tier, e.class_name, e.class_slug, e.spec_name, e.spec_slug, e.guide_url, e.source_url,
		       e.change_direction
		FROM datasets d
		JOIN icyveins_tierlist_entries e ON e.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-icyveins' AND e.activity = $1 AND e.role = $2
		ORDER BY `+sprintfTier("e.tier")+`, e.rank_in_tier
		LIMIT $3
	`, query.Activity, query.Role, query.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0, query.Limit)
	for rows.Next() {
		entry := Entry{Role: query.Role}
		var change string
		if err := rows.Scan(&entry.Tier, &entry.ClassName, &entry.ClassSlug, &entry.SpecName, &entry.SpecSlug,
			&entry.GuideURL, &entry.SourceURL, &change); err != nil {
			return nil, err
		}
		if change == "up" || change == "down" {
			entry.Change = change
		}
		entry.Rank = len(entries) + 1
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// wowggEntries reads wow.gg's own ranking: all dungeons (all keys) for
// Mythic+, the current raid of the expansion for raids (Heroic unless asked),
// and the bracket × region slice for PvP. A dungeon or boss query goes
// through contextTierList.
func (s *Service) wowggEntries(ctx context.Context, query Query) ([]Entry, *Context, error) {
	if query.SelectionType != "" && query.SelectionType != "all" {
		snapshot, err := s.contextTierList(ctx, query, nil, time.Time{})
		if err != nil {
			return nil, nil, err
		}
		return snapshot.Entries, snapshot.Context, nil
	}
	selectionType, selectionID, keyType, difficulty, bracket, region := "all", "all", "all", "", "", ""
	switch query.Activity {
	case "raid":
		selectionType, selectionID, keyType, difficulty = "raid", "", "", wowggDifficulty(query.Difficulty)
	case "pvp":
		selectionType, selectionID, keyType, bracket, region = "bracket", query.Bracket, "", query.Bracket, regionOrAll(query.Region)
	}
	rows, err := s.db.Query(ctx, `
		WITH selected_context AS (
			SELECT c.snapshot_id, c.context_key, c.selection_id, c.selection_name
			FROM datasets d
			JOIN wowgg_tierlist_contexts c ON c.snapshot_id = d.current_snapshot_id
			WHERE d.slug = 'tierlist-wowgg'
			  AND c.mode = $1 AND c.role = $2 AND c.selection_type = $3
			  AND ($4 = '' OR c.selection_id = $4)
			  AND c.key_type = $5 AND c.raid_difficulty = $6
			  AND c.pvp_bracket = $7 AND c.pvp_region = $8
			  AND c.addon_key = 'midnight' AND c.record_count > 0
			ORDER BY c.source_updated_at DESC, c.selection_id DESC
			LIMIT 1
		)
		SELECT e.rank, e.tier, e.class_name, e.class_slug, e.spec_name, e.spec_slug,
		       e.meta_score::float8, e.average_dps::float8, e.average_hps::float8, e.popularity::float8,
		       e.max_key, e.diff_rank, e.pvp_players, e.pvp_average_rating::float8, e.guide_url, e.source_url,
		       c.selection_id, c.selection_name
		FROM selected_context c
		JOIN wowgg_tierlist_entries e ON e.snapshot_id = c.snapshot_id AND e.context_key = c.context_key
		WHERE e.entity_type = 'specialization'
		ORDER BY e.rank
		LIMIT $9`, query.Activity, query.Role, selectionType, selectionID, keyType, difficulty, bracket, region, query.Limit)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0, query.Limit)
	selected := &Context{Activity: query.Activity, SelectionType: selectionType, KeyType: keyType, Difficulty: difficulty, AddonKey: "midnight"}
	for rows.Next() {
		entry := Entry{Role: query.Role}
		var players *int32
		if err := rows.Scan(&entry.Rank, &entry.Tier, &entry.ClassName, &entry.ClassSlug, &entry.SpecName, &entry.SpecSlug,
			&entry.Score, &entry.AverageDPS, &entry.AverageHPS, &entry.Popularity, &entry.MaxKey, &entry.RankChange,
			&players, &entry.Rating, &entry.GuideURL, &entry.SourceURL, &selected.SelectionID, &selected.SelectionName); err != nil {
			return nil, nil, err
		}
		if players != nil {
			value := int(*players)
			entry.Players = &value
		}
		// wow.gg publishes 0 for metrics it has no value for in a slice.
		for _, value := range []**float64{&entry.Score, &entry.AverageDPS, &entry.AverageHPS, &entry.Popularity} {
			if *value != nil && **value == 0 {
				*value = nil
			}
		}
		if entry.MaxKey != nil && *entry.MaxKey == 0 {
			entry.MaxKey = nil
		}
		entries = append(entries, entry)
	}
	return entries, selected, rows.Err()
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

// SourceColumn is one source's list inside a comparison.
type SourceColumn struct {
	Source       string     `json:"source"`
	Status       string     `json:"status"`
	UpdatedAt    *time.Time `json:"updatedAt,omitempty"`
	TiersDerived bool       `json:"tiersDerived,omitempty"`
	Entries      []Entry    `json:"entries"`
}

// Comparison is every source's list for one mode and role plus the consensus.
type Comparison struct {
	Game      string         `json:"game"`
	Activity  string         `json:"activity"`
	Role      string         `json:"role"`
	Bracket   string         `json:"bracket,omitempty"`
	UpdatedAt time.Time      `json:"updatedAt"`
	Columns   []SourceColumn `json:"columns"`
	Consensus []Entry        `json:"consensus"`
}

// WoWTierListCompare reads every live source that ranks the mode (one query
// per source) and adds the consensus. A source that fails is left out.
func (s *Service) WoWTierListCompare(ctx context.Context, query Query) (Comparison, error) {
	query.Limit = 60
	query.SelectionType, query.SelectionID = "", ""
	var datasets []string
	for _, source := range tierSources {
		if source.covers(query.Activity) {
			datasets = append(datasets, source.Dataset)
		}
	}
	statuses, updatedAt, err := s.sourceStatuses(ctx, datasets)
	if err != nil {
		return Comparison{}, err
	}
	status := map[string]Source{}
	for _, item := range statuses {
		status[item.Slug] = item
	}
	comparison := Comparison{Game: "wow", Activity: query.Activity, Role: query.Role, Bracket: query.Bracket, UpdatedAt: updatedAt}
	for _, source := range tierSources {
		current, ok := status[source.Dataset]
		if !source.covers(query.Activity) || !ok || current.Status == "empty" {
			continue
		}
		entries, _, derived, err := s.sourceEntries(ctx, source, query)
		if err != nil {
			if !errors.Is(err, ErrSnapshotNotFound) {
				slog.Warn("tier-list comparison source unavailable", "source", source.ID, "error", err)
			}
			continue
		}
		if len(entries) == 0 {
			continue
		}
		comparison.Columns = append(comparison.Columns, SourceColumn{
			Source: source.ID, Status: current.Status, UpdatedAt: current.UpdatedAt, TiersDerived: derived, Entries: entries,
		})
	}
	if len(comparison.Columns) == 0 {
		return Comparison{}, ErrSnapshotNotFound
	}
	comparison.Consensus = Consensus(comparison.Columns, query.Role)
	return comparison, nil
}

// SourceAvailability is one source tab and whether it has a published list.
type SourceAvailability struct {
	TierSource
	Status    string     `json:"status"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

// WoWTierListSources lists the source tabs with their status, so the page
// only offers tabs that have data.
func (s *Service) WoWTierListSources(ctx context.Context) ([]SourceAvailability, error) {
	datasets := make([]string, 0, len(tierSources))
	for _, source := range tierSources {
		datasets = append(datasets, source.Dataset)
	}
	statuses, _, err := s.sourceStatuses(ctx, datasets)
	if err != nil {
		return nil, err
	}
	byDataset := map[string]Source{}
	for _, item := range statuses {
		byDataset[item.Slug] = item
	}
	list := make([]SourceAvailability, 0, len(tierSources))
	for _, source := range tierSources {
		item := SourceAvailability{TierSource: source, Status: "empty"}
		if current, ok := byDataset[source.Dataset]; ok {
			item.Status, item.UpdatedAt = current.Status, current.UpdatedAt
		}
		list = append(list, item)
	}
	return list, nil
}

// sourceDatasets lists the datasets of every source tab, in tab order.
func sourceDatasets() []string {
	datasets := make([]string, 0, len(tierSources))
	for _, source := range tierSources {
		datasets = append(datasets, source.Dataset)
	}
	return datasets
}
