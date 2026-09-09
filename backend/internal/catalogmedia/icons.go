package catalogmedia

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const officialIconOrigin = "https://render.worldofwarcraft.com/eu/icons/56/"
const wagoCASCOrigin = "https://wago.tools/api/casc/"
const wagoCASCUserAgent = "GildraCatalogMedia/1.0 (+https://gildra.net)"

// zamimgIconOrigin is a filename-addressed WoW icon mirror. It is used only
// after both the official render endpoint and the build-pinned CASC fallback
// fail. The icon name itself still comes from the imported, build-proven DB2
// mapping and the downloaded bytes are cached locally before publication.
const zamimgIconOrigin = "https://wow.zamimg.com/images/wow/icons/large/"

// Wago's CASC endpoint is deliberately conservative about burst traffic. Icon
// seeding is a maintenance job, so prefer a single deterministic stream over
// a fast parallel burst that leaves part of the catalog uncached with 403s.
const officialIconWorkers = 1
const officialIconFailureSampleLimit = 25

type IconFailure struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

type IconSeedResult struct {
	Eligible               int64         `json:"eligible"`
	IconsCached            int64         `json:"iconsCached"`
	Entities               int64         `json:"entitiesLinked"`
	Failed                 int64         `json:"failed"`
	Bytes                  int64         `json:"bytes"`
	FallbackCached         int64         `json:"fallbackCached"`
	UnpinnedFallbackCached int64         `json:"unpinnedFallbackCached"`
	NameFallbackCached     int64         `json:"nameFallbackCached"`
	FailureSample          []IconFailure `json:"failureSample,omitempty"`
}

// IconSeedOptions can constrain a repair to a confirmed expansion cohort.
// MissingOnly prevents a repair job from re-downloading already usable media.
type IconSeedOptions struct {
	Product     string
	Expansion   string
	Limit       int
	MissingOnly bool
}

type iconCandidate struct {
	Name       string
	FileDataID *int64
}

type cachedIcon struct {
	iconCandidate
	Source         string
	AssetKey       string
	ArtifactKey    string
	SourceURL      string
	SourceSize     int64
	SourceHash     []byte
	CacheKey       string
	CachedMIMEType string
	CachedSize     int64
	CachedHash     []byte
	Width          int
	Height         int
	Conversion     string
}

type iconFetchResult struct {
	Candidate iconCandidate
	Icon      cachedIcon
	Err       error
}

// SeedOfficialIcons converts build-proven icon-name mappings into locally
// cached browser images. One official render asset is fetched per unique icon;
// every published entity using that icon then points to the same content-
// addressed object on disk.
func (c *Cache) SeedOfficialIcons(ctx context.Context, options IconSeedOptions) (IconSeedResult, error) {
	product := strings.TrimSpace(options.Product)
	expansion := strings.TrimSpace(strings.ToLower(options.Expansion))
	limit := options.Limit
	if product == "" {
		return IconSeedResult{}, errors.New("catalog product is required")
	}
	if limit < 1 || limit > 10000 {
		return IconSeedResult{}, errors.New("icon seed limit must be between 1 and 10000")
	}

	var productID int16
	var buildID int64
	var buildVersion string
	if err := c.db.QueryRow(ctx, `
		SELECT product.id,build.id,build.version
		FROM game_products product
		JOIN LATERAL (
			SELECT candidate.id,candidate.version
			FROM game_builds candidate
			WHERE candidate.product_id=product.id
			ORDER BY candidate.build_number DESC,candidate.id DESC
			LIMIT 1
		) build ON true
		WHERE product.slug=$1`, product).Scan(&productID, &buildID, &buildVersion); err != nil {
		return IconSeedResult{}, fmt.Errorf("find current %s build: %w", product, err)
	}

	candidates := make([]iconCandidate, 0, limit)
	result := IconSeedResult{}
	err := pgx.BeginFunc(ctx, c.db, func(tx pgx.Tx) error {
		// Parallel hash plans can exhaust Docker's small default /dev/shm on the
		// production catalog. This bounded read is faster as two sequential
		// aggregates and does not need dynamic shared memory.
		if _, err := tx.Exec(ctx, `SET LOCAL max_parallel_workers_per_gather=0`); err != nil {
			return fmt.Errorf("disable parallel official icon candidate plan: %w", err)
		}
		rows, err := tx.Query(ctx, `
		WITH source_icons AS (
			-- DB2 occasionally contains display spaces or doubled separators in a
			-- texture basename (for example inv_misc_ selfiecamera_01). Icon
			-- filenames cannot contain whitespace and a repeated underscore is not
			-- a distinct CASC asset; the matching FileDataID proves this is source
			-- formatting rather than a different player-facing asset.
			SELECT regexp_replace(regexp_replace(lower(icon.icon_name),'[[:space:]]+','','g'),'_+','_','g') AS icon_name,
				icon.file_data_id,icon.entity_type,icon.external_id,icon.build_id
			FROM catalog_entity_icons icon
			WHERE icon.build_id=$2 AND $4=''
			UNION ALL
			SELECT regexp_replace(regexp_replace(lower(icon.icon_name),'[[:space:]]+','','g'),'_+','_','g') AS icon_name,
				icon.file_data_id,icon.entity_type,icon.external_id,icon.build_id
			FROM catalog_entity_expansions cohort
			JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
			JOIN catalog_entity_icons icon ON icon.build_id=cohort.build_id
				AND icon.entity_type=cohort.entity_type AND icon.external_id=cohort.external_id
			WHERE cohort.product_id=$1 AND cohort.build_id=$2 AND cohort.classification='confirmed'
				AND expansion.expansion_key=$4
		), verified_primary_media AS (
			SELECT DISTINCT media.entity_id,media.build_id
			FROM catalog_entity_media media
			WHERE media.build_id=$2 AND media.media_kind='icon' AND media.is_primary
			  AND media.cache_status='cached' AND media.cached_content_hash IS NOT NULL
			  AND media.cached_byte_size IS NOT NULL
		), targets AS (
			SELECT icon.icon_name,
				min(icon.file_data_id) AS file_data_id,
				count(DISTINCT entity.id) AS entity_count,
				count(DISTINCT entity.id) FILTER (WHERE primary_media.entity_id IS NULL) AS missing_media_entity_count
			FROM source_icons icon
			JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=icon.entity_type AND entity.external_id=icon.external_id
			JOIN game_entity_versions published ON published.id=entity.published_version_id
				AND published.build_id=icon.build_id
			LEFT JOIN verified_primary_media primary_media ON primary_media.entity_id=entity.id
				AND primary_media.build_id=icon.build_id
			WHERE entity.deleted_at IS NULL
			  AND lower(icon.icon_name) ~ '^[a-z0-9_]+$'
			GROUP BY icon.icon_name
		), cached AS (
			-- MissingOnly is the production repair path. It needs only one
			-- verified primary image per entity, not a catalogue-wide accounting
			-- of every cached icon. Keep this CTE empty in that mode so PostgreSQL
			-- does not group the complete WoW media cache before considering the
			-- small Midnight cohort.
			SELECT lower(media.attributes->>'icon_name') AS icon_name,
				count(DISTINCT media.entity_id) AS entity_count
			FROM catalog_entity_media media
			WHERE NOT $5::boolean
			  AND media.build_id=$2 AND media.media_kind='icon'
			  AND ((media.asset_key='official_render_56' AND media.source='blizzard_api')
			    OR (media.asset_key='wago_casc_icon_png' AND media.source='wago_tools')
			    OR (media.asset_key='zamimg_icon_large' AND media.source='zamimg'))
			  AND media.cache_status='cached' AND media.cached_content_hash IS NOT NULL
			  AND media.cached_byte_size IS NOT NULL AND media.attributes ? 'icon_name'
			GROUP BY lower(media.attributes->>'icon_name')
		), candidates AS (
			SELECT target.icon_name,target.file_data_id
			FROM targets target
			LEFT JOIN cached ON cached.icon_name=target.icon_name
			WHERE CASE WHEN $5::boolean THEN target.missing_media_entity_count>0
				ELSE COALESCE(cached.entity_count,0)<target.entity_count END
		), resolved_candidates AS (
			-- Most DB2 icon rows contain FileDataID directly. Only the small set
			-- that does not gets the legacy file-asset fallback; joining that
			-- unindexed normalized name mapping for every scoped icon made a
			-- Midnight repair spend minutes before its first download.
			SELECT candidate.icon_name,
				COALESCE(candidate.file_data_id,asset.file_data_id) AS file_data_id
			FROM candidates candidate
			LEFT JOIN LATERAL (
				SELECT file_asset.file_data_id
				FROM catalog_file_assets file_asset
				WHERE candidate.file_data_id IS NULL
				  AND file_asset.file_data_id IS NOT NULL
				  AND regexp_replace(regexp_replace(lower(file_asset.icon_name),'[[:space:]]+','','g'),'_+','_','g')=candidate.icon_name
				ORDER BY file_asset.file_data_id
				LIMIT 1
			) asset ON true
		)
		SELECT icon_name,file_data_id,count(*) OVER()
		FROM resolved_candidates
		ORDER BY icon_name
		LIMIT $3`, productID, buildID, limit, expansion, options.MissingOnly)
		if err != nil {
			return fmt.Errorf("list uncached official icons: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var candidate iconCandidate
			if err := rows.Scan(&candidate.Name, &candidate.FileDataID, &result.Eligible); err != nil {
				return fmt.Errorf("scan official icon candidate: %w", err)
			}
			candidate.FileDataID = inferFileDataID(candidate.Name, candidate.FileDataID)
			candidates = append(candidates, candidate)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("iterate official icon candidates: %w", err)
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	if len(candidates) == 0 {
		return result, nil
	}

	icons := make([]cachedIcon, 0, len(candidates))
	for outcome := range c.fetchOfficialIcons(ctx, candidates, product, buildVersion) {
		if outcome.Err != nil {
			result.Failed++
			if len(result.FailureSample) < officialIconFailureSampleLimit {
				result.FailureSample = append(result.FailureSample, IconFailure{
					Name:  outcome.Candidate.Name,
					Error: truncateError(outcome.Err),
				})
			}
			continue
		}
		icons = append(icons, outcome.Icon)
		result.IconsCached++
		result.Bytes += outcome.Icon.CachedSize
		if outcome.Icon.Source == "wago_tools" {
			result.FallbackCached++
			if outcome.Icon.Conversion == "blp2_to_png_unpinned_casc" {
				result.UnpinnedFallbackCached++
			}
		}
		if outcome.Icon.Source == "zamimg" {
			result.NameFallbackCached++
		}
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	if len(icons) == 0 {
		return result, nil
	}

	sort.Slice(icons, func(i, j int) bool {
		if icons[i].Source == icons[j].Source {
			return icons[i].Name < icons[j].Name
		}
		return icons[i].Source < icons[j].Source
	})
	iconsBySource := make(map[string][]cachedIcon, 2)
	for _, icon := range icons {
		iconsBySource[icon.Source] = append(iconsBySource[icon.Source], icon)
	}

	err = pgx.BeginFunc(ctx, c.db, func(tx pgx.Tx) error {
		snapshotIDs := make(map[string]uuid.UUID, len(iconsBySource))
		for _, source := range []string{"blizzard_api", "wago_tools", "zamimg"} {
			sourceIcons := iconsBySource[source]
			if len(sourceIcons) == 0 {
				continue
			}
			manifest := sha256.New()
			_, _ = fmt.Fprintf(manifest, "gildra-icon-manifest-v2:%s\n", source)
			for _, icon := range sourceIcons {
				_, _ = fmt.Fprintf(manifest, "%s:%x:%d\n", icon.Name, icon.SourceHash, icon.SourceSize)
			}
			projection := "official_render_icons_56"
			if source == "wago_tools" {
				projection = "wago_casc_icons_png"
			} else if source == "zamimg" {
				projection = "zamimg_icons_large"
			}
			var snapshotID uuid.UUID
			if err := tx.QueryRow(ctx, `
				INSERT INTO catalog_snapshots(product_id,build_id,source,status,content_hash,metadata,validated_at,published_at)
				VALUES($1,$2,$3,'published',$4,
					jsonb_build_object('projection',$5::text,'icon_count',$6::int,'complete',$7::boolean),now(),now())
				ON CONFLICT(product_id,build_id,source,content_hash) WHERE content_hash IS NOT NULL
				DO UPDATE SET metadata=EXCLUDED.metadata,validated_at=now(),published_at=now()
				RETURNING id`, productID, buildID, source, hex.EncodeToString(manifest.Sum(nil)),
				projection, len(sourceIcons), result.Failed == 0 && result.Eligible <= int64(limit)).Scan(&snapshotID); err != nil {
				return fmt.Errorf("create %s icon snapshot: %w", source, err)
			}
			snapshotIDs[source] = snapshotID
		}

		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE official_icon_seed(
				icon_name text PRIMARY KEY,
				file_data_id bigint,
				snapshot_id uuid NOT NULL,
				source text NOT NULL,
				asset_key text NOT NULL,
				projection text NOT NULL,
				artifact_key text NOT NULL,
				source_url text NOT NULL,
				source_byte_size bigint NOT NULL,
				source_content_hash bytea NOT NULL,
				cache_key text NOT NULL,
				cached_mime_type text NOT NULL,
				cached_byte_size bigint NOT NULL,
				cached_content_hash bytea NOT NULL,
				width integer NOT NULL,
				height integer NOT NULL,
				conversion text NOT NULL,
				artifact_id uuid NOT NULL,
				CHECK(width>0 AND height>0)
			) ON COMMIT DROP`); err != nil {
			return fmt.Errorf("create official icon seed table: %w", err)
		}
		seedRows := make([][]any, 0, len(icons))
		for _, icon := range icons {
			projection := "official_render_icon_56"
			if icon.Source == "wago_tools" {
				projection = "wago_casc_icon_blp2"
			} else if icon.Source == "zamimg" {
				projection = "zamimg_icon_large"
			}
			seedRows = append(seedRows, []any{
				icon.Name, icon.FileDataID, snapshotIDs[icon.Source], icon.Source,
				icon.AssetKey, projection, icon.ArtifactKey, icon.SourceURL,
				icon.SourceSize, icon.SourceHash, icon.CacheKey, icon.CachedMIMEType,
				icon.CachedSize, icon.CachedHash, icon.Width, icon.Height,
				icon.Conversion, uuid.New(),
			})
		}
		if copied, err := tx.CopyFrom(ctx, pgx.Identifier{"official_icon_seed"}, []string{
			"icon_name", "file_data_id", "snapshot_id", "source", "asset_key", "projection",
			"artifact_key", "source_url", "source_byte_size", "source_content_hash",
			"cache_key", "cached_mime_type", "cached_byte_size", "cached_content_hash",
			"width", "height", "conversion", "artifact_id",
		}, pgx.CopyFromRows(seedRows)); err != nil {
			return fmt.Errorf("stage official icons: %w", err)
		} else if copied != int64(len(seedRows)) {
			return fmt.Errorf("stage official icons: copied %d of %d", copied, len(seedRows))
		}

		if _, err := tx.Exec(ctx, `
			WITH upserted AS (
				INSERT INTO catalog_source_artifacts(
					id,snapshot_id,build_id,source,artifact_key,locale,source_url,
					content_hash,byte_size,status,metadata,fetched_at
				)
				SELECT DISTINCT ON (seed.snapshot_id,seed.artifact_key)
					seed.artifact_id,seed.snapshot_id,$1,seed.source,seed.artifact_key,'',seed.source_url,
					seed.source_content_hash,seed.source_byte_size,'ready',jsonb_build_object(
						'projection',seed.projection,'icon_name',seed.icon_name,
						'file_data_id',seed.file_data_id,'conversion',seed.conversion
					),now()
				FROM official_icon_seed seed
				ORDER BY seed.snapshot_id,seed.artifact_key,seed.icon_name
				ON CONFLICT(snapshot_id,artifact_key,locale)
				DO UPDATE SET source_url=EXCLUDED.source_url,byte_size=EXCLUDED.byte_size,
					content_hash=EXCLUDED.content_hash,status='ready',metadata=EXCLUDED.metadata,fetched_at=now()
				RETURNING id,snapshot_id,artifact_key
			)
			UPDATE official_icon_seed seed SET artifact_id=upserted.id
			FROM upserted WHERE upserted.snapshot_id=seed.snapshot_id
			  AND upserted.artifact_key=seed.artifact_key`, buildID); err != nil {
			return fmt.Errorf("record official icon provenance batch: %w", err)
		}

		command, err := tx.Exec(ctx, `
			WITH targets AS (
				SELECT DISTINCT ON (entity.id)
					entity.id AS entity_id,entity.entity_type,entity.external_id,
					seed.icon_name,COALESCE(icon.file_data_id,seed.file_data_id) AS file_data_id,
					seed.source,seed.asset_key,seed.source_url,seed.source_content_hash,
					seed.cache_key,seed.cached_mime_type,seed.cached_byte_size,
					seed.cached_content_hash,seed.width,seed.height,seed.conversion,seed.artifact_id
				FROM official_icon_seed seed
		JOIN catalog_entity_icons icon ON icon.build_id=$2
					AND regexp_replace(regexp_replace(lower(icon.icon_name),'[[:space:]]+','','g'),'_+','_','g')=seed.icon_name
				JOIN game_entities entity ON entity.product_id=$1
					AND entity.entity_type=icon.entity_type AND entity.external_id=icon.external_id
				JOIN game_entity_versions published ON published.id=entity.published_version_id
					AND published.build_id=icon.build_id
				LEFT JOIN catalog_entity_expansions cohort ON cohort.product_id=$1
					AND cohort.build_id=icon.build_id AND cohort.entity_type=icon.entity_type
					AND cohort.external_id=icon.external_id AND cohort.classification='confirmed'
				LEFT JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
				WHERE entity.deleted_at IS NULL AND ($4='' OR expansion.expansion_key=$4)
				  AND (NOT $5::boolean OR NOT EXISTS (
					SELECT 1 FROM catalog_entity_media existing
					WHERE existing.entity_id=entity.id AND existing.build_id=icon.build_id
					  AND existing.media_kind='icon' AND existing.is_primary
					  AND existing.cache_status='cached'
					  AND existing.cached_content_hash IS NOT NULL AND existing.cached_byte_size IS NOT NULL
				))
				ORDER BY entity.id,icon.file_data_id NULLS LAST
			), prepared AS (
				SELECT gen_random_uuid() AS id,target.* FROM targets target
			)
			INSERT INTO catalog_entity_media(
				id,build_id,entity_id,entity_type,external_id,media_kind,asset_key,locale,
				source,source_url,cached_url,file_data_id,content_hash,mime_type,width,height,
				cache_status,source_artifact_id,is_primary,attributes,cache_key,
				cached_content_hash,cached_byte_size,cached_at,cache_error
			)
			SELECT prepared.id,$2,prepared.entity_id,prepared.entity_type,prepared.external_id,
				'icon',prepared.asset_key,'',prepared.source,prepared.source_url,
				$3 || '/v1/media/' || prepared.id::text,prepared.file_data_id,
				prepared.source_content_hash,prepared.cached_mime_type,prepared.width,prepared.height,
				'cached',prepared.artifact_id,true,
				jsonb_build_object(
					'icon_name',prepared.icon_name,'file_data_id',prepared.file_data_id,
					'discovery','build_proven_icon_mapping','conversion',prepared.conversion
				),prepared.cache_key,prepared.cached_content_hash,prepared.cached_byte_size,now(),''
			FROM prepared
			ON CONFLICT ON CONSTRAINT catalog_entity_media_observation_unique DO NOTHING`,
			productID, buildID, c.publicBase, expansion, options.MissingOnly)
		if err != nil {
			return fmt.Errorf("link official icon batch to entities: %w", err)
		}
		result.Entities += command.RowsAffected()
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_published_source_dependencies()`); err != nil {
			return fmt.Errorf("refresh published source dependencies: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_media_previews($1)`, productID); err != nil {
			return fmt.Errorf("refresh library media previews: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_media_coverage($1)`, productID); err != nil {
			return fmt.Errorf("refresh library media coverage: %w", err)
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	return result, nil
}

// inferFileDataID preserves the explicit DB2 value when it is present. Some
// modern DB2 icon rows expose the FileDataID as the icon value itself, however,
// leaving the companion file_data_id column null. Those values are not render
// filenames; treat a positive decimal-only icon value as the equivalent CASC
// FileDataID so the build-pinned fallback can fetch the real icon.
func inferFileDataID(iconName string, explicit *int64) *int64 {
	if explicit != nil && *explicit > 0 {
		return explicit
	}
	iconName = strings.TrimSpace(iconName)
	if iconName == "" {
		return nil
	}
	for _, character := range iconName {
		if character < '0' || character > '9' {
			return nil
		}
	}
	fileDataID, err := strconv.ParseInt(iconName, 10, 64)
	if err != nil || fileDataID <= 0 {
		return nil
	}
	return &fileDataID
}

func (c *Cache) fetchOfficialIcons(
	ctx context.Context,
	candidates []iconCandidate,
	product string,
	buildVersion string,
) <-chan iconFetchResult {
	results := make(chan iconFetchResult)
	jobs := make(chan iconCandidate)
	workerCount := min(officialIconWorkers, len(candidates))
	var workers sync.WaitGroup
	workers.Add(workerCount)
	for range workerCount {
		go func() {
			defer workers.Done()
			for candidate := range jobs {
				sourceURL, err := officialIconURL(candidate.Name)
				if err != nil {
					select {
					case results <- iconFetchResult{Candidate: candidate, Err: err}:
					case <-ctx.Done():
						return
					}
					continue
				}
				key, mimeType, size, hash, err := c.fetch(ctx, sourceURL)
				outcome := iconFetchResult{Candidate: candidate}
				if err == nil {
					outcome.Icon = cachedIcon{
						iconCandidate:  candidate,
						Source:         "blizzard_api",
						AssetKey:       "official_render_56",
						ArtifactKey:    "icons/56/" + candidate.Name + ".jpg",
						SourceURL:      sourceURL,
						SourceSize:     size,
						SourceHash:     hash,
						CacheKey:       key,
						CachedMIMEType: mimeType,
						CachedSize:     size,
						CachedHash:     hash,
						Width:          56,
						Height:         56,
						Conversion:     "identity",
					}
				} else {
					fetchErrors := []error{fmt.Errorf("official render: %w", err)}
					// The filename mirror is backed by the imported DB2 icon mapping and
					// responds quickly to the official CDN's systematic 403. Try it
					// before Wago CASC: the latter is useful as a byte-level fallback,
					// but a slow CASC gateway must not serialize thousands of icons.
					if outcome.Icon.Source == "" {
						fallback, fallbackErr := c.fetchZamimgIcon(ctx, candidate)
						if fallbackErr == nil {
							outcome.Icon = fallback
						} else {
							fetchErrors = append(fetchErrors, fmt.Errorf("name fallback: %w", fallbackErr))
						}
					}
					if outcome.Icon.Source == "" && candidate.FileDataID != nil {
						fallback, fallbackErr := c.fetchWagoCASCIcon(ctx, candidate, product, buildVersion)
						if fallbackErr == nil {
							outcome.Icon = fallback
						} else {
							fetchErrors = append(fetchErrors, fmt.Errorf("Wago CASC fallback: %w", fallbackErr))
						}
					}
					if outcome.Icon.Source == "" {
						outcome.Err = errors.Join(fetchErrors...)
					}
				}
				select {
				case results <- outcome:
				case <-ctx.Done():
					return
				}
			}
		}()
	}
	go func() {
		defer close(jobs)
		for _, candidate := range candidates {
			select {
			case jobs <- candidate:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		workers.Wait()
		close(results)
	}()
	return results
}

func (c *Cache) fetchWagoCASCIcon(
	ctx context.Context,
	candidate iconCandidate,
	product string,
	buildVersion string,
) (cachedIcon, error) {
	if candidate.FileDataID == nil || *candidate.FileDataID <= 0 {
		return cachedIcon{}, errors.New("positive FileDataID is required")
	}
	sourceURL, err := wagoCASCIconURL(*candidate.FileDataID, product, buildVersion)
	if err != nil {
		return cachedIcon{}, err
	}
	conversion := "blp2_to_png"
	raw, err := c.downloadWagoCASC(ctx, sourceURL)
	if err != nil {
		unpinnedURL := wagoCASCOrigin + strconv.FormatInt(*candidate.FileDataID, 10)
		raw, err = c.downloadWagoCASC(ctx, unpinnedURL)
		if err != nil {
			return cachedIcon{}, err
		}
		sourceURL = unpinnedURL
		conversion = "blp2_to_png_unpinned_casc"
	}
	pngData, width, height, err := decodeBLP2PNG(raw)
	if err != nil {
		return cachedIcon{}, err
	}
	cacheKey, cachedSize, cachedHash, err := c.cacheImageBytes(pngData, "image/png")
	if err != nil {
		return cachedIcon{}, err
	}
	sourceHash := sha256.Sum256(raw)
	return cachedIcon{
		iconCandidate:  candidate,
		Source:         "wago_tools",
		AssetKey:       "wago_casc_icon_png",
		ArtifactKey:    "casc/" + buildVersion + "/" + strconv.FormatInt(*candidate.FileDataID, 10) + ".blp",
		SourceURL:      sourceURL,
		SourceSize:     int64(len(raw)),
		SourceHash:     sourceHash[:],
		CacheKey:       cacheKey,
		CachedMIMEType: "image/png",
		CachedSize:     cachedSize,
		CachedHash:     cachedHash,
		Width:          width,
		Height:         height,
		Conversion:     conversion,
	}, nil
}

func (c *Cache) fetchZamimgIcon(ctx context.Context, candidate iconCandidate) (cachedIcon, error) {
	sourceURL, err := zamimgIconURL(candidate.Name)
	if err != nil {
		return cachedIcon{}, err
	}
	cacheKey, mimeType, size, hash, err := c.fetch(ctx, sourceURL)
	if err != nil {
		return cachedIcon{}, err
	}
	if mimeType != "image/jpeg" {
		return cachedIcon{}, fmt.Errorf("unexpected icon MIME type %q", mimeType)
	}
	return cachedIcon{
		iconCandidate:  candidate,
		Source:         "zamimg",
		AssetKey:       "zamimg_icon_large",
		ArtifactKey:    "icons/large/" + candidate.Name + ".jpg",
		SourceURL:      sourceURL,
		SourceSize:     size,
		SourceHash:     hash,
		CacheKey:       cacheKey,
		CachedMIMEType: mimeType,
		CachedSize:     size,
		CachedHash:     hash,
		Width:          56,
		Height:         56,
		Conversion:     "filename_mirror_identity",
	}, nil
}

func (c *Cache) downloadWagoCASC(ctx context.Context, sourceURL string) ([]byte, error) {
	parsed, err := validateRemoteURL(sourceURL)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	// Wago rejects anonymous programmatic CASC downloads. Identify this
	// cache worker so the build-pinned fallback remains usable when Blizzard's
	// render endpoint is unavailable from the production network.
	request.Header.Set("User-Agent", wagoCASCUserAgent)
	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("download BLP2: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download BLP2: HTTP %d", response.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, maxAssetBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read BLP2: %w", err)
	}
	if len(raw) == 0 || len(raw) > maxAssetBytes {
		return nil, errors.New("BLP2 is empty or exceeds 32 MiB")
	}
	return raw, nil
}

func wagoCASCIconURL(fileDataID int64, product, buildVersion string) (string, error) {
	product = strings.TrimSpace(product)
	buildVersion = strings.TrimSpace(buildVersion)
	if fileDataID <= 0 || product == "" || buildVersion == "" {
		return "", errors.New("FileDataID, product, and build version are required")
	}
	endpoint, err := url.Parse(wagoCASCOrigin + strconv.FormatInt(fileDataID, 10))
	if err != nil {
		return "", err
	}
	query := endpoint.Query()
	query.Set("product", product)
	query.Set("version", buildVersion)
	endpoint.RawQuery = query.Encode()
	return endpoint.String(), nil
}

func officialIconURL(name string) (string, error) {
	return iconURL(officialIconOrigin, name)
}

func zamimgIconURL(name string) (string, error) {
	return iconURL(zamimgIconOrigin, name)
}

func iconURL(origin, name string) (string, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return "", errors.New("icon name is required")
	}
	for _, character := range name {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '_' {
			return "", errors.New("icon name contains unsupported characters")
		}
	}
	return origin + url.PathEscape(name) + ".jpg", nil
}
