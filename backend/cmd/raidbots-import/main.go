package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"slices"
	"strconv"
	"strings"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/raidbots"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type options struct {
	databaseURL string
	environment string
	files       []string
	factFiles   []string
	maxRecords  int
}

type datasetSpec struct {
	Type      string
	IDField   string
	NameField string
}

type talentFact struct {
	entry       map[string]any
	appearances []map[string]any
	seen        map[string]struct{}
}

var datasetSpecs = map[string]datasetSpec{
	"equippable-items-full.json": {Type: "item", IDField: "id", NameField: "name"},
	"talents.json":               {Type: "talent_tree", IDField: "specId"},
	"instances.json":             {Type: "instance", IDField: "id", NameField: "name"},
	"enchantments.json":          {Type: "enchantment", IDField: "id", NameField: "displayName"},
	"gems.json":                  {Type: "gem", IDField: "id", NameField: "name"},
	"item-sets.json":             {Type: "item_set", IDField: "id", NameField: "name"},
	"seasons.json":               {Type: "season", IDField: "id", NameField: "name"},
	"foods.json":                 {Type: "food", IDField: "itemId", NameField: "name"},
	"flasks.json":                {Type: "flask", IDField: "itemId", NameField: "name"},
	"potions.json":               {Type: "potion", IDField: "itemId", NameField: "name"},
}

const defaultFiles = "equippable-items-full.json,talents.json,instances.json,enchantments.json,gems.json,item-sets.json,seasons.json,foods.json,flasks.json,potions.json"

const defaultFactFiles = "bonuses.json,bonus-effects.json,bonus-sockets.json,bonus-upgrade-sets.json,bonus-id-base-levels.json,bonus-id-levels.json,bonus-level-deltas.json,bonus-roll-sources.json,class-traits.json,content-tuning.json,crafting.json,currency-types.json,encounter-items.json,encounter-names.json,item-conversions.json,item-curves.json,item-level-bonus-lookup.json,item-level-offset-bonuses.json,item-limit-categories.json,level-selector-sequences.json,spell-scaling-table.json,weapon-specs.json,icon-lookup.json"

func main() {
	if err := run(); err != nil {
		slog.Error("Raidbots catalog import failed", "error", err)
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

	client := raidbots.New(raidbots.Config{})
	metadata, err := client.Metadata(ctx, opts.environment)
	if err != nil {
		return err
	}
	buildNumber, err := buildNumber(metadata.WoWBuild)
	if err != nil {
		return err
	}
	available := make(map[string]struct{}, len(metadata.Files))
	for _, file := range metadata.Files {
		available[file] = struct{}{}
	}
	for _, file := range opts.files {
		if _, ok := available[file]; !ok {
			return fmt.Errorf("Raidbots metadata does not contain %q", file)
		}
	}
	for _, file := range opts.factFiles {
		if _, ok := available[file]; !ok {
			return fmt.Errorf("Raidbots metadata does not contain fact file %q", file)
		}
	}

	db, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping catalog database: %w", err)
	}

	store := catalogimport.NewStore(db)
	releaseID, err := catalogimport.ReleaseIDFromEnvironment()
	if err != nil {
		return err
	}
	parameters := map[string]any{
		"environment":          metadata.Environment,
		"content_hash":         metadata.ContentHash,
		"generated_at":         metadata.GeneratedAt,
		"files":                opts.files,
		"max_records_per_file": opts.maxRecords,
	}
	importContext, err := store.Begin(ctx, "wow", buildNumber, metadata.WoWBuild, "us", "raidbots", releaseID, parameters)
	if err != nil {
		return err
	}

	var seen, written int64
	itemIDs := make(map[int64]struct{})
	importErr := importDatasets(ctx, client, store, importContext, opts, metadata.ContentHash, itemIDs, &seen, &written)
	if importErr == nil {
		importErr = importFactDatasets(ctx, db, client, store, importContext, opts, metadata.ContentHash, &seen, &written)
	}
	if importErr == nil {
		importErr = importItemNames(ctx, client, store, importContext, opts.environment, metadata.ContentHash, itemIDs, &seen, &written)
	}
	status := "SUCCEEDED"
	if importErr != nil {
		status = "FAILED"
	}
	if finishErr := store.Finish(context.WithoutCancel(ctx), importContext.RunID, status, seen, written, importErr); finishErr != nil {
		return errors.Join(importErr, fmt.Errorf("finish import run: %w", finishErr))
	}
	if importErr != nil {
		return importErr
	}
	if _, err := db.Exec(ctx, `UPDATE game_entities entity SET deleted_at=now(),updated_at=now()
		FROM game_entity_versions version
		WHERE entity.entity_type='talent_tree' AND entity.latest_version_id=version.id
		  AND version.payload #>> '{raidbots,specId}' ~ '^[0-9]+$'
		  AND entity.external_id<>(version.payload #>> '{raidbots,specId}')::bigint`); err != nil {
		return fmt.Errorf("retire legacy class-level talent trees: %w", err)
	}
	slog.Info("Raidbots catalog import completed", "seen", seen, "written", written, "build", metadata.WoWBuild)
	return nil
}

func importFactDatasets(
	ctx context.Context,
	db *pgxpool.Pool,
	client *raidbots.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	contentHash string,
	seen, written *int64,
) error {
	for _, file := range opts.factFiles {
		artifactID, err := store.RegisterArtifact(ctx, importContext, "raidbots", file, "en_US", client.URL(opts.environment, file), map[string]any{
			"environment": opts.environment, "raidbots_content_hash": contentHash, "record_shape": "array_or_object",
		})
		if err != nil {
			return err
		}
		slog.Info("importing Raidbots fact dataset", "file", file)
		_, err = client.Records(ctx, opts.environment, file, opts.maxRecords, func(key string, raw json.RawMessage) error {
			(*seen)++
			key = factRecordKey(key, raw)
			changed, err := store.UpsertSourceRecord(ctx, artifactID, key, raw)
			if err != nil {
				return fmt.Errorf("store Raidbots %s record %s: %w", file, key, err)
			}
			if changed {
				(*written)++
			}
			if err := projectRaidbotsFact(ctx, db, store, importContext, artifactID, client.URL(opts.environment, file), file, key, raw); err != nil {
				return fmt.Errorf("project Raidbots %s record %s: %w", file, key, err)
			}
			return nil
		})
		if err != nil {
			return fmt.Errorf("import Raidbots facts %s: %w", file, err)
		}
	}
	return nil
}

func projectRaidbotsFact(
	ctx context.Context,
	db *pgxpool.Pool,
	store *catalogimport.Store,
	ic catalogimport.ImportContext,
	artifactID uuid.UUID,
	sourceURL, file, key string,
	raw json.RawMessage,
) error {
	switch file {
	case "bonuses.json", "item-curves.json", "weapon-specs.json", "class-traits.json",
		"item-conversions.json", "currency-types.json", "encounter-items.json", "icon-lookup.json":
	default:
		return nil
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return err
	}
	switch file {
	case "bonuses.json":
		id := numericID(doc["id"])
		if id > 0 {
			_, err := db.Exec(ctx, `INSERT INTO catalog_item_bonus_rules(build_id,bonus_id,source_artifact_id,payload)
				VALUES($1,$2,$3,$4) ON CONFLICT(build_id,bonus_id) DO UPDATE SET
				source_artifact_id=EXCLUDED.source_artifact_id,payload=EXCLUDED.payload`, ic.BuildID, id, artifactID, raw)
			return err
		}
	case "item-curves.json":
		curveID := numericID(doc["curveId"])
		if curveID <= 0 {
			return nil
		}
		return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `DELETE FROM catalog_item_level_curve_points WHERE build_id=$1 AND curve_id=$2`, ic.BuildID, curveID); err != nil {
				return err
			}
			points, _ := doc["points"].([]any)
			for index, value := range points {
				point, _ := value.(map[string]any)
				if _, err := tx.Exec(ctx, `INSERT INTO catalog_item_level_curve_points(
					build_id,curve_id,point_index,player_level,item_level,source_artifact_id,attributes)
					VALUES($1,$2,$3,$4,$5,$6,$7)`, ic.BuildID, curveID, index, point["playerLevel"], point["itemLevel"], artifactID, point); err != nil {
					return err
				}
			}
			return nil
		})
	case "weapon-specs.json":
		classID, subclassID := int(numericID(doc["itemClass"])), int(numericID(doc["itemSubClass"]))
		canUse, canDrop := numericSet(doc["specsCanUse"]), numericSet(doc["specsCanDrop"])
		for specID := range canUse {
			if _, err := db.Exec(ctx, `INSERT INTO catalog_item_specialization_rules(
				build_id,item_class_id,item_subclass_id,specialization_id,can_use,can_drop,source_artifact_id,attributes)
				VALUES($1,$2,$3,$4,true,$5,$6,$7)
				ON CONFLICT(build_id,item_class_id,item_subclass_id,specialization_id) DO UPDATE SET
				can_use=true,can_drop=EXCLUDED.can_drop,source_artifact_id=EXCLUDED.source_artifact_id,attributes=EXCLUDED.attributes`,
				ic.BuildID, classID, subclassID, specID, canDrop[specID], artifactID, raw); err != nil {
				return err
			}
		}
		for specID := range canDrop {
			if _, exists := canUse[specID]; exists {
				continue
			}
			if _, err := db.Exec(ctx, `INSERT INTO catalog_item_specialization_rules(
				build_id,item_class_id,item_subclass_id,specialization_id,can_use,can_drop,source_artifact_id,attributes)
				VALUES($1,$2,$3,$4,false,true,$5,$6)
				ON CONFLICT(build_id,item_class_id,item_subclass_id,specialization_id) DO UPDATE SET
				can_drop=true,source_artifact_id=EXCLUDED.source_artifact_id,attributes=EXCLUDED.attributes`,
				ic.BuildID, classID, subclassID, specID, artifactID, raw); err != nil {
				return err
			}
		}
	case "class-traits.json":
		classID, treeID := int(numericID(doc["classId"])), nestedNumericID(doc["traitTree"], "id")
		if classID <= 0 || treeID <= 0 {
			return nil
		}
		return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_class_trait_trees(
				build_id,class_id,trait_tree_id,skill_line_id,class_name,source_artifact_id,attributes)
				VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(build_id,class_id,trait_tree_id) DO UPDATE SET
				skill_line_id=EXCLUDED.skill_line_id,class_name=EXCLUDED.class_name,
				source_artifact_id=EXCLUDED.source_artifact_id,attributes=EXCLUDED.attributes`,
				ic.BuildID, classID, treeID, nestedNumericID(doc["skillLine"], "id"), doc["className"], artifactID, raw); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `DELETE FROM catalog_class_trait_tree_specializations
				WHERE build_id=$1 AND class_id=$2 AND trait_tree_id=$3`, ic.BuildID, classID, treeID); err != nil {
				return err
			}
			for specID := range numericSet(doc["specs"]) {
				if _, err := tx.Exec(ctx, `INSERT INTO catalog_class_trait_tree_specializations(
					build_id,class_id,trait_tree_id,specialization_id) VALUES($1,$2,$3,$4)`, ic.BuildID, classID, treeID, specID); err != nil {
					return err
				}
			}
			return nil
		})
	case "item-conversions.json":
		id := numericID(doc["id"])
		if id > 0 {
			_, err := db.Exec(ctx, `INSERT INTO catalog_item_conversions(build_id,conversion_id,source_artifact_id,payload)
				VALUES($1,$2,$3,$4) ON CONFLICT(build_id,conversion_id) DO UPDATE SET
				source_artifact_id=EXCLUDED.source_artifact_id,payload=EXCLUDED.payload`, ic.BuildID, id, artifactID, raw)
			return err
		}
	case "currency-types.json":
		id := numericID(doc["id"])
		name := strings.TrimSpace(stringField(doc["name"]))
		if id > 0 && name != "" {
			payload, err := json.Marshal(map[string]any{"name": name, "raidbots": doc})
			if err != nil {
				return err
			}
			return store.UpsertCanonical(ctx, ic, catalogimport.Record{Type: "currency", ExternalID: id, Locale: "en_US", Payload: payload, SourceURL: sourceURL, SourceArtifactID: &artifactID})
		}
	case "encounter-items.json":
		return projectEncounterItem(ctx, db, store, ic, artifactID, sourceURL, raw, doc)
	case "icon-lookup.json":
		return projectIconLookup(ctx, db, ic, artifactID, key, doc)
	}
	return nil
}

func projectEncounterItem(ctx context.Context, db *pgxpool.Pool, store *catalogimport.Store, ic catalogimport.ImportContext, artifactID uuid.UUID, sourceURL string, raw json.RawMessage, doc map[string]any) error {
	record, include, err := raidbotsRecord(sourceURL, datasetSpecs["equippable-items-full.json"], raw)
	if err != nil || !include {
		return err
	}
	record.SourceArtifactID = &artifactID
	if err := store.UpsertCanonical(ctx, ic, record); err != nil {
		return err
	}
	digest := sha256.Sum256(raw)
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var versionID, variantID uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT v.id FROM game_entities e JOIN game_entity_versions v ON v.entity_id=e.id
			WHERE e.product_id=$1 AND e.entity_type='item' AND e.external_id=$2 AND v.build_id=$3
			ORDER BY (v.snapshot_id=$4) DESC,v.revision DESC LIMIT 1`, ic.ProductID, record.ExternalID, ic.BuildID, ic.SnapshotID).Scan(&versionID); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO catalog_item_variants(
			item_version_id,snapshot_id,source_artifact_id,variant_key,item_level,quality,content_hash,attributes)
			VALUES($1,$2,$3,'raidbots:encounter',$4,$5,$6,$7)
			ON CONFLICT(item_version_id,variant_key) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id,
			source_artifact_id=EXCLUDED.source_artifact_id,item_level=EXCLUDED.item_level,quality=EXCLUDED.quality,
			content_hash=EXCLUDED.content_hash,attributes=EXCLUDED.attributes,updated_at=now() RETURNING id`,
			versionID, ic.SnapshotID, artifactID, numericID(doc["itemLevel"]), numericID(doc["quality"]), digest[:], raw).Scan(&variantID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_item_variant_stats WHERE variant_id=$1`, variantID); err != nil {
			return err
		}
		stats, _ := doc["stats"].([]any)
		for index, value := range stats {
			stat, _ := value.(map[string]any)
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_item_variant_stats(
				variant_id,stat_index,stat_type,allocation,attributes) VALUES($1,$2,$3,$4,$5)`,
				variantID, index, numericID(stat["id"]), stat["alloc"], stat); err != nil {
				return err
			}
		}
		sources, _ := doc["sources"].([]any)
		for index, value := range sources {
			source, _ := value.(map[string]any)
			encounterID := numericID(source["encounterId"])
			if encounterID <= 0 {
				continue
			}
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_item_acquisition_sources(
				version_id,source_type,source_id,context_id,journal_instance_id,attributes,source_url,source_artifact_id)
				VALUES($1,'encounter',$2,$3,$4,$5,$6,$7)
				ON CONFLICT(version_id,source_type,source_id,context_id) DO UPDATE SET
				journal_instance_id=EXCLUDED.journal_instance_id,attributes=EXCLUDED.attributes,
				source_url=EXCLUDED.source_url,source_artifact_id=EXCLUDED.source_artifact_id`,
				versionID, encounterID, index, numericID(source["instanceId"]), source, sourceURL, artifactID); err != nil {
				return err
			}
		}
		return nil
	})
}

func projectIconLookup(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext, artifactID uuid.UUID, entityType string, values map[string]any) error {
	if entityType != "item" && entityType != "spell" && entityType != "currency" {
		return nil
	}
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `CREATE TEMP TABLE catalog_icon_stage(external_id BIGINT,icon_name TEXT) ON COMMIT DROP`); err != nil {
			return err
		}
		rows := make([][]any, 0, len(values))
		for rawID, rawName := range values {
			id, err := strconv.ParseInt(rawID, 10, 64)
			name, _ := rawName.(string)
			if err == nil && id > 0 && strings.TrimSpace(name) != "" {
				rows = append(rows, []any{id, name})
			}
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"catalog_icon_stage"}, []string{"external_id", "icon_name"}, pgx.CopyFromRows(rows)); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
			SELECT $1,$2,external_id,icon_name,$3 FROM catalog_icon_stage
			ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id`, ic.BuildID, entityType, artifactID)
		return err
	})
}

func numericSet(value any) map[int64]bool {
	result := make(map[int64]bool)
	values, _ := value.([]any)
	for _, raw := range values {
		if id := numericID(raw); id > 0 {
			result[id] = true
		}
	}
	return result
}

func nestedNumericID(value any, key string) int64 {
	doc, _ := value.(map[string]any)
	return numericID(doc[key])
}

func importDatasets(
	ctx context.Context,
	client *raidbots.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	contentHash string,
	itemIDs map[int64]struct{},
	seen, written *int64,
) error {
	importedClasses := make(map[int64]struct{})
	importedSpecs := make(map[int64]struct{})
	for _, file := range opts.files {
		spec := datasetSpecs[file]
		artifactID, err := store.RegisterArtifact(ctx, importContext, "raidbots", file, "en_US", client.URL(opts.environment, file), map[string]any{
			"environment": opts.environment, "raidbots_content_hash": contentHash,
		})
		if err != nil {
			return err
		}
		slog.Info("importing Raidbots dataset", "file", file, "type", spec.Type)
		talents := make(map[int64]*talentFact)
		_, err = client.Array(ctx, opts.environment, file, opts.maxRecords, func(raw json.RawMessage) error {
			record, include, err := raidbotsRecord(client.URL(opts.environment, file), spec, raw)
			if err != nil {
				return fmt.Errorf("normalize %s: %w", file, err)
			}
			if !include {
				return nil
			}
			record.SourceArtifactID = &artifactID
			(*seen)++
			if err := store.UpsertCanonical(ctx, importContext, record); err != nil {
				return fmt.Errorf("store %s %d: %w", spec.Type, record.ExternalID, err)
			}
			if spec.Type == "item" {
				itemIDs[record.ExternalID] = struct{}{}
			}
			if spec.Type == "talent_tree" {
				if err := collectTalentFacts(raw, talents); err != nil {
					return fmt.Errorf("collect talents from tree %d: %w", record.ExternalID, err)
				}
				var tree map[string]any
				if err := json.Unmarshal(raw, &tree); err != nil {
					return err
				}
				classID, specID := numericID(tree["classId"]), numericID(tree["specId"])
				if _, exists := importedClasses[classID]; classID > 0 && !exists {
					payload, _ := json.Marshal(map[string]any{"name": tree["className"], "raidbots": map[string]any{"classId": classID}})
					if err := store.UpsertCanonical(ctx, importContext, catalogimport.Record{Type: "class", ExternalID: classID, Locale: "en_US", Payload: payload, SourceURL: client.URL(opts.environment, file), SourceArtifactID: &artifactID}); err != nil {
						return fmt.Errorf("store class %d: %w", classID, err)
					}
					importedClasses[classID] = struct{}{}
					(*seen)++
					(*written)++
				}
				if _, exists := importedSpecs[specID]; specID > 0 && !exists {
					payload, _ := json.Marshal(map[string]any{"name": tree["specName"], "raidbots": map[string]any{"specId": specID, "classId": classID, "className": tree["className"], "traitTreeId": tree["traitTreeId"]}})
					if err := store.UpsertCanonical(ctx, importContext, catalogimport.Record{Type: "specialization", ExternalID: specID, Locale: "en_US", Payload: payload, SourceURL: client.URL(opts.environment, file), SourceArtifactID: &artifactID}); err != nil {
						return fmt.Errorf("store specialization %d: %w", specID, err)
					}
					importedSpecs[specID] = struct{}{}
					(*seen)++
					(*written)++
				}
			}
			(*written)++
			return nil
		})
		if err != nil {
			return fmt.Errorf("import Raidbots %s: %w", file, err)
		}
		if spec.Type == "talent_tree" {
			ids := make([]int64, 0, len(talents))
			for id := range talents {
				ids = append(ids, id)
			}
			slices.Sort(ids)
			for _, id := range ids {
				fact := talents[id]
				name := strings.TrimSpace(stringField(fact.entry["name"]))
				if name == "" {
					continue
				}
				details := make(map[string]any, len(fact.entry)+1)
				for key, value := range fact.entry {
					details[key] = value
				}
				details["appearances"] = fact.appearances
				payload, err := json.Marshal(map[string]any{"name": name, "raidbots": details})
				if err != nil {
					return fmt.Errorf("encode talent %d: %w", id, err)
				}
				record := catalogimport.Record{
					Type: "talent", ExternalID: id, Locale: "en_US", Payload: payload,
					SourceURL: client.URL(opts.environment, file), SourceArtifactID: &artifactID,
				}
				(*seen)++
				if err := store.UpsertCanonical(ctx, importContext, record); err != nil {
					return fmt.Errorf("store talent %d: %w", id, err)
				}
				(*written)++
			}
		}
	}
	return nil
}

func collectTalentFacts(raw json.RawMessage, talents map[int64]*talentFact) error {
	var tree map[string]any
	if err := json.Unmarshal(raw, &tree); err != nil {
		return err
	}
	for _, treeKind := range []string{"classNodes", "specNodes", "heroNodes", "subTreeNodes"} {
		nodes, _ := tree[treeKind].([]any)
		for _, rawNode := range nodes {
			node, _ := rawNode.(map[string]any)
			entries, _ := node["entries"].([]any)
			for _, rawEntry := range entries {
				entry, _ := rawEntry.(map[string]any)
				entryID := numericID(entry["id"])
				if entryID <= 0 || strings.TrimSpace(stringField(entry["name"])) == "" {
					continue
				}
				fact := talents[entryID]
				if fact == nil {
					fact = &talentFact{entry: entry, seen: make(map[string]struct{})}
					talents[entryID] = fact
				}
				appearance := map[string]any{
					"trait_tree_id": tree["traitTreeId"], "spec_id": tree["specId"],
					"class_id": tree["classId"], "class_name": tree["className"], "spec_name": tree["specName"],
					"tree_kind": strings.TrimSuffix(treeKind, "Nodes"), "node_id": node["id"],
					"sub_tree_id": node["subTreeId"], "position_x": node["posX"], "position_y": node["posY"],
				}
				key := fmt.Sprintf("%v/%v/%s/%v", tree["traitTreeId"], tree["specId"], treeKind, node["id"])
				if _, exists := fact.seen[key]; exists {
					continue
				}
				fact.seen[key] = struct{}{}
				fact.appearances = append(fact.appearances, appearance)
			}
		}
	}
	return nil
}

func importItemNames(
	ctx context.Context,
	client *raidbots.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	environment string,
	contentHash string,
	itemIDs map[int64]struct{},
	seen, written *int64,
) error {
	slog.Info("importing Raidbots item localizations", "items", len(itemIDs))
	artifactID, err := store.RegisterArtifact(ctx, importContext, "raidbots", "item-names.json", "ru_RU", client.URL(environment, "item-names.json"), map[string]any{
		"environment": environment, "raidbots_content_hash": contentHash,
	})
	if err != nil {
		return err
	}
	_, err = client.ItemNames(ctx, environment, itemIDs, func(itemID int64, names map[string]string) error {
		name := strings.TrimSpace(names["ru_RU"])
		if name == "" {
			return nil
		}
		payload, err := json.Marshal(map[string]any{"name": map[string]string{"ru_RU": name}})
		if err != nil {
			return fmt.Errorf("encode item %d localization: %w", itemID, err)
		}
		(*seen)++
		record := catalogimport.Record{
			Type: "item", ExternalID: itemID, Locale: "ru_RU", Payload: payload,
			SourceURL: client.URL(environment, "item-names.json"), SourceArtifactID: &artifactID,
		}
		if err := store.UpsertLocalization(ctx, importContext, record); err != nil {
			return fmt.Errorf("store item %d localization: %w", itemID, err)
		}
		(*written)++
		return nil
	})
	return err
}

func raidbotsRecord(sourceURL string, spec datasetSpec, raw json.RawMessage) (catalogimport.Record, bool, error) {
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return catalogimport.Record{}, false, err
	}
	id := numericID(doc[spec.IDField])
	if id <= 0 {
		return catalogimport.Record{}, false, nil
	}
	name := strings.TrimSpace(stringField(doc[spec.NameField]))
	if spec.Type == "talent_tree" {
		name = strings.TrimSpace(stringField(doc["className"]) + " — " + stringField(doc["specName"]))
	}
	if name == "" || name == "—" {
		return catalogimport.Record{}, false, nil
	}
	normalized := map[string]any{"name": name, "raidbots": doc}
	if spec.Type == "item" {
		normalized["level"] = doc["itemLevel"]
		if doc["quality"] != nil {
			normalized["quality"] = map[string]any{"type": fmt.Sprint(doc["quality"])}
		}
		if doc["inventoryType"] != nil {
			normalized["inventory_type"] = map[string]any{"type": fmt.Sprint(doc["inventoryType"])}
		}
		normalized["item_class"] = map[string]any{"id": doc["itemClass"]}
		normalized["item_subclass"] = map[string]any{"id": doc["itemSubClass"]}
		normalized["is_equippable"] = true
	}
	payload, err := json.Marshal(normalized)
	if err != nil {
		return catalogimport.Record{}, false, err
	}
	return catalogimport.Record{
		Type: spec.Type, ExternalID: id, Locale: "en_US", Payload: payload, SourceURL: sourceURL,
	}, true, nil
}

func parseOptions() (options, error) {
	var files, factFiles string
	opts := options{}
	flag.StringVar(&opts.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&opts.environment, "environment", "live", "Raidbots environment")
	flag.StringVar(&files, "files", defaultFiles, "comma-separated Raidbots datasets")
	flag.StringVar(&factFiles, "fact-files", defaultFactFiles, "comma-separated Raidbots fact datasets stored as source records")
	flag.IntVar(&opts.maxRecords, "max-records", 1000, "maximum records per dataset; 0 imports all")
	flag.Parse()
	opts.environment = strings.TrimSpace(opts.environment)
	opts.files = splitList(files)
	opts.factFiles = splitList(factFiles)
	switch {
	case opts.databaseURL == "":
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	case len(opts.files) == 0:
		return options{}, errors.New("at least one Raidbots dataset is required")
	case opts.maxRecords < 0:
		return options{}, errors.New("max-records cannot be negative")
	}
	for _, file := range opts.files {
		if _, ok := datasetSpecs[file]; !ok {
			return options{}, fmt.Errorf("unsupported Raidbots dataset %q", file)
		}
	}
	return opts, nil
}

func factRecordKey(fallback string, raw json.RawMessage) string {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err == nil {
		for _, field := range []string{"id", "itemId", "curveId", "index", "traitTreeId"} {
			if value, ok := doc[field]; ok {
				var number json.Number
				if err := json.Unmarshal(value, &number); err == nil && number.String() != "" {
					return number.String()
				}
			}
		}
	}
	if index, err := strconv.Atoi(fallback); err == nil {
		return fmt.Sprintf("%012d", index)
	}
	return fallback
}

func buildNumber(version string) (int, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid Raidbots build %q", version)
	}
	result, err := strconv.Atoi(parts[3])
	if err != nil || result <= 0 {
		return 0, fmt.Errorf("invalid Raidbots build %q", version)
	}
	return result, nil
}

func numericID(value any) int64 {
	number, ok := value.(float64)
	if !ok {
		return 0
	}
	return int64(number)
}

func stringField(value any) string {
	result, _ := value.(string)
	return result
}

func splitList(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
