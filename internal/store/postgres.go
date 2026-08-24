package store

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/Gildra-Foundation/Gildra/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/internal/raidbots"
	"github.com/Gildra-Foundation/Gildra/internal/wago"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var nonSlug = regexp.MustCompile(`[^a-z0-9а-яё]+`)

type Postgres struct {
	db *pgxpool.Pool
}

type ApplyResult struct {
	TreesWritten   int64 `json:"trees_written"`
	TalentsWritten int64 `json:"talents_written"`
	LegacyDeleted  int64 `json:"legacy_trees_deleted"`
}

func Open(ctx context.Context, databaseURL string) (*Postgres, error) {
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := db.Ping(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Postgres{db: db}, nil
}

func (s *Postgres) Close() { s.db.Close() }

func (s *Postgres) ApplyTalents(ctx context.Context, metadata raidbots.Metadata, dataset catalog.Dataset, sourceURL string) (ApplyResult, error) {
	var result ApplyResult
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		productID, namespaceID, buildID, err := prepare(ctx, tx, metadata)
		if err != nil {
			return err
		}
		for _, tree := range dataset.Trees {
			if err := upsert(ctx, tx, productID, namespaceID, buildID, "talent_tree", tree.ExternalID, tree.Name, tree.Payload, sourceURL); err != nil {
				return fmt.Errorf("store talent tree %d: %w", tree.ExternalID, err)
			}
			result.TreesWritten++
		}
		for _, talent := range dataset.Talents {
			payload, err := json.Marshal(map[string]any{
				"name": talent.Name,
				"raidbots": map[string]any{
					"id": talent.ExternalID, "definitionId": talent.DefinitionID, "spellId": talent.SpellID,
					"name": talent.Name, "icon": talent.Icon, "type": talent.Type,
					"maxRanks": talent.MaxRanks, "appearances": talent.Appearances,
				},
			})
			if err != nil {
				return fmt.Errorf("encode talent %d: %w", talent.ExternalID, err)
			}
			if err := upsert(ctx, tx, productID, namespaceID, buildID, "talent", talent.ExternalID, talent.Name, payload, sourceURL); err != nil {
				return fmt.Errorf("store talent %d: %w", talent.ExternalID, err)
			}
			result.TalentsWritten++
		}
		legacyIDs, specIDs := make([]int64, 0, len(dataset.Trees)), make([]int64, 0, len(dataset.Trees))
		for _, tree := range dataset.Trees {
			legacyIDs = append(legacyIDs, tree.TraitTreeID)
			specIDs = append(specIDs, tree.ExternalID)
		}
		command, err := tx.Exec(ctx, `
			UPDATE game_entities e SET deleted_at = now(), updated_at = now()
			WHERE e.product_id = $1 AND e.entity_type = 'talent_tree'
			  AND e.deleted_at IS NULL
			  AND e.external_id = ANY($2) AND NOT (e.external_id = ANY($3))
			  AND EXISTS (
				SELECT 1 FROM game_entity_versions v
				WHERE v.id = e.latest_version_id AND v.source_url = $4
			  )`, productID, legacyIDs, specIDs, sourceURL)
		if err != nil {
			return fmt.Errorf("soft-delete legacy trees: %w", err)
		}
		result.LegacyDeleted = command.RowsAffected()
		parameters, err := json.Marshal(map[string]any{"environment": metadata.Environment, "content_hash": metadata.ContentHash, "mode": "corrected-talents"})
		if err != nil {
			return fmt.Errorf("encode import parameters: %w", err)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO catalog_import_runs (product_id, build_id, source, status, parameters, records_seen, records_written, finished_at)
			VALUES ($1, $2, 'raidbots', 'SUCCEEDED', $3, $4, $4, now())`,
			productID, buildID, parameters, result.TreesWritten+result.TalentsWritten)
		if err != nil {
			return fmt.Errorf("record import run: %w", err)
		}
		return nil
	})
	return result, err
}

func (s *Postgres) EnrichItems(ctx context.Context, buildVersion string, rows []wago.Description) (int64, error) {
	var written int64
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var productID int16
		var buildID int64
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug = 'wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		if err := tx.QueryRow(ctx, `SELECT id FROM game_builds WHERE product_id = $1 AND version = $2`, productID, buildVersion).Scan(&buildID); err != nil {
			return fmt.Errorf("find build %q: %w", buildVersion, err)
		}
		if _, err := tx.Exec(ctx, `CREATE TEMP TABLE item_description_stage (external_id BIGINT, locale TEXT, name TEXT, description TEXT) ON COMMIT DROP`); err != nil {
			return fmt.Errorf("create description stage: %w", err)
		}
		copyRows := make([][]any, 0, len(rows))
		for _, row := range rows {
			copyRows = append(copyRows, []any{row.ExternalID, row.Locale, row.Name, row.Description})
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"item_description_stage"}, []string{"external_id", "locale", "name", "description"}, pgx.CopyFromRows(copyRows)); err != nil {
			return fmt.Errorf("stage descriptions: %w", err)
		}
		command, err := tx.Exec(ctx, `
			UPDATE game_entity_localizations l SET description = s.description
			FROM item_description_stage s, game_entities e
			WHERE e.product_id = $1 AND e.entity_type = 'item' AND e.external_id = s.external_id
			  AND e.deleted_at IS NULL AND e.latest_version_id = l.version_id
			  AND l.locale = s.locale AND s.description <> '' AND l.description IS DISTINCT FROM s.description`, productID)
		if err != nil {
			return fmt.Errorf("update descriptions: %w", err)
		}
		written = command.RowsAffected()
		parameters, _ := json.Marshal(map[string]any{"mode": "localization-only", "build": buildVersion, "rows": len(rows)})
		_, err = tx.Exec(ctx, `
			INSERT INTO catalog_import_runs (product_id, build_id, source, status, parameters, records_seen, records_written, finished_at)
			VALUES ($1, $2, 'wago_tools', 'SUCCEEDED', $3, $4, $5, now())`, productID, buildID, parameters, len(rows), written)
		return err
	})
	return written, err
}

func prepare(ctx context.Context, tx pgx.Tx, metadata raidbots.Metadata) (int16, int16, int64, error) {
	parts := strings.Split(metadata.WoWBuild, ".")
	if len(parts) != 4 {
		return 0, 0, 0, fmt.Errorf("invalid build %q", metadata.WoWBuild)
	}
	buildNumber, err := strconv.Atoi(parts[3])
	if err != nil || buildNumber <= 0 {
		return 0, 0, 0, fmt.Errorf("invalid build %q", metadata.WoWBuild)
	}
	var productID, namespaceID int16
	var buildID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug = 'wow'`).Scan(&productID); err != nil {
		return 0, 0, 0, fmt.Errorf("find wow product: %w", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO game_namespaces (product_id, region, kind, slug) VALUES ($1, 'us', 'static', 'static-us')
		ON CONFLICT (product_id, slug) DO UPDATE SET region = EXCLUDED.region RETURNING id`, productID).Scan(&namespaceID); err != nil {
		return 0, 0, 0, fmt.Errorf("upsert namespace: %w", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO game_builds (product_id, build_number, version, is_active) VALUES ($1, $2, $3, false)
		ON CONFLICT (product_id, build_number) DO UPDATE SET version = EXCLUDED.version RETURNING id`, productID, buildNumber, metadata.WoWBuild).Scan(&buildID); err != nil {
		return 0, 0, 0, fmt.Errorf("upsert build: %w", err)
	}
	return productID, namespaceID, buildID, nil
}

func upsert(ctx context.Context, tx pgx.Tx, productID, namespaceID int16, buildID int64, entityType string, externalID int64, name string, payload []byte, sourceURL string) error {
	hash := sha256.Sum256(payload)
	var entityID, versionID uuid.UUID
	err := tx.QueryRow(ctx, `
		INSERT INTO game_entities (product_id, namespace_id, entity_type, external_id, canonical_slug, first_seen_build_id, last_seen_build_id, deleted_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$6,NULL,now())
		ON CONFLICT (product_id, entity_type, external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id, canonical_slug=EXCLUDED.canonical_slug, last_seen_build_id=EXCLUDED.last_seen_build_id, deleted_at=NULL, updated_at=now()
		RETURNING id`, productID, namespaceID, entityType, externalID, slugify(name), buildID).Scan(&entityID)
	if err != nil {
		return fmt.Errorf("upsert entity: %w", err)
	}
	err = tx.QueryRow(ctx, `SELECT id FROM game_entity_versions WHERE entity_id=$1 AND build_id=$2 AND content_hash=$3`, entityID, buildID, hash[:]).Scan(&versionID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
			INSERT INTO game_entity_versions (entity_id, build_id, revision, content_hash, payload, source_url)
			SELECT $1,$2,COALESCE(MAX(revision),0)+1,$3,$4,$5 FROM game_entity_versions WHERE entity_id=$1 AND build_id=$2 RETURNING id`,
			entityID, buildID, hash[:], payload, sourceURL).Scan(&versionID)
	}
	if err != nil {
		return fmt.Errorf("upsert version: %w", err)
	}
	attributes := json.RawMessage(payload)
	if _, err := tx.Exec(ctx, `
		INSERT INTO game_entity_localizations (version_id, locale, slug, name, description, attributes)
		VALUES ($1,'en_US',$2,$3,'',$4)
		ON CONFLICT (version_id, locale) DO UPDATE SET slug=EXCLUDED.slug, name=EXCLUDED.name, attributes=EXCLUDED.attributes`,
		versionID, slugify(name), name, attributes); err != nil {
		return fmt.Errorf("upsert localization: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE game_entities SET latest_version_id=$2, updated_at=now() WHERE id=$1`, entityID, versionID); err != nil {
		return fmt.Errorf("set latest version: %w", err)
	}
	return nil
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Trim(nonSlug.ReplaceAllString(value, "-"), "-")
}
