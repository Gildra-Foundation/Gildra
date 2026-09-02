package adminpanel

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
)

// The console pages load their sections independently: every endpoint below
// is bounded by its own timeout so one slow dependency (a running import, a
// cold ClickHouse, a stuck Redis) degrades a single panel instead of blocking
// the whole dashboard.
const (
	quickCheckTimeout      = 2 * time.Second
	datasetQueryTimeout    = 5 * time.Second
	analyticsQueryTimeout  = 5 * time.Second
	catalogHealthTimeout   = 8 * time.Second
	catalogActivityTimeout = 3 * time.Second
	catalogHealthCacheTTL  = 20 * time.Second
	dashboardTimeout       = 15 * time.Second
	maxAnalyticsHours      = 24 * 7
)

// consoleEndpoint documents one public API method for the console.  The
// list is static: the API page must render without any request.
type consoleEndpoint struct {
	Method      string `json:"method"`
	Path        string `json:"path"`
	Description string `json:"description"`
}

var consoleEndpoints = []consoleEndpoint{
	{"GET", "/v1/game/products", "Список игровых продуктов"},
	{"GET", "/v1/game/entity-types", "Полнота каталога по типам данных"},
	{"GET", "/v1/game/entity-summaries", "Быстрый поиск и карточки без тяжёлых payload"},
	{"GET", "/v1/game/entities", "Совместимый полный список каталога"},
	{"GET", "/v1/game/categories", "Иерархические категории каталога"},
	{"GET", "/v1/game/entities/{id}", "Карточка игровой сущности"},
	{"GET", "/v1/game/entities/{id}/relationships", "Связи, источники, владельцы и упоминания"},
	{"GET", "/v1/game/coverage", "Покрытие полей по активной сборке"},
	{"GET", "/v1/game/source-policies", "Правила использования источников"},
	{"GET", "/v1/game/relation-types", "Онтология связей каталога"},
	{"GET", "/v1/game/sitemap-entries", "Сегментированный SEO read-model"},
	{"GET", "/world-of-warcraft/{retail|classic|classic-era|hardcore}/v1", "Каноничные базы API по изданиям WoW"},
	{"GET", "/v1/library/datasets", "Публичные датасеты библиотеки"},
	{"GET", "/v1/media/{id}", "Локально кэшированные медиа каталога"},
	{"GET", "/v1/admin/system", "Быстрые проверки Postgres, ClickHouse и Redis"},
	{"GET", "/v1/admin/catalog-health", "Полнота каталога и последние импорты"},
	{"GET", "/v1/admin/catalog-readiness", "Проверки готовности базы к production"},
	{"GET", "/v1/admin/datasets", "Список датасетов панели"},
	{"GET", "/v1/admin/datasets/{slug}", "Карточка датасета"},
	{"GET", "/v1/admin/datasets/{slug}/freshness", "Свежесть датасета"},
	{"GET", "/v1/admin/datasets/{slug}/runs", "История обновлений датасета"},
	{"GET", "/v1/admin/tierlist-wowgg", "Все срезы и фильтры Tierlist — wow.gg"},
	{"GET", "/v1/admin/tierlist-icyveins", "Тиры, разборы и гайды Tierlist — Icy Veins"},
	{"POST", "/v1/analytics/events", "Приём событий аналитики"},
	{"POST", "/v1/indexnow", "Отправка URL в IndexNow"},
	{"POST", "/graphql", "GraphQL API каталога"},
}

type systemReport struct {
	GeneratedAt    time.Time    `json:"generatedAt"`
	Systems        []statusItem `json:"systems"`
	SchemaVersion  int64        `json:"schemaVersion"`
	RecoveryPolicy string       `json:"recoveryPolicy"`
	Healthy        bool         `json:"healthy"`
}

type datasetFreshness struct {
	Slug                   string     `json:"slug"`
	Freshness              string     `json:"freshness"`
	FreshUntil             *time.Time `json:"freshUntil"`
	LastSuccessAt          *time.Time `json:"lastSuccessAt"`
	LastAttemptAt          *time.Time `json:"lastAttemptAt"`
	RefreshIntervalSeconds int64      `json:"refreshIntervalSeconds"`
	GeneratedAt            time.Time  `json:"generatedAt"`
}

// computeFreshness classifies a dataset by its last successful snapshot and
// refresh interval: "never" without a success, "fresh" while the interval has
// not elapsed, "stale" afterwards.  The returned deadline is nil for "never".
func computeFreshness(now time.Time, lastSuccessAt *time.Time, refreshInterval time.Duration) (string, *time.Time) {
	if lastSuccessAt == nil {
		return "never", nil
	}
	freshUntil := lastSuccessAt.UTC().Add(refreshInterval)
	if now.Before(freshUntil) {
		return "fresh", &freshUntil
	}
	return "stale", &freshUntil
}

// system answers GET /v1/admin/system: three parallel pings with a two-second
// budget each, the applied schema version and the recovery policy.  It never
// touches catalog tables, so it stays fast during imports.
func (h *Handler) system(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), quickCheckTimeout+time.Second)
	defer cancel()
	report := systemReport{GeneratedAt: time.Now().UTC(), RecoveryPolicy: h.recoveryPolicy, Healthy: true}
	report.Systems = h.systemStatuses(ctx)
	for _, system := range report.Systems {
		if system.Status != "operational" {
			report.Healthy = false
		}
	}
	if h.postgres != nil {
		versionCtx, versionCancel := context.WithTimeout(ctx, quickCheckTimeout)
		if err := h.postgres.QueryRow(versionCtx, `SELECT COALESCE(max(version_id),0) FROM goose_db_version WHERE is_applied`).Scan(&report.SchemaVersion); err != nil {
			slog.Warn("read schema version", "error", err)
		}
		versionCancel()
	}
	writeJSON(w, http.StatusOK, report)
}

// systemStatuses pings PostgreSQL, ClickHouse and Redis concurrently.  A
// missing client is reported as degraded instead of panicking so the console
// still renders in reduced deployments.
func (h *Handler) systemStatuses(parent context.Context) []statusItem {
	checks := []struct {
		name string
		fn   func(context.Context) error
	}{
		{"PostgreSQL", func(ctx context.Context) error {
			if h.postgres == nil {
				return errors.New("postgres client is not configured")
			}
			return h.postgres.Ping(ctx)
		}},
		{"ClickHouse", func(ctx context.Context) error {
			if h.clickhouse == nil {
				return errors.New("clickhouse client is not configured")
			}
			return h.clickhouse.Ping(ctx)
		}},
		{"Redis", func(ctx context.Context) error {
			if h.redis == nil {
				return errors.New("redis client is not configured")
			}
			return h.redis.Ping(ctx).Err()
		}},
	}
	results := make([]statusItem, len(checks))
	var wg sync.WaitGroup
	for index, check := range checks {
		wg.Add(1)
		go func(index int, name string, fn func(context.Context) error) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(parent, quickCheckTimeout)
			defer cancel()
			started := time.Now()
			err := fn(ctx)
			status := "operational"
			if err != nil {
				status = "degraded"
			}
			results[index] = statusItem{Name: name, Status: status, LatencyMS: time.Since(started).Milliseconds()}
		}(index, check.name, check.fn)
	}
	wg.Wait()
	return append([]statusItem{{Name: "API", Status: "operational", LatencyMS: 0}}, results...)
}

// catalogHealthAPI answers GET /v1/admin/catalog-health with the cached
// snapshot; the cache absorbs the burst of requests from several open tabs.
func (h *Handler) catalogHealthAPI(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), catalogHealthTimeout)
	defer cancel()
	health, err := h.cachedCatalogHealth(ctx)
	if err != nil {
		slog.Error("load catalog health", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalog_health_unavailable", "Не удалось загрузить состояние каталога")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"generatedAt": time.Now().UTC(), "catalog": health, "catalogReadiness": h.dashboardReadiness(),
	})
}

func (h *Handler) cachedCatalogHealth(ctx context.Context) (catalogHealth, error) {
	h.healthMu.Lock()
	if !h.healthCachedAt.IsZero() && time.Since(h.healthCachedAt) < catalogHealthCacheTTL {
		health := h.healthCached
		h.healthMu.Unlock()
		return health, nil
	}
	h.healthMu.Unlock()

	health, err := h.catalogHealth(ctx)
	if err != nil {
		return catalogHealth{}, err
	}
	h.healthMu.Lock()
	h.healthCached = health
	h.healthCachedAt = time.Now()
	h.healthMu.Unlock()
	return health, nil
}

// catalogImportActivity aggregates live source records for the snapshots of
// the listed import runs in one pass.  The previous LATERAL subquery scanned
// catalog_source_records once per run; this query walks the artifact index
// and the records primary key (artifact_id, record_key) instead, and it runs
// under a local statement timeout so a running import can never hold the
// dashboard hostage.  On timeout the caller keeps the import list without
// live counts.
func (h *Handler) catalogImportActivity(ctx context.Context, snapshotIDs []string) (map[string][2]any, error) {
	if len(snapshotIDs) == 0 {
		return map[string][2]any{}, nil
	}
	ctx, cancel := context.WithTimeout(ctx, catalogActivityTimeout)
	defer cancel()
	tx, err := h.postgres.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err := tx.Exec(ctx, `SET LOCAL statement_timeout = '`+strconv.FormatInt(catalogActivityTimeout.Milliseconds(), 10)+`ms'`); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
		SELECT artifact.snapshot_id::text,
			count(record.artifact_id) AS record_count,
			max(record.imported_at) AS last_activity_at
		FROM catalog_source_artifacts artifact
		LEFT JOIN catalog_source_records record ON record.artifact_id=artifact.id
		WHERE artifact.snapshot_id = ANY($1::uuid[])
		GROUP BY artifact.snapshot_id`, snapshotIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string][2]any, len(snapshotIDs))
	for rows.Next() {
		var snapshotID string
		var count int64
		var lastActivity *time.Time
		if err := rows.Scan(&snapshotID, &count, &lastActivity); err != nil {
			return nil, err
		}
		result[snapshotID] = [2]any{count, lastActivity}
	}
	return result, rows.Err()
}

// analyticsOverview answers GET /v1/admin/analytics-overview?hours=24 with a
// bounded ClickHouse query; the dashboard chart is optional, so a slow
// analytics store returns 503 for this section only.
func (h *Handler) analyticsOverview(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	hours := 24
	if raw := r.URL.Query().Get("hours"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > maxAnalyticsHours {
			writeError(w, http.StatusBadRequest, "invalid_hours", "Параметр hours должен быть числом от 1 до 168")
			return
		}
		hours = parsed
	}
	if h.analytics == nil {
		writeError(w, http.StatusServiceUnavailable, "analytics_unavailable", "Аналитика не настроена")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), analyticsQueryTimeout)
	defer cancel()
	overview, err := h.analytics.Overview(ctx, hours)
	if err != nil {
		slog.Warn("load panel analytics", "error", err)
		writeError(w, http.StatusServiceUnavailable, "analytics_unavailable", "Аналитика временно недоступна")
		return
	}
	if overview.Series == nil {
		overview.Series = make([]api.AnalyticsPoint, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"generatedAt": time.Now().UTC(), "analytics": overview})
}

// endpoints answers GET /v1/admin/endpoints with the static method list; the
// console ships the same list in its bundle and only uses this route as a
// consistency check.
func (h *Handler) endpoints(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": consoleEndpoints, "count": len(consoleEndpoints)})
}

func (h *Handler) datasetDetail(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), datasetQueryTimeout)
	defer cancel()
	items, err := h.loadDatasets(ctx, r.PathValue("slug"))
	if err != nil {
		slog.Error("load dataset detail", "error", err)
		writeError(w, http.StatusInternalServerError, "datasets_unavailable", "Не удалось загрузить датасет")
		return
	}
	if len(items) == 0 {
		writeError(w, http.StatusNotFound, "dataset_not_found", "Датасет не найден")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"dataset": items[0], "generatedAt": time.Now().UTC()})
}

func (h *Handler) datasetFreshnessAPI(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), datasetQueryTimeout)
	defer cancel()
	items, err := h.loadDatasets(ctx, r.PathValue("slug"))
	if err != nil {
		slog.Error("load dataset freshness", "error", err)
		writeError(w, http.StatusInternalServerError, "datasets_unavailable", "Не удалось проверить свежесть датасета")
		return
	}
	if len(items) == 0 {
		writeError(w, http.StatusNotFound, "dataset_not_found", "Датасет не найден")
		return
	}
	item := items[0]
	writeJSON(w, http.StatusOK, datasetFreshness{
		Slug: item.Slug, Freshness: item.Freshness, FreshUntil: item.FreshUntil,
		LastSuccessAt: item.LastSuccessAt, LastAttemptAt: item.LastAttemptAt,
		RefreshIntervalSeconds: item.RefreshIntervalSeconds, GeneratedAt: time.Now().UTC(),
	})
}

// loadDatasets lists every dataset, or only the one with the given slug.
func (h *Handler) loadDatasets(ctx context.Context, slug string) ([]datasetListItem, error) {
	rows, err := h.postgres.Query(ctx, `
		SELECT d.id::text, d.slug, d.name, d.source_name,
		       extract(epoch from d.refresh_interval)::bigint,
		       d.last_attempt_at, d.last_success_at, d.last_error_code, d.last_error_summary,
		       COALESCE(s.page_count, 0), COALESCE(s.record_count, 0),
		       COALESCE(s.unique_spec_count, 0)
		FROM datasets d
		LEFT JOIN dataset_snapshots s ON s.id = d.current_snapshot_id
		WHERE $1 = '' OR d.slug = $1
		ORDER BY d.name`, slug)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		item.Freshness, item.FreshUntil = computeFreshness(now, item.LastSuccessAt, time.Duration(item.RefreshIntervalSeconds)*time.Second)
		result = append(result, item)
	}
	return result, rows.Err()
}

// pendingReadiness is the placeholder shown until the first explicit audit.
func pendingReadiness() catalogquality.ReadinessReport {
	return catalogquality.ReadinessReport{
		Product:     "wow",
		GeneratedAt: time.Now().UTC(),
		DataReady:   false,
		Checks: []catalogquality.ReadinessCheck{{
			Key:      "readiness_pending",
			Scope:    catalogquality.ScopeData,
			Status:   "pending",
			Message:  "Полная проверка готовности запускается отдельно и не блокирует панель",
			Blocking: false,
		}},
	}
}
