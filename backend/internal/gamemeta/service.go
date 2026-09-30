package gamemeta

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSnapshotNotFound = errors.New("game meta snapshot not found")

type Query struct {
	Activity      string
	Role          string
	Limit         int
	SelectionType string
	SelectionID   string
	KeyType       string
	Difficulty    string
	AddonKey      string
}

type Context struct {
	Activity      string `json:"activity"`
	SelectionType string `json:"selectionType"`
	SelectionID   string `json:"selectionId"`
	SelectionName string `json:"selectionName"`
	KeyType       string `json:"keyType,omitempty"`
	Difficulty    string `json:"difficulty,omitempty"`
	AddonKey      string `json:"addonKey"`
	AddonName     string `json:"addonName"`
	RecordCount   int    `json:"recordCount"`
}

type Source struct {
	Slug        string     `json:"slug"`
	Name        string     `json:"name"`
	Provider    string     `json:"provider"`
	Status      string     `json:"status"`
	RecordCount int        `json:"recordCount"`
	UpdatedAt   *time.Time `json:"updatedAt,omitempty"`
}

type Entry struct {
	Rank       int      `json:"rank"`
	Tier       string   `json:"tier"`
	Role       string   `json:"role"`
	ClassName  string   `json:"className"`
	ClassSlug  string   `json:"classSlug"`
	SpecName   string   `json:"specName"`
	SpecSlug   string   `json:"specSlug"`
	Score      *float64 `json:"score,omitempty"`
	AverageDPS *float64 `json:"averageDps,omitempty"`
	AverageHPS *float64 `json:"averageHps,omitempty"`
	Popularity *float64 `json:"popularity,omitempty"`
	MaxKey     *int16   `json:"maxKey,omitempty"`
	RankChange *int16   `json:"rankChange,omitempty"`
	GuideURL   string   `json:"guideUrl,omitempty"`
	SourceURL  string   `json:"sourceUrl"`
}

type Snapshot struct {
	Game        string    `json:"game"`
	Status      string    `json:"status"`
	Activity    string    `json:"activity"`
	Role        string    `json:"role"`
	UpdatedAt   time.Time `json:"updatedAt"`
	RecordCount int       `json:"recordCount"`
	Sources     []Source  `json:"sources"`
	Entries     []Entry   `json:"entries"`
	Context     *Context  `json:"context,omitempty"`
}

type Service struct {
	db  *pgxpool.Pool
	now func() time.Time
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db, now: time.Now}
}

func (s *Service) WoWTierListContexts(ctx context.Context, activity string) ([]Context, error) {
	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT mode, selection_type, selection_id, selection_name,
		       key_type, raid_difficulty, addon_key, addon_name, record_count
		FROM datasets d
		JOIN wowgg_tierlist_contexts c ON c.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-wowgg'
		  AND c.mode = $1
		  AND c.role = 'dps'
		  AND c.record_count > 0
		  AND (
		    ($1 = 'mythic_plus' AND c.addon_key = 'midnight' AND c.key_type = 'all' AND c.selection_type IN ('all', 'dungeon'))
		    OR ($1 = 'raid' AND c.selection_type IN ('raid', 'boss'))
		  )
		ORDER BY addon_name, selection_type, selection_name, key_type, raid_difficulty`, activity)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contexts := make([]Context, 0, 32)
	for rows.Next() {
		var item Context
		if err := rows.Scan(&item.Activity, &item.SelectionType, &item.SelectionID,
			&item.SelectionName, &item.KeyType, &item.Difficulty, &item.AddonKey, &item.AddonName, &item.RecordCount); err != nil {
			return nil, err
		}
		contexts = append(contexts, item)
	}
	return contexts, rows.Err()
}

func (s *Service) WoWTierList(ctx context.Context, query Query) (Snapshot, error) {
	sources, updatedAt, err := s.sources(ctx)
	if err != nil {
		return Snapshot{}, err
	}

	if query.SelectionType != "" && query.SelectionType != "all" {
		return s.contextTierList(ctx, query, sources, updatedAt)
	}

	rows, err := s.db.Query(ctx, `
		WITH wowhead AS (
			SELECT e.*
			FROM datasets d
			JOIN tierlist_entries e ON e.snapshot_id = d.current_snapshot_id
			WHERE d.slug = 'tierlist-wowhead'
			  AND e.activity = $1
			  AND e.role = $2
		), metric_context AS (
			SELECT c.snapshot_id, c.context_key
			FROM datasets d
			JOIN wowgg_tierlist_contexts c ON c.snapshot_id = d.current_snapshot_id
			WHERE d.slug = 'tierlist-wowgg'
			  AND c.mode = $1
			  AND c.role = $2
			  AND c.selection_type = 'all'
			  AND c.selection_id = 'all'
			  AND COALESCE(c.key_type, '') IN ('', 'all')
			ORDER BY c.source_updated_at DESC
			LIMIT 1
		), metrics AS (
			SELECT e.class_slug, e.spec_slug, e.meta_score::double precision,
			       e.average_dps::double precision, e.average_hps::double precision,
			       e.popularity::double precision, e.max_key, e.diff_rank
			FROM metric_context c
			JOIN wowgg_tierlist_entries e
			  ON e.snapshot_id = c.snapshot_id AND e.context_key = c.context_key
		)
		SELECT row_number() OVER (
			ORDER BY CASE w.tier
				WHEN 'S+' THEN 0 WHEN 'S' THEN 1 WHEN 'A+' THEN 2 WHEN 'A' THEN 3
				WHEN 'B' THEN 4 WHEN 'C' THEN 5 WHEN 'D' THEN 6 ELSE 7 END,
			w.rank_in_tier, w.class_name, w.spec_name
		), w.tier, w.role, w.class_name, w.class_slug, w.spec_name, w.spec_slug,
		m.meta_score, m.average_dps, m.average_hps, m.popularity, m.max_key, m.diff_rank,
		w.guide_url, w.source_url
		FROM wowhead w
		LEFT JOIN metrics m ON m.class_slug = w.class_slug AND m.spec_slug = w.spec_slug
		ORDER BY 1
		LIMIT $3
	`, query.Activity, query.Role, query.Limit)
	if err != nil {
		return Snapshot{}, err
	}
	defer rows.Close()

	entries := make([]Entry, 0, query.Limit)
	for rows.Next() {
		var entry Entry
		var rank int64
		if err := rows.Scan(
			&rank, &entry.Tier, &entry.Role, &entry.ClassName, &entry.ClassSlug,
			&entry.SpecName, &entry.SpecSlug, &entry.Score, &entry.AverageDPS,
			&entry.AverageHPS, &entry.Popularity, &entry.MaxKey, &entry.RankChange,
			&entry.GuideURL, &entry.SourceURL,
		); err != nil {
			return Snapshot{}, err
		}
		entry.Rank = int(rank)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return Snapshot{}, err
	}
	if len(entries) == 0 {
		return Snapshot{}, ErrSnapshotNotFound
	}

	return Snapshot{
		Game: "wow", Status: "live", Activity: query.Activity, Role: query.Role,
		UpdatedAt: updatedAt, RecordCount: len(entries), Sources: sources, Entries: entries,
	}, nil
}

func (s *Service) contextTierList(ctx context.Context, query Query, sources []Source, updatedAt time.Time) (Snapshot, error) {
	keyType := query.KeyType
	if query.Activity == "mythic_plus" && keyType == "" {
		keyType = "all"
	}
	difficulty := query.Difficulty
	if query.Activity == "raid" && difficulty == "" {
		difficulty = "raid_hero"
	}

	rows, err := s.db.Query(ctx, `
		WITH selected_context AS (
			SELECT c.snapshot_id, c.context_key, c.selection_name
			FROM datasets d
			JOIN wowgg_tierlist_contexts c ON c.snapshot_id = d.current_snapshot_id
			WHERE d.slug = 'tierlist-wowgg'
			  AND c.mode = $1
			  AND c.role = $2
			  AND c.selection_type = $3
			  AND c.selection_id = $4
			  AND c.key_type = $5
			  AND c.raid_difficulty = $6
			  AND c.addon_key = $7
			ORDER BY c.source_updated_at DESC
			LIMIT 1
		), wowhead AS (
			SELECT w.class_name, w.class_slug, w.spec_name, w.spec_slug, w.guide_url
			FROM datasets d
			JOIN tierlist_entries w ON w.snapshot_id = d.current_snapshot_id
			WHERE d.slug = 'tierlist-wowhead' AND w.activity = $1 AND w.role = $2
		)
		SELECT e.rank, e.tier, e.role, COALESCE(w.class_name, e.class_name), e.class_slug,
		       COALESCE(w.spec_name, e.spec_name), e.spec_slug, e.meta_score::double precision,
		       e.average_dps::double precision, e.average_hps::double precision,
		       e.popularity::double precision, e.max_key, e.diff_rank,
		       COALESCE(NULLIF(w.guide_url, ''), e.guide_url), e.source_url, c.selection_name
		FROM selected_context c
		JOIN wowgg_tierlist_entries e
		  ON e.snapshot_id = c.snapshot_id AND e.context_key = c.context_key
		LEFT JOIN wowhead w ON w.class_slug = e.class_slug AND w.spec_slug = e.spec_slug
		WHERE e.entity_type = 'specialization'
		ORDER BY e.rank
		LIMIT $8`, query.Activity, query.Role, query.SelectionType, query.SelectionID,
		keyType, difficulty, query.AddonKey, query.Limit)
	if err != nil {
		return Snapshot{}, err
	}
	defer rows.Close()

	entries := make([]Entry, 0, query.Limit)
	selectionName := ""
	for rows.Next() {
		var entry Entry
		if err := rows.Scan(
			&entry.Rank, &entry.Tier, &entry.Role, &entry.ClassName, &entry.ClassSlug,
			&entry.SpecName, &entry.SpecSlug, &entry.Score, &entry.AverageDPS,
			&entry.AverageHPS, &entry.Popularity, &entry.MaxKey, &entry.RankChange,
			&entry.GuideURL, &entry.SourceURL, &selectionName,
		); err != nil {
			return Snapshot{}, err
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return Snapshot{}, err
	}
	if len(entries) == 0 {
		return Snapshot{}, ErrSnapshotNotFound
	}

	return Snapshot{
		Game: "wow", Status: "live", Activity: query.Activity, Role: query.Role,
		UpdatedAt: updatedAt, RecordCount: len(entries), Sources: sources, Entries: entries,
		Context: &Context{Activity: query.Activity, SelectionType: query.SelectionType,
			SelectionID: query.SelectionID, SelectionName: selectionName, KeyType: keyType,
			Difficulty: difficulty, AddonKey: query.AddonKey},
	}, nil
}

func (s *Service) sources(ctx context.Context) ([]Source, time.Time, error) {
	rows, err := s.db.Query(ctx, `
		SELECT d.slug, d.name, d.source_name, d.last_success_at,
		       COALESCE(snapshot.record_count, 0)
		FROM datasets d
		LEFT JOIN dataset_snapshots snapshot ON snapshot.id = d.current_snapshot_id
		WHERE d.slug IN (
			'tierlist-wowhead', 'tierlist-wowgg', 'tierlist-archon',
			'tierlist-icyveins', 'tierlist-mythicstats'
		)
		ORDER BY CASE d.slug
			WHEN 'tierlist-wowhead' THEN 0 WHEN 'tierlist-wowgg' THEN 1
			WHEN 'tierlist-archon' THEN 2 WHEN 'tierlist-icyveins' THEN 3 ELSE 4 END
	`)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer rows.Close()

	now := s.now().UTC()
	updatedAt := time.Time{}
	sources := make([]Source, 0, 5)
	for rows.Next() {
		var source Source
		if err := rows.Scan(&source.Slug, &source.Name, &source.Provider, &source.UpdatedAt, &source.RecordCount); err != nil {
			return nil, time.Time{}, err
		}
		source.Status = "empty"
		if source.UpdatedAt != nil && source.RecordCount > 0 {
			source.Status = "live"
			if now.Sub(source.UpdatedAt.UTC()) > 36*time.Hour {
				source.Status = "stale"
			}
			if source.UpdatedAt.After(updatedAt) {
				updatedAt = source.UpdatedAt.UTC()
			}
		}
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return nil, time.Time{}, err
	}
	if updatedAt.IsZero() {
		updatedAt = now
	}
	return sources, updatedAt, nil
}
