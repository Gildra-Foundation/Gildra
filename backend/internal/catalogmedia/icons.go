package catalogmedia

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const officialIconOrigin = "https://render.worldofwarcraft.com/eu/icons/56/"
const officialIconWorkers = 8
const officialIconFailureSampleLimit = 25

type IconFailure struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

type IconSeedResult struct {
	Eligible      int64         `json:"eligible"`
	IconsCached   int64         `json:"iconsCached"`
	Entities      int64         `json:"entitiesLinked"`
	Failed        int64         `json:"failed"`
	Bytes         int64         `json:"bytes"`
	FailureSample []IconFailure `json:"failureSample,omitempty"`
}

type iconCandidate struct {
	Name       string
	FileDataID *int64
}

type cachedIcon struct {
	iconCandidate
	SourceURL string
	CacheKey  string
	MIMEType  string
	Size      int64
	Hash      []byte
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
	if err := c.db.QueryRow(ctx, `
		SELECT product.id,build.id
		FROM game_products product
		JOIN LATERAL (
			SELECT candidate.id
			FROM game_builds candidate
			WHERE candidate.product_id=product.id
			ORDER BY candidate.build_number DESC,candidate.id DESC
			LIMIT 1
		) build ON true
		WHERE product.slug=$1`, product).Scan(&productID, &buildID); err != nil {
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
			  AND media.asset_key='official_render_56' AND media.source='blizzard_api'
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
	for outcome := range c.fetchOfficialIcons(ctx, candidates) {
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
		result.Bytes += outcome.Icon.Size
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	if len(icons) == 0 {
		return result, nil
	}

	sort.Slice(icons, func(i, j int) bool { return icons[i].Name < icons[j].Name })
	manifest := sha256.New()
	_, _ = manifest.Write([]byte("gildra-official-icon-manifest-v1\n"))
	for _, icon := range icons {
		_, _ = fmt.Fprintf(manifest, "%s:%x:%d\n", icon.Name, icon.Hash, icon.Size)
	}
	snapshotHash := hex.EncodeToString(manifest.Sum(nil))

	err = pgx.BeginFunc(ctx, c.db, func(tx pgx.Tx) error {
		var snapshotID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO catalog_snapshots(product_id,build_id,source,status,content_hash,metadata,validated_at,published_at)
			VALUES($1,$2,'blizzard_api','published',$3,
				jsonb_build_object('projection','official_render_icons_56','icon_count',$4::int,'complete',$5::boolean),now(),now())
			ON CONFLICT(product_id,build_id,source,content_hash) WHERE content_hash IS NOT NULL
			DO UPDATE SET metadata=EXCLUDED.metadata,validated_at=now(),published_at=now()
			RETURNING id`, productID, buildID, snapshotHash, len(icons),
			result.Failed == 0 && result.Eligible <= int64(limit)).Scan(&snapshotID); err != nil {
			return fmt.Errorf("create official icon snapshot: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE official_icon_seed(
				icon_name text PRIMARY KEY,
				file_data_id bigint,
				source_url text NOT NULL,
				cache_key text NOT NULL,
				mime_type text NOT NULL,
				byte_size bigint NOT NULL,
				content_hash bytea NOT NULL,
				artifact_id uuid NOT NULL,
				artifact_key text NOT NULL
			) ON COMMIT DROP`); err != nil {
			return fmt.Errorf("create official icon seed table: %w", err)
		}
		seedRows := make([][]any, 0, len(icons))
		for _, icon := range icons {
			seedRows = append(seedRows, []any{
				icon.Name, icon.FileDataID, icon.SourceURL, icon.CacheKey, icon.MIMEType,
				icon.Size, icon.Hash, uuid.New(), "icons/56/" + icon.Name + ".jpg",
			})
		}
		if copied, err := tx.CopyFrom(ctx, pgx.Identifier{"official_icon_seed"}, []string{
			"icon_name", "file_data_id", "source_url", "cache_key", "mime_type",
			"byte_size", "content_hash", "artifact_id", "artifact_key",
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
				SELECT seed.artifact_id,$1,$2,'blizzard_api',seed.artifact_key,'',seed.source_url,
					seed.content_hash,seed.byte_size,'ready',jsonb_build_object(
						'projection','official_render_icon_56','icon_name',seed.icon_name,
						'file_data_id',seed.file_data_id
					),now()
				FROM official_icon_seed seed
				ON CONFLICT(snapshot_id,artifact_key,locale)
				DO UPDATE SET source_url=EXCLUDED.source_url,byte_size=EXCLUDED.byte_size,
					content_hash=EXCLUDED.content_hash,status='ready',metadata=EXCLUDED.metadata,fetched_at=now()
				RETURNING id,artifact_key
			)
			UPDATE official_icon_seed seed SET artifact_id=upserted.id
			FROM upserted WHERE upserted.artifact_key=seed.artifact_key`, snapshotID, buildID); err != nil {
			return fmt.Errorf("record official icon provenance batch: %w", err)
		}

		command, err := tx.Exec(ctx, `
			WITH targets AS (
				SELECT DISTINCT ON (entity.id)
					entity.id AS entity_id,entity.entity_type,entity.external_id,
					seed.icon_name,COALESCE(icon.file_data_id,seed.file_data_id) AS file_data_id,
					seed.source_url,seed.cache_key,seed.mime_type,seed.byte_size,
					seed.content_hash,seed.artifact_id
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
					  AND existing.media_kind='icon' AND existing.asset_key='official_render_56'
					  AND existing.source='blizzard_api' AND existing.cache_status='cached'
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
				'icon','official_render_56','','blizzard_api',prepared.source_url,
				$3 || '/v1/media/' || prepared.id::text,prepared.file_data_id,
				prepared.content_hash,prepared.mime_type,56,56,'cached',prepared.artifact_id,true,
				jsonb_build_object(
					'icon_name',prepared.icon_name,'file_data_id',prepared.file_data_id,
					'discovery','build_proven_icon_name_render_template'
				),prepared.cache_key,prepared.content_hash,prepared.byte_size,now(),''
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
		return nil
	})
	if err != nil {
		return result, err
	}
	return result, nil
}

func (c *Cache) fetchOfficialIcons(ctx context.Context, candidates []iconCandidate) <-chan iconFetchResult {
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
				outcome := iconFetchResult{Candidate: candidate, Err: err}
				if err == nil {
					outcome.Icon = cachedIcon{
						iconCandidate: candidate,
						SourceURL:     sourceURL,
						CacheKey:      key,
						MIMEType:      mimeType,
						Size:          size,
						Hash:          hash,
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
