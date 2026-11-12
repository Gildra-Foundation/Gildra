package catalogmedia

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// refreshTroubleLimit stops a run after the official render host throttled
// or failed this many icons in a row: the job never pushes through a host
// that is asking it to slow down or is down.
var refreshTroubleLimit = 3

// A run reports an error when more than refreshFailurePercent of its
// downloads, and at least refreshFailureFloor of them, found no source with
// the icon. A handful of icons the render hosts do not have is the measured
// norm (0.7% of a 2000-icon sample), not an incident.
const (
	refreshFailurePercent = 10
	refreshFailureFloor   = 10
)

func refreshFailuresExceedTolerance(failed int64, attempted int) bool {
	return failed >= refreshFailureFloor && failed*100 > int64(attempted)*refreshFailurePercent
}

var officialIconHost = func() string {
	origin, err := url.Parse(officialIconOrigin)
	if err != nil {
		panic(err)
	}
	return origin.Hostname()
}()

// RefreshOptions bounds one pass of the whole-catalog icon renewal.
type RefreshOptions struct {
	Product     string
	Environment string
	// BuildID zero selects the active published build.
	BuildID int64
	// Limit caps distinct icon names downloaded in this run.
	Limit int
	// BatchSize is the number of icon names committed per transaction.
	BatchSize int
	// HeadroomDays renews a cached icon this many days before its source
	// retention ends.
	HeadroomDays int
	// Interval is the minimum gap between HTTP requests, fallbacks included.
	Interval time.Duration
	// Checkpoint is the resumable cursor file; required to apply.
	Checkpoint string
	// RetryFailedAfter keeps an icon that no source could serve out of the
	// following runs for this long.
	RetryFailedAfter time.Duration
	PlanOnly         bool
	Progress         func(RefreshResult)
}

type RefreshResult struct {
	BuildID                int64            `json:"buildId"`
	Eligible               int64            `json:"eligibleIcons"`
	Downloads              int64            `json:"plannedDownloads"`
	Rows                   int64            `json:"plannedRowUpdates"`
	ByType                 map[string]int64 `json:"plannedRowsByType"`
	DeferredFailures       int              `json:"deferredFailures"`
	IconsCached            int64            `json:"iconsCached"`
	Entities               int64            `json:"entitiesLinked"`
	RowsInserted           int64            `json:"rowsInserted"`
	Failed                 int64            `json:"failed"`
	SourceTrouble          int64            `json:"sourceTrouble"`
	Bytes                  int64            `json:"bytes"`
	FallbackCached         int64            `json:"fallbackCached"`
	UnpinnedFallbackCached int64            `json:"unpinnedFallbackCached"`
	NameFallbackCached     int64            `json:"nameFallbackCached"`
	FailureSample          []IconFailure    `json:"failureSample,omitempty"`
	Batches                int              `json:"committedBatches"`
	PlanSeconds            float64          `json:"planSeconds"`
	ElapsedSeconds         float64          `json:"elapsedSeconds"`
}

// refreshCheckpoint is written after every committed batch. After is the last
// icon name handled, so an interrupted run resumes behind it; Failed remembers
// names no source could serve; ViewsPending marks committed batches whose read
// models were not rebuilt yet.
type refreshCheckpoint struct {
	Product      string               `json:"product"`
	BuildID      int64                `json:"buildId"`
	After        string               `json:"after"`
	Failed       map[string]time.Time `json:"failed,omitempty"`
	ViewsPending bool                 `json:"viewsPending,omitempty"`
}

type refreshCandidate struct {
	iconCandidate
	Entities []uuid.UUID
	ByType   map[string]int64
}

// refreshPlanSQL lists icon names that at least one published record needs
// renewed, with every published record sharing the name. catalog_entity_icons
// holds one row per record, so the aggregates need no DISTINCT. A record is
// fresh while any proven primary icon of it is inside its source retention
// minus the headroom; sources without retention never become due by age.
const refreshPlanSQL = `
	WITH published AS MATERIALIZED (
		SELECT entity.id,entity.entity_type,entity.external_id
		FROM game_entities entity
		JOIN LATERAL (
			SELECT version.build_id FROM game_entity_versions version
			WHERE version.id=entity.published_version_id OFFSET 0
		) version ON version.build_id=$2
		WHERE entity.product_id=$1 AND entity.deleted_at IS NULL
	), fresh AS MATERIALIZED (
		SELECT DISTINCT media.entity_id
		FROM catalog_entity_media media
		JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
			AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		JOIN catalog_source_policies policy ON policy.source=media.source AND policy.review_status='reviewed'
		WHERE media.build_id=$2 AND media.media_kind='icon' AND media.is_primary
		  AND media.cache_status='cached' AND media.cached_content_hash IS NOT NULL
		  AND media.cached_byte_size IS NOT NULL AND media.cache_key<>'' AND media.cached_at IS NOT NULL
		  AND (policy.retention_days IS NULL
		    OR media.cached_at>now()-make_interval(days=>GREATEST(policy.retention_days-$3,1)))
	), mappings AS MATERIALIZED (
		SELECT entity.id,entity.entity_type,icon.file_data_id,fresh.entity_id IS NULL AS due,
			regexp_replace(regexp_replace(lower(icon.icon_name),'[[:space:]]+','','g'),'_+','_','g') AS name
		FROM published entity
		JOIN catalog_entity_icons icon ON icon.build_id=$2
			AND icon.entity_type=entity.entity_type AND icon.external_id=entity.external_id
		LEFT JOIN fresh ON fresh.entity_id=entity.id
	), usable AS MATERIALIZED (
		-- A name the render hosts cannot address is usable only through its
		-- proven FileDataID.
		SELECT * FROM mappings WHERE name ~ '^[a-z0-9_&''.-]+$' OR file_data_id>0
	), grouped AS (
		SELECT name,min(file_data_id) AS file_data_id,array_agg(id) AS entities
		FROM usable GROUP BY name HAVING bool_or(due)
	), types AS (
		SELECT name,jsonb_object_agg(entity_type,records) AS counts
		FROM (SELECT name,entity_type,count(*) AS records FROM usable GROUP BY name,entity_type) counted
		GROUP BY name
	), due AS (
		SELECT grouped.name,grouped.file_data_id,grouped.entities,types.counts,count(*) OVER() AS total
		FROM grouped JOIN types USING(name)
		WHERE NOT grouped.name=ANY($6::text[])
		ORDER BY (grouped.name<=$4),grouped.name LIMIT $5
	)
	SELECT due.name,COALESCE(due.file_data_id,asset.file_data_id),due.entities,due.counts,due.total
	FROM due
	LEFT JOIN LATERAL (
		-- Only names without a DB2 FileDataID ask the listfile for one; it
		-- feeds the CASC fallback when no render host has the icon.
		SELECT file_asset.file_data_id FROM catalog_file_assets file_asset
		WHERE due.file_data_id IS NULL AND file_asset.icon_name=due.name
		ORDER BY file_asset.file_data_id LIMIT 1
	) asset ON true
	ORDER BY (due.name<=$4),due.name`

// RefreshIcons renews cached icons across the whole published build. One icon
// name is downloaded once and linked to every published record that uses it.
// PlanOnly reads the database and reports what a run would download and
// write; nothing is fetched or changed.
func (c *Cache) RefreshIcons(ctx context.Context, options RefreshOptions) (result RefreshResult, err error) {
	started := time.Now()
	defer func() { result.ElapsedSeconds = time.Since(started).Seconds() }()
	result.ByType = map[string]int64{}
	if options.Product == "" || options.Limit < 1 || options.Limit > 100000 ||
		options.BatchSize < 1 || options.BatchSize > 500 ||
		options.HeadroomDays < 0 || options.HeadroomDays > 29 ||
		options.Interval < 0 || options.RetryFailedAfter < 0 {
		return result, errors.New("refresh requires product, limit 1..100000, batch 1..500, headroom 0..29 days and nonnegative intervals")
	}
	if options.Environment != "development" && options.Environment != "staging" && options.Environment != "production" {
		return result, errors.New("invalid refresh environment")
	}
	if !options.PlanOnly && (!filepath.IsAbs(options.Checkpoint) || options.Interval < 100*time.Millisecond) {
		return result, errors.New("refresh apply requires an absolute checkpoint path and a request interval of at least 100ms")
	}

	var productID int16
	var version string
	if err = c.db.QueryRow(ctx, `
		SELECT product.id,build.id,build.version
		FROM game_products product
		JOIN game_builds build ON build.product_id=product.id
		WHERE product.slug=$1 AND (($2::bigint=0 AND build.is_active) OR build.id=$2)
		  AND EXISTS (
			SELECT 1 FROM game_entity_versions version
			JOIN game_entities entity ON entity.published_version_id=version.id
			WHERE version.build_id=build.id
		  )
		ORDER BY build.build_number DESC LIMIT 1`, options.Product, options.BuildID).Scan(&productID, &result.BuildID, &version); err != nil {
		return result, fmt.Errorf("find published %s build: %w", options.Product, err)
	}

	checkpoint, err := readRefreshCheckpoint(options.Checkpoint, options.Product, result.BuildID, options.RetryFailedAfter)
	if err != nil {
		return result, err
	}
	deferred := make([]string, 0, len(checkpoint.Failed))
	for name := range checkpoint.Failed {
		deferred = append(deferred, name)
	}
	result.DeferredFailures = len(deferred)

	if !options.PlanOnly {
		// A session lock lives on one connection, never on a pooled query:
		// the seeders and the cache runner write the same table and volume.
		lock, acquireErr := c.db.Acquire(ctx)
		if acquireErr != nil {
			return result, fmt.Errorf("acquire media cache lock connection: %w", acquireErr)
		}
		defer lock.Release()
		var locked bool
		if err = lock.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext('gildra_media_cache:'||$1))`, options.Environment).Scan(&locked); err != nil {
			return result, fmt.Errorf("acquire media cache lock: %w", err)
		}
		if !locked {
			return result, errors.New("another media cache run is active")
		}
		defer lock.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock(hashtext('gildra_media_cache:'||$1))`, options.Environment) //nolint:errcheck
	}

	candidates, err := c.planRefresh(ctx, productID, options, checkpoint.After, deferred, &result)
	result.PlanSeconds = time.Since(started).Seconds()
	if err != nil || options.PlanOnly {
		return result, err
	}

	previous := c.client
	client, pace := pacedClient(previous, options.Interval, officialIconHost)
	c.client = client
	defer func() { c.client = previous }()

	attempted, troubleInRow := 0, 0
	for offset := 0; offset < len(candidates) && troubleInRow < refreshTroubleLimit; offset += options.BatchSize {
		batch := candidates[offset:min(offset+options.BatchSize, len(candidates))]
		var icons []cachedIcon
		var ids []uuid.UUID
		handled := 0
		for _, candidate := range batch {
			trouble, primaryTrouble := pace.trouble.Load(), pace.primaryTrouble.Load()
			icon, fetchErr := c.fetchIcon(ctx, candidate.iconCandidate, options.Product, version)
			if err = ctx.Err(); err != nil {
				// An interruption is not evidence about an icon: the open
				// batch is redone by the next run, committed ones are kept.
				return result, err
			}
			handled++
			attempted++
			if pace.primaryTrouble.Load() != primaryTrouble {
				troubleInRow++
			} else {
				troubleInRow = 0
			}
			switch {
			case fetchErr == nil:
				icons = append(icons, icon)
				ids = append(ids, candidate.Entities...)
				delete(checkpoint.Failed, candidate.Name)
			case pace.trouble.Load() != trouble || !sourceLacksAsset(fetchErr):
				// A throttled, failing or unreachable host says nothing about
				// the icon: it stays due and is not put aside as missing.
				result.SourceTrouble++
			default:
				result.Failed++
				checkpoint.Failed[candidate.Name] = time.Now().UTC()
			}
			if fetchErr != nil && len(result.FailureSample) < officialIconFailureSampleLimit {
				result.FailureSample = append(result.FailureSample, IconFailure{Name: candidate.Name, Error: truncateError(fetchErr)})
			}
			if troubleInRow >= refreshTroubleLimit {
				break
			}
		}
		if len(icons) > 0 {
			linked, linkErr := c.linkOfficialIcons(ctx, productID, result.BuildID, "", len(icons),
				IconSeedOptions{EntityIDs: ids, renewal: true}, icons,
				IconSeedResult{Eligible: result.Eligible, Failed: result.Failed})
			if linkErr != nil {
				return result, linkErr
			}
			result.Entities += linked.Entities
			result.RowsInserted += linked.inserted
			checkpoint.ViewsPending = true
			for _, icon := range icons {
				result.IconsCached++
				result.Bytes += icon.CachedSize
				switch icon.Source {
				case "zamimg":
					result.NameFallbackCached++
				case "wago_tools":
					result.FallbackCached++
					if icon.Conversion == "blp2_to_png_unpinned_casc" {
						result.UnpinnedFallbackCached++
					}
				}
			}
		}
		checkpoint.After = batch[handled-1].Name
		if err = writeRefreshCheckpoint(options.Checkpoint, checkpoint); err != nil {
			return result, err
		}
		result.Batches++
		result.ElapsedSeconds = time.Since(started).Seconds()
		if options.Progress != nil {
			options.Progress(result)
		}
	}

	// The read models are rebuilt once per run, and also for an earlier run
	// that committed batches and was interrupted before this point.
	if checkpoint.ViewsPending {
		if err = c.refreshMediaReadModels(ctx, productID); err != nil {
			return result, err
		}
		checkpoint.ViewsPending = false
		if err = writeRefreshCheckpoint(options.Checkpoint, checkpoint); err != nil {
			return result, err
		}
	}
	if troubleInRow >= refreshTroubleLimit {
		return result, fmt.Errorf("%s throttled or failed %d icons in a row; stopped after %d committed batches", officialIconHost, troubleInRow, result.Batches)
	}
	if refreshFailuresExceedTolerance(result.Failed, attempted) {
		return result, fmt.Errorf("no source has %d of %d icons; committed icons are kept", result.Failed, attempted)
	}
	return result, nil
}

func (c *Cache) planRefresh(ctx context.Context, productID int16, options RefreshOptions, after string, deferred []string, result *RefreshResult) ([]refreshCandidate, error) {
	tx, err := c.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
	// Parallel hash plans can exhaust Docker's small default /dev/shm on the
	// production catalog; the plan took about 80 s there under load.
	if _, err := tx.Exec(ctx, `SET LOCAL max_parallel_workers_per_gather=0; SET LOCAL jit=off; SET LOCAL statement_timeout='300s'`); err != nil {
		return nil, fmt.Errorf("prepare icon refresh plan: %w", err)
	}
	rows, err := tx.Query(ctx, refreshPlanSQL, productID, result.BuildID, options.HeadroomDays, after, options.Limit, deferred)
	if err != nil {
		return nil, fmt.Errorf("plan icon refresh: %w", err)
	}
	defer rows.Close()
	var candidates []refreshCandidate
	for rows.Next() {
		var candidate refreshCandidate
		var types []byte
		if err := rows.Scan(&candidate.Name, &candidate.FileDataID, &candidate.Entities, &types, &result.Eligible); err != nil {
			return nil, fmt.Errorf("scan icon refresh plan: %w", err)
		}
		if err := json.Unmarshal(types, &candidate.ByType); err != nil {
			return nil, fmt.Errorf("decode icon refresh plan: %w", err)
		}
		candidate.FileDataID = inferFileDataID(candidate.Name, candidate.FileDataID)
		candidates = append(candidates, candidate)
		result.Rows += int64(len(candidate.Entities))
		for kind, records := range candidate.ByType {
			result.ByType[kind] += records
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read icon refresh plan: %w", err)
	}
	result.Downloads = int64(len(candidates))
	return candidates, nil
}

func (c *Cache) refreshMediaReadModels(ctx context.Context, productID int16) error {
	if _, err := c.db.Exec(ctx, `SELECT refresh_catalog_published_source_dependencies()`); err != nil {
		return fmt.Errorf("refresh published source dependencies: %w", err)
	}
	if _, err := c.db.Exec(ctx, `SELECT refresh_catalog_library_media_previews($1)`, productID); err != nil {
		return fmt.Errorf("refresh library media previews: %w", err)
	}
	if _, err := c.db.Exec(ctx, `SELECT refresh_catalog_library_media_coverage($1)`, productID); err != nil {
		return fmt.Errorf("refresh library media coverage: %w", err)
	}
	return nil
}

// readRefreshCheckpoint returns an empty cursor for a missing file or for one
// written for another product or build, and forgets failures older than the
// retry window so those names are tried again.
func readRefreshCheckpoint(path, product string, buildID int64, retryFailedAfter time.Duration) (refreshCheckpoint, error) {
	checkpoint := refreshCheckpoint{Product: product, BuildID: buildID, Failed: map[string]time.Time{}}
	if path == "" {
		return checkpoint, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return checkpoint, nil
	}
	if err != nil {
		return checkpoint, fmt.Errorf("read refresh checkpoint: %w", err)
	}
	var saved refreshCheckpoint
	if err := json.Unmarshal(data, &saved); err != nil {
		return checkpoint, fmt.Errorf("decode refresh checkpoint: %w", err)
	}
	if saved.Product != product || saved.BuildID != buildID {
		return checkpoint, nil
	}
	checkpoint.After, checkpoint.ViewsPending = saved.After, saved.ViewsPending
	for name, failedAt := range saved.Failed {
		if time.Since(failedAt) < retryFailedAfter {
			checkpoint.Failed[name] = failedAt
		}
	}
	return checkpoint, nil
}

func writeRefreshCheckpoint(path string, checkpoint refreshCheckpoint) error {
	return writeJSONAtomically(path, checkpoint)
}

func writeJSONAtomically(path string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".media-checkpoint-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, path)
}
