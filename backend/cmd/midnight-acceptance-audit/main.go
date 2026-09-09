// midnight-acceptance-audit performs the build-pinned public acceptance sweep
// for the Midnight cohort. It deliberately calls the public API rather than
// reading projections directly, so an eligible row that cannot render is a
// failure and review/excluded rows that leak are failures too.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
	"github.com/jackc/pgx/v5/pgxpool"
)

var templateToken = regexp.MustCompile(`\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])`)
var technicalName = regexp.MustCompile(`(?i)(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\]`)

type record struct {
	ID         string
	Type       string
	ExternalID int64
	Decision   string
	HasMedia   bool
}

type result struct {
	Build          string   `json:"build"`
	Full           bool     `json:"fullCohort"`
	Random         int      `json:"randomEligible"`
	Edge           int      `json:"edgeCases"`
	Templates      int      `json:"templateRecords"`
	TemplateShard  int      `json:"templateShard"`
	TemplateShards int      `json:"templateShards"`
	Checked        int      `json:"checkedRequests"`
	Failures       []string `json:"failures,omitempty"`
	CompletedAt    string   `json:"completedAt"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, apiBase, build, seed string
	var randomCount, edgeCount, concurrency, templateShard, templateShards int
	var all, templatesOnly bool
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&apiBase, "api-base-url", "https://api.gildra.net", "public API base URL")
	flag.StringVar(&build, "build", "", "build version (defaults to the active WoW build)")
	flag.StringVar(&seed, "seed", "midnight-acceptance-v1", "deterministic selection seed")
	flag.IntVar(&randomCount, "random", 200, "number of eligible random records")
	flag.IntVar(&edgeCount, "edge", 100, "number of edge records")
	flag.BoolVar(&all, "all", false, "check every eligible and non-eligible Midnight record")
	flag.BoolVar(&templatesOnly, "templates-only", false, "only run the sharded public template checks (requires -all)")
	flag.IntVar(&concurrency, "concurrency", 4, "maximum concurrent public API requests")
	flag.IntVar(&templateShards, "template-shards", 1, "split template API checks into this many deterministic shards")
	flag.IntVar(&templateShard, "template-shard", 0, "zero-based template shard to check")
	flag.DurationVar(&timeout, "timeout", 30*time.Minute, "whole audit timeout")
	flag.Parse()
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	if !all && (randomCount < 1 || edgeCount < 1) {
		return errors.New("-random and -edge must be positive")
	}
	if templatesOnly && !all {
		return errors.New("-templates-only requires -all")
	}
	// This audit uses a database gate for the entire cohort and bounded public
	// HTTP checks for its acceptance sample.  More than sixteen simultaneous
	// detail requests only evicts the production database working set, making
	// the audit slower and competing with player traffic.
	if concurrency < 1 || concurrency > 16 {
		return errors.New("-concurrency must be between 1 and 16")
	}
	if all && concurrency > 4 {
		return errors.New("-all requires -concurrency no greater than 4 to protect production traffic")
	}
	if timeout < time.Minute || timeout > time.Hour {
		return errors.New("-timeout must be between 1m and 1h")
	}
	if templateShards < 1 || templateShards > 16 || templateShard < 0 || templateShard >= templateShards {
		return errors.New("template-shards must be 1..16 and template-shard must select an existing shard")
	}
	apiBase = strings.TrimRight(strings.TrimSpace(apiBase), "/")
	if _, err := url.ParseRequestURI(apiBase); err != nil {
		return fmt.Errorf("invalid API base URL: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	if build == "" {
		if err := db.QueryRow(ctx, `SELECT build.version FROM game_builds build JOIN game_products product ON product.id=build.product_id WHERE product.slug='wow' AND build.is_active ORDER BY build.build_number DESC LIMIT 1`).Scan(&build); err != nil {
			return fmt.Errorf("load active build: %w", err)
		}
	}
	var records []record
	report := result{Build: build, Full: all, TemplateShard: templateShard, TemplateShards: templateShards}
	client := &http.Client{Timeout: 20 * time.Second}
	var checked atomic.Int64
	if all {
		if !templatesOnly {
			report.Failures, err = fullCohortFailures(ctx, db, build)
			if err != nil {
				return err
			}
			var selectedEdges []record
			records, selectedEdges, err = loadSample(ctx, db, build, seed, 200, 100)
			if err != nil {
				return err
			}
			report.Random, report.Edge = len(records), len(selectedEdges)
			records = append(records, selectedEdges...)
			localeRoutes, routeErr := loadRecords(ctx, db, build, seed, 0, "locale_routes")
			if routeErr != nil {
				return routeErr
			}
			for _, item := range localeRoutes {
				requestCount, failures := checkLocaleRoute(ctx, client, apiBase, item)
				checked.Add(int64(requestCount))
				report.Failures = append(report.Failures, failures...)
			}
		}
		// A stored source template is not itself a public failure: the API
		// resolves supported Blizzard tokens at request time. Audit every such
		// record through both locale routes so the release result reflects the
		// exact public payload, including tooltip blocks, rather than a raw DB
		// regular-expression count.
		templateRecords, templateErr := loadRecords(ctx, db, build, seed, 0, "template_all")
		if templateErr != nil {
			return templateErr
		}
		templateRecords = selectTemplateShard(templateRecords, templateShards, templateShard)
		report.Templates = len(templateRecords)
		requestCount, templateFailures := checkTemplateRecords(ctx, client, apiBase, templateRecords, concurrency)
		checked.Add(int64(requestCount))
		report.Failures = append(report.Failures, templateFailures...)
	} else {
		var selectedEdges []record
		records, selectedEdges, err = loadSample(ctx, db, build, seed, randomCount, edgeCount)
		if err != nil {
			return err
		}
		report.Random, report.Edge = len(records), len(selectedEdges)
		records = append(records, selectedEdges...)
	}
	var failuresMu sync.Mutex
	jobs := make(chan record)
	var workers sync.WaitGroup
	for range concurrency {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for item := range jobs {
				requestCount, failures := checkRecord(ctx, client, apiBase, item)
				checked.Add(int64(requestCount))
				if len(failures) > 0 {
					failuresMu.Lock()
					report.Failures = append(report.Failures, failures...)
					failuresMu.Unlock()
				}
			}
		}()
	}
	for _, item := range records {
		select {
		case jobs <- item:
		case <-ctx.Done():
			close(jobs)
			workers.Wait()
			return ctx.Err()
		}
	}
	close(jobs)
	workers.Wait()
	report.Checked = int(checked.Load())
	report.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	sort.Strings(report.Failures)
	encoded, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(encoded))
	if len(report.Failures) > 0 {
		return fmt.Errorf("Midnight public acceptance failed: %d failures", len(report.Failures))
	}
	return nil
}

// fullCohortFailures validates every eligible Midnight row through the same
// build-pinned quality projection that the release gate uses.  The public
// HTTP phase below intentionally remains a bounded acceptance sample: issuing
// two expensive detail requests for every record would turn a safety check
// into a production load test and would not validate more source data.
func fullCohortFailures(ctx context.Context, db *pgxpool.Pool, build string) ([]string, error) {
	snapshot, err := catalogquality.EvaluatePublicQuality(ctx, db, "wow", build, catalogquality.QualityProfileMidnightActive)
	if err != nil {
		return nil, fmt.Errorf("evaluate full Midnight quality cohort: %w", err)
	}
	failures := make([]string, 0, 8)
	if !snapshot.ActiveBuild || snapshot.Raw == 0 || snapshot.Eligible == 0 {
		failures = append(failures, "full cohort: active Midnight denominator is empty or not pinned to the active build")
	}
	if failed := snapshot.English.Missing + snapshot.English.Technical + snapshot.English.Unproven; failed != 0 {
		failures = append(failures, fmt.Sprintf("full cohort: English display failures=%d", failed))
	}
	if failed := snapshot.Russian.Missing + snapshot.Russian.Technical + snapshot.Russian.Fallback + snapshot.Russian.Unproven; failed != 0 {
		failures = append(failures, fmt.Sprintf("full cohort: Russian display/provenance failures=%d", failed))
	}
	// Template values are resolved while constructing the public entity. The
	// full audit calls both locale routes for each raw candidate below, which is
	// the authoritative check; a raw-token counter would incorrectly reject a
	// successfully resolved public tooltip.
	if failed := snapshot.MissingPrimaryMedia; failed != 0 {
		failures = append(failures, fmt.Sprintf("full cohort: media failures=%d", failed))
	}
	if snapshot.RunningImports != 0 || snapshot.FailedImports != 0 {
		failures = append(failures, fmt.Sprintf("full cohort: running imports=%d failed imports=%d", snapshot.RunningImports, snapshot.FailedImports))
	}
	return failures, nil
}

func loadSample(ctx context.Context, db *pgxpool.Pool, build, seed string, randomCount, edgeCount int) ([]record, []record, error) {
	randomRecords, err := loadRecords(ctx, db, build, seed, randomCount, "random")
	if err != nil {
		return nil, nil, err
	}
	seen := make(map[string]struct{}, len(randomRecords)+edgeCount)
	for _, item := range randomRecords {
		seen[item.ID] = struct{}{}
	}
	selectedEdges := make([]record, 0, edgeCount)
	edgeSelectors := []string{"noneligible", "missing_media", "template"}
	for _, selector := range edgeSelectors {
		candidates, err := loadRecords(ctx, db, build, seed, edgeCount, selector)
		if err != nil {
			return nil, nil, err
		}
		quota := edgeCount / len(edgeSelectors)
		if selector == edgeSelectors[len(edgeSelectors)-1] {
			quota = edgeCount - len(selectedEdges)
		}
		for _, item := range candidates {
			if len(selectedEdges) >= edgeCount || quota == 0 {
				break
			}
			if _, duplicate := seen[item.ID]; duplicate {
				continue
			}
			seen[item.ID] = struct{}{}
			selectedEdges = append(selectedEdges, item)
			quota--
		}
	}
	for _, selector := range edgeSelectors {
		if len(selectedEdges) == edgeCount {
			break
		}
		candidates, err := loadRecords(ctx, db, build, seed+"-fill", edgeCount, selector)
		if err != nil {
			return nil, nil, err
		}
		for _, item := range candidates {
			if len(selectedEdges) == edgeCount {
				break
			}
			if _, duplicate := seen[item.ID]; duplicate {
				continue
			}
			seen[item.ID] = struct{}{}
			selectedEdges = append(selectedEdges, item)
		}
	}
	if len(randomRecords) != randomCount || len(selectedEdges) != edgeCount {
		return nil, nil, fmt.Errorf("acceptance cohort is too small: random=%d/%d edge=%d/%d", len(randomRecords), randomCount, len(selectedEdges), edgeCount)
	}
	return randomRecords, selectedEdges, nil
}

func checkRecord(ctx context.Context, client *http.Client, apiBase string, item record) (int, []string) {
	failures := make([]string, 0, 2)
	if item.Decision != "eligible" {
		if err := expectStatus(ctx, client, apiBase, item.ID, "en_US", http.StatusNotFound); err != nil {
			failures = append(failures, fmt.Sprintf("%s/%d (%s): %v", item.Type, item.ExternalID, item.Decision, err))
		}
		return 1, failures
	}
	requests := 1
	payload, err := fetchEntity(ctx, client, apiBase, item.ID, "en_US")
	if err != nil {
		return requests, append(failures, fmt.Sprintf("%s/%d en_US: %v", item.Type, item.ExternalID, err))
	}
	if err := validateDisplay(payload, item.Type, item.HasMedia); err != nil {
		failures = append(failures, fmt.Sprintf("%s/%d en_US: %v", item.Type, item.ExternalID, err))
	}
	if err := validateEmbeddedLocalizations(payload); err != nil {
		failures = append(failures, fmt.Sprintf("%s/%d localizations: %v", item.Type, item.ExternalID, err))
	}
	// The response contains both build-pinned locale payloads. One media fetch
	// is sufficient because cached media is build-scoped, not locale-scoped.
	if item.HasMedia {
		requests++
		if err := fetchCachedMedia(ctx, client, payload); err != nil {
			failures = append(failures, fmt.Sprintf("%s/%d icon: %v", item.Type, item.ExternalID, err))
		}
	}
	return requests, failures
}

func checkLocaleRoute(ctx context.Context, client *http.Client, apiBase string, item record) (int, []string) {
	if item.Decision != "eligible" {
		return 0, nil
	}
	payload, err := fetchEntity(ctx, client, apiBase, item.ID, "ru_RU")
	if err != nil {
		return 1, []string{fmt.Sprintf("%s/%d ru_RU route: %v", item.Type, item.ExternalID, err)}
	}
	if err := validateDisplay(payload, item.Type, item.HasMedia); err != nil {
		return 1, []string{fmt.Sprintf("%s/%d ru_RU route: %v", item.Type, item.ExternalID, err)}
	}
	return 1, nil
}

func loadRecords(ctx context.Context, db *pgxpool.Pool, build, seed string, limit int, selector string) ([]record, error) {
	query := `
	WITH scoped AS (
		SELECT entity.id,cohort.entity_type,cohort.external_id,COALESCE(usability.decision,'review') decision,
			EXISTS (SELECT 1 FROM catalog_entity_media media WHERE media.build_id=cohort.build_id
				AND media.entity_type=cohort.entity_type AND media.external_id=cohort.external_id
				AND media.cache_status='cached' AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL AND media.cached_url IS NOT NULL) has_media,
			(EXISTS (SELECT 1 FROM catalog_entity_tooltips tooltip WHERE tooltip.version_id=version.id
				AND (tooltip.plain_text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])' OR tooltip.blocks::text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'))
			 OR EXISTS (SELECT 1 FROM game_entity_localizations localization WHERE localization.version_id=version.id
				AND localization.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])')) has_template
		FROM catalog_entity_expansions cohort
		JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id AND expansion.expansion_key='midnight'
		JOIN game_products product ON product.id=cohort.product_id AND product.slug='wow'
		JOIN game_builds build_row ON build_row.id=cohort.build_id AND build_row.version=$1
		JOIN game_entities entity ON entity.product_id=cohort.product_id AND entity.entity_type=cohort.entity_type AND entity.external_id=cohort.external_id AND entity.deleted_at IS NULL
		JOIN game_entity_versions version ON version.id=entity.published_version_id AND version.build_id=cohort.build_id
		LEFT JOIN catalog_entity_usability usability ON usability.product_id=cohort.product_id AND usability.build_id=cohort.build_id AND usability.entity_type=cohort.entity_type AND usability.external_id=cohort.external_id
		WHERE cohort.classification='confirmed'
	)
	SELECT id::text,entity_type,external_id,decision,has_media
	FROM scoped
	WHERE `
	switch selector {
	case "all":
		query += `true ORDER BY entity_type,external_id`
	case "random":
		query += `decision='eligible' ORDER BY md5($2 || id::text) LIMIT $3`
	case "noneligible":
		query += `decision<>'eligible' ORDER BY md5($2 || id::text) LIMIT $3`
	case "missing_media":
		query += `decision='eligible' AND entity_type='item' AND NOT has_media ORDER BY md5($2 || id::text) LIMIT $3`
	case "template":
		query += `decision='eligible' AND has_template ORDER BY md5($2 || id::text) LIMIT $3`
	case "template_all":
		query += `decision='eligible' AND has_template ORDER BY entity_type,external_id`
	case "locale_routes":
		query += `decision='eligible' AND id IN (
			SELECT DISTINCT ON (entity_type) id FROM scoped
			WHERE decision='eligible' ORDER BY entity_type,md5($2 || id::text)
		) ORDER BY entity_type`
	default:
		return nil, fmt.Errorf("unsupported acceptance selector %q", selector)
	}
	args := []any{build}
	if selector != "all" && selector != "template_all" {
		args = append(args, seed, limit)
		if selector == "locale_routes" {
			args = args[:2]
		}
	}
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("select acceptance records: %w", err)
	}
	defer rows.Close()
	result := make([]record, 0, limit)
	for rows.Next() {
		var item record
		if err := rows.Scan(&item.ID, &item.Type, &item.ExternalID, &item.Decision, &item.HasMedia); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

// selectTemplateShard splits the already deterministically sorted template
// cohort without changing its membership. A complete acceptance run consists
// of every shard; this keeps each production-safe HTTP pass comfortably below
// the one-hour execution limit.
func selectTemplateShard(records []record, shards, shard int) []record {
	if shards <= 1 {
		return records
	}
	result := make([]record, 0, (len(records)+shards-1)/shards)
	for index, item := range records {
		if index%shards == shard {
			result = append(result, item)
		}
	}
	return result
}

func checkTemplateRecords(ctx context.Context, client *http.Client, apiBase string, records []record, concurrency int) (int, []string) {
	if len(records) == 0 {
		return 0, nil
	}
	jobs := make(chan record)
	var workers sync.WaitGroup
	var checked atomic.Int64
	var failuresMu sync.Mutex
	failures := make([]string, 0)
	for range concurrency {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for item := range jobs {
				requests, recordFailures := checkTemplateRecord(ctx, client, apiBase, item)
				checked.Add(int64(requests))
				if len(recordFailures) == 0 {
					continue
				}
				failuresMu.Lock()
				failures = append(failures, recordFailures...)
				failuresMu.Unlock()
			}
		}()
	}
	for _, item := range records {
		select {
		case jobs <- item:
		case <-ctx.Done():
			close(jobs)
			workers.Wait()
			return int(checked.Load()), append(failures, fmt.Sprintf("template audit: %v", ctx.Err()))
		}
	}
	close(jobs)
	workers.Wait()
	return int(checked.Load()), failures
}

func checkTemplateRecord(ctx context.Context, client *http.Client, apiBase string, item record) (int, []string) {
	if item.Decision != "eligible" {
		return 0, nil
	}
	failures := make([]string, 0, 2)
	for _, locale := range []string{"en_US", "ru_RU"} {
		payload, err := fetchEntity(ctx, client, apiBase, item.ID, locale)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s/%d %s template route: %v", item.Type, item.ExternalID, locale, err))
			continue
		}
		// Media is independently fetched by the sampled HTTP checks, so do not
		// multiply icon traffic for every template record. Still preserve the
		// build-pinned media fact here: passing false made every item template
		// look like a missing-media failure even when its cached icon was proven
		// by the same SQL record selection.
		if err := validateDisplay(payload, item.Type, item.HasMedia); err != nil {
			failures = append(failures, fmt.Sprintf("%s/%d %s: %v", item.Type, item.ExternalID, locale, err))
		}
		if err := validateEmbeddedLocalizations(payload); err != nil {
			failures = append(failures, fmt.Sprintf("%s/%d localizations: %v", item.Type, item.ExternalID, err))
		}
	}
	return 2, failures
}

func expectStatus(ctx context.Context, client *http.Client, base, id, locale string, wanted int) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/v1/game/entities/"+id+"?locale="+url.QueryEscape(locale), nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != wanted {
		return fmt.Errorf("HTTP %d, want %d", response.StatusCode, wanted)
	}
	return nil
}

func fetchEntity(ctx context.Context, client *http.Client, base, id, locale string) (map[string]any, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/v1/game/entities/"+id+"?locale="+url.QueryEscape(locale), nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d, want 200", response.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(http.MaxBytesReader(nil, response.Body, 8<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func validateDisplay(payload map[string]any, entityType string, hasMedia bool) error {
	name, _ := payload["name"].(string)
	if strings.TrimSpace(name) == "" || technicalName.MatchString(name) {
		return fmt.Errorf("invalid public name %q", name)
	}
	if entityType == "item" && !hasMedia {
		return errors.New("missing verified primary media")
	}
	if hasMedia {
		if iconURL, _ := payload["iconUrl"].(string); !strings.HasPrefix(iconURL, "https://api.gildra.net/v1/media/") {
			return fmt.Errorf("cached media has no local icon URL")
		}
	}
	for _, key := range []string{"description", "resolvedDescription"} {
		if value, _ := payload[key].(string); templateToken.MatchString(value) {
			return fmt.Errorf("unresolved template in %s", key)
		}
	}
	if tooltip, ok := payload["tooltip"].(map[string]any); ok && tooltipHasTemplate(tooltip) {
		return errors.New("unresolved template in tooltip")
	}
	return nil
}

// validateEmbeddedLocalizations checks the bilingual payload returned with a
// public entity. The requested-locale route is separately exercised once per
// entity type, while this check proves the actual EN/RU content for every
// sampled record without multiplying production detail traffic.
func validateEmbeddedLocalizations(payload map[string]any) error {
	localizations, ok := payload["localizations"].(map[string]any)
	if !ok {
		return errors.New("missing bilingual localizations")
	}
	for _, locale := range []string{"en_US", "ru_RU"} {
		value, ok := localizations[locale].(map[string]any)
		if !ok {
			return fmt.Errorf("missing %s localization", locale)
		}
		name, _ := value["name"].(string)
		if strings.TrimSpace(name) == "" || technicalName.MatchString(name) {
			return fmt.Errorf("invalid %s name %q", locale, name)
		}
		for _, key := range []string{"description", "resolvedDescription"} {
			if text, _ := value[key].(string); templateToken.MatchString(text) {
				return fmt.Errorf("unresolved %s template in %s", locale, key)
			}
		}
	}
	return nil
}

// fetchCachedMedia proves that the public entity URL does not merely look
// local: it must serve an actual image without redirecting to a third party.
func fetchCachedMedia(ctx context.Context, client *http.Client, payload map[string]any) error {
	iconURL, _ := payload["iconUrl"].(string)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, iconURL, nil)
	if err != nil {
		return fmt.Errorf("create media request: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d, want 200", response.StatusCode)
	}
	if !strings.HasPrefix(strings.ToLower(response.Header.Get("Content-Type")), "image/") {
		return fmt.Errorf("content type %q is not an image", response.Header.Get("Content-Type"))
	}
	return nil
}

func tooltipHasTemplate(value any) bool {
	switch typed := value.(type) {
	case string:
		return templateToken.MatchString(typed)
	case []any:
		for _, entry := range typed {
			if tooltipHasTemplate(entry) {
				return true
			}
		}
	case map[string]any:
		for key, entry := range typed {
			if key == "raw_text" {
				continue
			}
			if tooltipHasTemplate(entry) {
				return true
			}
		}
	}
	return false
}
