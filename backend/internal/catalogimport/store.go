package catalogimport

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

type ImportContext struct {
	ProductID   int16
	NamespaceID int16
	BuildID     int64
	RunID       uuid.UUID
	SnapshotID  uuid.UUID
	ReleaseID   *uuid.UUID
}

type Record struct {
	Type             string
	ExternalID       int64
	Locale           string
	Payload          json.RawMessage
	SourceURL        string
	SourceArtifactID *uuid.UUID
}

type MediaCandidate struct {
	EntityType string
	ExternalID int64
	Href       string
}

type EntityMedia struct {
	Kind       string
	AssetKey   string
	SourceURL  string
	FileDataID *int64
	MIMEType   string
	Width      *int
	Height     *int
	Primary    bool
	Attributes map[string]any
}

type QuestReward struct {
	Type       string         `json:"reward_type"`
	Index      int16          `json:"reward_index"`
	ExternalID *int64         `json:"external_id,omitempty"`
	Amount     int64          `json:"amount"`
	Choice     bool           `json:"is_choice"`
	Name       string         `json:"-"`
	Attributes map[string]any `json:"attributes"`
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// ReplaceBattleNetQuestRewards projects the complete localized reward set from
// one official quest response. Rows no longer present in the response are
// removed, while names from other locales are retained in attributes.names.
func (s *Store) ReplaceBattleNetQuestRewards(
	ctx context.Context,
	ic ImportContext,
	questID int64,
	locale string,
	rewards []QuestReward,
	artifactID uuid.UUID,
) error {
	if questID <= 0 {
		return errors.New("quest ID must be positive")
	}
	if locale != "en_US" && locale != "ru_RU" {
		return fmt.Errorf("unsupported quest reward locale %q", locale)
	}
	for index := range rewards {
		if rewards[index].Type == "" || rewards[index].Index < 0 || rewards[index].Amount < 0 {
			return fmt.Errorf("invalid quest reward at index %d", index)
		}
		if rewards[index].Attributes == nil {
			rewards[index].Attributes = make(map[string]any)
		}
		if rewards[index].Name != "" {
			rewards[index].Attributes["names"] = map[string]string{locale: rewards[index].Name}
		}
	}
	encoded, err := json.Marshal(rewards)
	if err != nil {
		return fmt.Errorf("encode quest %d rewards: %w", questID, err)
	}
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_quest_registry(build_id,quest_id,enrichment_status)
			VALUES($1,$2,'blizzard_api')
			ON CONFLICT(build_id,quest_id) DO UPDATE SET enrichment_status='blizzard_api'`,
			ic.BuildID, questID); err != nil {
			return fmt.Errorf("register Battle.net quest %d: %w", questID, err)
		}
		_, err := tx.Exec(ctx, `
		WITH incoming AS (
			SELECT reward_type,reward_index,external_id,amount,is_choice,COALESCE(attributes,'{}'::jsonb) AS attributes
			FROM jsonb_to_recordset($4::jsonb) AS reward(
				reward_type text,reward_index smallint,external_id bigint,amount numeric,is_choice boolean,attributes jsonb
			)
		), removed AS (
			DELETE FROM catalog_quest_rewards stored
			WHERE stored.build_id=$1 AND stored.quest_id=$2 AND stored.source='blizzard_api'
			  AND NOT EXISTS (
				SELECT 1 FROM incoming
				WHERE incoming.reward_type=stored.reward_type AND incoming.reward_index=stored.reward_index
			  )
		)
		INSERT INTO catalog_quest_rewards(
			build_id,quest_id,reward_type,reward_index,external_id,item_entity_id,
			amount,is_choice,source,attributes,source_artifact_id
		)
		SELECT $1,$2,incoming.reward_type,incoming.reward_index,incoming.external_id,
			CASE WHEN incoming.reward_type='item' THEN item.id END,
			incoming.amount,incoming.is_choice,'blizzard_api',incoming.attributes,$5
		FROM incoming
		LEFT JOIN game_entities item ON item.product_id=$3 AND item.entity_type='item'
			AND item.external_id=incoming.external_id AND item.deleted_at IS NULL
		ON CONFLICT(build_id,quest_id,reward_type,reward_index) DO UPDATE SET
			external_id=EXCLUDED.external_id,
			item_entity_id=EXCLUDED.item_entity_id,
			amount=EXCLUDED.amount,
			is_choice=EXCLUDED.is_choice,
			source=EXCLUDED.source,
			source_artifact_id=EXCLUDED.source_artifact_id,
			attributes=(catalog_quest_rewards.attributes || EXCLUDED.attributes)
				|| jsonb_build_object('names',
					COALESCE(catalog_quest_rewards.attributes->'names','{}'::jsonb)
					|| COALESCE(EXCLUDED.attributes->'names','{}'::jsonb))`,
			ic.BuildID, questID, ic.ProductID, json.RawMessage(encoded), artifactID)
		if err != nil {
			return fmt.Errorf("replace Battle.net quest %d rewards (%s): %w", questID, locale, err)
		}
		return nil
	})
}

// MaxExternalID bounds Battle.net search partitions with the build-complete
// entity identities already discovered from DB2. Blizzard search responses are
// capped at 1,000 matches, so an unbounded wildcard search silently truncates.
func (s *Store) MaxExternalID(ctx context.Context, productID int16, entityType string) (int64, error) {
	var maxID int64
	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE(max(external_id),0)
		FROM game_entities
		WHERE product_id=$1 AND entity_type=$2 AND deleted_at IS NULL`, productID, entityType).Scan(&maxID); err != nil {
		return 0, fmt.Errorf("find maximum %s external ID: %w", entityType, err)
	}
	return maxID, nil
}

// BattleNetMediaCandidates returns the newest official resource document for
// each entity that advertises a build-pinned Media API link.
func (s *Store) BattleNetMediaCandidates(
	ctx context.Context,
	buildID int64,
	entityTypes []string,
) ([]MediaCandidate, error) {
	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT ON (entity_type,external_id)
			entity_type,external_id,payload #>> '{media,key,href}'
		FROM catalog_entity_source_documents
		WHERE build_id=$1 AND source='blizzard_api' AND locale='en_US'
		  AND entity_type=ANY($2::text[])
		  AND NULLIF(BTRIM(payload #>> '{media,key,href}'),'') IS NOT NULL
		ORDER BY entity_type,external_id,imported_at DESC`, buildID, entityTypes)
	if err != nil {
		return nil, fmt.Errorf("list Battle.net media candidates: %w", err)
	}
	defer rows.Close()
	result := make([]MediaCandidate, 0)
	for rows.Next() {
		var candidate MediaCandidate
		if err := rows.Scan(&candidate.EntityType, &candidate.ExternalID, &candidate.Href); err != nil {
			return nil, fmt.Errorf("scan Battle.net media candidate: %w", err)
		}
		result = append(result, candidate)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read Battle.net media candidates: %w", err)
	}
	return result, nil
}

func (s *Store) RegisterArtifact(
	ctx context.Context,
	ic ImportContext,
	source, artifactKey, locale, sourceURL string,
	metadata any,
) (uuid.UUID, error) {
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return uuid.Nil, fmt.Errorf("encode source artifact metadata: %w", err)
	}
	var artifactID uuid.UUID
	err = s.db.QueryRow(ctx, `
		INSERT INTO catalog_source_artifacts (
			snapshot_id,build_id,source,artifact_key,locale,source_url,status,metadata
		) VALUES ($1,$2,$3,$4,$5,$6,'ready',$7)
		ON CONFLICT (snapshot_id,artifact_key,locale) DO UPDATE SET
			source_url=EXCLUDED.source_url,status='ready',metadata=EXCLUDED.metadata,fetched_at=now()
		RETURNING id`, ic.SnapshotID, ic.BuildID, source, artifactKey, locale, sourceURL, encoded).Scan(&artifactID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("register source artifact %q: %w", artifactKey, err)
	}
	return artifactID, nil
}

func (s *Store) UpsertSourceRecord(ctx context.Context, artifactID uuid.UUID, recordKey string, payload json.RawMessage) (bool, error) {
	recordKey = strings.TrimSpace(recordKey)
	if recordKey == "" {
		return false, errors.New("source record key is required")
	}
	var canonical any
	if err := json.Unmarshal(payload, &canonical); err != nil {
		return false, fmt.Errorf("decode source record %q: %w", recordKey, err)
	}
	encoded, err := json.Marshal(canonical)
	if err != nil {
		return false, fmt.Errorf("canonicalize source record %q: %w", recordKey, err)
	}
	hash := sha256.Sum256(encoded)
	command, err := s.db.Exec(ctx, `
		INSERT INTO catalog_source_records (artifact_id,record_key,payload,content_hash)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (artifact_id,record_key) DO UPDATE SET
			payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,imported_at=now()
		WHERE catalog_source_records.content_hash IS DISTINCT FROM EXCLUDED.content_hash`,
		artifactID, recordKey, json.RawMessage(encoded), hash[:])
	if err != nil {
		return false, fmt.Errorf("upsert source record %q: %w", recordKey, err)
	}
	return command.RowsAffected() > 0, nil
}

// UpsertSourceDocument keeps the exact source-specific representation separate
// from the canonical build version. Documents are append-only by content hash,
// so same-build server hotfixes remain auditable. Importers can therefore enrich
// an entity without replacing normalized DB2 facts that reference version_id.
func (s *Store) UpsertSourceDocument(
	ctx context.Context,
	ic ImportContext,
	record Record,
	source string,
) (bool, error) {
	if strings.TrimSpace(source) == "" {
		return false, errors.New("source is required")
	}
	_, canonical, err := decodePayload(record.Payload)
	if err != nil {
		return false, err
	}
	hash := sha256.Sum256(canonical)
	command, err := s.db.Exec(ctx, `
		INSERT INTO catalog_entity_source_documents (
			build_id,entity_type,external_id,source,locale,payload,content_hash,source_url,source_artifact_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (build_id,entity_type,external_id,source,locale,content_hash) DO NOTHING`,
		ic.BuildID, record.Type, record.ExternalID, source, record.Locale,
		json.RawMessage(canonical), hash[:], record.SourceURL, record.SourceArtifactID)
	if err != nil {
		return false, fmt.Errorf("upsert %s source document %s %d (%s): %w",
			source, record.Type, record.ExternalID, record.Locale, err)
	}
	return command.RowsAffected() > 0, nil
}

// UpsertEntityIcon records a build-specific icon resolved from an official
// media document. The artifact reference keeps its provenance auditable.
func (s *Store) UpsertEntityIcon(
	ctx context.Context,
	ic ImportContext,
	entityType string,
	externalID int64,
	iconName string,
	artifactID uuid.UUID,
) error {
	entityType = strings.TrimSpace(entityType)
	iconName = strings.TrimSpace(iconName)
	if entityType == "" || externalID <= 0 || iconName == "" {
		return errors.New("entity type, positive external ID, and icon name are required")
	}
	_, err := s.db.Exec(ctx, `
		WITH target_builds AS (
			SELECT $1::bigint AS build_id
			UNION
			SELECT latest_version.build_id
			FROM game_entities entity
			JOIN game_entity_versions latest_version ON latest_version.id=entity.latest_version_id
			JOIN game_builds source_build ON source_build.id=$1
			JOIN game_builds target_build ON target_build.id=latest_version.build_id
			WHERE entity.product_id=$6 AND entity.entity_type=$2 AND entity.external_id=$3
			  AND entity.deleted_at IS NULL AND target_build.build_number>=source_build.build_number
		)
		INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
		SELECT build_id,$2,$3,$4,$5 FROM target_builds
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id`,
		ic.BuildID, entityType, externalID, iconName, artifactID, ic.ProductID)
	if err != nil {
		return fmt.Errorf("upsert entity icon %s %d: %w", entityType, externalID, err)
	}
	return nil
}

// UpsertEntityMedia preserves every official media asset advertised for an
// entity. It records the remote URL and provenance without implying that the
// bytes were cached; byte mirroring is governed separately by source policy.
func (s *Store) UpsertEntityMedia(
	ctx context.Context,
	ic ImportContext,
	entityType string,
	externalID int64,
	locale, source string,
	media EntityMedia,
	artifactID uuid.UUID,
) error {
	entityType = strings.TrimSpace(entityType)
	media.Kind = strings.TrimSpace(media.Kind)
	media.AssetKey = strings.TrimSpace(media.AssetKey)
	media.SourceURL = strings.TrimSpace(media.SourceURL)
	locale = strings.TrimSpace(locale)
	source = strings.TrimSpace(source)
	parsedURL, err := url.Parse(media.SourceURL)
	if err != nil || parsedURL.Scheme != "https" || parsedURL.Hostname() == "" {
		return errors.New("entity media source URL must be an absolute HTTPS URL")
	}
	if entityType == "" || externalID <= 0 || media.Kind == "" || media.AssetKey == "" || source == "" {
		return errors.New("entity type, positive external ID, media kind, asset key, and source are required")
	}
	if media.Attributes == nil {
		media.Attributes = make(map[string]any)
	}
	attributes, err := json.Marshal(media.Attributes)
	if err != nil {
		return fmt.Errorf("encode entity media attributes: %w", err)
	}
	_, err = s.db.Exec(ctx, `
		WITH target_entity AS (
			SELECT entity.id
			FROM game_entities entity
			JOIN game_builds build ON build.id=$1 AND build.product_id=entity.product_id
			WHERE entity.entity_type=$2 AND entity.external_id=$3 AND entity.deleted_at IS NULL
			LIMIT 1
		)
		INSERT INTO catalog_entity_media(
			build_id,entity_id,entity_type,external_id,media_kind,asset_key,locale,
			source,source_url,file_data_id,mime_type,width,height,source_artifact_id,
			is_primary,attributes
		) VALUES(
			$1,(SELECT id FROM target_entity),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
		)
		ON CONFLICT(build_id,entity_type,external_id,media_kind,asset_key,locale,source)
		DO UPDATE SET entity_id=EXCLUDED.entity_id,source_url=EXCLUDED.source_url,
			file_data_id=EXCLUDED.file_data_id,mime_type=EXCLUDED.mime_type,
			width=EXCLUDED.width,height=EXCLUDED.height,
			source_artifact_id=EXCLUDED.source_artifact_id,is_primary=EXCLUDED.is_primary,
			attributes=EXCLUDED.attributes,updated_at=now()`,
		ic.BuildID, entityType, externalID, media.Kind, media.AssetKey, locale,
		source, media.SourceURL, media.FileDataID, media.MIMEType, media.Width,
		media.Height, artifactID, media.Primary, json.RawMessage(attributes))
	if err != nil {
		return fmt.Errorf("upsert entity media %s %d %s: %w", entityType, externalID, media.AssetKey, err)
	}
	return nil
}

// Enrich applies trusted localized fields and typed API facts to an existing
// build version while retaining its canonical payload and normalized DB2 rows.
// If the entity does not exist for the build yet, it becomes a normal canonical
// entity instead.
func (s *Store) Enrich(ctx context.Context, ic ImportContext, record Record, source string) error {
	doc, canonical, err := decodePayload(record.Payload)
	if err != nil {
		return err
	}
	name := localizedString(doc["name"], record.Locale)
	if name == "" {
		return fmt.Errorf("%s %d has no localized name", record.Type, record.ExternalID)
	}
	description := localizedString(doc["description"], record.Locale)

	var versionID uuid.UUID
	err = s.db.QueryRow(ctx, `
		SELECT version.id
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$4
		LEFT JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
		WHERE entity.product_id=$1 AND entity.entity_type=$2 AND entity.external_id=$3
		  AND entity.deleted_at IS NULL
		  AND (version.snapshot_id=$5 OR version.snapshot_id IS NULL OR snapshot.status='published'
			OR ($6::uuid IS NOT NULL AND snapshot.release_id=$6))
		ORDER BY version.revision DESC
		LIMIT 1`, ic.ProductID, record.Type, record.ExternalID, ic.BuildID, ic.SnapshotID, ic.ReleaseID).Scan(&versionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.UpsertCanonical(ctx, ic, record)
	}
	if err != nil {
		return fmt.Errorf("find %s %d for enrichment: %w", record.Type, record.ExternalID, err)
	}

	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations (version_id,locale,slug,name,description,attributes)
			VALUES ($1,$2,$3,$4,$5,jsonb_build_object($6::text,$7::jsonb))
			ON CONFLICT (version_id,locale) DO UPDATE SET
				slug=EXCLUDED.slug,
				name=EXCLUDED.name,
				description=COALESCE(NULLIF(EXCLUDED.description,''),game_entity_localizations.description),
				attributes=game_entity_localizations.attributes || EXCLUDED.attributes`,
			versionID, record.Locale, slugify(name), name, description, source, json.RawMessage(canonical)); err != nil {
			return fmt.Errorf("enrich %s localization: %w", record.Locale, err)
		}
		if err := upsertTyped(ctx, tx, record.Type, versionID, doc); err != nil {
			return err
		}
		return nil
	})
}

func (s *Store) Begin(
	ctx context.Context,
	product string,
	buildNumber int,
	buildVersion, region, source string,
	releaseID *uuid.UUID,
	parameters any,
) (ImportContext, error) {
	var result ImportContext
	result.ReleaseID = releaseID
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug = $1`, product).Scan(&result.ProductID); err != nil {
			return fmt.Errorf("find product %q: %w", product, err)
		}
		namespace := "static-" + region
		if err := tx.QueryRow(ctx, `
			INSERT INTO game_namespaces (product_id, region, kind, slug)
			VALUES ($1, $2, 'static', $3)
			ON CONFLICT (product_id, slug) DO UPDATE SET region = EXCLUDED.region
			RETURNING id`, result.ProductID, region, namespace).Scan(&result.NamespaceID); err != nil {
			return fmt.Errorf("upsert namespace: %w", err)
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO game_builds (product_id, build_number, version, is_active)
			VALUES ($1, $2, $3, false)
			ON CONFLICT (product_id, build_number)
			DO UPDATE SET version = EXCLUDED.version
			RETURNING id`, result.ProductID, buildNumber, buildVersion).Scan(&result.BuildID); err != nil {
			return fmt.Errorf("upsert build: %w", err)
		}
		if releaseID != nil {
			command, err := tx.Exec(ctx, `
				UPDATE catalog_releases
				SET build_id=COALESCE(build_id,$3),updated_at=now()
				WHERE id=$1 AND product_id=$2 AND build_version=$4 AND status='staging'
				  AND (build_id IS NULL OR build_id=$3)`, *releaseID, result.ProductID, result.BuildID, buildVersion)
			if err != nil {
				return fmt.Errorf("bind catalog release build: %w", err)
			}
			if command.RowsAffected() != 1 {
				return fmt.Errorf("catalog release %s does not accept product %s build %s", releaseID.String(), product, buildVersion)
			}
		}
		encoded, err := json.Marshal(parameters)
		if err != nil {
			return fmt.Errorf("encode import parameters: %w", err)
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO catalog_snapshots (product_id, build_id, source, metadata, release_id)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id`, result.ProductID, result.BuildID, source, encoded, releaseID).Scan(&result.SnapshotID); err != nil {
			return fmt.Errorf("start catalog snapshot: %w", err)
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO catalog_import_runs (product_id, build_id, source, parameters, snapshot_id)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id`, result.ProductID, result.BuildID, source, encoded, result.SnapshotID).Scan(&result.RunID); err != nil {
			return fmt.Errorf("start import run: %w", err)
		}
		return nil
	})
	return result, err
}

func (s *Store) UpsertCanonical(ctx context.Context, ic ImportContext, record Record) error {
	doc, canonical, err := decodePayload(record.Payload)
	if err != nil {
		return err
	}
	name := localizedString(doc["name"], record.Locale)
	if name == "" {
		return fmt.Errorf("%s %d has no localized name", record.Type, record.ExternalID)
	}
	description := localizedString(doc["description"], record.Locale)
	slug := slugify(name)
	hash := sha256.Sum256(canonical)

	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var entityID, versionID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO game_entities (
				product_id, namespace_id, entity_type, external_id, canonical_slug,
				first_seen_build_id, last_seen_build_id, deleted_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $6, NULL, now())
			ON CONFLICT (product_id, entity_type, external_id) DO UPDATE SET
				namespace_id = EXCLUDED.namespace_id,
				canonical_slug = CASE WHEN $7::uuid IS NULL THEN EXCLUDED.canonical_slug ELSE game_entities.canonical_slug END,
				last_seen_build_id = CASE WHEN $7::uuid IS NULL THEN EXCLUDED.last_seen_build_id ELSE game_entities.last_seen_build_id END,
				deleted_at = CASE WHEN $7::uuid IS NULL THEN NULL ELSE game_entities.deleted_at END,
				updated_at = now()
			RETURNING id`, ic.ProductID, ic.NamespaceID, record.Type, record.ExternalID, slug, ic.BuildID, ic.ReleaseID).Scan(&entityID); err != nil {
			return fmt.Errorf("upsert entity: %w", err)
		}
		err := tx.QueryRow(ctx, `
			SELECT version.id FROM game_entity_versions version
			LEFT JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
			WHERE version.entity_id=$1 AND version.build_id=$2 AND version.content_hash=$3
			  AND (version.snapshot_id=$4 OR version.snapshot_id IS NULL OR snapshot.status='published'
				OR ($5::uuid IS NOT NULL AND snapshot.release_id=$5))
			ORDER BY version.revision DESC LIMIT 1`, entityID, ic.BuildID, hash[:], ic.SnapshotID, ic.ReleaseID).Scan(&versionID)
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `
				UPDATE game_entity_versions version SET
					snapshot_id=$4,source_url=$5,source_artifact_id=$6
				FROM catalog_snapshots snapshot
				WHERE version.entity_id=$1 AND version.build_id=$2 AND version.content_hash=$3
				  AND snapshot.id=version.snapshot_id AND snapshot.status='failed'
				RETURNING version.id`, entityID, ic.BuildID, hash[:], ic.SnapshotID, record.SourceURL, record.SourceArtifactID).Scan(&versionID)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `
				INSERT INTO game_entity_versions (
					entity_id, build_id, revision, content_hash, payload, source_url, snapshot_id, source_artifact_id
				)
				SELECT $1, $2, COALESCE(MAX(revision), 0) + 1, $3, $4, $5, $6, $7
				FROM game_entity_versions WHERE entity_id = $1 AND build_id = $2
				RETURNING id`, entityID, ic.BuildID, hash[:], json.RawMessage(canonical), record.SourceURL, ic.SnapshotID, record.SourceArtifactID).Scan(&versionID)
		}
		if err != nil {
			return fmt.Errorf("upsert entity version: %w", err)
		}
		if err := upsertLocalization(ctx, tx, versionID, record.Locale, slug, name, description, canonical); err != nil {
			return err
		}
		if err := upsertTyped(ctx, tx, record.Type, versionID, doc); err != nil {
			return err
		}
		return nil
	})
}

func (s *Store) UpsertLocalization(ctx context.Context, ic ImportContext, record Record) error {
	_, canonical, err := decodePayload(record.Payload)
	if err != nil {
		return err
	}
	var doc map[string]any
	if err := json.Unmarshal(canonical, &doc); err != nil {
		return fmt.Errorf("decode localized payload: %w", err)
	}
	name := localizedString(doc["name"], record.Locale)
	if name == "" {
		return fmt.Errorf("%s %d has no localized name", record.Type, record.ExternalID)
	}
	var versionID uuid.UUID
	err = s.db.QueryRow(ctx, `
		SELECT COALESCE((
			SELECT v.id FROM game_entity_versions v
			WHERE v.entity_id=e.id AND v.snapshot_id=$4
			ORDER BY v.revision DESC LIMIT 1
		), e.latest_version_id)
		FROM game_entities e
		WHERE e.product_id = $1 AND e.entity_type = $2 AND e.external_id = $3 AND e.deleted_at IS NULL`,
		ic.ProductID, record.Type, record.ExternalID, ic.SnapshotID).Scan(&versionID)
	if err != nil {
		return fmt.Errorf("find canonical %s %d: %w", record.Type, record.ExternalID, err)
	}
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		return upsertLocalization(ctx, tx, versionID, record.Locale, slugify(name), name,
			localizedString(doc["description"], record.Locale), canonical)
	})
}

func (s *Store) Finish(ctx context.Context, runID uuid.UUID, status string, seen, written int64, importErr error) error {
	errorSummary := ""
	if importErr != nil {
		errorSummary = importErr.Error()
	}
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var snapshotID uuid.UUID
		var productID int16
		var releaseID *uuid.UUID
		if err := tx.QueryRow(ctx, `
			WITH finished AS (
				UPDATE catalog_import_runs
				SET status=$2,records_seen=$3,records_written=$4,error_summary=$5,finished_at=now()
				WHERE id=$1
				RETURNING snapshot_id,product_id
			)
			SELECT finished.snapshot_id,finished.product_id,snapshot.release_id
			FROM finished
			JOIN catalog_snapshots snapshot ON snapshot.id=finished.snapshot_id`,
			runID, status, seen, written, errorSummary).Scan(&snapshotID, &productID, &releaseID); err != nil {
			return err
		}
		if status != "SUCCEEDED" {
			if _, err := tx.Exec(ctx, `UPDATE catalog_snapshots SET status='failed',failed_at=now() WHERE id=$1`, snapshotID); err != nil {
				return err
			}
			// Some legacy projections still move latest_version_id while staging. Restore
			// every entity touched by this failed snapshot to its last published version.
			_, err := tx.Exec(ctx, `
				WITH affected AS (
					SELECT DISTINCT entity_id FROM game_entity_versions WHERE snapshot_id=$1
				), resolved AS (
					SELECT a.entity_id,(
						SELECT v.id
						FROM game_entity_versions v
						JOIN game_builds b ON b.id=v.build_id
						LEFT JOIN catalog_snapshots s ON s.id=v.snapshot_id
						WHERE v.entity_id=a.entity_id
						  AND (v.snapshot_id IS NULL OR s.status='published')
						ORDER BY b.build_number DESC,v.revision DESC
						LIMIT 1
					) AS version_id
					FROM affected a
				)
				UPDATE game_entities e
				SET latest_version_id=r.version_id,updated_at=now()
				FROM resolved r WHERE e.id=r.entity_id`, snapshotID)
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_snapshots
			SET status='validated',validated_at=now()
			WHERE id=$1 AND status='staging'`, snapshotID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH candidates AS (
				SELECT DISTINCT ON (v.entity_id) v.entity_id,v.id AS version_id,b.build_number
				FROM game_entity_versions v
				JOIN game_builds b ON b.id=v.build_id
				WHERE v.snapshot_id=$1
				ORDER BY v.entity_id,b.build_number DESC,v.revision DESC
			)
			UPDATE game_entities e
			SET latest_version_id=c.version_id,
				published_version_id=CASE WHEN $2::uuid IS NULL THEN c.version_id ELSE e.published_version_id END,
				updated_at=now()
			FROM candidates c
			WHERE e.id=c.entity_id
			  AND COALESCE((
				SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=e.latest_version_id
			  ),0) <= c.build_number`, snapshotID, releaseID); err != nil {
			return fmt.Errorf("publish catalog snapshot entities: %w", err)
		}
		if releaseID != nil {
			return nil
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_snapshots
			SET status='published',published_at=now()
			WHERE id=$1 AND status='validated'`, snapshotID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_builds b
			SET is_active=b.id=(
				SELECT s.build_id
				FROM catalog_snapshots s
				JOIN game_builds published_build ON published_build.id=s.build_id
				WHERE s.product_id=$1 AND s.status='published'
				ORDER BY published_build.build_number DESC,s.published_at DESC
				LIMIT 1
			)
			WHERE b.product_id=$1`, productID); err != nil {
			return fmt.Errorf("activate latest published build: %w", err)
		}
		return nil
	})
}

func decodePayload(payload json.RawMessage) (map[string]any, []byte, error) {
	var doc map[string]any
	if err := json.Unmarshal(payload, &doc); err != nil {
		return nil, nil, fmt.Errorf("decode entity payload: %w", err)
	}
	canonical, err := json.Marshal(doc)
	if err != nil {
		return nil, nil, fmt.Errorf("canonicalize entity payload: %w", err)
	}
	return doc, canonical, nil
}

func upsertLocalization(ctx context.Context, tx pgx.Tx, versionID uuid.UUID, locale, slug, name, description string, attributes []byte) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO game_entity_localizations (version_id, locale, slug, name, description, attributes)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (version_id, locale) DO UPDATE SET
			slug = EXCLUDED.slug, name = EXCLUDED.name,
			description = EXCLUDED.description, attributes = EXCLUDED.attributes`,
		versionID, locale, slug, name, description, json.RawMessage(attributes))
	if err != nil {
		return fmt.Errorf("upsert %s localization: %w", locale, err)
	}
	return nil
}

func upsertTyped(ctx context.Context, tx pgx.Tx, entityType string, versionID uuid.UUID, doc map[string]any) error {
	switch entityType {
	case "item":
		_, err := tx.Exec(ctx, `
			INSERT INTO catalog_items (
				version_id, quality, item_level, required_level, inventory_type,
				item_class_id, item_subclass_id, max_count, purchase_price, sell_price,
				is_equippable, is_stackable
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			ON CONFLICT (version_id) DO UPDATE SET
				quality=COALESCE(EXCLUDED.quality,catalog_items.quality),
				item_level=COALESCE(EXCLUDED.item_level,catalog_items.item_level),
				required_level=COALESCE(EXCLUDED.required_level,catalog_items.required_level),
				inventory_type=COALESCE(EXCLUDED.inventory_type,catalog_items.inventory_type),
				item_class_id=COALESCE(EXCLUDED.item_class_id,catalog_items.item_class_id),
				item_subclass_id=COALESCE(EXCLUDED.item_subclass_id,catalog_items.item_subclass_id),
				max_count=COALESCE(EXCLUDED.max_count,catalog_items.max_count),
				purchase_price=COALESCE(EXCLUDED.purchase_price,catalog_items.purchase_price),
				sell_price=COALESCE(EXCLUDED.sell_price,catalog_items.sell_price),
				is_equippable=COALESCE(EXCLUDED.is_equippable,catalog_items.is_equippable),
				is_stackable=COALESCE(EXCLUDED.is_stackable,catalog_items.is_stackable)`, versionID,
			pathString(doc, "quality", "type"), integer(doc["level"]), integer(doc["required_level"]),
			pathString(doc, "inventory_type", "type"), pathInt(doc, "item_class", "id"),
			pathInt(doc, "item_subclass", "id"), integer(doc["max_count"]), integer(doc["purchase_price"]),
			integer(doc["sell_price"]), boolean(doc["is_equippable"]), boolean(doc["is_stackable"]))
		if err != nil {
			return fmt.Errorf("upsert typed item: %w", err)
		}
	case "spell":
		_, err := tx.Exec(ctx, `
			INSERT INTO catalog_spells (version_id, school, cast_time, cooldown_ms, min_range, max_range)
			VALUES ($1,$2,$3,$4,$5,$6)
			ON CONFLICT (version_id) DO UPDATE SET
				school=COALESCE(EXCLUDED.school,catalog_spells.school),
				cast_time=COALESCE(EXCLUDED.cast_time,catalog_spells.cast_time),
				cooldown_ms=COALESCE(EXCLUDED.cooldown_ms,catalog_spells.cooldown_ms),
				min_range=COALESCE(EXCLUDED.min_range,catalog_spells.min_range),
				max_range=COALESCE(EXCLUDED.max_range,catalog_spells.max_range)`,
			versionID, pathString(doc, "school", "type"), pathString(doc, "cast_time", "name"),
			integer(doc["cooldown_ms"]), number(doc["min_range"]), number(doc["max_range"]))
		if err != nil {
			return fmt.Errorf("upsert typed spell: %w", err)
		}
	default:
		return nil
	}
	return nil
}

func localizedString(value any, locale string) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		if result, ok := typed[locale].(string); ok {
			return result
		}
	}
	return ""
}

func pathString(doc map[string]any, keys ...string) *string {
	var current any = doc
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	value, ok := current.(string)
	if !ok {
		return nil
	}
	return &value
}

func pathInt(doc map[string]any, keys ...string) *int64 {
	var current any = doc
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	return integer(current)
}

func integer(value any) *int64 {
	number, ok := value.(float64)
	if !ok {
		return nil
	}
	result := int64(number)
	return &result
}

func number(value any) *float64 {
	result, ok := value.(float64)
	if !ok {
		return nil
	}
	return &result
}

func boolean(value any) *bool {
	result, ok := value.(bool)
	if !ok {
		return nil
	}
	return &result
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var result strings.Builder
	lastDash := false
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || (char >= 'а' && char <= 'я') || char == 'ё' {
			result.WriteRune(char)
			lastDash = false
			continue
		}
		if !lastDash && result.Len() > 0 {
			result.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(result.String(), "-")
}
