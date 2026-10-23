package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type row struct {
	id      int64
	payload string
	hash    []byte
}

type completenessExclusion struct {
	externalKey string
	reasonCode  string
	reason      string
	attributes  map[string]any
}

func existingItemProjectionContext(ctx context.Context, db *pgxpool.Pool, product string, buildNumber int) (catalogimport.ImportContext, error) {
	return existingCompleteProjectionContext(ctx, db, product, buildNumber, "db2.item")
}

func existingCompleteProjectionContext(
	ctx context.Context,
	db *pgxpool.Pool,
	product string,
	buildNumber int,
	scopeKey string,
) (catalogimport.ImportContext, error) {
	var ic catalogimport.ImportContext
	err := db.QueryRow(ctx, `
		SELECT product.id,namespace.id,build.id
		FROM game_products product
		JOIN game_namespaces namespace ON namespace.product_id=product.id AND namespace.slug='static-us'
		JOIN game_builds build ON build.product_id=product.id AND build.build_number=$2
		WHERE product.slug=$1`, product, buildNumber).Scan(&ic.ProductID, &ic.NamespaceID, &ic.BuildID)
	if errors.Is(err, pgx.ErrNoRows) {
		return catalogimport.ImportContext{}, fmt.Errorf("existing build %d for product %q was not found", buildNumber, product)
	}
	if err != nil {
		return catalogimport.ImportContext{}, fmt.Errorf("resolve existing build: %w", err)
	}
	var ready bool
	if err := db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM catalog_completeness_latest
			WHERE build_id=$1 AND scope_key=$2 AND locale='en_US' AND status='complete'
		)`, ic.BuildID, scopeKey).Scan(&ready); err != nil {
		return catalogimport.ImportContext{}, fmt.Errorf("verify existing %s completeness: %w", scopeKey, err)
	}
	if !ready {
		return catalogimport.ImportContext{}, fmt.Errorf("existing build %d scope %s is not proven complete", buildNumber, scopeKey)
	}
	return ic, nil
}

func observeDB2LocalizationArtifactsForTables(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext, tables []string) error {
	_, err := db.Exec(ctx, `
		WITH mappings(entity_type,table_name) AS (VALUES
			('item'::text,'ItemSparse'::text),('spell','SpellName'),('spell','Spell'),
			('creature','Creature'),('quest','QuestV2CliTask'),('profession','SkillLine'),
			('pvp_talent','PvpTalent'),('class','ChrClasses'),('specialization','ChrSpecialization'),
			('currency','CurrencyTypes'),('mount','Mount'),('battle_pet','BattlePetSpecies'),
			('toy','Toy'),('map','Map'),('ui_map','UiMap'),('area','AreaTable'),('faction','Faction'),
			('transmog_set','TransmogSet'),('achievement','Achievement'),
			('instance','JournalInstance'),('encounter','JournalEncounter')
		), selected_mappings AS (
			SELECT * FROM mappings
			WHERE COALESCE(cardinality($3::text[]),0)=0 OR table_name=ANY($3::text[])
		), direct_observations AS (
			SELECT DISTINCT version.id AS version_id,localized.locale,raw.source_artifact_id
			FROM selected_mappings mapping
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type=mapping.entity_type
				AND entity.deleted_at IS NULL
			JOIN game_entity_versions version ON version.id=entity.latest_version_id AND version.build_id=$2
			JOIN game_entity_localizations localized ON localized.version_id=version.id
			JOIN catalog_db2_rows raw ON raw.build_id=version.build_id AND raw.table_name=mapping.table_name
				AND raw.locale=localized.locale AND raw.row_id=entity.external_id
			WHERE raw.source_artifact_id IS NOT NULL
		), recipe_observations AS (
			SELECT DISTINCT recipe_version.id AS version_id,localized.locale,raw.source_artifact_id
			FROM game_entities recipe_entity
			JOIN game_entity_versions recipe_version ON recipe_version.id=recipe_entity.latest_version_id
				AND recipe_version.build_id=$2
			JOIN catalog_recipes recipe ON recipe.version_id=recipe_version.id
			JOIN game_entity_versions spell_version ON spell_version.id=recipe.source_spell_version_id
			JOIN game_entities spell_entity ON spell_entity.id=spell_version.entity_id
			JOIN game_entity_localizations localized ON localized.version_id=recipe_version.id
			JOIN catalog_db2_rows raw ON raw.build_id=recipe_version.build_id
				AND raw.table_name IN ('SpellName','Spell') AND raw.locale=localized.locale
				AND raw.row_id=spell_entity.external_id
			WHERE recipe_entity.product_id=$1 AND recipe_entity.entity_type='recipe'
			  AND recipe_entity.deleted_at IS NULL AND raw.source_artifact_id IS NOT NULL
			  AND (COALESCE(cardinality($3::text[]),0)=0 OR $3::text[] && ARRAY['SpellName','Spell']::text[])
		), observations AS (
			SELECT version_id,locale,source_artifact_id FROM direct_observations
			UNION
			SELECT version_id,locale,source_artifact_id FROM recipe_observations
		), version_observations AS (
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version_id,source_artifact_id FROM observations
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING
			RETURNING version_id
		)
		INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
		SELECT version_id,locale,source_artifact_id FROM observations
		ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING`, ic.ProductID, ic.BuildID, tables)
	if err != nil {
		return fmt.Errorf("observe DB2 localization artifacts: %w", err)
	}
	return nil
}

func importTables(ctx context.Context, db *pgxpool.Pool, client *wago.Client, store *catalogimport.Store, ic catalogimport.ImportContext, opts options, seen, written *int64) error {
	for _, table := range opts.tables {
		locales := opts.locales
		if !isLocalized(table) {
			locales = []string{"en_US"}
		}
		for _, locale := range locales {
			wagoLocale := map[string]string{"en_US": "enUS", "ru_RU": "ruRU"}[locale]
			sourceURL := client.CSVURL(table, opts.version, wagoLocale)
			metadata := map[string]any{
				"table": table, "build": opts.version, "locale": locale,
				"bounded": opts.maxRecords > 0, "max_records": opts.maxRecords,
			}
			var artifactID uuid.UUID
			var err error
			artifactID, err = store.RegisterPendingArtifact(ctx, ic, "wago_tools", table, locale, sourceURL, metadata)
			if err != nil {
				return err
			}
			artifactErr := func() (resultErr error) {
				finalized := false
				defer func() {
					if finalized {
						return
					}
					if failErr := store.FailArtifact(context.WithoutCancel(ctx), artifactID, resultErr); failErr != nil {
						slog.Error("fail DB2 artifact", "table", table, "locale", locale, "error", failErr)
					}
				}()
				batch := make([]row, 0, opts.batchSize)
				flush := func() error {
					if len(batch) == 0 {
						return nil
					}
					count, err := upsertBatch(ctx, db, ic, artifactID, table, locale, sourceURL, batch)
					if err != nil {
						return err
					}
					*written += count
					batch = batch[:0]
					return nil
				}
				slog.Info("importing DB2 table", "table", table, "locale", locale, "build", opts.version)
				sourceOrdinal := int64(0)
				seenIDs := make(map[int64]struct{})
				exclusions := make([]completenessExclusion, 0)
				sourceRows, proof, err := client.RowsWithProof(ctx, table, opts.version, wagoLocale, opts.maxRecords, func(values map[string]string) error {
					sourceOrdinal++
					*seen++
					rawID := strings.TrimSpace(values["ID"])
					id, err := strconv.ParseInt(rawID, 10, 64)
					if err != nil || id <= 0 {
						exclusions = append(exclusions, completenessExclusion{
							externalKey: fmt.Sprintf("row:%d", sourceOrdinal), reasonCode: "invalid_id",
							reason:     "source row has no positive DB2 ID",
							attributes: map[string]any{"raw_id": rawID, "source_ordinal": sourceOrdinal},
						})
						return nil
					}
					if _, duplicate := seenIDs[id]; duplicate {
						exclusions = append(exclusions, completenessExclusion{
							externalKey: fmt.Sprintf("row:%d", sourceOrdinal), reasonCode: "duplicate_id",
							reason:     "source file repeats a DB2 ID already seen in this artifact",
							attributes: map[string]any{"db2_id": id, "source_ordinal": sourceOrdinal},
						})
						return nil
					}
					seenIDs[id] = struct{}{}
					canonical, err := json.Marshal(values)
					if err != nil {
						return err
					}
					digest := sha256.Sum256(canonical)
					batch = append(batch, row{id: id, payload: string(canonical), hash: digest[:]})
					if len(batch) >= opts.batchSize {
						return flush()
					}
					return nil
				})
				if err != nil {
					var unavailable *wago.UnavailableError
					if errors.As(err, &unavailable) {
						if markErr := store.MarkArtifactUnavailable(context.WithoutCancel(ctx), artifactID, unavailable.Error()); markErr != nil {
							return markErr
						}
						if recordErr := recordDB2Unavailable(context.WithoutCancel(ctx), db, ic, artifactID, table, locale, sourceURL, unavailable.Error()); recordErr != nil {
							return recordErr
						}
						finalized = true
						slog.Warn("DB2 table is unavailable for build; recorded explicit source gap", "table", table, "locale", locale, "build", opts.version, "error", unavailable)
						return nil
					}
					return fmt.Errorf("import %s (%s): %w", table, locale, err)
				}
				if err := flush(); err != nil {
					return fmt.Errorf("flush %s (%s): %w", table, locale, err)
				}
				if proof.Complete {
					if err := store.CompleteArtifact(ctx, artifactID, proof.SHA256, proof.ByteSize, proof.ETag); err != nil {
						return err
					}
					if err := recordDB2Completeness(ctx, db, ic, artifactID, table, locale, sourceURL, int64(sourceRows), proof, exclusions); err != nil {
						return err
					}
				} else {
					if opts.maxRecords == 0 {
						return fmt.Errorf("DB2 %s (%s) ended without a complete content proof", table, locale)
					}
					if err := store.MarkArtifactSampled(ctx, artifactID, sourceRows, opts.maxRecords); err != nil {
						return err
					}
				}
				finalized = true
				return nil
			}()
			if artifactErr != nil {
				return artifactErr
			}
		}
	}
	return nil
}

// recordDB2Unavailable keeps a denominator row for a source export that is
// explicitly absent. The zero denominator is marked with availability metadata
// so completeness reports cannot mistake it for a successful non-empty export.
func recordDB2Unavailable(
	ctx context.Context,
	db *pgxpool.Pool,
	ic catalogimport.ImportContext,
	artifactID uuid.UUID,
	table, locale, sourceURL, reason string,
) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var expectationID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO catalog_completeness_expectations(
				product_id,build_id,scope_key,entity_type,locale,source,expected_count,
				source_artifact_id,attributes,observed_at
			) VALUES($1,$2,$3,'db2_row',$4,'wago_tools',0,$5,
				jsonb_build_object('availability','unavailable','table',$6::text,'source_url',$7::text,'reason',$8::text),now())
			ON CONFLICT(build_id,scope_key,locale,source) DO UPDATE SET
				product_id=EXCLUDED.product_id,expected_count=0,source_artifact_id=EXCLUDED.source_artifact_id,
				expected_content_hash=NULL,attributes=EXCLUDED.attributes,observed_at=now()
			RETURNING id`, ic.ProductID, ic.BuildID, "db2."+strings.ToLower(table), locale, artifactID, table, sourceURL, reason).Scan(&expectationID); err != nil {
			return fmt.Errorf("record unavailable DB2 expectation for %s (%s): %w", table, locale, err)
		}
		if _, err := tx.Exec(ctx, `
			DELETE FROM catalog_completeness_exclusions
			WHERE expectation_id=$1 AND attributes->>'managed_by'='db2-import'`, expectationID); err != nil {
			return fmt.Errorf("clear unavailable DB2 exclusions for %s (%s): %w", table, locale, err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_completeness_measurements(
				expectation_id,imported_count,excluded_count,missing_count,invalid_count,status,coverage_percent,details
			) VALUES($1,0,0,0,0,'complete',100,
				jsonb_build_object('availability','unavailable','table',$2::text,'source_url',$3::text,'reason',$4::text))`, expectationID, table, sourceURL, reason); err != nil {
			return fmt.Errorf("record unavailable DB2 measurement for %s (%s): %w", table, locale, err)
		}
		return nil
	})
}

func recordDB2Completeness(
	ctx context.Context,
	db *pgxpool.Pool,
	ic catalogimport.ImportContext,
	artifactID uuid.UUID,
	table, locale, sourceURL string,
	expected int64,
	proof wago.ContentProof,
	exclusions []completenessExclusion,
) error {
	if !proof.Complete || len(proof.SHA256) != sha256.Size || expected < 0 {
		return errors.New("complete DB2 content proof and non-negative denominator are required")
	}
	scopeKey := "db2." + strings.ToLower(table)
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var expectationID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO catalog_completeness_expectations(
				product_id,build_id,scope_key,entity_type,locale,source,expected_count,
				source_artifact_id,expected_content_hash,attributes,observed_at
			) VALUES($1,$2,$3,'db2_row',$4,'wago_tools',$5,$6,$7,
				jsonb_build_object('count_mode','db2_rows','table',$8::text,'source_url',$9::text),now())
			ON CONFLICT(build_id,scope_key,locale,source) DO UPDATE SET
				product_id=EXCLUDED.product_id,entity_type=EXCLUDED.entity_type,
				expected_count=EXCLUDED.expected_count,source_artifact_id=EXCLUDED.source_artifact_id,
				expected_content_hash=EXCLUDED.expected_content_hash,attributes=EXCLUDED.attributes,
				observed_at=now()
			RETURNING id`, ic.ProductID, ic.BuildID, scopeKey, locale, expected, artifactID,
			proof.SHA256, table, sourceURL).Scan(&expectationID); err != nil {
			return fmt.Errorf("record DB2 completeness expectation for %s (%s): %w", table, locale, err)
		}
		if _, err := tx.Exec(ctx, `
			DELETE FROM catalog_completeness_exclusions
			WHERE expectation_id=$1 AND attributes->>'managed_by'='db2-import'`, expectationID); err != nil {
			return fmt.Errorf("clear DB2 completeness exclusions for %s (%s): %w", table, locale, err)
		}
		for _, exclusion := range exclusions {
			attributes := exclusion.attributes
			if attributes == nil {
				attributes = make(map[string]any)
			}
			attributes["managed_by"] = "db2-import"
			encoded, err := json.Marshal(attributes)
			if err != nil {
				return fmt.Errorf("encode DB2 exclusion %s: %w", exclusion.externalKey, err)
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO catalog_completeness_exclusions(
					expectation_id,external_key,reason_code,reason,source_artifact_id,attributes
				) VALUES($1,$2,$3,$4,$5,$6)
				ON CONFLICT(expectation_id,external_key) DO UPDATE SET
					reason_code=EXCLUDED.reason_code,reason=EXCLUDED.reason,
					source_artifact_id=EXCLUDED.source_artifact_id,attributes=EXCLUDED.attributes`,
				expectationID, exclusion.externalKey, exclusion.reasonCode, exclusion.reason,
				artifactID, encoded); err != nil {
				return fmt.Errorf("record DB2 exclusion %s: %w", exclusion.externalKey, err)
			}
		}
		var imported, excluded int64
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM catalog_db2_rows
			WHERE build_id=$1 AND table_name=$2 AND locale=$3 AND source_artifact_id=$4`,
			ic.BuildID, table, locale, artifactID).Scan(&imported); err != nil {
			return fmt.Errorf("measure imported DB2 rows for %s (%s): %w", table, locale, err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM catalog_completeness_exclusions WHERE expectation_id=$1`,
			expectationID).Scan(&excluded); err != nil {
			return fmt.Errorf("measure DB2 exclusions for %s (%s): %w", table, locale, err)
		}
		accounted := imported + excluded
		missing := expected - accounted
		status := "complete"
		if missing < 0 {
			missing, status = 0, "overfull"
		} else if missing > 0 {
			status = "incomplete"
		}
		coverage := float64(100)
		if expected > 0 {
			coverage = math.Round((float64(accounted)/float64(expected))*1000000) / 10000
		} else if accounted > 0 {
			coverage = 0
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_completeness_measurements(
				expectation_id,imported_count,excluded_count,missing_count,invalid_count,
				status,coverage_percent,details
			) VALUES($1,$2,$3,$4,0,$5,$6,
				jsonb_build_object('count_mode','db2_rows','table',$7::text,
					'source_artifact_id',$8::text,'source_rows',$9::bigint))`,
			expectationID, imported, excluded, missing, status, coverage, table,
			artifactID.String(), expected); err != nil {
			return fmt.Errorf("record DB2 completeness measurement for %s (%s): %w", table, locale, err)
		}
		return nil
	})
}

func upsertBatch(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext, artifactID uuid.UUID, table, locale, sourceURL string, rows []row) (int64, error) {
	var affected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `CREATE TEMP TABLE catalog_db2_stage (row_id BIGINT, payload JSONB, content_hash BYTEA) ON COMMIT DROP`); err != nil {
			return err
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"catalog_db2_stage"}, []string{"row_id", "payload", "content_hash"},
			pgx.CopyFromSlice(len(rows), func(index int) ([]any, error) {
				return []any{rows[index].id, rows[index].payload, rows[index].hash}, nil
			}))
		if err != nil {
			return err
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO catalog_db2_rows (build_id, table_name, locale, row_id, payload, content_hash, source_url, snapshot_id, source_artifact_id)
			SELECT $1,$2,$3,row_id,payload,content_hash,$4,$5,$6 FROM catalog_db2_stage
			ON CONFLICT (build_id, table_name, locale, row_id) DO UPDATE SET
				payload=EXCLUDED.payload, content_hash=EXCLUDED.content_hash,
				source_url=EXCLUDED.source_url, snapshot_id=EXCLUDED.snapshot_id,
				source_artifact_id=EXCLUDED.source_artifact_id, imported_at=now()
			WHERE catalog_db2_rows.content_hash IS DISTINCT FROM EXCLUDED.content_hash
			   OR catalog_db2_rows.snapshot_id IS DISTINCT FROM EXCLUDED.snapshot_id
			   OR catalog_db2_rows.source_artifact_id IS DISTINCT FROM EXCLUDED.source_artifact_id`,
			ic.BuildID, table, locale, sourceURL, ic.SnapshotID, artifactID)
		if err != nil {
			return err
		}
		affected = command.RowsAffected()
		return nil
	})
	return affected, err
}
