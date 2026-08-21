package adminpanel

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/Gildra-Foundation/Gildra/backend/internal/analytics"
	"github.com/Gildra-Foundation/Gildra/backend/internal/auth"
)

const sessionCookie = "gildra_admin_session"

type Handler struct {
	auth       *auth.Service
	analytics  *analytics.Service
	postgres   *pgxpool.Pool
	clickhouse driver.Conn
	redis      *redis.Client
}

type statusItem struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	LatencyMS int64  `json:"latencyMs"`
}

type datasetSummary struct {
	ID               string     `json:"id"`
	Slug             string     `json:"slug"`
	Name             string     `json:"name"`
	SourceName       string     `json:"sourceName"`
	LastAttemptAt    *time.Time `json:"lastAttemptAt"`
	LastSuccessAt    *time.Time `json:"lastSuccessAt"`
	LastErrorCode    string     `json:"lastErrorCode"`
	LastErrorSummary string     `json:"lastErrorSummary"`
	PageCount        int        `json:"pageCount"`
	RecordCount      int        `json:"recordCount"`
	UniqueSpecCount  int        `json:"uniqueSpecCount"`
	SourceFetchedAt  *time.Time `json:"sourceFetchedAt"`
}

type datasetListItem struct {
	ID                     string     `json:"id"`
	Slug                   string     `json:"slug"`
	Name                   string     `json:"name"`
	SourceName             string     `json:"sourceName"`
	RefreshIntervalSeconds int64      `json:"refreshIntervalSeconds"`
	LastAttemptAt          *time.Time `json:"lastAttemptAt"`
	LastSuccessAt          *time.Time `json:"lastSuccessAt"`
	FreshUntil             *time.Time `json:"freshUntil"`
	Freshness              string     `json:"freshness"`
	LastErrorCode          string     `json:"lastErrorCode"`
	LastErrorSummary       string     `json:"lastErrorSummary"`
	PageCount              int        `json:"pageCount"`
	RecordCount            int        `json:"recordCount"`
	UniqueSpecCount        int        `json:"uniqueSpecCount"`
}

type datasetRun struct {
	ID              string     `json:"id"`
	Trigger         string     `json:"trigger"`
	Status          string     `json:"status"`
	ScheduledFor    time.Time  `json:"scheduledFor"`
	StartedAt       *time.Time `json:"startedAt"`
	FinishedAt      *time.Time `json:"finishedAt"`
	PageCount       int        `json:"pageCount"`
	RecordCount     int        `json:"recordCount"`
	UniqueSpecCount int        `json:"uniqueSpecCount"`
	ErrorSummary    string     `json:"errorSummary"`
}

type tierlistEntry struct {
	Activity   string `json:"activity"`
	Role       string `json:"role"`
	Tier       string `json:"tier"`
	RankInTier int    `json:"rankInTier"`
	ClassName  string `json:"className"`
	ClassSlug  string `json:"classSlug"`
	SpecName   string `json:"specName"`
	SpecSlug   string `json:"specSlug"`
	BadgeSlug  string `json:"badgeSlug"`
	GuideTitle string `json:"guideTitle"`
	GuideURL   string `json:"guideUrl"`
	SourceURL  string `json:"sourceUrl"`
}

type archonTierAssignment struct {
	Tier string `json:"tier"`
	Rank int    `json:"rank"`
}

type archonTierlistEntry struct {
	Activity        string                          `json:"activity"`
	Difficulty      string                          `json:"difficulty"`
	Role            string                          `json:"role"`
	Rank            int                             `json:"rank"`
	Tier            string                          `json:"tier"`
	TierAssignments map[string]archonTierAssignment `json:"tierAssignments"`
	SpecID          *int64                          `json:"specId"`
	ClassName       string                          `json:"className"`
	ClassSlug       string                          `json:"classSlug"`
	SpecName        string                          `json:"specName"`
	SpecSlug        string                          `json:"specSlug"`
	IconSlug        string                          `json:"iconSlug"`
	BuildURL        string                          `json:"buildUrl"`
	SourceURL       string                          `json:"sourceUrl"`
	Score           *float64                        `json:"score"`
	DPS             *float64                        `json:"dps"`
	HPS             *float64                        `json:"hps"`
	Survivability   *float64                        `json:"survivability"`
	Popularity      *float64                        `json:"popularity"`
	Parses          int64                           `json:"parses"`
	MaxKey          *int                            `json:"maxKey"`
	SourceUpdatedAt time.Time                       `json:"sourceUpdatedAt"`
}

type wowGGTierlistContext struct {
	ContextKey      string    `json:"contextKey"`
	Mode            string    `json:"mode"`
	Role            string    `json:"role"`
	AddonID         string    `json:"addonId"`
	AddonKey        string    `json:"addonKey"`
	AddonName       string    `json:"addonName"`
	SelectionType   string    `json:"selectionType"`
	SelectionID     string    `json:"selectionId"`
	SelectionName   string    `json:"selectionName"`
	KeyType         string    `json:"keyType"`
	RaidDifficulty  string    `json:"raidDifficulty"`
	PVPBracket      string    `json:"pvpBracket"`
	PVPRegion       string    `json:"pvpRegion"`
	SourceWeek      string    `json:"sourceWeek"`
	SourceURL       string    `json:"sourceUrl"`
	SourceUpdatedAt time.Time `json:"sourceUpdatedAt"`
	RecordCount     int       `json:"recordCount"`
}

type wowGGTierlistEntry struct {
	ContextKey       string                          `json:"contextKey"`
	EntityType       string                          `json:"entityType"`
	EntityID         string                          `json:"entityId"`
	EntityName       string                          `json:"entityName"`
	EntitySlug       string                          `json:"entitySlug"`
	Rank             int                             `json:"rank"`
	Tier             string                          `json:"tier"`
	TierAssignments  map[string]archonTierAssignment `json:"tierAssignments"`
	ClassName        *string                         `json:"className"`
	ClassSlug        *string                         `json:"classSlug"`
	SpecName         *string                         `json:"specName"`
	SpecSlug         *string                         `json:"specSlug"`
	Role             string                          `json:"role"`
	GuideURL         string                          `json:"guideUrl"`
	SourceURL        string                          `json:"sourceUrl"`
	MetaScore        *float64                        `json:"metaScore"`
	AverageDPS       *float64                        `json:"averageDps"`
	AverageHPS       *float64                        `json:"averageHps"`
	TopValue         *float64                        `json:"topValue"`
	Popularity       *float64                        `json:"popularity"`
	PVPPlayers       *int                            `json:"pvpPlayers"`
	PVPAverageRating *float64                        `json:"pvpAverageRating"`
	PVPMaxRating     *float64                        `json:"pvpMaxRating"`
	PVPMinRating     *float64                        `json:"pvpMinRating"`
	MaxKey           *int                            `json:"maxKey"`
	DiffRank         *int                            `json:"diffRank"`
	MetricValues     map[string]any                  `json:"metricValues"`
}

type wowGGWeek struct {
	Week            string    `json:"week"`
	SnapshotID      string    `json:"snapshotId"`
	SourceFetchedAt time.Time `json:"sourceFetchedAt"`
}

type icyVeinsTierlistPage struct {
	ContextKey      string    `json:"contextKey"`
	Activity        string    `json:"activity"`
	Role            string    `json:"role"`
	Title           string    `json:"title"`
	AuthorName      string    `json:"authorName"`
	SourceURL       string    `json:"sourceUrl"`
	SourceUpdatedAt time.Time `json:"sourceUpdatedAt"`
	RecordCount     int       `json:"recordCount"`
}

type icyVeinsTierlistEntry struct {
	ContextKey      string    `json:"contextKey"`
	Activity        string    `json:"activity"`
	Role            string    `json:"role"`
	Tier            string    `json:"tier"`
	RankInTier      int       `json:"rankInTier"`
	ClassName       string    `json:"className"`
	ClassSlug       string    `json:"classSlug"`
	SpecName        string    `json:"specName"`
	SpecSlug        string    `json:"specSlug"`
	IconURL         string    `json:"iconUrl"`
	GuideURL        string    `json:"guideUrl"`
	SourceURL       string    `json:"sourceUrl"`
	ChangeDirection string    `json:"changeDirection"`
	SourceUpdatedAt time.Time `json:"sourceUpdatedAt"`
}

type mythicStatsPage struct {
	ContextKey       string `json:"contextKey"`
	PageType         string `json:"pageType"`
	Title            string `json:"title"`
	Subtitle         string `json:"subtitle"`
	SourceURL        string `json:"sourceUrl"`
	SourcePeriodID   string `json:"sourcePeriodId"`
	SourcePeriodName string `json:"sourcePeriodName"`
	KeyRange         string `json:"keyRange"`
	RecordCount      int    `json:"recordCount"`
}

type mythicStatsPerformanceEntry struct {
	Role         string `json:"role"`
	Rank         int    `json:"rank"`
	RankChange   int    `json:"rankChange"`
	Tier         string `json:"tier"`
	AverageValue int64  `json:"averageValue"`
	TopValue     int64  `json:"topValue"`
	RunsLabel    string `json:"runsLabel"`
	RunsEstimate int    `json:"runsEstimate"`
	KeyRange     string `json:"keyRange"`
	ClassName    string `json:"className"`
	ClassSlug    string `json:"classSlug"`
	SpecName     string `json:"specName"`
	SpecSlug     string `json:"specSlug"`
	IconURL      string `json:"iconUrl"`
	SpecURL      string `json:"specUrl"`
	SourceURL    string `json:"sourceUrl"`
}

type mythicStatsTierEntry struct {
	Category   string `json:"category"`
	Tier       string `json:"tier"`
	RankInTier int    `json:"rankInTier"`
	ClassName  string `json:"className"`
	ClassSlug  string `json:"classSlug"`
	SpecName   string `json:"specName"`
	SpecSlug   string `json:"specSlug"`
	IconURL    string `json:"iconUrl"`
	SpecURL    string `json:"specUrl"`
	SourceURL  string `json:"sourceUrl"`
}

var sourceWeekPattern = regexp.MustCompile(`^\d{4}-W\d{2}$`)

func New(authService *auth.Service, analyticsService *analytics.Service, postgres *pgxpool.Pool, clickhouse driver.Conn, redisClient *redis.Client) *Handler {
	return &Handler{auth: authService, analytics: analyticsService, postgres: postgres, clickhouse: clickhouse, redis: redisClient}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/auth/login", h.login)
	mux.HandleFunc("POST /v1/auth/logout", h.logout)
	mux.HandleFunc("GET /v1/auth/me", h.me)
	mux.HandleFunc("GET /v1/admin/dashboard", h.dashboard)
	mux.HandleFunc("GET /v1/admin/datasets", h.datasets)
	mux.HandleFunc("GET /v1/admin/datasets/{slug}/runs", h.datasetRunsAPI)
	mux.HandleFunc("GET /v1/admin/tierlist-wowhead", h.tierlist)
	mux.HandleFunc("GET /v1/admin/tierlist-archon", h.archonTierlist)
	mux.HandleFunc("GET /v1/admin/tierlist-wowgg", h.wowGGTierlist)
	mux.HandleFunc("GET /v1/admin/tierlist-icyveins", h.icyVeinsTierlist)
	mux.HandleFunc("GET /v1/admin/tierlist-mythicstats", h.mythicStatsTierlist)
}

func (h *Handler) datasetRunsAPI(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	slug := r.PathValue("slug")
	if slug != "tierlist-wowhead" && slug != "tierlist-archon" && slug != "tierlist-wowgg" && slug != "tierlist-icyveins" && slug != "tierlist-mythicstats" {
		writeError(w, http.StatusNotFound, "dataset_not_found", "Датасет не найден")
		return
	}
	runs, err := h.datasetRuns(r.Context(), slug)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить историю обновлений")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": runs, "count": len(runs)})
}

func (h *Handler) mythicStatsTierlist(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	role := r.URL.Query().Get("role")
	category := r.URL.Query().Get("category")
	if role != "" && role != "dps" && role != "tank" && role != "healer" {
		writeError(w, http.StatusBadRequest, "invalid_role", "Неизвестная роль")
		return
	}
	if category != "" && category != "melee" && category != "ranged" && category != "tank" && category != "healer" {
		writeError(w, http.StatusBadRequest, "invalid_category", "Неизвестная категория")
		return
	}

	var snapshotID string
	var sourceFetchedAt time.Time
	if err := h.postgres.QueryRow(r.Context(), `
		SELECT d.current_snapshot_id::text, s.source_fetched_at
		FROM datasets d
		JOIN dataset_snapshots s ON s.id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-mythicstats'`).Scan(&snapshotID, &sourceFetchedAt); err != nil {
		writeError(w, http.StatusNotFound, "dataset_not_ready", "У датасета ещё нет успешного снимка")
		return
	}

	pageRows, err := h.postgres.Query(r.Context(), `
		SELECT context_key, page_type, title, subtitle, source_url, source_period_id,
		       source_period_name, key_range, record_count
		FROM mythicstats_pages
		WHERE snapshot_id = $1
		ORDER BY CASE context_key WHEN 'performance' THEN 0 ELSE 1 END`, snapshotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить страницы MythicStats")
		return
	}
	pages := make([]mythicStatsPage, 0, 2)
	for pageRows.Next() {
		var page mythicStatsPage
		if err := pageRows.Scan(&page.ContextKey, &page.PageType, &page.Title, &page.Subtitle,
			&page.SourceURL, &page.SourcePeriodID, &page.SourcePeriodName, &page.KeyRange,
			&page.RecordCount); err != nil {
			pageRows.Close()
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать страницы MythicStats")
			return
		}
		pages = append(pages, page)
	}
	if err := pageRows.Err(); err != nil {
		pageRows.Close()
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить страницы MythicStats")
		return
	}
	pageRows.Close()

	performanceRows, err := h.postgres.Query(r.Context(), `
		SELECT role, rank, rank_change, tier, average_value, top_value, runs_label,
		       runs_estimate, key_range, class_name, class_slug, spec_name, spec_slug,
		       icon_url, spec_url, source_url
		FROM mythicstats_performance_entries
		WHERE snapshot_id = $1 AND ($2 = '' OR role = $2)
		ORDER BY CASE role WHEN 'dps' THEN 0 WHEN 'tank' THEN 1 ELSE 2 END, rank`, snapshotID, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить рейтинги MythicStats")
		return
	}
	performance := make([]mythicStatsPerformanceEntry, 0, 40)
	for performanceRows.Next() {
		var entry mythicStatsPerformanceEntry
		if err := performanceRows.Scan(&entry.Role, &entry.Rank, &entry.RankChange, &entry.Tier,
			&entry.AverageValue, &entry.TopValue, &entry.RunsLabel, &entry.RunsEstimate,
			&entry.KeyRange, &entry.ClassName, &entry.ClassSlug, &entry.SpecName, &entry.SpecSlug,
			&entry.IconURL, &entry.SpecURL, &entry.SourceURL); err != nil {
			performanceRows.Close()
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать рейтинги MythicStats")
			return
		}
		performance = append(performance, entry)
	}
	if err := performanceRows.Err(); err != nil {
		performanceRows.Close()
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить рейтинги MythicStats")
		return
	}
	performanceRows.Close()

	tierRows, err := h.postgres.Query(r.Context(), `
		SELECT category, tier, rank_in_tier, class_name, class_slug, spec_name, spec_slug,
		       icon_url, spec_url, source_url
		FROM mythicstats_spec_tier_entries
		WHERE snapshot_id = $1 AND ($2 = '' OR category = $2)
		ORDER BY CASE category WHEN 'melee' THEN 0 WHEN 'ranged' THEN 1 WHEN 'tank' THEN 2 ELSE 3 END,
		         CASE tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END,
		         rank_in_tier`, snapshotID, category)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить тир-лист MythicStats")
		return
	}
	tiers := make([]mythicStatsTierEntry, 0, 40)
	for tierRows.Next() {
		var entry mythicStatsTierEntry
		if err := tierRows.Scan(&entry.Category, &entry.Tier, &entry.RankInTier, &entry.ClassName,
			&entry.ClassSlug, &entry.SpecName, &entry.SpecSlug, &entry.IconURL, &entry.SpecURL,
			&entry.SourceURL); err != nil {
			tierRows.Close()
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать тир-лист MythicStats")
			return
		}
		tiers = append(tiers, entry)
	}
	if err := tierRows.Err(); err != nil {
		tierRows.Close()
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить тир-лист MythicStats")
		return
	}
	tierRows.Close()

	writeJSON(w, http.StatusOK, map[string]any{
		"snapshotId":      snapshotID,
		"sourceFetchedAt": sourceFetchedAt,
		"pages":           pages,
		"performance":     performance,
		"tiers":           tiers,
		"count":           len(performance) + len(tiers),
	})
}

func (h *Handler) icyVeinsTierlist(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	activity := r.URL.Query().Get("activity")
	role := r.URL.Query().Get("role")
	if activity != "" && activity != "raid" && activity != "mythic_plus" && activity != "pvp" {
		writeError(w, http.StatusBadRequest, "invalid_activity", "Неизвестный тип активности")
		return
	}
	if role != "" && role != "dps" && role != "healer" && role != "tank" {
		writeError(w, http.StatusBadRequest, "invalid_role", "Неизвестная роль")
		return
	}
	var snapshotID string
	if err := h.postgres.QueryRow(r.Context(), `
		SELECT current_snapshot_id::text FROM datasets WHERE slug = 'tierlist-icyveins'`).Scan(&snapshotID); err != nil {
		writeError(w, http.StatusNotFound, "dataset_not_ready", "У датасета ещё нет успешного снимка")
		return
	}
	pageRows, err := h.postgres.Query(r.Context(), `
		SELECT context_key, activity, role, title, author_name, source_url, source_updated_at, record_count
		FROM icyveins_tierlist_pages WHERE snapshot_id = $1
		ORDER BY CASE activity WHEN 'mythic_plus' THEN 0 WHEN 'raid' THEN 1 ELSE 2 END, role`, snapshotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить страницы Icy Veins")
		return
	}
	pages := make([]icyVeinsTierlistPage, 0, 8)
	for pageRows.Next() {
		var page icyVeinsTierlistPage
		if err := pageRows.Scan(&page.ContextKey, &page.Activity, &page.Role, &page.Title, &page.AuthorName,
			&page.SourceURL, &page.SourceUpdatedAt, &page.RecordCount); err != nil {
			pageRows.Close()
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать страницы Icy Veins")
			return
		}
		pages = append(pages, page)
	}
	if err := pageRows.Err(); err != nil {
		pageRows.Close()
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить страницы Icy Veins")
		return
	}
	pageRows.Close()

	rows, err := h.postgres.Query(r.Context(), `
		SELECT context_key, activity, role, tier, rank_in_tier, class_name, class_slug,
		       spec_name, spec_slug, icon_url, guide_url, source_url, change_direction,
		       source_updated_at
		FROM icyveins_tierlist_entries
		WHERE snapshot_id = $1 AND ($2 = '' OR activity = $2) AND ($3 = '' OR role = $3)
		ORDER BY CASE activity WHEN 'mythic_plus' THEN 0 WHEN 'raid' THEN 1 ELSE 2 END, role,
		         CASE left(tier, 1) WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
		         rank_in_tier, class_name, spec_name`, snapshotID, activity, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить Tierlist — Icy Veins")
		return
	}
	defer rows.Close()
	entries := make([]icyVeinsTierlistEntry, 0, 120)
	for rows.Next() {
		var entry icyVeinsTierlistEntry
		if err := rows.Scan(&entry.ContextKey, &entry.Activity, &entry.Role, &entry.Tier, &entry.RankInTier,
			&entry.ClassName, &entry.ClassSlug, &entry.SpecName, &entry.SpecSlug, &entry.IconURL,
			&entry.GuideURL, &entry.SourceURL, &entry.ChangeDirection, &entry.SourceUpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать Tierlist — Icy Veins")
			return
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить Tierlist — Icy Veins")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"snapshotId": snapshotID, "pages": pages, "data": entries, "count": len(entries)})
}

func (h *Handler) wowGGTierlist(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	week := r.URL.Query().Get("week")
	if week != "" && !sourceWeekPattern.MatchString(week) {
		writeError(w, http.StatusBadRequest, "invalid_week", "Недопустимый формат недели")
		return
	}
	var snapshotID string
	if week == "" {
		err := h.postgres.QueryRow(r.Context(), `
			SELECT current_snapshot_id::text FROM datasets WHERE slug = 'tierlist-wowgg'`).Scan(&snapshotID)
		if err != nil {
			writeError(w, http.StatusNotFound, "dataset_not_ready", "У датасета ещё нет успешного снимка")
			return
		}
	} else {
		err := h.postgres.QueryRow(r.Context(), `
			SELECT s.id::text
			FROM dataset_snapshots s
			JOIN datasets d ON d.id = s.dataset_id
			WHERE d.slug = 'tierlist-wowgg'
			  AND EXISTS (
			      SELECT 1 FROM wowgg_tierlist_contexts c
			      WHERE c.snapshot_id = s.id AND c.source_week = $1
			  )
			ORDER BY s.source_fetched_at DESC LIMIT 1`, week).Scan(&snapshotID)
		if err != nil {
			writeError(w, http.StatusNotFound, "week_not_found", "Снимок за эту неделю не найден")
			return
		}
	}

	contextRows, err := h.postgres.Query(r.Context(), `
		SELECT context_key, mode, role, addon_id, addon_key, addon_name,
		       selection_type, selection_id, selection_name, key_type,
		       raid_difficulty, pvp_bracket, pvp_region, source_week,
		       source_url, source_updated_at, record_count
		FROM wowgg_tierlist_contexts
		WHERE snapshot_id = $1
		ORDER BY mode, role, addon_name, selection_type, selection_name`, snapshotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить фильтры wow.gg")
		return
	}
	contexts := make([]wowGGTierlistContext, 0, 500)
	for contextRows.Next() {
		var item wowGGTierlistContext
		if err := contextRows.Scan(
			&item.ContextKey, &item.Mode, &item.Role, &item.AddonID, &item.AddonKey,
			&item.AddonName, &item.SelectionType, &item.SelectionID, &item.SelectionName,
			&item.KeyType, &item.RaidDifficulty, &item.PVPBracket, &item.PVPRegion,
			&item.SourceWeek, &item.SourceURL, &item.SourceUpdatedAt, &item.RecordCount,
		); err != nil {
			contextRows.Close()
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать фильтры wow.gg")
			return
		}
		contexts = append(contexts, item)
	}
	if err := contextRows.Err(); err != nil {
		contextRows.Close()
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить фильтры wow.gg")
		return
	}
	contextRows.Close()

	entryRows, err := h.postgres.Query(r.Context(), `
		SELECT context_key, entity_type, entity_id, entity_name, entity_slug, rank, tier,
		       tier_assignments, class_name, class_slug, spec_name, spec_slug, role,
		       guide_url, source_url, meta_score::double precision,
		       average_dps::double precision, average_hps::double precision,
		       top_value::double precision, popularity::double precision, pvp_players,
		       pvp_average_rating::double precision, pvp_max_rating::double precision,
		       pvp_min_rating::double precision, max_key, diff_rank, metric_values
		FROM wowgg_tierlist_entries
		WHERE snapshot_id = $1
		ORDER BY context_key, rank`, snapshotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить Tierlist — wow.gg")
		return
	}
	defer entryRows.Close()
	entries := make([]wowGGTierlistEntry, 0, 5000)
	for entryRows.Next() {
		var item wowGGTierlistEntry
		var assignments, metrics []byte
		if err := entryRows.Scan(
			&item.ContextKey, &item.EntityType, &item.EntityID, &item.EntityName,
			&item.EntitySlug, &item.Rank, &item.Tier, &assignments, &item.ClassName,
			&item.ClassSlug, &item.SpecName, &item.SpecSlug, &item.Role, &item.GuideURL,
			&item.SourceURL, &item.MetaScore, &item.AverageDPS, &item.AverageHPS,
			&item.TopValue, &item.Popularity, &item.PVPPlayers, &item.PVPAverageRating,
			&item.PVPMaxRating, &item.PVPMinRating, &item.MaxKey, &item.DiffRank, &metrics,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать Tierlist — wow.gg")
			return
		}
		if err := json.Unmarshal(assignments, &item.TierAssignments); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Повреждены данные тиров wow.gg")
			return
		}
		if err := json.Unmarshal(metrics, &item.MetricValues); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Повреждены метрики wow.gg")
			return
		}
		entries = append(entries, item)
	}
	if err := entryRows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить Tierlist — wow.gg")
		return
	}

	weekRows, err := h.postgres.Query(r.Context(), `
		SELECT DISTINCT ON (c.source_week) c.source_week, s.id::text, s.source_fetched_at
		FROM wowgg_tierlist_contexts c
		JOIN dataset_snapshots s ON s.id = c.snapshot_id
		JOIN datasets d ON d.id = s.dataset_id
		WHERE d.slug = 'tierlist-wowgg'
		ORDER BY c.source_week DESC, s.source_fetched_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить недели wow.gg")
		return
	}
	defer weekRows.Close()
	weeks := make([]wowGGWeek, 0, 16)
	for weekRows.Next() {
		var item wowGGWeek
		if err := weekRows.Scan(&item.Week, &item.SnapshotID, &item.SourceFetchedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать недели wow.gg")
			return
		}
		weeks = append(weeks, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"snapshotId": snapshotID, "contexts": contexts, "data": entries,
		"weeks": weeks, "count": len(entries),
	})
}

func (h *Handler) datasets(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	rows, err := h.postgres.Query(r.Context(), `
		SELECT d.id::text, d.slug, d.name, d.source_name,
		       extract(epoch from d.refresh_interval)::bigint,
		       d.last_attempt_at, d.last_success_at, d.last_error_code, d.last_error_summary,
		       COALESCE(s.page_count, 0), COALESCE(s.record_count, 0),
		       COALESCE(s.unique_spec_count, 0)
		FROM datasets d
		LEFT JOIN dataset_snapshots s ON s.id = d.current_snapshot_id
		ORDER BY d.name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "datasets_unavailable", "Не удалось загрузить список датасетов")
		return
	}
	defer rows.Close()
	now := time.Now().UTC()
	result := make([]datasetListItem, 0)
	for rows.Next() {
		var item datasetListItem
		if err := rows.Scan(&item.ID, &item.Slug, &item.Name, &item.SourceName,
			&item.RefreshIntervalSeconds, &item.LastAttemptAt, &item.LastSuccessAt,
			&item.LastErrorCode, &item.LastErrorSummary, &item.PageCount,
			&item.RecordCount, &item.UniqueSpecCount); err != nil {
			writeError(w, http.StatusInternalServerError, "datasets_unavailable", "Не удалось прочитать список датасетов")
			return
		}
		item.Freshness = "never"
		if item.LastSuccessAt != nil {
			freshUntil := item.LastSuccessAt.UTC().Add(time.Duration(item.RefreshIntervalSeconds) * time.Second)
			item.FreshUntil = &freshUntil
			if now.Before(freshUntil) {
				item.Freshness = "fresh"
			} else {
				item.Freshness = "stale"
			}
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "datasets_unavailable", "Не удалось загрузить список датасетов")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": result, "count": len(result), "generatedAt": now})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "invalid_origin", "Недопустимый источник запроса")
		return
	}
	var request struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil || request.Email == "" || request.Password == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "Введите email и пароль")
		return
	}
	user, token, expiresAt, err := h.auth.Login(r.Context(), request.Email, request.Password, r.UserAgent())
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Неверный email или пароль")
		return
	}
	if err != nil {
		slog.Error("admin login failed", "error", err)
		writeError(w, http.StatusInternalServerError, "login_failed", "Не удалось выполнить вход")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", Expires: expiresAt,
		MaxAge: int(time.Until(expiresAt).Seconds()), HttpOnly: true, Secure: true,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "expiresAt": expiresAt})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "invalid_origin", "Недопустимый источник запроса")
		return
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		if err := h.auth.Logout(r.Context(), cookie.Value); err != nil {
			slog.Warn("revoke admin session", "error", err)
		}
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	user, ok := h.authorize(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	user, ok := h.authorize(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	dataset, err := h.datasetSummary(ctx)
	if err != nil {
		slog.Error("load panel dataset summary", "error", err)
		writeError(w, http.StatusInternalServerError, "dashboard_unavailable", "Не удалось загрузить данные панели")
		return
	}
	runs, err := h.datasetRuns(ctx, "tierlist-wowhead")
	if err != nil {
		slog.Error("load panel dataset runs", "error", err)
		writeError(w, http.StatusInternalServerError, "dashboard_unavailable", "Не удалось загрузить историю обновлений")
		return
	}
	overview, err := h.analytics.Overview(ctx, 24)
	if err != nil {
		slog.Warn("load panel analytics", "error", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"generatedAt": time.Now().UTC(), "user": user, "systems": h.systemStatuses(ctx),
		"dataset": dataset, "runs": runs, "analytics": overview,
		"endpoints": []map[string]string{
			{"method": "GET", "path": "/v1/game/products", "description": "Список игровых продуктов"},
			{"method": "GET", "path": "/v1/game/entities", "description": "Каталог игровых сущностей"},
			{"method": "GET", "path": "/v1/admin/tierlist-wowgg", "description": "Все срезы и фильтры Tierlist — wow.gg"},
			{"method": "GET", "path": "/v1/admin/tierlist-icyveins", "description": "Тиры, разборы и гайды Tierlist — Icy Veins"},
			{"method": "GET", "path": "/v1/admin/tierlist-mythicstats", "description": "Рейтинги DPS, танков, лекарей и тиры MythicStats"},
			{"method": "POST", "path": "/v1/analytics/events", "description": "Приём событий аналитики"},
			{"method": "POST", "path": "/v1/indexnow", "description": "Отправка URL в IndexNow"},
			{"method": "POST", "path": "/graphql", "description": "GraphQL API каталога"},
		},
	})
}

func (h *Handler) tierlist(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	activity := r.URL.Query().Get("activity")
	role := r.URL.Query().Get("role")
	if activity != "" && activity != "raid" && activity != "mythic_plus" {
		writeError(w, http.StatusBadRequest, "invalid_activity", "Неизвестный тип активности")
		return
	}
	if role != "" && role != "dps" && role != "healer" && role != "tank" {
		writeError(w, http.StatusBadRequest, "invalid_role", "Неизвестная роль")
		return
	}
	rows, err := h.postgres.Query(r.Context(), `
		SELECT e.activity, e.role, e.tier, e.rank_in_tier, e.class_name, e.class_slug,
		       e.spec_name, e.spec_slug, e.badge_slug, e.guide_title, e.guide_url,
		       e.source_url
		FROM datasets d JOIN tierlist_entries e ON e.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-wowhead'
		  AND ($1 = '' OR e.activity = $1) AND ($2 = '' OR e.role = $2)
		ORDER BY e.activity, e.role, CASE e.tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END,
		         e.rank_in_tier, e.class_name, e.spec_name`, activity, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить тир-лист")
		return
	}
	defer rows.Close()
	entries := make([]tierlistEntry, 0, 80)
	for rows.Next() {
		var entry tierlistEntry
		if err := rows.Scan(&entry.Activity, &entry.Role, &entry.Tier, &entry.RankInTier,
			&entry.ClassName, &entry.ClassSlug, &entry.SpecName, &entry.SpecSlug, &entry.BadgeSlug,
			&entry.GuideTitle, &entry.GuideURL, &entry.SourceURL); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать тир-лист")
			return
		}
		entries = append(entries, entry)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": entries, "count": len(entries)})
}

func (h *Handler) archonTierlist(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	activity := r.URL.Query().Get("activity")
	role := r.URL.Query().Get("role")
	difficulty := r.URL.Query().Get("difficulty")
	if activity != "" && activity != "raid" && activity != "mythic_plus" {
		writeError(w, http.StatusBadRequest, "invalid_activity", "Неизвестный тип активности")
		return
	}
	if role != "" && role != "dps" && role != "healer" && role != "tank" {
		writeError(w, http.StatusBadRequest, "invalid_role", "Неизвестная роль")
		return
	}
	if difficulty != "" && difficulty != "10" && difficulty != "normal" && difficulty != "heroic" && difficulty != "mythic" {
		writeError(w, http.StatusBadRequest, "invalid_difficulty", "Неизвестная сложность")
		return
	}
	rows, err := h.postgres.Query(r.Context(), `
		SELECT e.activity, e.difficulty, e.role, e.rank, e.tier,
		       e.tier_assignments, e.spec_id, e.class_name, e.class_slug,
		       e.spec_name, e.spec_slug, e.icon_slug, e.build_url, e.source_url,
		       e.score::double precision, e.dps::double precision, e.hps::double precision,
		       e.survivability::double precision, e.popularity::double precision,
		       e.parses, e.max_key, e.source_updated_at
		FROM datasets d
		JOIN archon_tierlist_entries e ON e.snapshot_id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-archon'
		  AND ($1 = '' OR e.activity = $1)
		  AND ($2 = '' OR e.role = $2)
		  AND ($3 = '' OR e.difficulty = $3)
		ORDER BY e.activity, e.difficulty, e.role,
		         CASE e.tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
		         e.rank, e.class_name, e.spec_name`, activity, role, difficulty)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить Tierlist Archon")
		return
	}
	defer rows.Close()
	entries := make([]archonTierlistEntry, 0, 160)
	for rows.Next() {
		var entry archonTierlistEntry
		var assignments []byte
		if err := rows.Scan(
			&entry.Activity, &entry.Difficulty, &entry.Role, &entry.Rank, &entry.Tier,
			&assignments, &entry.SpecID, &entry.ClassName, &entry.ClassSlug,
			&entry.SpecName, &entry.SpecSlug, &entry.IconSlug, &entry.BuildURL,
			&entry.SourceURL, &entry.Score, &entry.DPS, &entry.HPS, &entry.Survivability,
			&entry.Popularity, &entry.Parses, &entry.MaxKey, &entry.SourceUpdatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось прочитать Tierlist Archon")
			return
		}
		if err := json.Unmarshal(assignments, &entry.TierAssignments); err != nil {
			writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Повреждены данные тиров Archon")
			return
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "dataset_unavailable", "Не удалось загрузить Tierlist Archon")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": entries, "count": len(entries)})
}

func (h *Handler) authorize(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Требуется вход")
		return auth.User{}, false
	}
	user, err := h.auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Сессия истекла")
		return auth.User{}, false
	}
	return user, true
}

func (h *Handler) datasetSummary(ctx context.Context) (datasetSummary, error) {
	var value datasetSummary
	err := h.postgres.QueryRow(ctx, `
		SELECT d.id::text, d.slug, d.name, d.source_name, d.last_attempt_at, d.last_success_at,
		       d.last_error_code, d.last_error_summary, COALESCE(s.page_count, 0),
		       COALESCE(s.record_count, 0), COALESCE(s.unique_spec_count, 0), s.source_fetched_at
		FROM datasets d LEFT JOIN dataset_snapshots s ON s.id = d.current_snapshot_id
		WHERE d.slug = 'tierlist-wowhead'`).Scan(&value.ID, &value.Slug, &value.Name, &value.SourceName,
		&value.LastAttemptAt, &value.LastSuccessAt, &value.LastErrorCode, &value.LastErrorSummary,
		&value.PageCount, &value.RecordCount, &value.UniqueSpecCount, &value.SourceFetchedAt)
	return value, err
}

func (h *Handler) datasetRuns(ctx context.Context, slug string) ([]datasetRun, error) {
	rows, err := h.postgres.Query(ctx, `
		SELECT r.id::text, r.trigger, r.status, r.scheduled_for, r.started_at, r.finished_at,
		       r.page_count, r.record_count, r.unique_spec_count, r.error_summary
		FROM dataset_runs r JOIN datasets d ON d.id = r.dataset_id
		WHERE d.slug = $1 ORDER BY r.created_at DESC LIMIT 12`, slug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]datasetRun, 0, 12)
	for rows.Next() {
		var run datasetRun
		if err := rows.Scan(&run.ID, &run.Trigger, &run.Status, &run.ScheduledFor, &run.StartedAt,
			&run.FinishedAt, &run.PageCount, &run.RecordCount, &run.UniqueSpecCount, &run.ErrorSummary); err != nil {
			return nil, err
		}
		result = append(result, run)
	}
	return result, rows.Err()
}

func (h *Handler) systemStatuses(parent context.Context) []statusItem {
	checks := []struct {
		name string
		fn   func(context.Context) error
	}{
		{"PostgreSQL", h.postgres.Ping},
		{"ClickHouse", h.clickhouse.Ping},
		{"Redis", func(ctx context.Context) error { return h.redis.Ping(ctx).Err() }},
	}
	result := []statusItem{{Name: "API", Status: "operational", LatencyMS: 0}}
	for _, check := range checks {
		ctx, cancel := context.WithTimeout(parent, 2*time.Second)
		started := time.Now()
		err := check.fn(ctx)
		cancel()
		status := "operational"
		if err != nil {
			status = "degraded"
		}
		result = append(result, statusItem{Name: check.name, Status: status, LatencyMS: time.Since(started).Milliseconds()})
	}
	return result
}

func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Host, r.Host) && parsed.Scheme == "https"
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("encode admin response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
