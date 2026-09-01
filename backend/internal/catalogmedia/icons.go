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
const catalogMediaUserAgent = "GildraCatalog/1.0 (+https://api.gildra.net)"
const officialIconWorkers = 8
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
	FailureSample          []IconFailure `json:"failureSample,omitempty"`
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
func (c *Cache) SeedOfficialIcons(ctx context.Context, product string, limit int) (IconSeedResult, error) {
	product = strings.TrimSpace(product)
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
		WITH targets AS (
			SELECT lower(icon.icon_name) AS icon_name,min(icon.file_data_id) AS file_data_id,
				count(DISTINCT entity.id) AS entity_count
			FROM catalog_entity_icons icon
			JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=icon.entity_type AND entity.external_id=icon.external_id
			JOIN game_entity_versions published ON published.id=entity.published_version_id
				AND published.build_id=icon.build_id
			WHERE icon.build_id=$2 AND entity.deleted_at IS NULL
			  AND lower(icon.icon_name) ~ '^[a-z0-9_]+$'
			GROUP BY lower(icon.icon_name)
		), cached AS (
			SELECT lower(media.attributes->>'icon_name') AS icon_name,
				count(DISTINCT media.entity_id) AS entity_count
			FROM catalog_entity_media media
			WHERE media.build_id=$2 AND media.media_kind='icon'
			  AND ((media.asset_key='official_render_56' AND media.source='blizzard_api')
			    OR (media.asset_key='wago_casc_icon_png' AND media.source='wago_tools'))
			  AND media.cache_status='cached' AND media.cached_content_hash IS NOT NULL
			  AND media.cached_byte_size IS NOT NULL AND media.attributes ? 'icon_name'
			GROUP BY lower(media.attributes->>'icon_name')
		), candidates AS (
			SELECT target.icon_name,target.file_data_id
			FROM targets target
			LEFT JOIN cached ON cached.icon_name=target.icon_name
			WHERE COALESCE(cached.entity_count,0)<target.entity_count
		)
		SELECT icon_name,file_data_id,count(*) OVER()
		FROM candidates
		ORDER BY icon_name
		LIMIT $3`, productID, buildID, limit)
		if err != nil {
			return fmt.Errorf("list uncached official icons: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var candidate iconCandidate
			if err := rows.Scan(&candidate.Name, &candidate.FileDataID, &result.Eligible); err != nil {
				return fmt.Errorf("scan official icon candidate: %w", err)
			}
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
		for _, source := range []string{"blizzard_api", "wago_tools"} {
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
					AND lower(icon.icon_name)=seed.icon_name
				JOIN game_entities entity ON entity.product_id=$1
					AND entity.entity_type=icon.entity_type AND entity.external_id=icon.external_id
				JOIN game_entity_versions published ON published.id=entity.published_version_id
					AND published.build_id=icon.build_id
				WHERE entity.deleted_at IS NULL AND NOT EXISTS (
					SELECT 1 FROM catalog_entity_media existing
					WHERE existing.entity_id=entity.id AND existing.build_id=icon.build_id
					  AND existing.media_kind='icon' AND existing.cache_status='cached'
					  AND ((existing.asset_key='official_render_56' AND existing.source='blizzard_api')
					    OR (existing.asset_key='wago_casc_icon_png' AND existing.source='wago_tools'))
					  AND existing.cached_content_hash IS NOT NULL AND existing.cached_byte_size IS NOT NULL
				)
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
			productID, buildID, c.publicBase)
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
				} else if candidate.FileDataID != nil {
					fallback, fallbackErr := c.fetchWagoCASCIcon(ctx, candidate, product, buildVersion)
					if fallbackErr == nil {
						outcome.Icon = fallback
					} else {
						outcome.Err = errors.Join(
							fmt.Errorf("official render: %w", err),
							fmt.Errorf("Wago CASC fallback: %w", fallbackErr),
						)
					}
				} else {
					outcome.Err = err
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

func (c *Cache) downloadWagoCASC(ctx context.Context, sourceURL string) ([]byte, error) {
	parsed, err := validateRemoteURL(sourceURL)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", catalogMediaUserAgent)
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
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return "", errors.New("icon name is required")
	}
	for _, character := range name {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '_' {
			return "", errors.New("icon name contains unsupported characters")
		}
	}
	return officialIconOrigin + url.PathEscape(name) + ".jpg", nil
}
