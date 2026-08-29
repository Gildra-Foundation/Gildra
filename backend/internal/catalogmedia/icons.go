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

type IconSeedResult struct {
	Eligible    int64 `json:"eligible"`
	IconsCached int64 `json:"iconsCached"`
	Entities    int64 `json:"entitiesLinked"`
	Failed      int64 `json:"failed"`
	Bytes       int64 `json:"bytes"`
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
	Icon cachedIcon
	Err  error
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

	rows, err := c.db.Query(ctx, `
		WITH candidates AS (
			SELECT lower(icon.icon_name) AS icon_name,min(icon.file_data_id) AS file_data_id
			FROM catalog_entity_icons icon
			JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=icon.entity_type AND entity.external_id=icon.external_id
			JOIN game_entity_versions published ON published.id=entity.published_version_id
				AND published.build_id=icon.build_id
			WHERE icon.build_id=$2 AND entity.deleted_at IS NULL
			  AND lower(icon.icon_name) ~ '^[a-z0-9_]+$'
			  AND NOT EXISTS (
				SELECT 1 FROM catalog_entity_media media
				WHERE media.entity_id=entity.id AND media.build_id=icon.build_id
				  AND media.media_kind='icon' AND media.asset_key='official_render_56'
				  AND media.source='blizzard_api' AND media.cache_status='cached'
				  AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL
			  )
			GROUP BY lower(icon.icon_name)
		)
		SELECT icon_name,file_data_id,count(*) OVER()
		FROM candidates
		ORDER BY icon_name
		LIMIT $3`, productID, buildID, limit)
	if err != nil {
		return IconSeedResult{}, fmt.Errorf("list uncached official icons: %w", err)
	}
	defer rows.Close()
	candidates := make([]iconCandidate, 0, limit)
	result := IconSeedResult{}
	for rows.Next() {
		var candidate iconCandidate
		if err := rows.Scan(&candidate.Name, &candidate.FileDataID, &result.Eligible); err != nil {
			return result, fmt.Errorf("scan official icon candidate: %w", err)
		}
		candidates = append(candidates, candidate)
	}
	if err := rows.Err(); err != nil {
		return result, fmt.Errorf("iterate official icon candidates: %w", err)
	}
	if len(candidates) == 0 {
		return result, nil
	}

	icons := make([]cachedIcon, 0, len(candidates))
	for outcome := range c.fetchOfficialIcons(ctx, candidates) {
		if outcome.Err != nil {
			result.Failed++
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

		for _, icon := range icons {
			artifactID := uuid.New()
			if err := tx.QueryRow(ctx, `
				INSERT INTO catalog_source_artifacts(
					id,snapshot_id,build_id,source,artifact_key,locale,source_url,
					content_hash,byte_size,status,metadata,fetched_at
				) VALUES($1,$2,$3,'blizzard_api',$4,'',$5,$6,$7,'ready',
					jsonb_build_object('projection','official_render_icon_56','icon_name',$8::text,'file_data_id',$9::bigint),now())
				ON CONFLICT(snapshot_id,artifact_key,locale)
				DO UPDATE SET source_url=EXCLUDED.source_url,byte_size=EXCLUDED.byte_size,
					content_hash=EXCLUDED.content_hash,status='ready',metadata=EXCLUDED.metadata,fetched_at=now()
				RETURNING id`,
				artifactID, snapshotID, buildID, "icons/56/"+icon.Name+".jpg", icon.SourceURL,
				icon.Hash, icon.Size, icon.Name, icon.FileDataID).Scan(&artifactID); err != nil {
				return fmt.Errorf("record official icon %s provenance: %w", icon.Name, err)
			}

			command, err := tx.Exec(ctx, `
				WITH targets AS (
					SELECT entity.id AS entity_id,entity.entity_type,entity.external_id,
						COALESCE(icon.file_data_id,$11::bigint) AS file_data_id
					FROM catalog_entity_icons icon
					JOIN game_entities entity ON entity.product_id=$1
						AND entity.entity_type=icon.entity_type AND entity.external_id=icon.external_id
					JOIN game_entity_versions published ON published.id=entity.published_version_id
						AND published.build_id=icon.build_id
					WHERE icon.build_id=$2 AND lower(icon.icon_name)=$3 AND entity.deleted_at IS NULL
					  AND NOT EXISTS (
						SELECT 1 FROM catalog_entity_media existing
						WHERE existing.entity_id=entity.id AND existing.build_id=icon.build_id
						  AND existing.media_kind='icon' AND existing.asset_key='official_render_56'
						  AND existing.source='blizzard_api' AND existing.cache_status='cached'
						  AND existing.cached_content_hash IS NOT NULL AND existing.cached_byte_size IS NOT NULL
					  )
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
					'icon','official_render_56','','blizzard_api',$4,
					$5 || '/v1/media/' || prepared.id::text,prepared.file_data_id,$6,$7,56,56,
					'cached',$8,true,jsonb_build_object(
						'icon_name',$3,'file_data_id',prepared.file_data_id,
						'discovery','build_proven_icon_name_render_template'
					),$9,$6,$10,now(),''
				FROM prepared`, productID, buildID, icon.Name, icon.SourceURL, c.publicBase,
				icon.Hash, icon.MIMEType, artifactID, icon.CacheKey, icon.Size, icon.FileDataID)
			if err != nil {
				return fmt.Errorf("link official icon %s to entities: %w", icon.Name, err)
			}
			result.Entities += command.RowsAffected()
		}
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
					case results <- iconFetchResult{Err: err}:
					case <-ctx.Done():
						return
					}
					continue
				}
				key, mimeType, size, hash, err := c.fetch(ctx, sourceURL)
				outcome := iconFetchResult{Err: err}
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
