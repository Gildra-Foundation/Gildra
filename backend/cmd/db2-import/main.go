package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"math"
	"os"
	"os/signal"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultTables = "Item,ItemSparse,ItemClass,ItemSubClass,ItemEffect,ItemXItemEffect,ItemSet,ItemSetSpell,ItemNameDescription,ItemLimitCategory,GemProperties,ItemBonus,ItemBonusList,ItemBonusListGroup,ItemBonusListGroupEntry,ItemBonusListLevelDelta,ItemBonusSeason,ItemLevelSelector,ItemLevelSelectorQuality,ItemLevelSelectorQualitySet,ItemModifiedAppearance,ItemModifiedAppearanceExtra,ItemAppearance,ItemSpec,ItemSpecOverride,ItemExtendedCost,ItemCurrencyCost,ItemSearchName,JournalInstance,JournalEncounter,JournalEncounterItem,SpellName,Spell,SpellMisc,SpellCooldowns,SpellRange,SpellCastTimes,SpellDuration,SpellRadius,SpellPower,SpellEffect,SpellDescriptionVariables,SpellAuraOptions,SpellAuraRestrictions,SpellCategories,SpellClassOptions,SpellEquippedItems,SpellLevels,SpellScaling,SpellTargetRestrictions,SpellProcsPerMinute,SpellXSpellVisual,SkillLine,SkillLineAbility,SkillRaceClassInfo,TradeSkillCategory,SpellReagents,SpellReagentsCurrency,CraftingData,CraftingDataItemQuality,TraitTree,TraitSubTree,TraitNode,TraitNodeEntry,TraitDefinition,TraitDefinitionEffectPoints,TraitEdge,TraitNodeXTraitNodeEntry,PvpTalent,Creature,CreatureDisplayInfo,CreatureModelData,CreatureType,CreatureFamily,CreatureDifficulty,ChrRaces,ChrClasses,ChrSpecialization,SpecSetMember,QuestV2,QuestV2CliTask,QuestObjective,QuestLine,QuestLineXQuest,QuestPOIBlob,QuestPOIPoint,QuestPackageItem,QuestMoneyReward,QuestXP,QuestFactionReward,QuestInfo,QuestSort,Map,MapDifficulty,AreaTable,UiMap,UiMapAssignment,UiMapLink,Faction,CurrencyTypes,Mount,MountCapability,MountTypeXCapability,BattlePetSpecies,Toy,TransmogSet,TransmogSetItem,Achievement,Achievement_Category,Criteria,CriteriaTree"

var tablePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{1,63}$`)

type options struct {
	databaseURL                  string
	product                      string
	version                      string
	tables                       []string
	locales                      []string
	maxRecords                   int
	batchSize                    int
	confirm                      bool
	projectSpells                bool
	projectItems                 bool
	projectExistingItems         bool
	projectExistingQuestPackages bool
	projectItemDetailsOnly       bool
	projectProfessions           bool
	projectCreatures             bool
	projectQuests                bool
	projectPvpTalents            bool
	projectCollections           bool
	download                     bool
}

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

func main() {
	if err := run(); err != nil {
		slog.Error("DB2 import failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	opts, err := parseOptions()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	client := wago.New(wago.Config{})
	if opts.version == "" {
		opts.version, err = client.CurrentBuild(ctx, "ItemSparse", "enUS")
		if err != nil {
			return err
		}
	}
	if !opts.confirm {
		encoded, _ := json.MarshalIndent(map[string]any{"dry_run": true, "build": opts.version, "tables": opts.tables, "locales": opts.locales}, "", "  ")
		fmt.Println(string(encoded))
		return nil
	}
	if opts.download && opts.maxRecords > 0 && (opts.projectSpells || opts.projectItems || opts.projectProfessions ||
		opts.projectCreatures || opts.projectQuests || opts.projectPvpTalents || opts.projectCollections) {
		return errors.New("sampled DB2 downloads cannot be projected; use -max-records=0 for a complete import or disable every projection")
	}
	buildNumber, err := parseBuildNumber(opts.version)
	if err != nil {
		return err
	}
	db, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}
	store := catalogimport.NewStore(db)
	if opts.projectExistingItems {
		ic, resolveErr := existingItemProjectionContext(ctx, db, opts.product, buildNumber)
		if resolveErr != nil {
			return resolveErr
		}
		projected, projectErr := projectItems(ctx, db, ic)
		if projectErr != nil {
			return projectErr
		}
		if observeErr := observeDB2LocalizationArtifactsForTables(ctx, db, ic, []string{"ItemSparse"}); observeErr != nil {
			return observeErr
		}
		slog.Info("existing Item build projected", "build", opts.version, "versions_created", projected)
		return nil
	}
	if opts.projectExistingQuestPackages {
		ic, resolveErr := existingCompleteProjectionContext(ctx, db, opts.product, buildNumber, "db2.questpackageitem")
		if resolveErr != nil {
			return resolveErr
		}
		projected, projectErr := projectQuestRewardPackages(ctx, db, ic)
		if projectErr != nil {
			return projectErr
		}
		slog.Info("existing QuestPackageItem build projected", "build", opts.version, "packages", projected)
		return nil
	}
	releaseID, err := catalogimport.ReleaseIDFromEnvironment()
	if err != nil {
		return err
	}
	ic, err := store.Begin(ctx, opts.product, buildNumber, opts.version, "us", "wago_tools", releaseID, map[string]any{
		"product": opts.product, "tables": opts.tables, "locales": opts.locales,
		"max_records_per_table": opts.maxRecords, "batch_size": opts.batchSize,
	})
	if err != nil {
		return err
	}
	var seen, written int64
	var importErr error
	if opts.download {
		importErr = importTables(ctx, db, client, store, ic, opts, &seen, &written)
	}
	if importErr == nil && opts.projectItemDetailsOnly {
		importErr = projectItemDetails(ctx, db, ic)
	} else if importErr == nil && opts.projectItems && (contains(opts.tables, "ItemSparse") || contains(opts.tables, "Item")) {
		var projected int64
		projected, importErr = projectItems(ctx, db, ic)
		written += projected
	}
	if importErr == nil && contains(opts.tables, "JournalInstance") && contains(opts.tables, "JournalEncounter") {
		importErr = projectJournalEntities(ctx, db, ic)
	}
	if importErr == nil && opts.projectSpells && contains(opts.tables, "SpellName") {
		var projected int64
		projected, importErr = projectSpells(ctx, db, ic)
		written += projected
	}
	if importErr == nil && opts.projectProfessions && contains(opts.tables, "SkillLine") && contains(opts.tables, "SkillLineAbility") {
		var projected int64
		projected, importErr = projectProfessions(ctx, db, ic)
		written += projected
	}
	if importErr == nil && opts.projectCreatures && contains(opts.tables, "Creature") {
		var projected int64
		projected, importErr = projectCreatures(ctx, db, ic)
		written += projected
	}
	if importErr == nil && opts.projectQuests && contains(opts.tables, "QuestV2") {
		var projected int64
		projected, importErr = projectQuests(ctx, db, ic)
		written += projected
	}
	if importErr == nil && opts.projectPvpTalents && contains(opts.tables, "PvpTalent") {
		var projected int64
		projected, importErr = projectPvpTalents(ctx, db, ic)
		written += projected
	}
	if importErr == nil && opts.projectCollections {
		var projected int64
		projected, importErr = projectCollectionsForTables(ctx, db, ic, opts.tables)
		written += projected
	}
	if importErr == nil {
		importErr = observeDB2LocalizationArtifactsForTables(ctx, db, ic, opts.tables)
	}
	status := "SUCCEEDED"
	if importErr != nil {
		status = "FAILED"
	}
	if finishErr := store.Finish(context.WithoutCancel(ctx), ic.RunID, status, seen, written, importErr); finishErr != nil {
		return errors.Join(importErr, finishErr)
	}
	if importErr != nil {
		return importErr
	}
	slog.Info("DB2 import completed", "build", opts.version, "seen", seen, "written", written)
	return nil
}

func observeDB2LocalizationArtifacts(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) error {
	return observeDB2LocalizationArtifactsForTables(ctx, db, ic, nil)
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

func parseOptions() (options, error) {
	var tables, locales string
	opts := options{}
	flag.StringVar(&opts.databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&opts.product, "product", "wow", "game_products slug")
	flag.StringVar(&opts.version, "version", "", "WoW build version; auto-detected when empty")
	flag.StringVar(&tables, "tables", defaultTables, "comma-separated Wago DB2 tables")
	flag.StringVar(&locales, "locales", "en_US,ru_RU", "comma-separated localized variants")
	flag.IntVar(&opts.maxRecords, "max-records", 1000, "maximum records per table; 0 imports all")
	flag.IntVar(&opts.batchSize, "batch-size", 2000, "rows per COPY batch")
	flag.BoolVar(&opts.confirm, "confirm", false, "download and store DB2 rows")
	flag.BoolVar(&opts.projectSpells, "project-spells", true, "project SpellName rows into searchable entities")
	flag.BoolVar(&opts.projectItems, "project-items", true, "project ItemSparse text and Item registry facts into item entities")
	flag.BoolVar(&opts.projectExistingItems, "project-existing-items", false, "project only item entities from an already imported complete build without creating an import run")
	flag.BoolVar(&opts.projectExistingQuestPackages, "project-existing-quest-packages", false, "project only quest reward package entities from an already imported complete build without creating an import run")
	flag.BoolVar(&opts.projectItemDetailsOnly, "project-item-details-only", false, "rebuild typed item details for an already projected build without reprojecting entities")
	flag.BoolVar(&opts.projectProfessions, "project-professions", true, "project professions, recipes, reagents, and outputs")
	flag.BoolVar(&opts.projectCreatures, "project-creatures", true, "project creatures, display models, and taxonomy")
	flag.BoolVar(&opts.projectQuests, "project-quests", true, "project quest registry, objectives, lines, and map POIs")
	flag.BoolVar(&opts.projectPvpTalents, "project-pvp-talents", true, "project PvP talents, specialization ownership, and spell links")
	flag.BoolVar(&opts.projectCollections, "project-collections", true, "project classes, specializations, currencies, mounts, pets, toys, maps, factions, transmogs, and achievements")
	flag.BoolVar(&opts.download, "download", true, "download tables before projection")
	flag.Parse()
	if opts.databaseURL == "" {
		opts.databaseURL = os.Getenv("DATABASE_URL")
	}
	if opts.projectItemDetailsOnly {
		opts.download = false
		opts.projectItems = false
		opts.projectSpells = false
		opts.projectProfessions = false
		opts.projectCreatures = false
		opts.projectQuests = false
		opts.projectPvpTalents = false
		opts.projectCollections = false
	}
	opts.tables = splitList(tables)
	opts.locales = splitList(locales)
	if opts.databaseURL == "" {
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	}
	if (opts.projectExistingItems || opts.projectExistingQuestPackages) && opts.download {
		return options{}, errors.New("project-existing modes require -download=false")
	}
	if opts.projectExistingItems && opts.projectExistingQuestPackages {
		return options{}, errors.New("select only one project-existing mode")
	}
	if !validProduct(opts.product) {
		return options{}, fmt.Errorf("unsupported product %q", opts.product)
	}
	if opts.maxRecords < 0 || opts.batchSize < 100 || opts.batchSize > 10000 {
		return options{}, errors.New("invalid max-records or batch-size")
	}
	for _, table := range opts.tables {
		if !tablePattern.MatchString(table) {
			return options{}, fmt.Errorf("invalid DB2 table %q", table)
		}
	}
	for _, locale := range opts.locales {
		if locale != "en_US" && locale != "ru_RU" {
			return options{}, fmt.Errorf("unsupported locale %q", locale)
		}
	}
	return opts, nil
}

func validProduct(product string) bool {
	switch product {
	case "wow", "wow_classic", "wow_classic_era", "wow_classic_hardcore":
		return true
	default:
		return false
	}
}

func isLocalized(table string) bool {
	switch table {
	case "ItemSparse", "ItemSearchName", "Spell", "SpellName", "SpellRange", "TraitDefinition",
		"ItemClass", "ItemSubClass", "QuestV2CliTask", "QuestObjective", "QuestLine",
		"QuestInfo", "QuestSort", "ItemSet", "ItemNameDescription", "ItemLimitCategory",
		"JournalInstance", "JournalEncounter", "SkillLine", "TradeSkillCategory", "Creature",
		"CreatureType", "CreatureFamily", "ChrRaces", "ChrClasses", "ChrSpecialization",
		"Map", "AreaTable", "UiMap", "Faction", "CurrencyTypes", "Mount", "BattlePetSpecies",
		"Toy", "TransmogSet", "Achievement", "Achievement_Category", "Criteria", "PvpTalent":
		return true
	default:
		return false
	}
}

func splitList(value string) []string {
	result := make([]string, 0)
	for part := range strings.SplitSeq(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func parseBuildNumber(version string) (int, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	value, err := strconv.Atoi(parts[3])
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	return value, nil
}

func contains(values []string, expected string) bool {
	return slices.Contains(values, expected)
}

func projectSpells(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_spells ON COMMIT DROP AS
			SELECT names.row_id AS external_id, names.source_url,names.source_artifact_id,
				names.payload->>'Name_lang' AS name_en,
				COALESCE(NULLIF(names_ru.payload->>'Name_lang',''),names.payload->>'Name_lang') AS name_ru,
				COALESCE(text_en.payload->>'Description_lang','') AS description_en,
				COALESCE(NULLIF(text_ru.payload->>'Description_lang',''),text_en.payload->>'Description_lang','') AS description_ru,
				COALESCE(text_en.payload->>'NameSubtext_lang','') AS subtext_en,
				COALESCE(NULLIF(text_ru.payload->>'NameSubtext_lang',''),text_en.payload->>'NameSubtext_lang','') AS subtext_ru,
				COALESCE(text_en.payload->>'AuraDescription_lang','') AS aura_en,
				COALESCE(NULLIF(text_ru.payload->>'AuraDescription_lang',''),text_en.payload->>'AuraDescription_lang','') AS aura_ru,
				names.payload AS db2_en,COALESCE(names_ru.payload,names.payload) AS db2_ru
			FROM catalog_db2_rows names
			LEFT JOIN catalog_db2_rows names_ru ON names_ru.build_id=names.build_id AND names_ru.table_name='SpellName' AND names_ru.locale='ru_RU' AND names_ru.row_id=names.row_id
			LEFT JOIN catalog_db2_rows text_en ON text_en.build_id=names.build_id AND text_en.table_name='Spell' AND text_en.locale='en_US' AND text_en.row_id=names.row_id
			LEFT JOIN catalog_db2_rows text_ru ON text_ru.build_id=names.build_id AND text_ru.table_name='Spell' AND text_ru.locale='ru_RU' AND text_ru.row_id=names.row_id
			WHERE names.build_id=$1 AND names.table_name='SpellName' AND names.locale='en_US'
			  AND NULLIF(BTRIM(names.payload->>'Name_lang'),'') IS NOT NULL`, ic.BuildID); err != nil {
			return fmt.Errorf("stage spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			ALTER TABLE projected_spells ADD COLUMN payload_en JSONB;
			UPDATE projected_spells SET payload_en=jsonb_build_object(
				'id',external_id,'name',name_en,'description',description_en,'subtext',subtext_en,'aura_description',aura_en,'db2',db2_en);
			ALTER TABLE projected_spells ADD COLUMN content_hash BYTEA;
			UPDATE projected_spells SET content_hash=digest(convert_to(payload_en::text,'UTF8'),'sha256');
			CREATE UNIQUE INDEX projected_spells_id_idx ON projected_spells(external_id)`); err != nil {
			return fmt.Errorf("prepare spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities (product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'spell',external_id,COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'spell-'||external_id),$3,$3
			FROM projected_spells
			ON CONFLICT (product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert spell entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions (entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.payload_en,p.source_url,$3,p.source_artifact_id
			FROM projected_spells p JOIN game_entities e ON e.product_id=$1 AND e.entity_type='spell' AND e.external_id=p.external_id
			WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`, ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("upsert spell versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_spell_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_spells p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='spell' AND e.external_id=p.external_id
			JOIN game_entity_versions v ON v.entity_id=e.id AND v.build_id=$2 AND v.content_hash=p.content_hash`, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("map projected spell versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations (version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'spell-'||external_id),
				name_en,description_en,jsonb_build_object('id',external_id,'name',name_en,'description',description_en,'subtext',subtext_en,'aura_description',aura_en,'db2',db2_en)
			FROM projected_spell_versions
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_ru,'[^[:alnum:]]+','-','g'))),''),'spell-'||external_id),
				name_ru,description_ru,jsonb_build_object('id',external_id,'name',name_ru,'description',description_ru,'subtext',subtext_ru,'aura_description',aura_ru,'db2',db2_ru)
			FROM projected_spell_versions
			ON CONFLICT (version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize projected spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_spell_versions p
			WHERE e.id=p.entity_id AND COALESCE((SELECT b.build_number FROM game_entity_versions current_version JOIN game_builds b ON b.id=current_version.build_id WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT b.build_number FROM game_builds b WHERE b.id=$1)`, ic.BuildID); err != nil {
			return fmt.Errorf("activate projected spells: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectProfessions(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_professions ON COMMIT DROP AS
			SELECT skill.row_id AS external_id,skill.payload AS db2_en,
				COALESCE(skill_ru.payload,skill.payload) AS db2_ru,skill.content_hash,skill.source_url,skill.source_artifact_id
			FROM catalog_db2_rows skill
			LEFT JOIN catalog_db2_rows skill_ru ON skill_ru.build_id=skill.build_id
				AND skill_ru.table_name='SkillLine' AND skill_ru.locale='ru_RU' AND skill_ru.row_id=skill.row_id
			WHERE skill.build_id=$1 AND skill.table_name='SkillLine' AND skill.locale='en_US'
			  AND NULLIF(BTRIM(skill.payload->>'DisplayName_lang'),'') IS NOT NULL
			  AND (
				COALESCE(NULLIF(skill.payload->>'CategoryID','')::int,0)=11
				OR skill.row_id IN (129,185,356,2851)
				OR EXISTS (
				SELECT 1 FROM catalog_db2_rows ability
				WHERE ability.build_id=skill.build_id AND ability.table_name='SkillLineAbility' AND ability.locale='en_US'
				  AND NULLIF(ability.payload->>'SkillLine','')::bigint=skill.row_id
				  AND COALESCE(NULLIF(ability.payload->>'TradeSkillCategoryID','')::int,0)>0
				)
			  );
			CREATE UNIQUE INDEX projected_professions_id_idx ON projected_professions(external_id)`, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("stage professions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'profession',external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'DisplayName_lang','[^[:alnum:]]+','-','g'))),''),'profession-'||external_id),$3,$3
			FROM projected_professions
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`,
			ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert profession entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.db2_en,p.source_url,$3,p.source_artifact_id
			FROM projected_professions p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='profession' AND e.external_id=p.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`,
			ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("version professions: %w", err)
		}
		projected += command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_profession_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_professions p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='profession' AND e.external_id=p.external_id
			JOIN game_entity_versions v ON v.entity_id=e.id AND v.build_id=$2 AND v.content_hash=p.content_hash;
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'DisplayName_lang','[^[:alnum:]]+','-','g'))),''),'profession-'||external_id),
				db2_en->>'DisplayName_lang',COALESCE(db2_en->>'Description_lang',''),db2_en FROM projected_profession_versions
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_ru->>'DisplayName_lang','[^[:alnum:]]+','-','g'))),''),'profession-'||external_id),
				COALESCE(NULLIF(db2_ru->>'DisplayName_lang',''),db2_en->>'DisplayName_lang'),
				COALESCE(NULLIF(db2_ru->>'Description_lang',''),db2_en->>'Description_lang',''),db2_ru FROM projected_profession_versions
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes;
			INSERT INTO catalog_professions(version_id,skill_line_id,parent_skill_line_id,category_id,parent_tier_index,icon_file_data_id,can_link,flags)
			SELECT version_id,external_id,NULLIF(COALESCE(NULLIF(db2_en->>'ParentSkillLineID','')::int,0),0),COALESCE(NULLIF(db2_en->>'CategoryID','')::int,0),
				NULLIF(db2_en->>'ParentTierIndex','')::int,NULLIF(COALESCE(NULLIF(db2_en->>'SpellIconFileID','')::bigint,0),0),
				COALESCE(NULLIF(db2_en->>'CanLink','')::int,0)<>0,COALESCE(NULLIF(db2_en->>'Flags','')::bigint,0)
			FROM projected_profession_versions
			ON CONFLICT(version_id) DO UPDATE SET parent_skill_line_id=EXCLUDED.parent_skill_line_id,category_id=EXCLUDED.category_id,
				parent_tier_index=EXCLUDED.parent_tier_index,icon_file_data_id=EXCLUDED.icon_file_data_id,can_link=EXCLUDED.can_link,flags=EXCLUDED.flags;
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_profession_versions p
			WHERE e.id=p.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$2)`, pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("project professions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_trade_skill_categories(build_id,external_id,parent_external_id,skill_line_id,order_index,flags)
			SELECT row.build_id,row.row_id,NULLIF(COALESCE(NULLIF(row.payload->>'ParentTradeSkillCategoryID','')::int,0),0),
				NULLIF(row.payload->>'SkillLineID','')::int,COALESCE(NULLIF(row.payload->>'OrderIndex','')::int,0),COALESCE(NULLIF(row.payload->>'Flags','')::bigint,0)
			FROM catalog_db2_rows row WHERE row.build_id=$1 AND row.table_name='TradeSkillCategory' AND row.locale='en_US'
			  AND COALESCE(NULLIF(row.payload->>'SkillLineID','')::int,0)>0
			ON CONFLICT(build_id,external_id) DO UPDATE SET parent_external_id=EXCLUDED.parent_external_id,
				skill_line_id=EXCLUDED.skill_line_id,order_index=EXCLUDED.order_index,flags=EXCLUDED.flags;
			INSERT INTO catalog_trade_skill_category_localizations(category_id,locale,name)
			SELECT category.id,row.locale,row.payload->>'Name_lang'
			FROM catalog_db2_rows row JOIN catalog_trade_skill_categories category
			  ON category.build_id=row.build_id AND category.external_id=row.row_id
			WHERE row.build_id=$1 AND row.table_name='TradeSkillCategory' AND row.locale IN ('en_US','ru_RU')
			  AND NULLIF(BTRIM(row.payload->>'Name_lang'),'') IS NOT NULL
			ON CONFLICT(category_id,locale) DO UPDATE SET name=EXCLUDED.name`, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project trade skill categories: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_recipes ON COMMIT DROP AS
			WITH recipe_sources AS (
				SELECT (ability.payload->>'Spell')::bigint AS external_id,
					jsonb_build_object(
						'SpellID',(ability.payload->>'Spell')::bigint,
						'SkillLineIDs',jsonb_agg(DISTINCT (ability.payload->>'SkillLine')::bigint
							ORDER BY (ability.payload->>'SkillLine')::bigint),
						'TradeSkillCategoryIDs',jsonb_agg(DISTINCT (ability.payload->>'TradeSkillCategoryID')::bigint
							ORDER BY (ability.payload->>'TradeSkillCategoryID')::bigint)
					) AS db2,
					MIN(ability.source_url) AS source_url,
					MIN(ability.source_artifact_id::text)::uuid AS source_artifact_id
				FROM catalog_db2_rows ability
				JOIN projected_profession_versions profession
					ON profession.external_id=(ability.payload->>'SkillLine')::bigint
				WHERE ability.build_id=$2 AND ability.table_name='SkillLineAbility' AND ability.locale='en_US'
				  AND (COALESCE(NULLIF(ability.payload->>'TradeSkillCategoryID','')::int,0)>0 OR (
					NOT EXISTS (SELECT 1 FROM catalog_db2_rows category
						WHERE category.build_id=$2 AND category.table_name='TradeSkillCategory')
					AND EXISTS (SELECT 1 FROM catalog_db2_rows reagents
						WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
						  AND COALESCE(NULLIF(reagents.payload->>'SpellID','')::bigint,0)=(ability.payload->>'Spell')::bigint)
				  ))
				  AND COALESCE(NULLIF(ability.payload->>'Spell','')::bigint,0)>0
				GROUP BY (ability.payload->>'Spell')::bigint
			)
			SELECT source.external_id,source.db2,
				jsonb_build_object('kind','recipe','spell_id',source.external_id,'db2',source.db2) AS payload,
				digest(convert_to(jsonb_build_object('kind','recipe','spell_id',source.external_id,'db2',source.db2)::text,'UTF8'),'sha256') AS content_hash,
				source.source_url,source.source_artifact_id,spell.id AS spell_entity_id,
				spell.latest_version_id AS spell_version_id,spell.canonical_slug
			FROM recipe_sources source
			JOIN game_entities spell ON spell.product_id=$1 AND spell.entity_type='spell'
				AND spell.external_id=source.external_id AND spell.deleted_at IS NULL
			JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id
				AND spell_version.build_id=$2;
			CREATE UNIQUE INDEX projected_recipes_id_idx ON projected_recipes(external_id);

			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
			SELECT $1,$4,'recipe',external_id,canonical_slug,$2,$2,NULL,now()
			FROM projected_recipes
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET
				namespace_id=EXCLUDED.namespace_id,canonical_slug=EXCLUDED.canonical_slug,
				last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

			INSERT INTO game_entity_versions(
				entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT entity.id,$2,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,
				recipe.content_hash,recipe.payload,recipe.source_url,$3,recipe.source_artifact_id
			FROM projected_recipes recipe
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type='recipe'
				AND entity.external_id=recipe.external_id
			WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2 AND old.content_hash=recipe.content_hash);

			CREATE TEMP TABLE projected_recipe_versions ON COMMIT DROP AS
			SELECT recipe.*,entity.id AS entity_id,version.id AS version_id
			FROM projected_recipes recipe
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type='recipe'
				AND entity.external_id=recipe.external_id
			JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
				WHERE candidate.entity_id=entity.id AND candidate.build_id=$2
					AND candidate.content_hash=recipe.content_hash
				ORDER BY candidate.revision DESC LIMIT 1) version ON true;

			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT recipe.version_id,localized.locale,localized.slug,localized.name,localized.description,
				localized.attributes || jsonb_build_object('source_spell_version_id',recipe.spell_version_id)
			FROM projected_recipe_versions recipe
			JOIN game_entity_localizations localized ON localized.version_id=recipe.spell_version_id
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
				description=EXCLUDED.description,attributes=EXCLUDED.attributes;

			UPDATE game_entities entity SET latest_version_id=recipe.version_id,updated_at=now()
			FROM projected_recipe_versions recipe
			WHERE entity.id=recipe.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$2);

			DELETE FROM catalog_profession_recipes link USING game_entity_versions version,game_entities entity
			WHERE link.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipe_reagents reagent USING game_entity_versions version,game_entities entity
			WHERE reagent.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipe_currencies currency USING game_entity_versions version,game_entities entity
			WHERE currency.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipe_outputs output USING game_entity_versions version,game_entities entity
			WHERE output.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipes recipe USING game_entity_versions version,game_entities entity
			WHERE recipe.version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell'`,
			pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID, ic.SnapshotID, ic.NamespaceID); err != nil {
			return fmt.Errorf("project recipe entities: %w", err)
		}
		command, err = tx.Exec(ctx, `
			WITH abilities AS (
				SELECT row.payload FROM catalog_db2_rows row
				WHERE row.build_id=$2 AND row.table_name='SkillLineAbility' AND row.locale='en_US'
				  AND (COALESCE(NULLIF(row.payload->>'TradeSkillCategoryID','')::int,0)>0 OR (
					NOT EXISTS (SELECT 1 FROM catalog_db2_rows category
						WHERE category.build_id=$2 AND category.table_name='TradeSkillCategory')
					AND EXISTS (SELECT 1 FROM catalog_db2_rows reagents
						WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
						  AND COALESCE(NULLIF(reagents.payload->>'SpellID','')::bigint,0)=(row.payload->>'Spell')::bigint)
				  ))
			), mapped AS (
				SELECT profession_version.version_id AS profession_version_id,recipe_version.version_id AS recipe_version_id,
					category.id AS category_id,ability.payload
				FROM abilities ability
				JOIN projected_profession_versions profession_version ON profession_version.external_id=(ability.payload->>'SkillLine')::bigint
				JOIN projected_recipe_versions recipe_version ON recipe_version.external_id=(ability.payload->>'Spell')::bigint
				LEFT JOIN catalog_trade_skill_categories category ON category.build_id=$2 AND category.external_id=NULLIF(ability.payload->>'TradeSkillCategoryID','')::int
			)
			INSERT INTO catalog_recipes(version_id,spell_id,source_spell_version_id)
			SELECT DISTINCT mapped.recipe_version_id,(mapped.payload->>'Spell')::int,spell_version.id
			FROM mapped
			JOIN game_entities spell ON spell.product_id=$1 AND spell.entity_type='spell'
				AND spell.external_id=(mapped.payload->>'Spell')::bigint
			JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id
				AND spell_version.build_id=$2
			ON CONFLICT(version_id) DO UPDATE SET spell_id=EXCLUDED.spell_id,
				source_spell_version_id=EXCLUDED.source_spell_version_id;
			WITH abilities AS (
				SELECT row.payload,row.source_artifact_id FROM catalog_db2_rows row
				WHERE row.build_id=$2 AND row.table_name='SkillLineAbility' AND row.locale='en_US'
				  AND (COALESCE(NULLIF(row.payload->>'TradeSkillCategoryID','')::int,0)>0 OR (
					NOT EXISTS (SELECT 1 FROM catalog_db2_rows category
						WHERE category.build_id=$2 AND category.table_name='TradeSkillCategory')
					AND EXISTS (SELECT 1 FROM catalog_db2_rows reagents
						WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
						  AND COALESCE(NULLIF(reagents.payload->>'SpellID','')::bigint,0)=(row.payload->>'Spell')::bigint)
				  ))
			), mapped AS (
				SELECT profession_version.version_id AS profession_version_id,recipe.version_id AS recipe_version_id,
					category.id AS category_id,ability.payload,ability.source_artifact_id
				FROM abilities ability
				JOIN projected_profession_versions profession_version ON profession_version.external_id=(ability.payload->>'SkillLine')::bigint
				JOIN projected_recipe_versions recipe ON recipe.external_id=(ability.payload->>'Spell')::bigint
				LEFT JOIN catalog_trade_skill_categories category ON category.build_id=$2 AND category.external_id=NULLIF(ability.payload->>'TradeSkillCategoryID','')::int
			)
			INSERT INTO catalog_profession_recipes(profession_version_id,recipe_version_id,trade_skill_category_id,min_skill_rank,trivial_rank_low,trivial_rank_high,acquire_method,supercedes_spell_id,flags,source_artifact_id)
			SELECT profession_version_id,recipe_version_id,min(category_id),min(COALESCE(NULLIF(payload->>'MinSkillLineRank','')::int,0)),
				min(COALESCE(NULLIF(payload->>'TrivialSkillLineRankLow','')::int,0)),max(COALESCE(NULLIF(payload->>'TrivialSkillLineRankHigh','')::int,0)),
				min(COALESCE(NULLIF(payload->>'AcquireMethod','')::int,0)),max(NULLIF(payload->>'SupercedesSpell','')::int),bit_or(COALESCE(NULLIF(payload->>'Flags','')::bigint,0)),source_artifact_id
			FROM mapped WHERE recipe_version_id IS NOT NULL
			GROUP BY profession_version_id,recipe_version_id,source_artifact_id
			ON CONFLICT(profession_version_id,recipe_version_id) DO UPDATE SET trade_skill_category_id=EXCLUDED.trade_skill_category_id,
				min_skill_rank=EXCLUDED.min_skill_rank,trivial_rank_low=EXCLUDED.trivial_rank_low,trivial_rank_high=EXCLUDED.trivial_rank_high,
				acquire_method=EXCLUDED.acquire_method,supercedes_spell_id=EXCLUDED.supercedes_spell_id,flags=EXCLUDED.flags,
				source_artifact_id=EXCLUDED.source_artifact_id`, pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID)
		if err != nil {
			return fmt.Errorf("project profession recipes: %w", err)
		}
		projected += command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_recipe_reagents(recipe_version_id,slot,item_entity_id,item_external_id,quantity,recraft_quantity,source_type,source_artifact_id)
			SELECT recipe.version_id,slot.slot,item.id,(reagents.payload->>format('Reagent_%s',slot.slot))::int,
				(reagents.payload->>format('ReagentCount_%s',slot.slot))::int,
				COALESCE(NULLIF(reagents.payload->>format('ReagentReCraftCount_%s',slot.slot),'')::int,0),
				COALESCE(NULLIF(reagents.payload->>format('ReagentSource_%s',slot.slot),'')::int,0),reagents.source_artifact_id
			FROM catalog_db2_rows reagents CROSS JOIN generate_series(0,7) AS slot(slot)
			JOIN projected_recipe_versions recipe ON recipe.external_id=(reagents.payload->>'SpellID')::bigint
			JOIN catalog_recipes typed_recipe ON typed_recipe.version_id=recipe.version_id
			LEFT JOIN game_entities item ON item.product_id=$1 AND item.entity_type='item'
			  AND item.external_id=(reagents.payload->>format('Reagent_%s',slot.slot))::bigint
			WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
			  AND COALESCE(NULLIF(reagents.payload->>format('Reagent_%s',slot.slot),'')::int,0)>0
			  AND COALESCE(NULLIF(reagents.payload->>format('ReagentCount_%s',slot.slot),'')::int,0)>0
			ON CONFLICT(recipe_version_id,slot) DO UPDATE SET item_entity_id=EXCLUDED.item_entity_id,item_external_id=EXCLUDED.item_external_id,
				quantity=EXCLUDED.quantity,recraft_quantity=EXCLUDED.recraft_quantity,source_type=EXCLUDED.source_type,
				source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_recipe_currencies(recipe_version_id,currency_external_id,quantity,recraft_quantity,order_index,source_artifact_id)
			SELECT recipe.version_id,(currency.payload->>'CurrencyTypesID')::int,(currency.payload->>'CurrencyCount')::int,
				COALESCE(NULLIF(currency.payload->>'OverrideRecraftCurrencyCount','')::int,0),COALESCE(NULLIF(currency.payload->>'OrderSource','')::int,0),currency.source_artifact_id
			FROM catalog_db2_rows currency
			JOIN projected_recipe_versions recipe ON recipe.external_id=(currency.payload->>'SpellID')::bigint
			JOIN catalog_recipes typed_recipe ON typed_recipe.version_id=recipe.version_id
			WHERE currency.build_id=$2 AND currency.table_name='SpellReagentsCurrency' AND currency.locale='en_US'
			  AND COALESCE(NULLIF(currency.payload->>'CurrencyTypesID','')::int,0)>0 AND COALESCE(NULLIF(currency.payload->>'CurrencyCount','')::int,0)>0
			ON CONFLICT(recipe_version_id,currency_external_id) DO UPDATE SET quantity=EXCLUDED.quantity,recraft_quantity=EXCLUDED.recraft_quantity,
				order_index=EXCLUDED.order_index,source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_recipe_outputs(recipe_version_id,item_entity_id,item_external_id,source,source_artifact_id)
			SELECT DISTINCT recipe.version_id,item.id,(effect.payload->>'EffectItemType')::int,'spell_effect',effect.source_artifact_id
			FROM catalog_db2_rows effect
			JOIN projected_recipe_versions recipe ON recipe.external_id=(effect.payload->>'SpellID')::bigint
			JOIN catalog_recipes typed_recipe ON typed_recipe.version_id=recipe.version_id
			LEFT JOIN game_entities item ON item.product_id=$1 AND item.entity_type='item' AND item.external_id=(effect.payload->>'EffectItemType')::bigint
			WHERE effect.build_id=$2 AND effect.table_name='SpellEffect' AND effect.locale='en_US'
			  AND COALESCE(NULLIF(effect.payload->>'EffectItemType','')::int,0)>0
			ON CONFLICT(recipe_version_id,item_external_id,source) DO UPDATE SET item_entity_id=EXCLUDED.item_entity_id,
				source_artifact_id=EXCLUDED.source_artifact_id;

			UPDATE catalog_item_acquisition_sources acquisition
			SET source_entity_id=recipe.id
			FROM game_entity_versions item_version,game_entities recipe
			WHERE acquisition.version_id=item_version.id AND item_version.build_id=$2
			  AND acquisition.source_type='crafting_recipe'
			  AND recipe.product_id=$1 AND recipe.entity_type='recipe'
			  AND recipe.external_id=acquisition.source_id AND recipe.deleted_at IS NULL`,
			pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("project recipe components: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectCreatures(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_creatures ON COMMIT DROP AS
			SELECT creature.row_id AS external_id,creature.payload AS db2_en,
				COALESCE(creature_ru.payload,creature.payload) AS db2_ru,creature.content_hash,creature.source_url,creature.source_artifact_id
			FROM catalog_db2_rows creature
			LEFT JOIN catalog_db2_rows creature_ru ON creature_ru.build_id=creature.build_id
				AND creature_ru.table_name='Creature' AND creature_ru.locale='ru_RU' AND creature_ru.row_id=creature.row_id
			WHERE creature.build_id=$1 AND creature.table_name='Creature' AND creature.locale='en_US'
			  AND NULLIF(BTRIM(creature.payload->>'Name_lang'),'') IS NOT NULL;
			CREATE UNIQUE INDEX projected_creatures_id_idx ON projected_creatures(external_id)`, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("stage creatures: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'creature',external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'Name_lang','[^[:alnum:]]+','-','g'))),''),'creature-'||external_id),$3,$3
			FROM projected_creatures
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`,
			ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert creature entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.db2_en,p.source_url,$3,p.source_artifact_id
			FROM projected_creatures p JOIN game_entities e ON e.product_id=$1 AND e.entity_type='creature' AND e.external_id=p.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`,
			ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("version creatures: %w", err)
		}
		projected += command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_creature_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_creatures p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='creature' AND e.external_id=p.external_id
			JOIN game_entity_versions v ON v.entity_id=e.id AND v.build_id=$2 AND v.content_hash=p.content_hash;
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'Name_lang','[^[:alnum:]]+','-','g'))),''),'creature-'||external_id),
				db2_en->>'Name_lang',COALESCE(db2_en->>'Title_lang',''),db2_en FROM projected_creature_versions
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_ru->>'Name_lang','[^[:alnum:]]+','-','g'))),''),'creature-'||external_id),
				COALESCE(NULLIF(db2_ru->>'Name_lang',''),db2_en->>'Name_lang'),COALESCE(NULLIF(db2_ru->>'Title_lang',''),db2_en->>'Title_lang',''),db2_ru
			FROM projected_creature_versions
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes;
			INSERT INTO catalog_creatures(version_id,classification_id,creature_type_id,creature_family_id,start_animation_state_id)
			SELECT version_id,COALESCE(NULLIF(db2_en->>'Classification','')::int,0),COALESCE(NULLIF(db2_en->>'CreatureType','')::int,0),
				COALESCE(NULLIF(db2_en->>'CreatureFamily','')::int,0),COALESCE(NULLIF(db2_en->>'StartAnimState','')::int,0)
			FROM projected_creature_versions ON CONFLICT(version_id) DO UPDATE SET classification_id=EXCLUDED.classification_id,
				creature_type_id=EXCLUDED.creature_type_id,creature_family_id=EXCLUDED.creature_family_id,start_animation_state_id=EXCLUDED.start_animation_state_id;
			INSERT INTO catalog_creature_displays(version_id,slot,display_external_id,probability,source_artifact_id)
			SELECT version_id,slot.slot,(db2_en->>format('DisplayID_%s',slot.slot))::int,
				GREATEST(0,LEAST(1,COALESCE(NULLIF(db2_en->>format('DisplayProbability_%s',slot.slot),'')::real,0))),
				source_artifact_id
			FROM projected_creature_versions CROSS JOIN generate_series(0,3) AS slot(slot)
			WHERE COALESCE(NULLIF(db2_en->>format('DisplayID_%s',slot.slot),'')::int,0)>0
			ON CONFLICT(version_id,slot) DO UPDATE SET display_external_id=EXCLUDED.display_external_id,
				probability=EXCLUDED.probability,source_artifact_id=EXCLUDED.source_artifact_id;
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_creature_versions p
			WHERE e.id=p.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$2)`, pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("project creatures: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_creature_display_info(build_id,external_id,model_external_id,portrait_file_data_id,texture_file_data_id,scale,alpha,gender,flags,source_artifact_id)
			SELECT row.build_id,row.row_id,COALESCE(NULLIF(row.payload->>'ModelID','')::int,0),
				NULLIF(COALESCE(NULLIF(row.payload->>'PortraitTextureFileDataID','')::bigint,0),0),
				NULLIF(COALESCE(NULLIF(row.payload->>'TextureVariationFileDataID_0','')::bigint,0),0),
				GREATEST(COALESCE(NULLIF(row.payload->>'CreatureModelScale','')::real,1),0.0001),
				GREATEST(0,LEAST(255,COALESCE(NULLIF(row.payload->>'CreatureModelAlpha','')::int,255))),NULLIF(row.payload->>'Gender','')::smallint,
				COALESCE(NULLIF(row.payload->>'Flags','')::bigint,0),row.source_artifact_id
			FROM catalog_db2_rows row WHERE row.build_id=$1 AND row.table_name='CreatureDisplayInfo' AND row.locale='en_US'
			  AND COALESCE(NULLIF(row.payload->>'ModelID','')::int,0)>0
			ON CONFLICT(build_id,external_id) DO UPDATE SET model_external_id=EXCLUDED.model_external_id,portrait_file_data_id=EXCLUDED.portrait_file_data_id,
				texture_file_data_id=EXCLUDED.texture_file_data_id,scale=EXCLUDED.scale,alpha=EXCLUDED.alpha,gender=EXCLUDED.gender,flags=EXCLUDED.flags,
				source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_creature_models(build_id,external_id,file_data_id,flags,walk_speed,run_speed,collision_width,collision_height,model_scale,source_artifact_id)
			SELECT row.build_id,row.row_id,(row.payload->>'FileDataID')::bigint,COALESCE(NULLIF(row.payload->>'Flags','')::bigint,0),
				NULLIF(row.payload->>'WalkSpeed','')::real,NULLIF(row.payload->>'RunSpeed','')::real,NULLIF(row.payload->>'CollisionWidth','')::real,
				NULLIF(row.payload->>'CollisionHeight','')::real,NULLIF(row.payload->>'ModelScale','')::real,row.source_artifact_id
			FROM catalog_db2_rows row WHERE row.build_id=$1 AND row.table_name='CreatureModelData' AND row.locale='en_US'
			  AND COALESCE(NULLIF(row.payload->>'FileDataID','')::bigint,0)>0
			ON CONFLICT(build_id,external_id) DO UPDATE SET file_data_id=EXCLUDED.file_data_id,flags=EXCLUDED.flags,walk_speed=EXCLUDED.walk_speed,
				run_speed=EXCLUDED.run_speed,collision_width=EXCLUDED.collision_width,collision_height=EXCLUDED.collision_height,
				model_scale=EXCLUDED.model_scale,source_artifact_id=EXCLUDED.source_artifact_id`,
			pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project creature display data: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_creature_taxa(build_id,taxon_type,external_id,icon_file_data_id,attributes,source_artifact_id)
			SELECT build_id,'type',row_id,NULL,payload,source_artifact_id FROM catalog_db2_rows WHERE build_id=$1 AND table_name='CreatureType' AND locale='en_US'
			UNION ALL
			SELECT build_id,'family',row_id,NULLIF(COALESCE(NULLIF(payload->>'IconFileID','')::bigint,0),0),payload,source_artifact_id FROM catalog_db2_rows
			WHERE build_id=$1 AND table_name='CreatureFamily' AND locale='en_US'
			ON CONFLICT(build_id,taxon_type,external_id) DO UPDATE SET icon_file_data_id=EXCLUDED.icon_file_data_id,
				attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_creature_taxon_localizations(build_id,taxon_type,external_id,locale,name)
			SELECT build_id,CASE table_name WHEN 'CreatureType' THEN 'type' ELSE 'family' END,row_id,locale,payload->>'Name_lang'
			FROM catalog_db2_rows WHERE build_id=$1 AND table_name IN ('CreatureType','CreatureFamily') AND locale IN ('en_US','ru_RU')
			  AND NULLIF(BTRIM(payload->>'Name_lang'),'') IS NOT NULL
			ON CONFLICT(build_id,taxon_type,external_id,locale) DO UPDATE SET name=EXCLUDED.name;
			INSERT INTO catalog_creature_difficulties(version_id,difficulty_row_id,faction_template_id,content_tuning_id,flags,source_artifact_id)
			SELECT creature.latest_version_id,row.row_id,COALESCE(NULLIF(row.payload->>'FactionTemplateID','')::int,0),
				COALESCE(NULLIF(row.payload->>'ContentTuningID','')::int,0),row.payload,row.source_artifact_id
			FROM catalog_db2_rows row JOIN game_entities creature ON creature.product_id=$2 AND creature.entity_type='creature'
			  AND creature.external_id=(row.payload->>'CreatureID')::bigint
			WHERE row.build_id=$1 AND row.table_name='CreatureDifficulty' AND row.locale='en_US'
			ON CONFLICT(version_id,difficulty_row_id) DO UPDATE SET faction_template_id=EXCLUDED.faction_template_id,
				content_tuning_id=EXCLUDED.content_tuning_id,flags=EXCLUDED.flags,
				source_artifact_id=EXCLUDED.source_artifact_id`, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID); err != nil {
			return fmt.Errorf("project creature taxonomy: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectQuests(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		command, err := tx.Exec(ctx, `
			INSERT INTO catalog_quest_registry(build_id,quest_id,unique_bit_flag,ui_details_theme_id,has_client_task,enrichment_status)
			SELECT $1,quest_id,MAX(unique_bit_flag),NULLIF(MAX(theme_id),0),BOOL_OR(has_task),
				CASE WHEN BOOL_OR(has_task) THEN 'client_task' ELSE 'registry_only' END
			FROM (
				SELECT row_id AS quest_id,COALESCE(NULLIF(payload->>'UniqueBitFlag','')::bigint,0) AS unique_bit_flag,
					COALESCE(NULLIF(payload->>'UiQuestDetailsThemeID','')::int,0) AS theme_id,false AS has_task
				FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestV2' AND locale='en_US'
				UNION ALL SELECT row_id,COALESCE(NULLIF(payload->>'UniqueBitFlag','')::bigint,0),0,true
				FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestV2CliTask' AND locale='en_US'
				UNION ALL SELECT (payload->>'QuestID')::bigint,0,0,false FROM catalog_db2_rows
				WHERE build_id=$1 AND table_name IN ('QuestObjective','QuestLineXQuest','QuestPOIBlob') AND locale='en_US'
				  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
			) quests GROUP BY quest_id
			ON CONFLICT(build_id,quest_id) DO UPDATE SET unique_bit_flag=EXCLUDED.unique_bit_flag,
				ui_details_theme_id=EXCLUDED.ui_details_theme_id,has_client_task=EXCLUDED.has_client_task,
				enrichment_status=CASE WHEN catalog_quest_registry.enrichment_status='blizzard_api' THEN 'blizzard_api' ELSE EXCLUDED.enrichment_status END`,
			ic.BuildID)
		if err != nil {
			return fmt.Errorf("project quest registry: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, questDetailsProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project quest details: %w", err)
		}
		if _, err := tx.Exec(ctx, questEntitiesProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID, ic.NamespaceID, ic.SnapshotID); err != nil {
			return fmt.Errorf("project named quest entities: %w", err)
		}
		if _, err := tx.Exec(ctx, questPackageEntitiesProjectionSQL, pgx.QueryExecModeSimpleProtocol,
			ic.BuildID, ic.ProductID, ic.NamespaceID); err != nil {
			return fmt.Errorf("project quest reward package entities: %w", err)
		}
		return nil
	})
	return projected, err
}

const questDetailsProjectionSQL = `
	INSERT INTO catalog_quest_localizations(build_id,quest_id,locale,title,bullet_text,source)
	SELECT build_id,row_id,locale,COALESCE(payload->>'QuestTitle_lang',''),COALESCE(payload->>'BulletText_lang',''),'db2_client_task'
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='QuestV2CliTask' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'QuestTitle_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,quest_id,locale) DO UPDATE SET title=EXCLUDED.title,bullet_text=EXCLUDED.bullet_text,
		source=CASE WHEN catalog_quest_localizations.source='blizzard_api' THEN 'blizzard_api' ELSE EXCLUDED.source END;

	INSERT INTO catalog_quest_details(build_id,quest_id,quest_info_id,content_tuning_id,covenant_id,start_item_id,
		breadcrumb_quest_id,condition_id,world_state_expression_id,class_mask,race_mask_0,race_mask_1,flags)
	SELECT build_id,row_id,NULLIF(COALESCE(NULLIF(payload->>'QuestInfoID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'ContentTuningID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'CovenantID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'StartItem','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'BreadCrumbID','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'ConditionID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'WorldStateExpressionID','')::int,0),0),
		COALESCE(NULLIF(payload->>'FiltClasses','')::bigint,0),
		COALESCE(NULLIF(payload->>'FiltRaceMasks_0','')::bigint,0),COALESCE(NULLIF(payload->>'FiltRaceMasks_1','')::bigint,0),payload
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestV2CliTask' AND locale='en_US'
	ON CONFLICT(build_id,quest_id) DO UPDATE SET quest_info_id=EXCLUDED.quest_info_id,
		content_tuning_id=EXCLUDED.content_tuning_id,covenant_id=EXCLUDED.covenant_id,start_item_id=EXCLUDED.start_item_id,
		breadcrumb_quest_id=EXCLUDED.breadcrumb_quest_id,condition_id=EXCLUDED.condition_id,
		world_state_expression_id=EXCLUDED.world_state_expression_id,class_mask=EXCLUDED.class_mask,
		race_mask_0=EXCLUDED.race_mask_0,race_mask_1=EXCLUDED.race_mask_1,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_objectives(build_id,quest_id,objective_id,objective_type,object_id,amount,order_index,storage_index,flags)
	SELECT build_id,(payload->>'QuestID')::bigint,row_id,COALESCE(NULLIF(payload->>'Type','')::int,0),
		NULLIF(COALESCE(NULLIF(payload->>'ObjectID','')::bigint,0),0),GREATEST(COALESCE(NULLIF(payload->>'Amount','')::int,0),0),
		COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),COALESCE(NULLIF(payload->>'StorageIndex','')::int,0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestObjective' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ON CONFLICT(build_id,quest_id,objective_id) DO UPDATE SET objective_type=EXCLUDED.objective_type,
		object_id=EXCLUDED.object_id,amount=EXCLUDED.amount,order_index=EXCLUDED.order_index,
		storage_index=EXCLUDED.storage_index,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_objective_localizations(build_id,quest_id,objective_id,locale,description)
	SELECT build_id,(payload->>'QuestID')::bigint,row_id,locale,COALESCE(payload->>'Description_lang','')
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestObjective' AND locale IN ('en_US','ru_RU')
	  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ON CONFLICT(build_id,quest_id,objective_id,locale) DO UPDATE SET description=EXCLUDED.description;

	INSERT INTO catalog_quest_lines(build_id,quest_line_id,completion_condition_id,player_condition_id,flags)
	SELECT build_id,row_id,NULLIF(COALESCE(NULLIF(payload->>'CompletionPlayerConditionID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'PlayerConditionID','')::int,0),0),COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestLine' AND locale='en_US'
	ON CONFLICT(build_id,quest_line_id) DO UPDATE SET completion_condition_id=EXCLUDED.completion_condition_id,
		player_condition_id=EXCLUDED.player_condition_id,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_line_localizations(build_id,quest_line_id,locale,name,description)
	SELECT build_id,row_id,locale,payload->>'Name_lang',COALESCE(payload->>'Description_lang','')
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestLine' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'Name_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,quest_line_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

	INSERT INTO catalog_quest_line_entries(build_id,quest_line_id,quest_id,order_index,flags)
	SELECT DISTINCT ON (build_id,(payload->>'QuestLineID')::bigint,(payload->>'QuestID')::bigint)
		build_id,(payload->>'QuestLineID')::bigint,(payload->>'QuestID')::bigint,
		COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestLineXQuest' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'QuestLineID','')::bigint,0)>0 AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ORDER BY build_id,(payload->>'QuestLineID')::bigint,(payload->>'QuestID')::bigint,
		COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),row_id
	ON CONFLICT(build_id,quest_line_id,quest_id) DO UPDATE SET order_index=EXCLUDED.order_index,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_poi_blobs(build_id,quest_id,blob_id,map_id,ui_map_id,objective_id,objective_index,
		player_condition_id,navigation_condition_id,flags)
	SELECT build_id,(payload->>'QuestID')::bigint,row_id,NULLIF(COALESCE(NULLIF(payload->>'MapID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'UiMapID','')::int,0),0),NULLIF(COALESCE(NULLIF(payload->>'ObjectiveID','')::bigint,0),0),
		COALESCE(NULLIF(payload->>'ObjectiveIndex','')::int,0),NULLIF(COALESCE(NULLIF(payload->>'PlayerConditionID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'NavigationPlayerConditionID','')::int,0),0),COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestPOIBlob' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ON CONFLICT(build_id,blob_id) DO UPDATE SET quest_id=EXCLUDED.quest_id,map_id=EXCLUDED.map_id,ui_map_id=EXCLUDED.ui_map_id,
		objective_id=EXCLUDED.objective_id,objective_index=EXCLUDED.objective_index,
		player_condition_id=EXCLUDED.player_condition_id,navigation_condition_id=EXCLUDED.navigation_condition_id,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_poi_points(build_id,blob_id,point_id,x,y,z)
	SELECT point.build_id,(point.payload->>'QuestPOIBlobID')::bigint,point.row_id,(point.payload->>'X')::double precision,
		(point.payload->>'Y')::double precision,COALESCE(NULLIF(point.payload->>'Z','')::double precision,0)
	FROM catalog_db2_rows point
	JOIN catalog_quest_poi_blobs blob ON blob.build_id=point.build_id AND blob.blob_id=(point.payload->>'QuestPOIBlobID')::bigint
	WHERE point.build_id=$1 AND point.table_name='QuestPOIPoint' AND point.locale='en_US'
	  AND COALESCE(NULLIF(point.payload->>'QuestPOIBlobID','')::bigint,0)>0
	ON CONFLICT(build_id,blob_id,point_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,z=EXCLUDED.z;

	INSERT INTO catalog_quest_package_items(build_id,row_id,package_id,item_external_id,item_entity_id,
		quantity,display_type,source_artifact_id,attributes)
	SELECT package.build_id,package.row_id,(package.payload->>'PackageID')::bigint,
		(package.payload->>'ItemID')::bigint,item.id,(package.payload->>'ItemQuantity')::numeric,
		COALESCE(NULLIF(package.payload->>'DisplayType','')::smallint,0),package.source_artifact_id,package.payload
	FROM catalog_db2_rows package
	JOIN game_builds build ON build.id=package.build_id
	LEFT JOIN game_entities item ON item.product_id=build.product_id AND item.entity_type='item'
		AND item.external_id=(package.payload->>'ItemID')::bigint AND item.deleted_at IS NULL
	WHERE package.build_id=$1 AND package.table_name='QuestPackageItem' AND package.locale='en_US'
	  AND package.payload->>'PackageID' ~ '^[1-9][0-9]*$'
	  AND package.payload->>'ItemID' ~ '^[1-9][0-9]*$'
	  AND package.payload->>'ItemQuantity' ~ '^[1-9][0-9]*(\.[0-9]+)?$'
	ON CONFLICT(build_id,row_id) DO UPDATE SET package_id=EXCLUDED.package_id,
		item_external_id=EXCLUDED.item_external_id,item_entity_id=EXCLUDED.item_entity_id,
		quantity=EXCLUDED.quantity,display_type=EXCLUDED.display_type,
		source_artifact_id=EXCLUDED.source_artifact_id,attributes=EXCLUDED.attributes;`

const questEntitiesProjectionSQL = `
	CREATE TEMP TABLE projected_named_quests ON COMMIT DROP AS
	SELECT task.row_id AS external_id,task.source_url,task.source_artifact_id,task.payload AS db2_en,
		COALESCE(task_ru.payload,task.payload) AS db2_ru,task.payload->>'QuestTitle_lang' AS name_en,
		COALESCE(NULLIF(task_ru.payload->>'QuestTitle_lang',''),task.payload->>'QuestTitle_lang') AS name_ru,
		COALESCE(task.payload->>'BulletText_lang','') AS description_en,
		COALESCE(NULLIF(task_ru.payload->>'BulletText_lang',''),task.payload->>'BulletText_lang','') AS description_ru
	FROM catalog_db2_rows task
	LEFT JOIN catalog_db2_rows task_ru ON task_ru.build_id=task.build_id AND task_ru.table_name='QuestV2CliTask'
		AND task_ru.locale='ru_RU' AND task_ru.row_id=task.row_id
	WHERE task.build_id=$1 AND task.table_name='QuestV2CliTask' AND task.locale='en_US'
	  AND NULLIF(BTRIM(task.payload->>'QuestTitle_lang'),'') IS NOT NULL;
	ALTER TABLE projected_named_quests ADD COLUMN payload_en JSONB;
	UPDATE projected_named_quests SET payload_en=jsonb_build_object('id',external_id,'name',name_en,
		'description',description_en,'db2',db2_en);
	ALTER TABLE projected_named_quests ADD COLUMN content_hash BYTEA;
	UPDATE projected_named_quests SET content_hash=digest(convert_to(payload_en::text,'UTF8'),'sha256');
	CREATE UNIQUE INDEX projected_named_quests_id_idx ON projected_named_quests(external_id);

	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
	SELECT $2,$3,'quest',external_id,COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'quest-'||external_id),$1,$1
	FROM projected_named_quests
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,
		projected.content_hash,projected.payload_en,projected.source_url,$4,projected.source_artifact_id
	FROM projected_named_quests projected
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
	WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=projected.content_hash);

	CREATE TEMP TABLE projected_named_quest_versions ON COMMIT DROP AS
	SELECT projected.*,entity.id AS entity_id,version.id AS version_id
	FROM projected_named_quests projected
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
	JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1 AND version.content_hash=projected.content_hash;

	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'quest-'||external_id),
		name_en,description_en,jsonb_build_object('id',external_id,'name',name_en,'description',description_en,'db2',db2_en)
	FROM projected_named_quest_versions
	UNION ALL
	SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_ru,'[^[:alnum:]]+','-','g'))),''),'quest-'||external_id),
		name_ru,description_ru,jsonb_build_object('id',external_id,'name',name_ru,'description',description_ru,'db2',db2_ru)
	FROM projected_named_quest_versions
	ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
		description=EXCLUDED.description,attributes=EXCLUDED.attributes;

	UPDATE game_entities entity SET latest_version_id=projected.version_id,updated_at=now()
	FROM projected_named_quest_versions projected
	WHERE entity.id=projected.entity_id
	  AND COALESCE((SELECT current_build.build_number
		FROM game_entity_versions current_version
		JOIN game_builds current_build ON current_build.id=current_version.build_id
		WHERE current_version.id=entity.latest_version_id),0)
		<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1);

	-- QuestV2 is the authoritative client registry even when the client does
	-- not ship a localized title. Preserve those quests as source-backed
	-- entities instead of hiding them or inventing a name. A later permitted
	-- localization source can attach text to the same stable identity.
	CREATE TEMP TABLE projected_registry_quests ON COMMIT DROP AS
	SELECT registry.quest_id AS external_id,row.source_url,row.source_artifact_id,
		jsonb_build_object(
			'id',registry.quest_id,
			'registry_only',true,
			'enrichment_status',registry.enrichment_status,
			'unique_bit_flag',registry.unique_bit_flag,
			'ui_details_theme_id',registry.ui_details_theme_id,
			'has_client_task',registry.has_client_task,
			'db2',row.payload
		) AS payload
	FROM catalog_quest_registry registry
	JOIN catalog_db2_rows row ON row.build_id=registry.build_id
		AND row.table_name='QuestV2' AND row.locale='en_US' AND row.row_id=registry.quest_id
	LEFT JOIN projected_named_quests named ON named.external_id=registry.quest_id
	WHERE registry.build_id=$1 AND named.external_id IS NULL
		AND row.source_artifact_id IS NOT NULL;
	ALTER TABLE projected_registry_quests ADD COLUMN content_hash BYTEA;
	UPDATE projected_registry_quests SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256');
	CREATE UNIQUE INDEX projected_registry_quests_id_idx ON projected_registry_quests(external_id);

	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
	SELECT $2,$3,'quest',external_id,'quest-'||external_id,$1,$1
	FROM projected_registry_quests
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,
		projected.content_hash,projected.payload,projected.source_url,$4,projected.source_artifact_id
	FROM projected_registry_quests projected
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
	WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=projected.content_hash);

	UPDATE game_entities entity SET latest_version_id=version.id,updated_at=now()
	FROM projected_registry_quests projected,game_entity_versions version
	WHERE entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
		AND version.entity_id=entity.id AND version.build_id=$1 AND version.content_hash=projected.content_hash
		AND COALESCE((SELECT current_build.build_number
			FROM game_entity_versions current_version
			JOIN game_builds current_build ON current_build.id=current_version.build_id
			WHERE current_version.id=entity.latest_version_id),0)
			<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1);`

const questPackageEntitiesProjectionSQL = `
	CREATE TEMP TABLE projected_quest_reward_packages ON COMMIT DROP AS
	SELECT package.package_id AS external_id,
		jsonb_build_object(
			'id',package.package_id,
			'kind','quest_reward_package',
			'items',jsonb_agg(jsonb_build_object(
				'row_id',package.row_id,
				'item_external_id',package.item_external_id,
				'quantity',package.quantity,
				'display_type',package.display_type,
				'source_artifact_id',package.source_artifact_id
			) ORDER BY package.display_type,package.row_id)
		) AS payload,
		(array_agg(artifact.source_url ORDER BY package.row_id))[1] AS source_url,
		(array_agg(package.source_artifact_id ORDER BY package.row_id))[1] AS source_artifact_id,
		(array_agg(artifact.snapshot_id ORDER BY package.row_id))[1] AS snapshot_id
	FROM catalog_quest_package_items package
	JOIN catalog_source_artifacts artifact ON artifact.id=package.source_artifact_id
	WHERE package.build_id=$1
	GROUP BY package.package_id;
	ALTER TABLE projected_quest_reward_packages ADD COLUMN content_hash BYTEA;
	UPDATE projected_quest_reward_packages
	SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256');
	CREATE UNIQUE INDEX projected_quest_reward_packages_id_idx
	ON projected_quest_reward_packages(external_id);

	INSERT INTO game_entities(
		product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id
	)
	SELECT $2,$3,'quest_reward_package',external_id,'quest-reward-package-'||external_id,$1,$1
	FROM projected_quest_reward_packages
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET
		namespace_id=EXCLUDED.namespace_id,
		last_seen_build_id=EXCLUDED.last_seen_build_id,
		deleted_at=NULL,
		updated_at=now();

	INSERT INTO game_entity_versions(
		entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id
	)
	SELECT entity.id,$1,
		COALESCE((SELECT max(previous.revision) FROM game_entity_versions previous
			WHERE previous.entity_id=entity.id AND previous.build_id=$1),0)+1,
		projected.content_hash,projected.payload,projected.source_url,projected.snapshot_id,projected.source_artifact_id
	FROM projected_quest_reward_packages projected
	JOIN game_entities entity ON entity.product_id=$2
		AND entity.entity_type='quest_reward_package'
		AND entity.external_id=projected.external_id
	WHERE NOT EXISTS (
		SELECT 1 FROM game_entity_versions previous
		WHERE previous.entity_id=entity.id AND previous.build_id=$1
		  AND previous.content_hash=projected.content_hash
	);

	CREATE TEMP TABLE projected_quest_reward_package_versions ON COMMIT DROP AS
	SELECT projected.*,entity.id AS entity_id,version.id AS version_id
	FROM projected_quest_reward_packages projected
	JOIN game_entities entity ON entity.product_id=$2
		AND entity.entity_type='quest_reward_package'
		AND entity.external_id=projected.external_id
	JOIN LATERAL (
		SELECT candidate.id
		FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		  AND candidate.content_hash=projected.content_hash
		ORDER BY candidate.revision DESC
		LIMIT 1
	) version ON true;

	INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
	SELECT DISTINCT projected.version_id,package.source_artifact_id
	FROM projected_quest_reward_package_versions projected
	JOIN catalog_quest_package_items package ON package.build_id=$1
		AND package.package_id=projected.external_id
	WHERE package.source_artifact_id IS NOT NULL
	ON CONFLICT(version_id,source_artifact_id) DO NOTHING;

	-- Packages are client entities but have no localized title column in
	-- QuestPackageItem.  Expose a deterministic, source-backed label instead
	-- of leaving them nameless in the public library.  Russian uses the exact
	-- English fallback until a permitted localized source is available.
	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT projected.version_id,'en_US','quest-reward-package-'||projected.external_id,
		'Quest reward package #'||projected.external_id,'',
		jsonb_build_object('generated_label',true,'source','QuestPackageItem')
	FROM projected_quest_reward_package_versions projected
	UNION ALL
	SELECT projected.version_id,'ru_RU','quest-reward-package-'||projected.external_id,
		'Quest reward package #'||projected.external_id,'',
		jsonb_build_object('generated_label',true,'source','QuestPackageItem','fallback_locale','en_US')
	FROM projected_quest_reward_package_versions projected
	ON CONFLICT(version_id,locale) DO UPDATE SET
		slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,
		attributes=EXCLUDED.attributes;

	INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
	SELECT DISTINCT projected.version_id,localized.locale,projected.source_artifact_id
	FROM projected_quest_reward_package_versions projected
	CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) localized(locale)
	WHERE projected.source_artifact_id IS NOT NULL
	ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING;

	UPDATE game_entities entity
	SET latest_version_id=projected.version_id,updated_at=now()
	FROM projected_quest_reward_package_versions projected
	WHERE entity.id=projected.entity_id
	  AND COALESCE((
		SELECT build.build_number
		FROM game_entity_versions current_version
		JOIN game_builds build ON build.id=current_version.build_id
		WHERE current_version.id=entity.latest_version_id
	  ),0)<=(SELECT build.build_number FROM game_builds build WHERE build.id=$1);`

func projectQuestRewardPackages(
	ctx context.Context,
	db *pgxpool.Pool,
	ic catalogimport.ImportContext,
) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, questPackageEntitiesProjectionSQL, pgx.QueryExecModeSimpleProtocol,
			ic.BuildID, ic.ProductID, ic.NamespaceID); err != nil {
			return fmt.Errorf("project quest reward package entities: %w", err)
		}
		return tx.QueryRow(ctx, `
			SELECT count(*)
			FROM game_entities entity
			JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1
			WHERE entity.product_id=$2 AND entity.entity_type='quest_reward_package'`,
			ic.BuildID, ic.ProductID).Scan(&projected)
	})
	return projected, err
}

func projectPvpTalents(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_pvp_talent_localizations ON COMMIT DROP AS
			SELECT talent.row_id AS external_id,talent.locale,
				spell.payload->>'Name_lang' AS name,
				COALESCE(talent.payload->>'Description_lang','') AS description,
				talent.payload AS db2,talent.source_url,talent.source_artifact_id
			FROM catalog_db2_rows talent
			JOIN catalog_db2_rows spell ON spell.build_id=talent.build_id
				AND spell.table_name='SpellName' AND spell.locale=talent.locale
				AND spell.row_id=COALESCE(NULLIF(talent.payload->>'SpellID','')::bigint,0)
			WHERE talent.build_id=$1 AND talent.table_name='PvpTalent'
				AND talent.locale IN ('en_US','ru_RU')
				AND NULLIF(BTRIM(spell.payload->>'Name_lang'),'') IS NOT NULL`, ic.BuildID); err != nil {
			return fmt.Errorf("stage PvP talent localizations: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_pvp_talents ON COMMIT DROP AS
			SELECT external_id,name,description,db2,source_url,source_artifact_id,
				jsonb_build_object('name',name,'description',description,'kind','pvp','db2',db2,
					'spellId',COALESCE(NULLIF(db2->>'SpellID','')::bigint,0),
					'specId',COALESCE(NULLIF(db2->>'SpecID','')::bigint,0)) AS payload
			FROM projected_pvp_talent_localizations WHERE locale='en_US';
			ALTER TABLE projected_pvp_talents ADD COLUMN content_hash BYTEA;
			UPDATE projected_pvp_talents
			SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256');
			CREATE UNIQUE INDEX projected_pvp_talents_id_idx ON projected_pvp_talents(external_id)`); err != nil {
			return fmt.Errorf("stage canonical PvP talents: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
			SELECT $1,$2,'pvp_talent',external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name,'[^[:alnum:]]+','-','g'))),''),'pvp-talent-'||external_id),
				$3,$3,NULL,now() FROM projected_pvp_talents
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,
				deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert PvP talent entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT entity.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,projected.content_hash,
				projected.payload,projected.source_url,$3,projected.source_artifact_id
			FROM projected_pvp_talents projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type='pvp_talent' AND entity.external_id=projected.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id
				AND old.build_id=$2 AND old.content_hash=projected.content_hash)`, ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("insert PvP talent versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_pvp_talent_versions ON COMMIT DROP AS
			SELECT projected.*,entity.id AS entity_id,version.id AS version_id
			FROM projected_pvp_talents projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type='pvp_talent' AND entity.external_id=projected.external_id
			JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
				AND candidate.build_id=$2 ORDER BY (candidate.snapshot_id=$3) DESC,candidate.revision DESC LIMIT 1) version ON true`,
			ic.ProductID, ic.BuildID, ic.SnapshotID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version.version_id,localized.locale,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),'pvp-talent-'||localized.external_id),
				localized.name,localized.description,
				localized.db2||jsonb_build_object('kind','pvp')
			FROM projected_pvp_talent_localizations localized
			JOIN projected_pvp_talent_versions version ON version.external_id=localized.external_id
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
				description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize PvP talents: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity SET latest_version_id=projected.version_id,updated_at=now()
			FROM projected_pvp_talent_versions projected
			WHERE entity.id=projected.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1)`, ic.BuildID); err != nil {
			return fmt.Errorf("activate staged PvP talents: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectCollections(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	return projectCollectionsForTables(ctx, db, ic, nil)
}

func projectCollectionsForTables(
	ctx context.Context,
	db *pgxpool.Pool,
	ic catalogimport.ImportContext,
	tables []string,
) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_collection_localizations ON COMMIT DROP AS
			WITH definitions(table_name,entity_type,name_field,description_field) AS (VALUES
				('ChrClasses','class','Name_lang','Description_lang'),
				('ChrSpecialization','specialization','Name_lang','Description_lang'),
				('CurrencyTypes','currency','Name_lang','Description_lang'),
				('Mount','mount','Name_lang','Description_lang'),
				('TransmogSet','transmog_set','Name_lang',''),
				('Achievement','achievement','Title_lang','Description_lang'),
				('Map','map','MapName_lang','MapDescription0_lang'),
				('UiMap','ui_map','Name_lang',''),
				('AreaTable','area','AreaName_lang',''),
				('Faction','faction','Name_lang','Description_lang')
			)
			SELECT raw.row_id AS external_id,definition.entity_type,raw.locale,
				raw.payload->>definition.name_field AS name,
				CASE WHEN definition.description_field='' THEN '' ELSE COALESCE(raw.payload->>definition.description_field,'') END AS description,
				raw.payload AS db2,raw.content_hash,raw.source_url,raw.source_artifact_id
			FROM catalog_db2_rows raw JOIN definitions definition ON definition.table_name=raw.table_name
			WHERE raw.build_id=$1 AND raw.locale IN ('en_US','ru_RU')
			  AND (COALESCE(cardinality($2::text[]),0)=0 OR raw.table_name=ANY($2::text[]))
			  AND NULLIF(BTRIM(raw.payload->>definition.name_field),'') IS NOT NULL
			UNION ALL
			SELECT toy.row_id,'toy',toy.locale,item.payload->>'Display_lang','',
				toy.payload||jsonb_build_object('item',item.payload),toy.content_hash,toy.source_url,toy.source_artifact_id
			FROM catalog_db2_rows toy JOIN catalog_db2_rows item ON item.build_id=toy.build_id
				AND item.table_name='ItemSparse' AND item.locale=toy.locale AND item.row_id=(toy.payload->>'ItemID')::bigint
			WHERE toy.build_id=$1 AND toy.table_name='Toy' AND toy.locale IN ('en_US','ru_RU')
			  AND (COALESCE(cardinality($2::text[]),0)=0 OR toy.table_name=ANY($2::text[]))
			  AND NULLIF(BTRIM(item.payload->>'Display_lang'),'') IS NOT NULL
			UNION ALL
			SELECT pet.row_id,'battle_pet',pet.locale,creature.payload->>'Name_lang',COALESCE(pet.payload->>'Description_lang',''),
				pet.payload||jsonb_build_object('creature',creature.payload),pet.content_hash,pet.source_url,pet.source_artifact_id
			FROM catalog_db2_rows pet JOIN catalog_db2_rows creature ON creature.build_id=pet.build_id
				AND creature.table_name='Creature' AND creature.locale=pet.locale AND creature.row_id=(pet.payload->>'CreatureID')::bigint
			WHERE pet.build_id=$1 AND pet.table_name='BattlePetSpecies' AND pet.locale IN ('en_US','ru_RU')
			  AND (COALESCE(cardinality($2::text[]),0)=0 OR pet.table_name=ANY($2::text[]))
			  AND NULLIF(BTRIM(creature.payload->>'Name_lang'),'') IS NOT NULL`, ic.BuildID, tables); err != nil {
			return fmt.Errorf("stage DB2 collections: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_collections ON COMMIT DROP AS
			WITH candidates AS (
				SELECT external_id,entity_type,name,description,db2,
					content_hash,source_url,source_artifact_id
				FROM projected_collection_localizations
				WHERE locale='en_US' AND entity_type<>'ui_map'
				UNION ALL
				SELECT raw.row_id,'ui_map',COALESCE(raw.payload->>'Name_lang',''),'',raw.payload,
					raw.content_hash,raw.source_url,raw.source_artifact_id
				FROM catalog_db2_rows raw
				WHERE raw.build_id=$1 AND raw.table_name='UiMap' AND raw.locale='en_US'
				  AND (COALESCE(cardinality($2::text[]),0)=0 OR raw.table_name=ANY($2::text[]))
			)
			SELECT DISTINCT ON (entity_type,external_id) external_id,entity_type,name,description,db2,
				content_hash,source_url,source_artifact_id
			FROM candidates
			ORDER BY entity_type,external_id`, ic.BuildID, tables); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
			SELECT $1,$2,entity_type,external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name,'[^[:alnum:]]+','-','g'))),''),entity_type||'-'||external_id),
				$3,$3,NULL,now() FROM projected_collections
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,
				deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert collection entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT entity.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,projected.content_hash,
				jsonb_build_object('name',projected.name,'description',projected.description,'db2',projected.db2,
					'registry_only',projected.entity_type='ui_map' AND btrim(projected.name)=''),
				projected.source_url,$3,projected.source_artifact_id
			FROM projected_collections projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=projected.entity_type AND entity.external_id=projected.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id
				AND old.build_id=$2 AND old.content_hash=projected.content_hash)`, ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("insert collection versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_collection_versions ON COMMIT DROP AS
			SELECT projected.*,entity.id AS entity_id,version.id AS version_id
			FROM projected_collections projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=projected.entity_type AND entity.external_id=projected.external_id
			JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
				AND candidate.build_id=$2 AND candidate.content_hash=projected.content_hash
				ORDER BY candidate.revision DESC LIMIT 1) version ON true`,
			ic.ProductID, ic.BuildID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version_id,source_artifact_id
			FROM projected_collection_versions
			WHERE source_artifact_id IS NOT NULL
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING`); err != nil {
			return fmt.Errorf("observe collection version artifacts: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version.version_id,localized.locale,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),localized.entity_type||'-'||localized.external_id),
				localized.name,localized.description,localized.db2
			FROM projected_collection_localizations localized
			JOIN projected_collection_versions version ON version.entity_type=localized.entity_type
				AND version.external_id=localized.external_id
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
				description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize collection entities: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
			SELECT $1,projected.entity_type,projected.external_id,asset.icon_name,projected.source_artifact_id
			FROM projected_collections projected
			JOIN catalog_file_assets asset ON asset.file_data_id=CASE projected.entity_type
				WHEN 'class' THEN NULLIF(projected.db2->>'IconFileDataID','')::bigint
				WHEN 'specialization' THEN NULLIF(projected.db2->>'SpellIconFileID','')::bigint END
			WHERE projected.entity_type IN ('class','specialization')
			ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
				icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id`, ic.BuildID); err != nil {
			return fmt.Errorf("project class and specialization icons: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity
			SET latest_version_id=projected.version_id,updated_at=now()
			FROM projected_collection_versions projected
			WHERE entity.id=projected.entity_id
			  AND COALESCE((
				SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id
			  ),0) <= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1)`,
			ic.BuildID); err != nil {
			return fmt.Errorf("activate staged collection entities: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectItems(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_items ON COMMIT DROP AS
				SELECT sparse.row_id AS external_id,sparse.source_url,sparse.source_artifact_id,sparse.snapshot_id AS source_snapshot_id,
					sparse.source_artifact_id AS sparse_source_artifact_id,core.source_artifact_id AS core_source_artifact_id,
					item_description.source_artifact_id AS item_description_source_artifact_id,
					false AS registry_only,
					sparse.payload->>'Display_lang' AS name_en,
					COALESCE(NULLIF(sparse_ru.payload->>'Display_lang',''),sparse.payload->>'Display_lang') AS name_ru,
					COALESCE(NULLIF(sparse.payload->>'Description_lang',''),item_description.payload->>'Description_lang','') AS description_en,
					COALESCE(NULLIF(sparse_ru.payload->>'Description_lang',''),NULLIF(item_description_ru.payload->>'Description_lang',''),NULLIF(item_description.payload->>'Description_lang',''),sparse.payload->>'Description_lang','') AS description_ru,
					sparse.payload AS db2_en,COALESCE(sparse_ru.payload,sparse.payload) AS db2_ru,
				COALESCE(core.payload,'{}'::jsonb) AS db2_core,
				CASE WHEN COALESCE(NULLIF(core.payload->>'ClassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'ClassID','')::int ELSE NULL END AS class_id,
				CASE WHEN COALESCE(NULLIF(core.payload->>'SubclassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'SubclassID','')::int ELSE NULL END AS subclass_id,
				CASE WHEN COALESCE(NULLIF(core.payload->>'InventoryType','')::int,-1)>=0
					THEN NULLIF(core.payload->>'InventoryType','')::int ELSE NULL END AS core_inventory_type,
				COALESCE(NULLIF(core.payload->>'IconFileDataID','')::bigint,0) AS icon_file_data_id
				FROM catalog_db2_rows sparse
				LEFT JOIN catalog_db2_rows sparse_ru ON sparse_ru.build_id=sparse.build_id AND sparse_ru.table_name='ItemSparse' AND sparse_ru.locale='ru_RU' AND sparse_ru.row_id=sparse.row_id
				LEFT JOIN catalog_db2_rows core ON core.build_id=sparse.build_id AND core.table_name='Item' AND core.locale='en_US' AND core.row_id=sparse.row_id
				LEFT JOIN catalog_db2_rows item_description ON item_description.build_id=sparse.build_id AND item_description.table_name='ItemNameDescription' AND item_description.locale='en_US' AND item_description.row_id=NULLIF(sparse.payload->>'ItemNameDescriptionID','')::bigint
				LEFT JOIN catalog_db2_rows item_description_ru ON item_description_ru.build_id=sparse.build_id AND item_description_ru.table_name='ItemNameDescription' AND item_description_ru.locale='ru_RU' AND item_description_ru.row_id=NULLIF(sparse.payload->>'ItemNameDescriptionID','')::bigint
			WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
			  AND NULLIF(BTRIM(sparse.payload->>'Display_lang'),'') IS NOT NULL
			UNION ALL
				SELECT core.row_id,core.source_url,core.source_artifact_id,core.snapshot_id,
					NULL::uuid,core.source_artifact_id,NULL::uuid,true,
				''::text,''::text,''::text,''::text,'{}'::jsonb,'{}'::jsonb,core.payload,
				CASE WHEN COALESCE(NULLIF(core.payload->>'ClassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'ClassID','')::int ELSE NULL END,
				CASE WHEN COALESCE(NULLIF(core.payload->>'SubclassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'SubclassID','')::int ELSE NULL END,
				CASE WHEN COALESCE(NULLIF(core.payload->>'InventoryType','')::int,-1)>=0
					THEN NULLIF(core.payload->>'InventoryType','')::int ELSE NULL END,
				COALESCE(NULLIF(core.payload->>'IconFileDataID','')::bigint,0)
			FROM catalog_db2_rows core
			WHERE core.build_id=$1 AND core.table_name='Item' AND core.locale='en_US'
			  AND NOT EXISTS (SELECT 1 FROM catalog_db2_rows sparse
				WHERE sparse.build_id=core.build_id AND sparse.table_name='ItemSparse'
				  AND sparse.locale='en_US' AND sparse.row_id=core.row_id
				  AND NULLIF(BTRIM(sparse.payload->>'Display_lang'),'') IS NOT NULL)`, ic.BuildID); err != nil {
			return fmt.Errorf("stage items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			ALTER TABLE projected_items ADD COLUMN payload_en JSONB;
			UPDATE projected_items SET payload_en=CASE WHEN registry_only THEN jsonb_build_object(
				'id',external_id,'registry_only',true,'enrichment_status','client_registry',
				'item_class',jsonb_build_object('id',class_id),'item_subclass',jsonb_build_object('id',subclass_id),
				'inventory_type',jsonb_build_object('type',core_inventory_type),
				'icon_file_data_id',icon_file_data_id,'db2',db2_core
			) ELSE jsonb_build_object(
				'id',external_id,'name',name_en,'description',description_en,
				'level',COALESCE(NULLIF(db2_en->>'ItemLevel','')::int,0),
				'required_level',CASE
					WHEN COALESCE(NULLIF(db2_en->>'RequiredLevel','')::int,-1)>=0
					THEN NULLIF(db2_en->>'RequiredLevel','')::int
					ELSE NULL
				END,
				'max_count',COALESCE(NULLIF(db2_en->>'MaxCount','')::int,0),
				'purchase_price',COALESCE(NULLIF(db2_en->>'BuyPrice','')::bigint,0),
				'sell_price',COALESCE(NULLIF(db2_en->>'SellPrice','')::bigint,0),
				'inventory_type',jsonb_build_object('type',COALESCE(db2_en->>'InventoryType','0')),
				'quality',jsonb_build_object('type',COALESCE(db2_en->>'OverallQualityID','0')),
				'item_class',jsonb_build_object('id',class_id),'item_subclass',jsonb_build_object('id',subclass_id),
				'icon_file_data_id',icon_file_data_id,'db2',db2_en,'db2_item',db2_core
			) END;
			ALTER TABLE projected_items ADD COLUMN content_hash BYTEA;
			UPDATE projected_items SET content_hash=digest(convert_to(payload_en::text,'UTF8'),'sha256');
			CREATE UNIQUE INDEX projected_items_id_idx ON projected_items(external_id)`); err != nil {
			return fmt.Errorf("prepare items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities (product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'item',external_id,COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'item-'||external_id),$3,$3
			FROM projected_items
			ON CONFLICT (product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert item entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions (entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.payload_en,p.source_url,p.source_snapshot_id,p.source_artifact_id
			FROM projected_items p JOIN game_entities e ON e.product_id=$1 AND e.entity_type='item' AND e.external_id=p.external_id
			WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old
				WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`,
			ic.ProductID, ic.BuildID)
		if err != nil {
			return fmt.Errorf("insert missing item versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_item_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_items p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='item' AND e.external_id=p.external_id
			JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
				WHERE candidate.entity_id=e.id AND candidate.build_id=$2 AND candidate.content_hash=p.content_hash
				ORDER BY candidate.revision DESC LIMIT 1) v ON true`,
			ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("map projected item versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations (version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'item-'||external_id),
				name_en,description_en,jsonb_build_object('id',external_id,'name',name_en,'description',description_en,'db2',db2_en)
			FROM projected_item_versions WHERE NOT registry_only
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_ru,'[^[:alnum:]]+','-','g'))),''),'item-'||external_id),
				name_ru,description_ru,jsonb_build_object('id',external_id,'name',name_ru,'description',description_ru,'db2',db2_ru)
			FROM projected_item_versions WHERE NOT registry_only
			ON CONFLICT (version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize projected items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_items (version_id,quality,item_level,required_level,inventory_type,item_class_id,item_subclass_id,max_count,purchase_price,sell_price,is_equippable,is_stackable)
			SELECT version_id,CASE WHEN registry_only THEN NULL ELSE db2_en->>'OverallQualityID' END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'ItemLevel','')::int,0) END,
				CASE WHEN COALESCE(NULLIF(db2_en->>'RequiredLevel','')::int,-1)>=0
					THEN NULLIF(db2_en->>'RequiredLevel','')::int ELSE NULL END,
				COALESCE(db2_en->>'InventoryType',core_inventory_type::text),class_id,subclass_id,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'MaxCount','')::int,0) END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'BuyPrice','')::bigint,0) END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'SellPrice','')::bigint,0) END,
				CASE WHEN registry_only THEN core_inventory_type>0 ELSE COALESCE(NULLIF(db2_en->>'InventoryType','')::int,0)>0 END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'Stackable','')::int,0)>1 END
			FROM projected_item_versions
			ON CONFLICT (version_id) DO UPDATE SET quality=EXCLUDED.quality,item_level=EXCLUDED.item_level,required_level=EXCLUDED.required_level,
				inventory_type=EXCLUDED.inventory_type,item_class_id=EXCLUDED.item_class_id,item_subclass_id=EXCLUDED.item_subclass_id,
				max_count=EXCLUDED.max_count,purchase_price=EXCLUDED.purchase_price,sell_price=EXCLUDED.sell_price,
				is_equippable=EXCLUDED.is_equippable,is_stackable=EXCLUDED.is_stackable`); err != nil {
			return fmt.Errorf("project typed items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version_id,source_artifact_id
			FROM (
				SELECT version_id,sparse_source_artifact_id AS source_artifact_id FROM projected_item_versions
				UNION ALL
				SELECT version_id,core_source_artifact_id FROM projected_item_versions
				UNION ALL
				SELECT version_id,item_description_source_artifact_id FROM projected_item_versions
			) observations
			WHERE source_artifact_id IS NOT NULL
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING`); err != nil {
			return fmt.Errorf("observe item version artifacts: %w", err)
		}
		if _, err := tx.Exec(ctx, itemDetailsProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID); err != nil {
			return fmt.Errorf("project item details: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_item_versions p
			WHERE e.id=p.entity_id AND COALESCE((SELECT b.build_number FROM game_entity_versions current_version JOIN game_builds b ON b.id=current_version.build_id WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT b.build_number FROM game_builds b WHERE b.id=$1)`, ic.BuildID); err != nil {
			return fmt.Errorf("activate projected items: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectJournalEntities(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) error {
	_, err := db.Exec(ctx, journalEntityProjectionSQL, pgx.QueryExecModeSimpleProtocol,
		ic.BuildID, ic.ProductID, ic.SnapshotID, ic.NamespaceID)
	if err != nil {
		return fmt.Errorf("project journal entities: %w", err)
	}
	return nil
}

func projectItemDetails(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, itemDetailsProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID); err != nil {
			return fmt.Errorf("project item details: %w", err)
		}
		return nil
	})
}

const itemDetailsProjectionSQL = `
	INSERT INTO catalog_journal_instances(build_id,journal_instance_id,map_id,area_id,covenant_id,flags)
	SELECT build_id,row_id,NULLIF(COALESCE(NULLIF(payload->>'MapID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'AreaID','')::int,0),0),NULLIF(COALESCE(NULLIF(payload->>'CovenantID','')::int,0),0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='JournalInstance' AND locale='en_US'
	ON CONFLICT(build_id,journal_instance_id) DO UPDATE SET map_id=EXCLUDED.map_id,area_id=EXCLUDED.area_id,
		covenant_id=EXCLUDED.covenant_id,flags=EXCLUDED.flags;

	INSERT INTO catalog_journal_instance_localizations(build_id,journal_instance_id,locale,name,description)
	SELECT build_id,row_id,locale,payload->>'Name_lang',COALESCE(payload->>'Description_lang','')
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='JournalInstance' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'Name_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,journal_instance_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

	INSERT INTO catalog_journal_encounters(build_id,journal_encounter_id,journal_instance_id,dungeon_encounter_id,
		ui_map_id,order_index,difficulty_mask,flags)
	SELECT encounter.build_id,encounter.row_id,(encounter.payload->>'JournalInstanceID')::bigint,
		NULLIF(COALESCE(NULLIF(encounter.payload->>'DungeonEncounterID','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(encounter.payload->>'UiMapID','')::int,0),0),
		COALESCE(NULLIF(encounter.payload->>'OrderIndex','')::int,0),
		COALESCE(NULLIF(encounter.payload->>'DifficultyMask','')::bigint,0),COALESCE(NULLIF(encounter.payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows encounter
	JOIN catalog_journal_instances instance ON instance.build_id=encounter.build_id
		AND instance.journal_instance_id=(encounter.payload->>'JournalInstanceID')::bigint
	WHERE encounter.build_id=$1 AND encounter.table_name='JournalEncounter' AND encounter.locale='en_US'
	ON CONFLICT(build_id,journal_encounter_id) DO UPDATE SET journal_instance_id=EXCLUDED.journal_instance_id,
		dungeon_encounter_id=EXCLUDED.dungeon_encounter_id,ui_map_id=EXCLUDED.ui_map_id,
		order_index=EXCLUDED.order_index,difficulty_mask=EXCLUDED.difficulty_mask,flags=EXCLUDED.flags;

	INSERT INTO catalog_journal_encounter_localizations(build_id,journal_encounter_id,locale,name,description)
	SELECT encounter.build_id,encounter.row_id,encounter.locale,encounter.payload->>'Name_lang',
		COALESCE(encounter.payload->>'Description_lang','')
	FROM catalog_db2_rows encounter
	JOIN catalog_journal_encounters typed ON typed.build_id=encounter.build_id AND typed.journal_encounter_id=encounter.row_id
	WHERE encounter.build_id=$1 AND encounter.table_name='JournalEncounter' AND encounter.locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(encounter.payload->>'Name_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,journal_encounter_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

	DELETE FROM catalog_item_acquisition_sources source USING game_entity_versions version
	WHERE source.version_id=version.id AND version.build_id=$1 AND source.source_type IN ('encounter','crafting_recipe');
	INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,context_id,journal_instance_id,difficulty_mask,attributes,source_artifact_id)
	SELECT item_version.id,'encounter',(journal_item.payload->>'JournalEncounterID')::bigint,journal_item.row_id,
		encounter.journal_instance_id,COALESCE(NULLIF(journal_item.payload->>'DifficultyMask','')::bigint,0),journal_item.payload,journal_item.source_artifact_id
	FROM catalog_db2_rows journal_item
	JOIN game_entities item ON item.product_id=$2 AND item.entity_type='item'
		AND item.external_id=(journal_item.payload->>'ItemID')::bigint AND item.deleted_at IS NULL
	JOIN LATERAL (SELECT version.id FROM game_entity_versions version
		WHERE version.entity_id=item.id AND version.build_id=$1 ORDER BY version.revision DESC LIMIT 1) item_version ON true
	JOIN catalog_journal_encounters encounter ON encounter.build_id=journal_item.build_id
		AND encounter.journal_encounter_id=(journal_item.payload->>'JournalEncounterID')::bigint
	WHERE journal_item.build_id=$1 AND journal_item.table_name='JournalEncounterItem' AND journal_item.locale='en_US'
	ON CONFLICT(version_id,source_type,source_id,context_id) DO UPDATE SET journal_instance_id=EXCLUDED.journal_instance_id,
		difficulty_mask=EXCLUDED.difficulty_mask,attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id;

	INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,context_id,source_entity_id,attributes,source_artifact_id)
	SELECT item_version.id,'crafting_recipe',recipe.external_id,0,recipe.id,
		jsonb_build_object('output_source',output.source),output.source_artifact_id
	FROM catalog_recipe_outputs output
	JOIN game_entities item ON item.product_id=$2 AND item.entity_type='item' AND item.external_id=output.item_external_id
		AND item.deleted_at IS NULL
	JOIN LATERAL (SELECT version.id FROM game_entity_versions version
		WHERE version.entity_id=item.id AND version.build_id=$1 ORDER BY version.revision DESC LIMIT 1) item_version ON true
	JOIN game_entity_versions recipe_version ON recipe_version.id=output.recipe_version_id AND recipe_version.build_id=$1
	JOIN game_entities recipe ON recipe.id=recipe_version.entity_id AND recipe.entity_type='recipe' AND recipe.product_id=$2
	ON CONFLICT(version_id,source_type,source_id,context_id) DO UPDATE SET source_entity_id=EXCLUDED.source_entity_id,
		attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id;

	INSERT INTO catalog_item_classes(build_id,class_id,db2_row_id,price_modifier,flags)
	SELECT build_id,(payload->>'ClassID')::int,row_id,COALESCE(NULLIF(payload->>'PriceModifier','')::numeric,0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemClass' AND locale='en_US'
	ON CONFLICT(build_id,class_id) DO UPDATE SET db2_row_id=EXCLUDED.db2_row_id,
		price_modifier=EXCLUDED.price_modifier,flags=EXCLUDED.flags;

	INSERT INTO catalog_item_class_localizations(build_id,class_id,locale,name)
	SELECT build_id,(payload->>'ClassID')::int,locale,payload->>'ClassName_lang'
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemClass' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'ClassName_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,class_id,locale) DO UPDATE SET name=EXCLUDED.name;

	INSERT INTO catalog_item_subclasses(build_id,class_id,subclass_id,db2_row_id,auction_house_sort_order,
		prerequisite_proficiency,postrequisite_proficiency,flags,display_flags)
	SELECT build_id,(payload->>'ClassID')::int,(payload->>'SubClassID')::int,row_id,
		COALESCE(NULLIF(payload->>'AuctionHouseSortOrder','')::int,0),
		COALESCE(NULLIF(payload->>'PrerequisiteProficiency','')::int,0),
		COALESCE(NULLIF(payload->>'PostrequisiteProficiency','')::int,0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0),COALESCE(NULLIF(payload->>'DisplayFlags','')::bigint,0)
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemSubClass' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'ClassID','')::int,-1)>=0
	  AND COALESCE(NULLIF(payload->>'SubClassID','')::int,-1)>=0
	ON CONFLICT(build_id,class_id,subclass_id) DO UPDATE SET db2_row_id=EXCLUDED.db2_row_id,
		auction_house_sort_order=EXCLUDED.auction_house_sort_order,
		prerequisite_proficiency=EXCLUDED.prerequisite_proficiency,
		postrequisite_proficiency=EXCLUDED.postrequisite_proficiency,flags=EXCLUDED.flags,display_flags=EXCLUDED.display_flags;

	INSERT INTO catalog_item_subclass_localizations(build_id,class_id,subclass_id,locale,name,verbose_name)
	SELECT build_id,(payload->>'ClassID')::int,(payload->>'SubClassID')::int,locale,
		COALESCE(NULLIF(payload->>'DisplayName_lang',''),NULLIF(payload->>'VerboseName_lang','')),
		COALESCE(payload->>'VerboseName_lang','')
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemSubClass' AND locale IN ('en_US','ru_RU')
	  AND COALESCE(NULLIF(payload->>'ClassID','')::int,-1)>=0
	  AND COALESCE(NULLIF(payload->>'SubClassID','')::int,-1)>=0
	  AND COALESCE(NULLIF(BTRIM(payload->>'DisplayName_lang'),''),NULLIF(BTRIM(payload->>'VerboseName_lang'),'')) IS NOT NULL
	ON CONFLICT(build_id,class_id,subclass_id,locale) DO UPDATE SET name=EXCLUDED.name,verbose_name=EXCLUDED.verbose_name;

	DELETE FROM catalog_item_stats stats USING game_entity_versions version
	WHERE stats.version_id=version.id AND version.build_id=$1;
	INSERT INTO catalog_item_stats(version_id,slot,stat_type,percent_editor,socket_percentage,source_artifact_id)
	SELECT item_version.id,slot::smallint,(sparse.payload->>('StatModifier_bonusStat_'||slot))::int,
		COALESCE(NULLIF(sparse.payload->>('StatPercentEditor_'||slot),'')::numeric,0),
		COALESCE(NULLIF(sparse.payload->>('StatPercentageOfSocket_'||slot),'')::numeric,0),
		sparse.source_artifact_id
	FROM catalog_db2_rows sparse
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item' AND entity.external_id=sparse.row_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	CROSS JOIN generate_series(0,9) slot
	WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
	  AND COALESCE(NULLIF(sparse.payload->>('StatModifier_bonusStat_'||slot),'')::int,-1)>=0;

	DELETE FROM catalog_item_sockets sockets USING game_entity_versions version
	WHERE sockets.version_id=version.id AND version.build_id=$1;
	INSERT INTO catalog_item_sockets(version_id,slot,socket_type)
	SELECT item_version.id,slot::smallint,(sparse.payload->>('SocketType_'||slot))::int
	FROM catalog_db2_rows sparse
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item' AND entity.external_id=sparse.row_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	CROSS JOIN generate_series(0,2) slot
	WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
	  AND COALESCE(NULLIF(sparse.payload->>('SocketType_'||slot),'')::int,0)>0;

	INSERT INTO catalog_item_requirements(version_id,required_level,required_skill_id,required_skill_rank,
		required_ability_id,min_faction_id,min_reputation,required_holiday_id,required_transmog_holiday_id,
		allowable_class_mask,allowable_race_mask_0,allowable_race_mask_1)
	SELECT item_version.id,GREATEST(COALESCE(NULLIF(sparse.payload->>'RequiredLevel','')::int,0),0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredSkill','')::int,0),0),
		COALESCE(NULLIF(sparse.payload->>'RequiredSkillRank','')::int,0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredAbility','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'MinFactionID','')::int,0),0),
		COALESCE(NULLIF(sparse.payload->>'MinReputation','')::int,0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredHoliday','')::int,0),0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredTransmogHoliday','')::int,0),0),
		COALESCE(NULLIF(sparse.payload->>'AllowableClass','')::bigint,0),
		COALESCE(NULLIF(sparse.payload->>'AllowableRaces_0','')::bigint,0),
		COALESCE(NULLIF(sparse.payload->>'AllowableRaces_1','')::bigint,0)
	FROM catalog_db2_rows sparse
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item' AND entity.external_id=sparse.row_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
	ON CONFLICT(version_id) DO UPDATE SET required_level=EXCLUDED.required_level,
		required_skill_id=EXCLUDED.required_skill_id,required_skill_rank=EXCLUDED.required_skill_rank,
		required_ability_id=EXCLUDED.required_ability_id,min_faction_id=EXCLUDED.min_faction_id,
		min_reputation=EXCLUDED.min_reputation,required_holiday_id=EXCLUDED.required_holiday_id,
		required_transmog_holiday_id=EXCLUDED.required_transmog_holiday_id,
		allowable_class_mask=EXCLUDED.allowable_class_mask,allowable_race_mask_0=EXCLUDED.allowable_race_mask_0,
		allowable_race_mask_1=EXCLUDED.allowable_race_mask_1;

	DELETE FROM catalog_item_effects effects USING game_entity_versions version
	WHERE effects.version_id=version.id AND version.build_id=$1;
	WITH item_effect_links AS (
		SELECT (link.payload->>'ItemID')::bigint AS item_id,effect.row_id AS item_effect_id,
			effect.payload,link.source_artifact_id
		FROM catalog_db2_rows link
		JOIN catalog_db2_rows effect ON effect.build_id=link.build_id AND effect.table_name='ItemEffect'
			AND effect.locale='en_US' AND effect.row_id=(link.payload->>'ItemEffectID')::bigint
		WHERE link.build_id=$1 AND link.table_name='ItemXItemEffect' AND link.locale='en_US'
		  AND link.payload->>'ItemID' ~ '^[1-9][0-9]*$'
		UNION ALL
		SELECT (effect.payload->>'ParentItemID')::bigint,effect.row_id,effect.payload,effect.source_artifact_id
		FROM catalog_db2_rows effect
		WHERE effect.build_id=$1 AND effect.table_name='ItemEffect' AND effect.locale='en_US'
		  AND effect.payload->>'ParentItemID' ~ '^[1-9][0-9]*$'
		  AND NOT EXISTS (
			SELECT 1 FROM catalog_db2_rows link
			WHERE link.build_id=effect.build_id AND link.table_name='ItemXItemEffect' AND link.locale='en_US'
			  AND link.payload->>'ItemEffectID' ~ '^[1-9][0-9]*$'
			  AND (link.payload->>'ItemEffectID')::bigint=effect.row_id
		  )
	)
	INSERT INTO catalog_item_effects(version_id,item_effect_id,slot,spell_id,trigger_type,charges,cooldown_ms,
		category_cooldown_ms,spell_category_id,specialization_id,player_condition_id,source_artifact_id)
	SELECT item_version.id,effect.item_effect_id,COALESCE(NULLIF(effect.payload->>'LegacySlotIndex','')::smallint,0),
		(effect.payload->>'SpellID')::bigint,COALESCE(NULLIF(effect.payload->>'TriggerType','')::int,0),
		COALESCE(NULLIF(effect.payload->>'Charges','')::int,0),COALESCE(NULLIF(effect.payload->>'CoolDownMSec','')::int,0),
		COALESCE(NULLIF(effect.payload->>'CategoryCoolDownMSec','')::int,0),
		COALESCE(NULLIF(effect.payload->>'SpellCategoryID','')::int,0),
		COALESCE(NULLIF(effect.payload->>'ChrSpecializationID','')::int,0),
		COALESCE(NULLIF(effect.payload->>'PlayerConditionID','')::int,0),effect.source_artifact_id
	FROM item_effect_links effect
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item'
		AND entity.external_id=effect.item_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	WHERE COALESCE(NULLIF(effect.payload->>'SpellID','')::bigint,0)>0
	ON CONFLICT(version_id,item_effect_id) DO UPDATE SET slot=EXCLUDED.slot,spell_id=EXCLUDED.spell_id,
		trigger_type=EXCLUDED.trigger_type,charges=EXCLUDED.charges,cooldown_ms=EXCLUDED.cooldown_ms,
		category_cooldown_ms=EXCLUDED.category_cooldown_ms,spell_category_id=EXCLUDED.spell_category_id,
		specialization_id=EXCLUDED.specialization_id,player_condition_id=EXCLUDED.player_condition_id,
		source_artifact_id=EXCLUDED.source_artifact_id;`

const journalEntityProjectionSQL = `
	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
		first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
	SELECT $2,$4,'instance',instance.journal_instance_id,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),'instance-'||instance.journal_instance_id),
		$1,$1,NULL,now()
	FROM catalog_journal_instances instance
	JOIN catalog_journal_instance_localizations localized ON localized.build_id=instance.build_id
		AND localized.journal_instance_id=instance.journal_instance_id AND localized.locale='en_US'
	WHERE instance.build_id=$1
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,raw.content_hash,
		jsonb_build_object('name',localized.name,'description',localized.description,'db2',raw.payload),
		raw.source_url,$3,raw.source_artifact_id
	FROM catalog_journal_instances instance
	JOIN catalog_journal_instance_localizations localized ON localized.build_id=instance.build_id
		AND localized.journal_instance_id=instance.journal_instance_id AND localized.locale='en_US'
	JOIN catalog_db2_rows raw ON raw.build_id=instance.build_id AND raw.table_name='JournalInstance'
		AND raw.locale='en_US' AND raw.row_id=instance.journal_instance_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='instance'
		AND entity.external_id=instance.journal_instance_id
	WHERE instance.build_id=$1 AND NOT EXISTS(SELECT 1 FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=raw.content_hash);

	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
		first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
	SELECT $2,$4,'encounter',encounter.journal_encounter_id,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),'encounter-'||encounter.journal_encounter_id),
		$1,$1,NULL,now()
	FROM catalog_journal_encounters encounter
	JOIN catalog_journal_encounter_localizations localized ON localized.build_id=encounter.build_id
		AND localized.journal_encounter_id=encounter.journal_encounter_id AND localized.locale='en_US'
	WHERE encounter.build_id=$1
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,raw.content_hash,
		jsonb_build_object('name',localized.name,'description',localized.description,'db2',raw.payload),
		raw.source_url,$3,raw.source_artifact_id
	FROM catalog_journal_encounters encounter
	JOIN catalog_journal_encounter_localizations localized ON localized.build_id=encounter.build_id
		AND localized.journal_encounter_id=encounter.journal_encounter_id AND localized.locale='en_US'
	JOIN catalog_db2_rows raw ON raw.build_id=encounter.build_id AND raw.table_name='JournalEncounter'
		AND raw.locale='en_US' AND raw.row_id=encounter.journal_encounter_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='encounter'
		AND entity.external_id=encounter.journal_encounter_id
	WHERE encounter.build_id=$1 AND NOT EXISTS(SELECT 1 FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=raw.content_hash);

	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT version.id,localized.locale,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),entity.entity_type||'-'||entity.external_id),
		localized.name,localized.description,jsonb_build_object('journal_instance_id',instance.journal_instance_id)
	FROM catalog_journal_instances instance
	JOIN catalog_journal_instance_localizations localized ON localized.build_id=instance.build_id
		AND localized.journal_instance_id=instance.journal_instance_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='instance' AND entity.external_id=instance.journal_instance_id
	JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
		AND candidate.build_id=$1 ORDER BY (candidate.snapshot_id=$3) DESC,candidate.revision DESC LIMIT 1) version ON true
	WHERE instance.build_id=$1
	ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
		description=EXCLUDED.description,attributes=EXCLUDED.attributes;

	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT version.id,localized.locale,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),entity.entity_type||'-'||entity.external_id),
		localized.name,localized.description,jsonb_build_object('journal_encounter_id',encounter.journal_encounter_id,
			'journal_instance_id',encounter.journal_instance_id,'dungeon_encounter_id',encounter.dungeon_encounter_id)
	FROM catalog_journal_encounters encounter
	JOIN catalog_journal_encounter_localizations localized ON localized.build_id=encounter.build_id
		AND localized.journal_encounter_id=encounter.journal_encounter_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='encounter' AND entity.external_id=encounter.journal_encounter_id
	JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
		AND candidate.build_id=$1 ORDER BY (candidate.snapshot_id=$3) DESC,candidate.revision DESC LIMIT 1) version ON true
	WHERE encounter.build_id=$1
	ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
		description=EXCLUDED.description,attributes=EXCLUDED.attributes;

	WITH candidates AS (
		SELECT DISTINCT ON (entity.id) entity.id AS entity_id,version.id AS version_id
		FROM game_entities entity JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1
		WHERE entity.product_id=$2 AND entity.entity_type IN ('instance','encounter')
		ORDER BY entity.id,(version.snapshot_id=$3) DESC,version.revision DESC
	)
	UPDATE game_entities entity SET latest_version_id=candidate.version_id,updated_at=now()
	FROM candidates candidate
	WHERE entity.id=candidate.entity_id
	  AND COALESCE((SELECT current_build.build_number
		FROM game_entity_versions current_version
		JOIN game_builds current_build ON current_build.id=current_version.build_id
		WHERE current_version.id=entity.latest_version_id),0)
		<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1);

	UPDATE catalog_journal_instances instance SET entity_id=entity.id
	FROM game_entities entity WHERE instance.build_id=$1 AND entity.product_id=$2
		AND entity.entity_type='instance' AND entity.external_id=instance.journal_instance_id;
	UPDATE catalog_journal_encounters encounter SET entity_id=entity.id
	FROM game_entities entity WHERE encounter.build_id=$1 AND entity.product_id=$2
		AND entity.entity_type='encounter' AND entity.external_id=encounter.journal_encounter_id;
	UPDATE catalog_item_acquisition_sources source SET source_entity_id=encounter.entity_id
	FROM game_entity_versions item_version,catalog_journal_encounters encounter
	WHERE source.version_id=item_version.id AND item_version.build_id=$1 AND source.source_type='encounter'
		AND encounter.build_id=item_version.build_id AND encounter.journal_encounter_id=source.source_id;`
