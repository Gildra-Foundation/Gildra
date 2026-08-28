package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/signal"
	"path"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"
)

var errWagoRecordMissingName = errors.New("Wago record has no localized name")

const defaultWagoTableTimeout = 2 * time.Hour

type battleNetEntitySpec struct {
	Resource        string
	IndexFields     []string
	Search          bool
	FetchDetail     bool
	FetchMedia      bool
	QuestCategories bool
}

var battleNetEntitySpecs = map[string]battleNetEntitySpec{
	"item":           {Resource: "item", Search: true},
	"spell":          {Resource: "spell", Search: true, FetchDetail: true},
	"creature":       {Resource: "creature", Search: true},
	"quest":          {Resource: "quest", QuestCategories: true},
	"talent":         {Resource: "talent", IndexFields: []string{"talents"}},
	"pvp_talent":     {Resource: "pvp-talent", IndexFields: []string{"pvp_talents"}},
	"profession":     {Resource: "profession", IndexFields: []string{"professions"}, FetchMedia: true},
	"mount":          {Resource: "mount", IndexFields: []string{"mounts"}, FetchMedia: true},
	"battle_pet":     {Resource: "pet", IndexFields: []string{"pets"}, FetchMedia: true},
	"class":          {Resource: "playable-class", IndexFields: []string{"classes"}, FetchMedia: true},
	"specialization": {Resource: "playable-specialization", IndexFields: []string{"character_specializations"}, FetchMedia: true},
	"achievement":    {Resource: "achievement", IndexFields: []string{"achievements"}, FetchMedia: true},
	"item_set":       {Resource: "item-set", IndexFields: []string{"item_sets"}},
	"instance":       {Resource: "journal-instance", IndexFields: []string{"instances"}, FetchMedia: true},
	"encounter":      {Resource: "journal-encounter", IndexFields: []string{"encounters"}},
	"faction":        {Resource: "reputation-faction", IndexFields: []string{"factions"}},
}

var battleNetAllEntityTypes = []string{
	"item", "spell", "creature", "quest", "talent", "pvp_talent", "profession",
	"mount", "battle_pet", "class", "specialization", "achievement", "item_set",
	"instance", "encounter", "faction",
}

type options struct {
	source           string
	databaseURL      string
	clientID         string
	clientSecret     string
	product          string
	buildNumber      int
	buildVersion     string
	locales          []string
	entityTypes      []string
	pageSize         int
	maxRecords       int
	detailWorkers    int
	mediaOnly        bool
	wagoTableTimeout time.Duration
}

func main() {
	if err := run(); err != nil {
		slog.Error("catalog import failed", "error", err)
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

	var wagoClient *wago.Client
	var battleNetClient *battlenet.Client
	switch opts.source {
	case "wago":
		wagoClient = wago.New(wago.Config{})
		if opts.buildVersion == "" {
			opts.buildVersion, err = wagoClient.CurrentBuild(ctx, "ItemSparse", "enUS")
			if err != nil {
				return err
			}
		}
		if opts.buildNumber == 0 {
			opts.buildNumber, err = buildNumber(opts.buildVersion)
			if err != nil {
				return err
			}
		}
	case "battlenet":
		battleNetClient, err = battlenet.New(battlenet.Config{ClientID: opts.clientID, ClientSecret: opts.clientSecret})
		if err != nil {
			return err
		}
		discoveryNamespace, err := battleNetNamespace(opts.product, "us")
		if err != nil {
			return err
		}
		detectedBuild, detectedVersion, err := battleNetClient.CurrentBuildForNamespace(ctx, "us", "en_US", discoveryNamespace)
		if err != nil {
			return err
		}
		if opts.buildNumber != 0 && (opts.buildNumber != detectedBuild || opts.buildVersion != detectedVersion) {
			slog.Warn("configured Battle.net build differs from the currently published API namespace",
				"configured", opts.buildVersion, "published", detectedVersion)
		}
		opts.buildNumber, opts.buildVersion = detectedBuild, detectedVersion
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
		"source": opts.source, "locales": opts.locales, "entity_types": opts.entityTypes,
		"page_size": opts.pageSize, "max_records_per_type": opts.maxRecords,
		"detail_workers": opts.detailWorkers, "media_only": opts.mediaOnly,
		"wago_table_timeout": effectiveWagoTableTimeout(opts.wagoTableTimeout).String(),
	}
	importContext, err := store.Begin(ctx, opts.product, opts.buildNumber, opts.buildVersion, "us", sourceName(opts.source), releaseID, parameters)
	if err != nil {
		return err
	}
	var seen, written int64
	var importErr error
	if opts.source == "wago" {
		importErr = importWago(ctx, wagoClient, store, importContext, opts, &seen, &written)
	} else if opts.mediaOnly {
		importErr = importBattleNetMedia(ctx, battleNetClient, store, importContext, opts, &seen, &written)
	} else {
		importErr = importBattleNet(ctx, battleNetClient, store, importContext, opts, &seen, &written)
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
	slog.Info("catalog import completed", "source", opts.source, "seen", seen, "written", written, "build", opts.buildVersion)
	return nil
}

func importWago(
	ctx context.Context,
	client *wago.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	seen, written *int64,
) error {
	for _, locale := range opts.locales {
		wagoLocale, err := wagoLocale(locale)
		if err != nil {
			return err
		}
		var spellTexts map[int64]spellText
		var spellArtifactID *uuid.UUID
		if contains(opts.entityTypes, "spell") {
			var artifactID uuid.UUID
			spellTexts, artifactID, err = importWagoSpellTexts(ctx, client, store, importContext, opts, locale, wagoLocale)
			if err != nil {
				return fmt.Errorf("load Wago spell text (%s): %w", locale, err)
			}
			spellArtifactID = &artifactID
		}
		for _, entityType := range opts.entityTypes {
			table := map[string]string{"item": "ItemSparse", "spell": "SpellName"}[entityType]
			sourceURL := client.CSVURL(table, opts.buildVersion, wagoLocale)
			metadata := map[string]any{
				"table": table, "build": opts.buildVersion, "locale": locale, "entity_type": entityType,
				"bounded": opts.maxRecords > 0, "max_records": opts.maxRecords,
			}
			var artifactID uuid.UUID
			if opts.maxRecords == 0 {
				artifactID, err = store.RegisterPendingArtifact(ctx, importContext, "wago_tools", table, locale, sourceURL, metadata)
			} else {
				artifactID, err = store.RegisterArtifact(ctx, importContext, "wago_tools", table, locale, sourceURL, metadata)
			}
			if err != nil {
				return err
			}
			slog.Info("importing Wago table", "table", table, "locale", locale, "build", opts.buildVersion)
			artifactErr := func() (resultErr error) {
				finalized := false
				defer func() {
					if finalized {
						return
					}
					if failErr := store.FailArtifact(context.WithoutCancel(ctx), artifactID, resultErr); failErr != nil {
						slog.Error("fail Wago artifact", "table", table, "locale", locale, "error", failErr)
					}
				}()
				tableContext, cancel := context.WithTimeout(ctx, effectiveWagoTableTimeout(opts.wagoTableTimeout))
				defer cancel()
				_, proof, err := client.RowsWithProof(tableContext, table, opts.buildVersion, wagoLocale, opts.maxRecords, func(row map[string]string) error {
					(*seen)++
					record, err := wagoRecordWithSpellText(entityType, locale, sourceURL, row, spellTexts)
					if err != nil {
						if errors.Is(err, errWagoRecordMissingName) {
							slog.Warn("skipping unnamed Wago record", "type", entityType, "id", row["ID"], "locale", locale)
							return reportWagoProgress(ctx, store, importContext.RunID, table, locale, *seen, *written)
						}
						return err
					}
					record.SourceArtifactID = &artifactID
					if entityType == "spell" && spellArtifactID != nil {
						record.SupportingSourceArtifactIDs = []uuid.UUID{*spellArtifactID}
					}
					if locale == "en_US" {
						err = store.UpsertCanonical(ctx, importContext, record)
					} else {
						err = store.UpsertLocalization(ctx, importContext, record)
					}
					if err != nil {
						return fmt.Errorf("store %s %d (%s): %w", entityType, record.ExternalID, locale, err)
					}
					(*written)++
					return reportWagoProgress(ctx, store, importContext.RunID, table, locale, *seen, *written)
				})
				if err != nil {
					return fmt.Errorf("import Wago %s (%s): %w", table, locale, err)
				}
				if proof.Complete {
					if err := store.CompleteArtifact(ctx, artifactID, proof.SHA256, proof.ByteSize, proof.ETag); err != nil {
						return err
					}
				} else if opts.maxRecords == 0 {
					return fmt.Errorf("Wago %s (%s) ended without a complete content proof", table, locale)
				}
				if err := store.UpdateProgress(ctx, importContext.RunID, *seen, *written); err != nil {
					return err
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

func reportWagoProgress(
	ctx context.Context,
	store *catalogimport.Store,
	runID uuid.UUID,
	table, locale string,
	seen, written int64,
) error {
	if seen == 0 || seen%10_000 != 0 {
		return nil
	}
	slog.Info("catalog import progress", "table", table, "locale", locale, "seen", seen, "written", written)
	return store.UpdateProgress(ctx, runID, seen, written)
}

func importWagoSpellTexts(
	ctx context.Context,
	client *wago.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	locale, wagoLocale string,
) (texts map[int64]spellText, artifactID uuid.UUID, resultErr error) {
	table := "Spell"
	sourceURL := client.CSVURL(table, opts.buildVersion, wagoLocale)
	metadata := map[string]any{
		"table": table, "build": opts.buildVersion, "locale": locale, "entity_type": "spell",
		"projection": "localized_spell_text", "bounded": opts.maxRecords > 0, "max_records": opts.maxRecords,
	}
	var err error
	if opts.maxRecords == 0 {
		artifactID, err = store.RegisterPendingArtifact(ctx, importContext, "wago_tools", table, locale, sourceURL, metadata)
	} else {
		artifactID, err = store.RegisterArtifact(ctx, importContext, "wago_tools", table, locale, sourceURL, metadata)
	}
	if err != nil {
		return nil, uuid.Nil, err
	}
	finalized := false
	defer func() {
		if finalized {
			return
		}
		if failErr := store.FailArtifact(context.WithoutCancel(ctx), artifactID, resultErr); failErr != nil {
			slog.Error("fail Wago artifact", "table", table, "locale", locale, "error", failErr)
		}
	}()
	slog.Info("importing Wago table", "table", table, "locale", locale, "build", opts.buildVersion)
	tableContext, cancel := context.WithTimeout(ctx, effectiveWagoTableTimeout(opts.wagoTableTimeout))
	defer cancel()
	texts, proof, err := loadSpellTexts(tableContext, client, opts.buildVersion, wagoLocale, opts.maxRecords)
	if err != nil {
		return nil, artifactID, fmt.Errorf("import Wago %s (%s): %w", table, locale, err)
	}
	if proof.Complete {
		if err := store.CompleteArtifact(ctx, artifactID, proof.SHA256, proof.ByteSize, proof.ETag); err != nil {
			return nil, artifactID, err
		}
	} else if opts.maxRecords == 0 {
		return nil, artifactID, fmt.Errorf("Wago %s (%s) ended without a complete content proof", table, locale)
	}
	finalized = true
	return texts, artifactID, nil
}

type spellText struct {
	Subtext         string
	Description     string
	AuraDescription string
}

func loadSpellTexts(
	ctx context.Context,
	client *wago.Client,
	build, locale string,
	limit int,
) (map[int64]spellText, wago.ContentProof, error) {
	texts := make(map[int64]spellText)
	_, proof, err := client.RowsWithProof(ctx, "Spell", build, locale, limit, func(row map[string]string) error {
		id, err := strconv.ParseInt(row["ID"], 10, 64)
		if err != nil || id <= 0 {
			return nil
		}
		texts[id] = spellText{
			Subtext:         strings.TrimSpace(row["NameSubtext_lang"]),
			Description:     strings.TrimSpace(row["Description_lang"]),
			AuraDescription: strings.TrimSpace(row["AuraDescription_lang"]),
		}
		return nil
	})
	return texts, proof, err
}

func wagoRecord(entityType, locale, sourceURL string, row map[string]string) (catalogimport.Record, error) {
	return wagoRecordWithSpellText(entityType, locale, sourceURL, row, nil)
}

func wagoRecordWithSpellText(entityType, locale, sourceURL string, row map[string]string, spellTexts map[int64]spellText) (catalogimport.Record, error) {
	id, err := strconv.ParseInt(row["ID"], 10, 64)
	if err != nil || id <= 0 {
		return catalogimport.Record{}, fmt.Errorf("invalid %s ID %q", entityType, row["ID"])
	}
	nameField := map[string]string{"item": "Display_lang", "spell": "Name_lang"}[entityType]
	name := strings.TrimSpace(row[nameField])
	if name == "" {
		return catalogimport.Record{}, fmt.Errorf("%w: %s %d", errWagoRecordMissingName, entityType, id)
	}
	description := strings.TrimSpace(row["Description_lang"])
	payload := map[string]any{
		"id": id, "name": name, "description": strings.TrimSpace(row["Description_lang"]),
		"db2": row,
	}
	if entityType == "spell" {
		if text, ok := spellTexts[id]; ok {
			description = text.Description
			payload["description"] = description
			payload["subtext"] = text.Subtext
			payload["aura_description"] = text.AuraDescription
		}
	}
	if entityType == "item" {
		payload["level"] = integerField(row, "ItemLevel")
		payload["required_level"] = integerField(row, "RequiredLevel")
		payload["max_count"] = integerField(row, "MaxCount")
		payload["purchase_price"] = integerField(row, "BuyPrice")
		payload["sell_price"] = integerField(row, "SellPrice")
		payload["inventory_type"] = map[string]any{"type": row["InventoryType"]}
		payload["quality"] = map[string]any{"type": row["OverallQualityID"]}
		payload["is_equippable"] = integerField(row, "InventoryType") > 0
		payload["is_stackable"] = integerField(row, "Stackable") > 1
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return catalogimport.Record{}, fmt.Errorf("encode Wago %s %d: %w", entityType, id, err)
	}
	return catalogimport.Record{Type: entityType, ExternalID: id, Locale: locale, Payload: encoded, SourceURL: sourceURL}, nil
}

func contains(values []string, expected string) bool {
	return slices.Contains(values, expected)
}

func importBattleNet(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	seen, written *int64,
) error {
	for _, locale := range opts.locales {
		region, err := regionForLocale(locale)
		if err != nil {
			return err
		}
		namespace, err := battleNetNamespace(opts.product, region)
		if err != nil {
			return err
		}
		for _, entityType := range opts.entityTypes {
			spec := battleNetEntitySpecs[entityType]
			slog.Info("importing catalog type", "type", entityType, "locale", locale, "region", region)
			var collectionURL string
			if spec.Search {
				collectionURL, err = client.SearchURL(region, namespace, locale, spec.Resource, 1, opts.pageSize)
			} else {
				collectionURL, err = client.IndexURL(region, namespace, locale, spec.Resource)
			}
			if err != nil {
				return err
			}
			artifactID, err := store.RegisterPendingArtifact(ctx, importContext, "blizzard_api",
				"battlenet/"+entityType, locale, collectionURL, map[string]any{
					"entity_type": entityType, "namespace": namespace, "locale": locale,
					"page_size": opts.pageSize, "proof_scope": "source_record_manifest_v1",
					"bounded": opts.maxRecords > 0, "max_records": opts.maxRecords,
				})
			if err != nil {
				return err
			}
			err = runBattleNetArtifact(ctx, store, artifactID, entityType, locale, func() error {
				if spec.Search {
					return importSearchType(ctx, client, store, importContext, region, namespace, locale,
						entityType, spec, opts.pageSize, opts.maxRecords, opts.detailWorkers, artifactID, seen, written)
				}
				if spec.QuestCategories {
					return importQuestType(ctx, client, store, importContext, region, namespace, locale,
						entityType, spec, opts.maxRecords, opts.detailWorkers, artifactID, seen, written)
				}
				return importIndexType(ctx, client, store, importContext, region, namespace, locale,
					entityType, spec, opts.maxRecords, opts.detailWorkers, artifactID, seen, written)
			})
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func runBattleNetArtifact(
	ctx context.Context,
	store *catalogimport.Store,
	artifactID uuid.UUID,
	entityType, locale string,
	importArtifact func() error,
) (resultErr error) {
	finalized := false
	defer func() {
		if finalized {
			return
		}
		if failErr := store.FailArtifact(context.WithoutCancel(ctx), artifactID, resultErr); failErr != nil {
			slog.Error("fail Battle.net artifact", "type", entityType, "locale", locale, "error", failErr)
		}
	}()
	if err := importArtifact(); err != nil {
		return err
	}
	proof, err := store.CompleteArtifactFromRecords(ctx, artifactID)
	if err != nil {
		return fmt.Errorf("complete Battle.net artifact %s (%s): %w", entityType, locale, err)
	}
	finalized = true
	slog.Info("proved Battle.net artifact", "type", entityType, "locale", locale,
		"records", proof.RecordCount, "manifest_bytes", proof.ByteSize,
		"sha256", fmt.Sprintf("%x", proof.SHA256))
	return nil
}

func importBattleNetMedia(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	seen, written *int64,
) (resultErr error) {
	candidates, err := store.BattleNetMediaCandidates(ctx, importContext.BuildID, opts.entityTypes)
	if err != nil {
		return err
	}
	artifacts := make(map[string]uuid.UUID)
	defer func() {
		for entityType, artifactID := range artifacts {
			if failErr := store.FailArtifact(context.WithoutCancel(ctx), artifactID, resultErr); failErr != nil {
				slog.Error("fail Battle.net media artifact", "type", entityType, "error", failErr)
			}
		}
	}()
	completeArtifacts := func() error {
		for entityType, artifactID := range artifacts {
			proof, err := store.CompleteArtifactFromRecords(ctx, artifactID)
			if err != nil {
				return fmt.Errorf("complete Battle.net media artifact %s: %w", entityType, err)
			}
			delete(artifacts, entityType)
			slog.Info("proved Battle.net media artifact", "type", entityType,
				"records", proof.RecordCount, "manifest_bytes", proof.ByteSize,
				"sha256", fmt.Sprintf("%x", proof.SHA256))
		}
		return nil
	}
	for _, candidate := range candidates {
		if opts.maxRecords > 0 && int(*seen) >= opts.maxRecords {
			return completeArtifacts()
		}
		artifactID, exists := artifacts[candidate.EntityType]
		if !exists {
			artifactID, err = store.RegisterPendingArtifact(ctx, importContext, "blizzard_api",
				"battlenet-media/"+candidate.EntityType, "en_US", candidate.Href, map[string]any{
					"entity_type": candidate.EntityType, "locale": "en_US", "media_only": true,
					"proof_scope": "source_record_manifest_v1",
					"bounded":     opts.maxRecords > 0, "max_records": opts.maxRecords,
				})
			if err != nil {
				return err
			}
			artifacts[candidate.EntityType] = artifactID
		}
		(*seen)++
		if err := fetchAndStoreBattleNetMediaLink(ctx, client, store, importContext, artifactID,
			"us", candidate.EntityType, "en_US", candidate.ExternalID,
			battleNetMediaLink{Href: candidate.Href, AssetPrefix: candidate.AssetPrefix}); err != nil {
			return err
		}
		(*written)++
		logBattleNetProgress(candidate.EntityType, "en_US", int(*seen), *seen, *written)
	}
	return completeArtifacts()
}

func importSearchType(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	region, namespace, locale, entityType string,
	spec battleNetEntitySpec,
	pageSize, maxRecords, detailWorkers int,
	artifactID uuid.UUID,
	seen, written *int64,
) error {
	maxID, err := store.MaxExternalID(ctx, importContext.ProductID, entityType)
	if err != nil {
		return err
	}
	if maxRecords == 0 {
		officialMaxID, err := client.MaxExternalID(ctx, region, namespace, locale, spec.Resource)
		if err != nil {
			return fmt.Errorf("discover highest official Battle.net %s ID (%s): %w", entityType, locale, err)
		}
		if officialMaxID > maxID {
			maxID = officialMaxID
		}
		slog.Info("discovered official catalog boundary", "type", entityType, "locale", locale, "max_id", officialMaxID)
	}
	if maxID <= 0 {
		if maxRecords == 0 {
			slog.Info("official catalog index is empty", "type", entityType, "locale", locale)
			return nil
		}
		return importBoundedSearchBootstrap(ctx, client, store, importContext, region, namespace, locale,
			entityType, spec, pageSize, maxRecords, artifactID, seen, written)
	}
	const rangeSize int64 = 1000
	processed := 0
	for rangeStart := int64(1); rangeStart <= maxID; rangeStart += rangeSize {
		rangeEnd := min(rangeStart+rangeSize-1, maxID)
		for pageNumber := 1; ; pageNumber++ {
			page, err := client.SearchRange(ctx, region, namespace, locale, spec.Resource, pageNumber, pageSize, rangeStart, rangeEnd)
			if err != nil {
				return fmt.Errorf("search %s range [%d,%d] page %d (%s): %w", entityType, rangeStart, rangeEnd, pageNumber, locale, err)
			}
			if spec.FetchDetail && maxRecords == 0 && detailWorkers > 1 {
				details, err := fetchBattleNetSearchDetails(ctx, client, region, locale, page.Results, detailWorkers)
				if err != nil {
					return fmt.Errorf("fetch %s search details range [%d,%d] page %d (%s): %w",
						entityType, rangeStart, rangeEnd, pageNumber, locale, err)
				}
				for _, detail := range details {
					(*seen)++
					if detail.Missing {
						slog.Warn("skipping missing Battle.net detail", "type", entityType, "id", detail.ID, "locale", locale)
						continue
					}
					if err := storeBattleNetRecord(ctx, store, importContext, artifactID, entityType, locale,
						detail.ID, detail.Payload, detail.SourceURL); err != nil {
						return err
					}
					(*written)++
					processed++
					logBattleNetProgress(entityType, locale, processed, *seen, *written)
				}
				if len(page.Results) == 0 || page.PageCount > 0 && pageNumber >= page.PageCount {
					break
				}
				continue
			}
			for _, result := range page.Results {
				if maxRecords > 0 && processed >= maxRecords {
					return nil
				}
				id, err := searchResultID(result.Data)
				if err != nil {
					return fmt.Errorf("read %s search result: %w", entityType, err)
				}
				(*seen)++
				if strings.TrimSpace(result.Key.Href) == "" {
					return fmt.Errorf("read %s search result %d: missing build-pinned resource link", entityType, id)
				}
				payload, sourceURL := result.Data, result.Key.Href
				if spec.FetchDetail {
					payload, sourceURL, err = client.FetchLink(ctx, region, locale, result.Key.Href)
					if err != nil {
						if battlenet.IsNotFound(err) {
							slog.Warn("skipping missing Battle.net detail", "type", entityType, "id", id, "locale", locale)
							continue
						}
						return fmt.Errorf("fetch %s %d (%s): %w", entityType, id, locale, err)
					}
				}
				if err := storeBattleNetRecord(ctx, store, importContext, artifactID, entityType, locale, id, payload, sourceURL); err != nil {
					return err
				}
				(*written)++
				processed++
				logBattleNetProgress(entityType, locale, processed, *seen, *written)
			}
			if len(page.Results) == 0 || page.PageCount > 0 && pageNumber >= page.PageCount {
				break
			}
		}
	}
	return nil
}

func importBoundedSearchBootstrap(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	region, namespace, locale, entityType string,
	spec battleNetEntitySpec,
	pageSize, maxRecords int,
	artifactID uuid.UUID,
	seen, written *int64,
) error {
	processed := 0
	for pageNumber := 1; processed < maxRecords; pageNumber++ {
		page, err := client.Search(ctx, region, namespace, locale, spec.Resource, pageNumber, min(pageSize, maxRecords-processed))
		if err != nil {
			return fmt.Errorf("bootstrap search %s page %d (%s): %w", entityType, pageNumber, locale, err)
		}
		for _, result := range page.Results {
			if processed >= maxRecords {
				return nil
			}
			id, err := searchResultID(result.Data)
			if err != nil {
				return fmt.Errorf("read %s bootstrap search result: %w", entityType, err)
			}
			(*seen)++
			if strings.TrimSpace(result.Key.Href) == "" {
				return fmt.Errorf("read %s bootstrap search result %d: missing build-pinned resource link", entityType, id)
			}
			payload, sourceURL := result.Data, result.Key.Href
			if spec.FetchDetail {
				payload, sourceURL, err = client.FetchLink(ctx, region, locale, result.Key.Href)
				if err != nil {
					if battlenet.IsNotFound(err) {
						slog.Warn("skipping missing Battle.net bootstrap detail", "type", entityType, "id", id, "locale", locale)
						continue
					}
					return fmt.Errorf("fetch %s bootstrap detail %d (%s): %w", entityType, id, locale, err)
				}
			}
			if err := storeBattleNetRecord(ctx, store, importContext, artifactID, entityType, locale, id, payload, sourceURL); err != nil {
				return err
			}
			(*written)++
			processed++
		}
		if len(page.Results) == 0 || page.PageCount > 0 && pageNumber >= page.PageCount {
			break
		}
	}
	return nil
}

type battleNetDetailFetcher interface {
	FetchLink(context.Context, string, string, string) (json.RawMessage, string, error)
}

type battleNetSearchDetail struct {
	ID        int64
	Payload   json.RawMessage
	SourceURL string
	Missing   bool
}

func fetchBattleNetSearchDetails(
	ctx context.Context,
	client battleNetDetailFetcher,
	region, locale string,
	results []battlenet.SearchResult,
	workers int,
) ([]battleNetSearchDetail, error) {
	if workers < 1 {
		return nil, errors.New("detail worker count must be positive")
	}
	details := make([]battleNetSearchDetail, len(results))
	for i, result := range results {
		id, err := searchResultID(result.Data)
		if err != nil {
			return nil, fmt.Errorf("read search result: %w", err)
		}
		if strings.TrimSpace(result.Key.Href) == "" {
			return nil, fmt.Errorf("read search result %d: missing build-pinned resource link", id)
		}
		details[i].ID = id
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(workers)
	for i, result := range results {
		group.Go(func() error {
			payload, sourceURL, err := client.FetchLink(groupCtx, region, locale, result.Key.Href)
			if err != nil {
				if battlenet.IsNotFound(err) {
					details[i].Missing = true
					return nil
				}
				return fmt.Errorf("fetch detail %d (%s): %w", details[i].ID, locale, err)
			}
			details[i].Payload = payload
			details[i].SourceURL = sourceURL
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}
	return details, nil
}

func importIndexType(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	region, namespace, locale, entityType string,
	spec battleNetEntitySpec,
	maxRecords int,
	detailWorkers int,
	artifactID uuid.UUID,
	seen, written *int64,
) error {
	indexPayload, _, err := client.Index(ctx, region, namespace, locale, spec.Resource)
	if err != nil {
		return fmt.Errorf("fetch %s index (%s): %w", entityType, locale, err)
	}
	if _, err := store.UpsertSourceRecord(ctx, artifactID, "_index", indexPayload); err != nil {
		return fmt.Errorf("preserve %s index (%s): %w", entityType, locale, err)
	}
	entries, err := indexResultEntries(indexPayload, spec.IndexFields...)
	if err != nil {
		return fmt.Errorf("read %s index (%s): %w", entityType, locale, err)
	}
	if maxRecords > 0 && len(entries) > maxRecords {
		entries = entries[:maxRecords]
	}
	processed := 0
	batchSize := battleNetIndexBatchSize(detailWorkers)
	for offset := 0; offset < len(entries); offset += batchSize {
		end := min(offset+batchSize, len(entries))
		batch := entries[offset:end]
		for _, entry := range batch {
			if strings.TrimSpace(entry.Href) == "" {
				return fmt.Errorf("read %s index entry %d: missing build-pinned resource link", entityType, entry.ID)
			}
		}
		*seen += int64(len(batch))
		details, err := fetchBattleNetIndexDetails(ctx, client, region, locale, batch, detailWorkers)
		if err != nil {
			return fmt.Errorf("fetch %s index details (%s): %w", entityType, locale, err)
		}
		previousProcessed := processed
		persisted := make([]battleNetSearchDetail, 0, len(details))
		for _, detail := range details {
			processed++
			if detail.Missing {
				slog.Warn("skipping missing Battle.net detail", "type", entityType, "id", detail.ID, "locale", locale)
				continue
			}
			if err := storeBattleNetRecord(ctx, store, importContext, artifactID, entityType, locale,
				detail.ID, detail.Payload, detail.SourceURL); err != nil {
				return err
			}
			persisted = append(persisted, detail)
		}
		if spec.FetchMedia && locale == "en_US" {
			group, groupCtx := errgroup.WithContext(ctx)
			group.SetLimit(detailWorkers)
			for _, detail := range persisted {
				group.Go(func() error {
					return fetchAndStoreBattleNetMedia(groupCtx, client, store, importContext, artifactID,
						region, entityType, locale, detail.ID, detail.Payload)
				})
			}
			if err := group.Wait(); err != nil {
				return err
			}
		}
		*written += int64(len(persisted))
		if processed/1000 > previousProcessed/1000 || processed == len(entries) {
			slog.Info("catalog import progress", "type", entityType, "locale", locale,
				"processed", processed, "seen", *seen, "written", *written)
		}
	}
	return nil
}

func battleNetIndexBatchSize(detailWorkers int) int {
	if detailWorkers < 1 {
		return 1
	}
	return min(max(detailWorkers*16, 32), 512)
}

func importQuestType(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	region, namespace, locale, entityType string,
	spec battleNetEntitySpec,
	maxRecords int,
	detailWorkers int,
	artifactID uuid.UUID,
	seen, written *int64,
) error {
	indexPayload, _, err := client.Index(ctx, region, namespace, locale, spec.Resource)
	if err != nil {
		return fmt.Errorf("fetch quest index (%s): %w", locale, err)
	}
	if _, err := store.UpsertSourceRecord(ctx, artifactID, "_index", indexPayload); err != nil {
		return fmt.Errorf("preserve quest index (%s): %w", locale, err)
	}
	categoriesHref, err := linkedHref(indexPayload, "categories")
	if err != nil {
		return fmt.Errorf("read quest category index link (%s): %w", locale, err)
	}
	categoriesPayload, _, err := client.FetchLink(ctx, region, locale, categoriesHref)
	if err != nil {
		return fmt.Errorf("fetch quest category index (%s): %w", locale, err)
	}
	if _, err := store.UpsertSourceRecord(ctx, artifactID, "category/_index", categoriesPayload); err != nil {
		return fmt.Errorf("preserve quest category index (%s): %w", locale, err)
	}
	categories, err := indexResultEntries(categoriesPayload, "categories")
	if err != nil {
		return fmt.Errorf("read quest categories (%s): %w", locale, err)
	}
	processed := 0
	seenQuestIDs := make(map[int64]struct{})
	for _, category := range categories {
		if maxRecords > 0 && processed >= maxRecords {
			return nil
		}
		categoryPayload, _, err := client.FetchLink(ctx, region, locale, category.Href)
		if err != nil {
			return fmt.Errorf("fetch quest category %d (%s): %w", category.ID, locale, err)
		}
		if _, err := store.UpsertSourceRecord(ctx, artifactID, fmt.Sprintf("category/%d", category.ID), categoryPayload); err != nil {
			return fmt.Errorf("preserve quest category %d (%s): %w", category.ID, locale, err)
		}
		quests, err := indexResultEntries(categoryPayload, "quests")
		if err != nil {
			// Empty categories are valid and contain no quest IDs.
			if strings.Contains(err.Error(), "contained entity IDs") {
				continue
			}
			return fmt.Errorf("read quest category %d (%s): %w", category.ID, locale, err)
		}
		batch := make([]battleNetIndexEntry, 0, len(quests))
		for _, quest := range quests {
			if maxRecords > 0 && processed >= maxRecords {
				break
			}
			if _, exists := seenQuestIDs[quest.ID]; exists {
				continue
			}
			seenQuestIDs[quest.ID] = struct{}{}
			(*seen)++
			processed++
			batch = append(batch, quest)
		}
		details, err := fetchBattleNetIndexDetails(ctx, client, region, locale, batch, detailWorkers)
		if err != nil {
			return err
		}
		for _, detail := range details {
			if detail.Missing {
				slog.Warn("skipping missing Battle.net quest detail", "id", detail.ID, "locale", locale)
				continue
			}
			if err := storeBattleNetRecord(ctx, store, importContext, artifactID, entityType, locale, detail.ID, detail.Payload, detail.SourceURL); err != nil {
				return err
			}
			(*written)++
			logBattleNetProgress(entityType, locale, processed, *seen, *written)
		}
		if maxRecords > 0 && processed >= maxRecords {
			return nil
		}
	}
	return nil
}

func fetchBattleNetIndexDetails(
	ctx context.Context,
	client battleNetDetailFetcher,
	region, locale string,
	entries []battleNetIndexEntry,
	workers int,
) ([]battleNetSearchDetail, error) {
	results := make([]battlenet.SearchResult, len(entries))
	for i, entry := range entries {
		results[i] = battlenet.SearchResult{
			Key:  battlenet.ResourceKey{Href: entry.Href},
			Data: json.RawMessage(fmt.Sprintf(`{"id":%d}`, entry.ID)),
		}
	}
	return fetchBattleNetSearchDetails(ctx, client, region, locale, results, workers)
}

func fetchAndStoreBattleNetMedia(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	region, entityType, locale string,
	id int64,
	entityPayload json.RawMessage,
) error {
	links := battleNetMediaLinks(entityPayload)
	for _, link := range links {
		if err := fetchAndStoreBattleNetMediaLink(ctx, client, store, importContext, artifactID,
			region, entityType, locale, id, link); err != nil {
			return err
		}
	}
	return nil
}

func fetchAndStoreBattleNetMediaHref(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	region, entityType, locale string,
	id int64,
	href string,
) error {
	return fetchAndStoreBattleNetMediaLink(ctx, client, store, importContext, artifactID,
		region, entityType, locale, id, battleNetMediaLink{Href: href})
}

type battleNetMediaLink struct {
	Href        string
	AssetPrefix string
}

func fetchAndStoreBattleNetMediaLink(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	region, entityType, locale string,
	id int64,
	link battleNetMediaLink,
) error {
	href := strings.TrimSpace(link.Href)
	if href == "" {
		return nil
	}
	mediaPayload, sourceURL, err := client.FetchLink(ctx, region, locale, href)
	if err != nil {
		if battlenet.IsNotFound(err) {
			slog.Warn("skipping missing Battle.net media", "type", entityType, "id", id)
			return nil
		}
		return fmt.Errorf("fetch %s media %d: %w", entityType, id, err)
	}
	recordKey := fmt.Sprintf("media/%d", id)
	if link.AssetPrefix != "" {
		recordKey += "/" + link.AssetPrefix
	}
	if _, err := store.UpsertSourceRecord(ctx, artifactID, recordKey, mediaPayload); err != nil {
		return fmt.Errorf("preserve %s media %d: %w", entityType, id, err)
	}
	mediaRecord := catalogimport.Record{
		Type: entityType, ExternalID: id, Locale: locale, Payload: mediaPayload,
		SourceURL: sourceURL, SourceArtifactID: &artifactID,
	}
	if _, err := store.UpsertSourceDocument(ctx, importContext, mediaRecord, "blizzard_api"); err != nil {
		return err
	}
	for _, asset := range battleNetMediaAssets(mediaPayload) {
		if link.AssetPrefix != "" {
			asset.AssetKey = link.AssetPrefix + "_" + asset.AssetKey
		}
		if err := store.UpsertEntityMedia(ctx, importContext, entityType, id, locale,
			"blizzard_api", asset, artifactID); err != nil {
			return fmt.Errorf("store %s media asset %d %s: %w", entityType, id, asset.AssetKey, err)
		}
	}
	iconName := battleNetMediaIconName(mediaPayload)
	if iconName == "" {
		return nil
	}
	if err := store.UpsertEntityIcon(ctx, importContext, entityType, id, iconName, artifactID); err != nil {
		return fmt.Errorf("store %s media icon %d: %w", entityType, id, err)
	}
	return nil
}

func battleNetMediaAssets(payload json.RawMessage) []catalogimport.EntityMedia {
	var document struct {
		Assets []struct {
			Key        string `json:"key"`
			Value      string `json:"value"`
			FileDataID int64  `json:"file_data_id"`
			Width      int    `json:"width"`
			Height     int    `json:"height"`
		} `json:"assets"`
	}
	if json.Unmarshal(payload, &document) != nil {
		return nil
	}
	assets := make([]catalogimport.EntityMedia, 0, len(document.Assets))
	for _, candidate := range document.Assets {
		assetKey := strings.TrimSpace(candidate.Key)
		parsed, err := url.Parse(strings.TrimSpace(candidate.Value))
		if assetKey == "" || err != nil || parsed.Scheme != "https" ||
			!strings.HasSuffix(strings.ToLower(parsed.Hostname()), ".worldofwarcraft.com") {
			continue
		}
		kind := normalizeMediaKind(assetKey)
		if kind == "" {
			continue
		}
		media := catalogimport.EntityMedia{
			Kind: kind, AssetKey: assetKey, SourceURL: parsed.String(),
			MIMEType:   mediaMIMEType(parsed.Path),
			Primary:    strings.EqualFold(assetKey, "icon") || strings.EqualFold(assetKey, "main"),
			Attributes: map[string]any{"host": strings.ToLower(parsed.Hostname())},
		}
		if candidate.FileDataID > 0 {
			media.FileDataID = &candidate.FileDataID
		}
		if candidate.Width > 0 {
			media.Width = &candidate.Width
		}
		if candidate.Height > 0 {
			media.Height = &candidate.Height
		}
		assets = append(assets, media)
	}
	return assets
}

func normalizeMediaKind(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var result strings.Builder
	result.Grow(len(value))
	previousSeparator := false
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			result.WriteRune(char)
			previousSeparator = false
			continue
		}
		if result.Len() > 0 && !previousSeparator {
			result.WriteByte('_')
			previousSeparator = true
		}
	}
	normalized := strings.Trim(result.String(), "_")
	if len(normalized) < 2 || len(normalized) > 64 || normalized[0] < 'a' || normalized[0] > 'z' {
		return ""
	}
	return normalized
}

func mediaMIMEType(assetPath string) string {
	switch strings.ToLower(path.Ext(assetPath)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return ""
	}
}

func battleNetMediaHref(payload json.RawMessage) string {
	links := battleNetMediaLinks(payload)
	if len(links) == 0 {
		return ""
	}
	return links[0].Href
}

func battleNetMediaLinks(payload json.RawMessage) []battleNetMediaLink {
	var document struct {
		Media struct {
			Key struct {
				Href string `json:"href"`
			} `json:"key"`
		} `json:"media"`
		CreatureDisplays []struct {
			ID  int64 `json:"id"`
			Key struct {
				Href string `json:"href"`
			} `json:"key"`
		} `json:"creature_displays"`
	}
	if json.Unmarshal(payload, &document) != nil {
		return nil
	}
	links := make([]battleNetMediaLink, 0, 1+len(document.CreatureDisplays))
	seen := make(map[string]struct{}, 1+len(document.CreatureDisplays))
	appendLink := func(href, prefix string) {
		href = strings.TrimSpace(href)
		if href == "" {
			return
		}
		if _, exists := seen[href]; exists {
			return
		}
		seen[href] = struct{}{}
		links = append(links, battleNetMediaLink{Href: href, AssetPrefix: prefix})
	}
	appendLink(document.Media.Key.Href, "")
	for _, display := range document.CreatureDisplays {
		prefix := "creature_display"
		if display.ID > 0 {
			prefix += "_" + strconv.FormatInt(display.ID, 10)
		}
		appendLink(display.Key.Href, prefix)
	}
	return links
}

func battleNetMediaIconName(payload json.RawMessage) string {
	var document struct {
		Assets []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"assets"`
	}
	if json.Unmarshal(payload, &document) != nil {
		return ""
	}
	for _, asset := range document.Assets {
		if !strings.EqualFold(strings.TrimSpace(asset.Key), "icon") {
			continue
		}
		parsed, err := url.Parse(strings.TrimSpace(asset.Value))
		if err != nil || parsed.Scheme != "https" || !strings.HasSuffix(strings.ToLower(parsed.Hostname()), ".worldofwarcraft.com") {
			return ""
		}
		name := strings.ToLower(strings.TrimSuffix(path.Base(parsed.Path), path.Ext(parsed.Path)))
		if name == "" {
			return ""
		}
		for _, char := range name {
			if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '_' {
				return ""
			}
		}
		return name
	}
	return ""
}

func logBattleNetProgress(entityType, locale string, processed int, seen, written int64) {
	if processed > 0 && processed%1000 == 0 {
		slog.Info("catalog import progress", "type", entityType, "locale", locale,
			"processed", processed, "seen", seen, "written", written)
	}
}

func storeBattleNetRecord(
	ctx context.Context,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	entityType, locale string,
	id int64,
	payload json.RawMessage,
	sourceURL string,
) error {
	record := catalogimport.Record{
		Type: entityType, ExternalID: id, Locale: locale, Payload: payload,
		SourceURL: sourceURL, SourceArtifactID: &artifactID,
	}
	if _, err := store.UpsertSourceRecord(ctx, artifactID, strconv.FormatInt(id, 10), payload); err != nil {
		return fmt.Errorf("preserve %s source record %d (%s): %w", entityType, id, locale, err)
	}
	if _, err := store.UpsertSourceDocument(ctx, importContext, record, "blizzard_api"); err != nil {
		return err
	}
	normalizedPayload, err := normalizeBattleNetPayload(entityType, payload)
	if err != nil {
		return fmt.Errorf("normalize %s %d (%s): %w", entityType, id, locale, err)
	}
	record.Payload = normalizedPayload
	var normalizedDocument map[string]any
	if err := json.Unmarshal(normalizedPayload, &normalizedDocument); err != nil {
		return fmt.Errorf("read normalized %s %d (%s): %w", entityType, id, locale, err)
	}
	if strings.TrimSpace(localizedTextForLocale(normalizedDocument["name"], locale)) == "" {
		slog.Debug("preserved Battle.net source document without publishing an empty localization",
			"type", entityType, "id", id, "locale", locale)
		return nil
	}
	if err := store.Enrich(ctx, importContext, record, "blizzard_api"); err != nil {
		return fmt.Errorf("enrich %s %d (%s): %w", entityType, id, locale, err)
	}
	if entityType == "quest" {
		rewards, err := parseBattleNetQuestRewards(payload)
		if err != nil {
			return fmt.Errorf("normalize quest %d rewards (%s): %w", id, locale, err)
		}
		if err := store.ReplaceBattleNetQuestRewards(ctx, importContext, id, locale, rewards, artifactID); err != nil {
			return err
		}
	}
	return nil
}

type battleNetIndexEntry struct {
	ID   int64
	Href string
}

func indexResultEntries(payload json.RawMessage, fields ...string) ([]battleNetIndexEntry, error) {
	var document map[string]json.RawMessage
	if err := json.Unmarshal(payload, &document); err != nil {
		return nil, err
	}
	seen := make(map[int64]struct{})
	result := make([]battleNetIndexEntry, 0)
	for _, field := range fields {
		raw, ok := document[field]
		if !ok {
			continue
		}
		var entries []struct {
			ID  int64 `json:"id"`
			Key struct {
				Href string `json:"href"`
			} `json:"key"`
		}
		if err := json.Unmarshal(raw, &entries); err != nil {
			return nil, fmt.Errorf("decode index field %q: %w", field, err)
		}
		for _, entry := range entries {
			if entry.ID <= 0 {
				continue
			}
			if _, exists := seen[entry.ID]; exists {
				continue
			}
			seen[entry.ID] = struct{}{}
			result = append(result, battleNetIndexEntry{ID: entry.ID, Href: entry.Key.Href})
		}
	}
	if len(result) == 0 {
		return nil, fmt.Errorf("none of the expected fields %v contained entity IDs", fields)
	}
	return result, nil
}

func indexResultIDs(payload json.RawMessage, fields ...string) ([]int64, error) {
	entries, err := indexResultEntries(payload, fields...)
	if err != nil {
		return nil, err
	}
	result := make([]int64, 0, len(entries))
	for _, entry := range entries {
		result = append(result, entry.ID)
	}
	return result, nil
}

func linkedHref(payload json.RawMessage, field string) (string, error) {
	var document map[string]struct {
		Href string `json:"href"`
	}
	if err := json.Unmarshal(payload, &document); err != nil {
		return "", err
	}
	href := strings.TrimSpace(document[field].Href)
	if href == "" {
		return "", fmt.Errorf("field %q did not contain a resource link", field)
	}
	return href, nil
}

type battleNetRewardResource struct {
	Key struct {
		Href string `json:"href"`
	} `json:"key"`
	Name string `json:"name"`
	ID   int64  `json:"id"`
}

type battleNetRewardAmount struct {
	Reward battleNetRewardResource `json:"reward"`
	Value  int64                   `json:"value"`
}

type battleNetItemReward struct {
	Item         battleNetRewardResource `json:"item"`
	Quantity     int64                   `json:"quantity"`
	Requirements json.RawMessage         `json:"requirements"`
}

func parseBattleNetQuestRewards(payload json.RawMessage) ([]catalogimport.QuestReward, error) {
	var document struct {
		Rewards struct {
			Experience int64 `json:"experience"`
			Money      *struct {
				Value int64 `json:"value"`
			} `json:"money"`
			Currency    []battleNetRewardAmount  `json:"currency"`
			Reputations []battleNetRewardAmount  `json:"reputations"`
			Spell       *battleNetRewardResource `json:"spell"`
			Title       *battleNetRewardResource `json:"title"`
			Items       struct {
				Guaranteed []battleNetItemReward `json:"items"`
				ChoiceOf   []battleNetItemReward `json:"choice_of"`
			} `json:"items"`
		} `json:"rewards"`
	}
	if err := json.Unmarshal(payload, &document); err != nil {
		return nil, err
	}
	result := make([]catalogimport.QuestReward, 0, 8)
	indices := make(map[string]int16)
	appendReward := func(rewardType string, resource *battleNetRewardResource, amount int64, choice bool, attributes map[string]any) {
		if amount <= 0 {
			return
		}
		if resource != nil {
			if resource.ID <= 0 {
				return
			}
		}
		reward := catalogimport.QuestReward{Type: rewardType, Index: indices[rewardType], Amount: amount, Choice: choice, Attributes: attributes}
		indices[rewardType]++
		if resource != nil {
			reward.ExternalID = &resource.ID
			reward.Name = strings.TrimSpace(resource.Name)
			if reward.Attributes == nil {
				reward.Attributes = make(map[string]any)
			}
			if href := strings.TrimSpace(resource.Key.Href); href != "" {
				reward.Attributes["source_url"] = href
			}
		}
		result = append(result, reward)
	}
	appendReward("experience", nil, document.Rewards.Experience, false, nil)
	if document.Rewards.Money != nil {
		appendReward("money", nil, document.Rewards.Money.Value, false, nil)
	}
	for index := range document.Rewards.Currency {
		entry := &document.Rewards.Currency[index]
		appendReward("currency", &entry.Reward, entry.Value, false, nil)
	}
	for index := range document.Rewards.Reputations {
		entry := &document.Rewards.Reputations[index]
		appendReward("reputation", &entry.Reward, entry.Value, false, nil)
	}
	if document.Rewards.Spell != nil {
		appendReward("spell", document.Rewards.Spell, 1, false, nil)
	}
	if document.Rewards.Title != nil {
		appendReward("title", document.Rewards.Title, 1, false, nil)
	}
	appendItem := func(entry battleNetItemReward, choice bool) {
		amount := entry.Quantity
		if amount <= 0 {
			amount = 1
		}
		attributes := make(map[string]any)
		if len(entry.Requirements) > 0 && string(entry.Requirements) != "null" && string(entry.Requirements) != "{}" {
			attributes["requirements"] = entry.Requirements
		}
		appendReward("item", &entry.Item, amount, choice, attributes)
	}
	for _, entry := range document.Rewards.Items.Guaranteed {
		appendItem(entry, false)
	}
	for _, entry := range document.Rewards.Items.ChoiceOf {
		appendItem(entry, true)
	}
	return result, nil
}

func normalizeBattleNetPayload(entityType string, payload json.RawMessage) (json.RawMessage, error) {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return nil, err
	}
	if strings.TrimSpace(localizedText(document["name"])) == "" {
		switch entityType {
		case "quest":
			document["name"] = document["title"]
		case "talent", "pvp_talent":
			if spell, ok := document["spell"].(map[string]any); ok {
				document["name"] = spell["name"]
			}
		}
	}
	if entityType == "talent" && strings.TrimSpace(localizedText(document["description"])) == "" {
		if ranks, ok := document["rank_descriptions"].([]any); ok {
			for _, value := range ranks {
				rank, ok := value.(map[string]any)
				if !ok || strings.TrimSpace(localizedText(rank["description"])) == "" {
					continue
				}
				document["description"] = rank["description"]
				break
			}
		}
	}
	return json.Marshal(document)
}

func localizedText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		for _, candidate := range typed {
			if text, ok := candidate.(string); ok && strings.TrimSpace(text) != "" {
				return text
			}
		}
	}
	return ""
}

func localizedTextForLocale(value any, locale string) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		if text, ok := typed[locale].(string); ok {
			return text
		}
	}
	return ""
}

func searchResultID(payload json.RawMessage) (int64, error) {
	var data struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		return 0, err
	}
	if data.ID <= 0 {
		return 0, errors.New("search result has no positive id")
	}
	return data.ID, nil
}

func parseOptions() (options, error) {
	var locales, entityTypes string
	opts := options{}
	flag.StringVar(&opts.source, "source", "wago", "catalog source: wago or battlenet")
	flag.StringVar(&opts.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&opts.clientID, "client-id", os.Getenv("BATTLENET_CLIENT_ID"), "Battle.net OAuth client ID")
	flag.StringVar(&opts.clientSecret, "client-secret", os.Getenv("BATTLENET_CLIENT_SECRET"), "Battle.net OAuth client secret")
	flag.StringVar(&opts.product, "product", "wow", "game_products slug")
	flag.IntVar(&opts.buildNumber, "build", intEnv("BATTLENET_BUILD_NUMBER"), "positive WoW build number")
	flag.StringVar(&opts.buildVersion, "version", os.Getenv("BATTLENET_BUILD_VERSION"), "WoW version; Wago auto-detects when empty")
	flag.StringVar(&locales, "locales", "en_US,ru_RU", "comma-separated storage locales")
	flag.StringVar(&entityTypes, "types", "item,spell", "comma-separated entity types or all")
	flag.IntVar(&opts.pageSize, "page-size", 100, "Battle.net search page size")
	flag.IntVar(&opts.maxRecords, "max-records", 100, "maximum records per type and locale; 0 imports all")
	flag.IntVar(&opts.detailWorkers, "detail-workers", 8, "maximum concurrent Battle.net detail requests")
	flag.DurationVar(&opts.wagoTableTimeout, "wago-table-timeout", defaultWagoTableTimeout, "maximum time to stream and project one Wago DB2 table")
	flag.BoolVar(&opts.mediaOnly, "media-only", false, "fetch official media for previously imported Battle.net documents")
	flag.Parse()
	opts.source = strings.ToLower(strings.TrimSpace(opts.source))
	opts.locales = splitList(locales)
	opts.entityTypes = splitList(entityTypes)
	if len(opts.entityTypes) == 1 && opts.entityTypes[0] == "all" {
		opts.entityTypes = slices.Clone(battleNetAllEntityTypes)
	}

	switch {
	case opts.source != "wago" && opts.source != "battlenet":
		return options{}, fmt.Errorf("unsupported source %q", opts.source)
	case opts.source == "wago" && opts.product != "wow":
		return options{}, errors.New("Wago imports currently support only the wow Retail product")
	case opts.databaseURL == "":
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	case opts.source == "battlenet" && (opts.clientID == "" || opts.clientSecret == ""):
		return options{}, errors.New("BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET are required for -source battlenet")
	case opts.mediaOnly && opts.source != "battlenet":
		return options{}, errors.New("-media-only requires -source battlenet")
	case len(opts.locales) == 0 || opts.locales[0] != "en_US":
		return options{}, errors.New("en_US must be the first canonical locale")
	case opts.pageSize < 1 || opts.pageSize > 1000:
		return options{}, errors.New("page-size must be between 1 and 1000")
	case opts.maxRecords < 0:
		return options{}, errors.New("max-records cannot be negative")
	case opts.detailWorkers < 1 || opts.detailWorkers > 32:
		return options{}, errors.New("detail-workers must be between 1 and 32")
	case opts.wagoTableTimeout <= 0:
		return options{}, errors.New("wago-table-timeout must be positive")
	}
	if opts.source == "battlenet" {
		if _, err := battleNetNamespace(opts.product, "us"); err != nil {
			return options{}, err
		}
	}
	for _, locale := range opts.locales {
		if _, err := regionForLocale(locale); err != nil {
			return options{}, err
		}
	}
	for _, entityType := range opts.entityTypes {
		if opts.source == "wago" && entityType != "item" && entityType != "spell" {
			return options{}, fmt.Errorf("unsupported entity type %q", entityType)
		}
		if opts.source == "battlenet" {
			if _, ok := battleNetEntitySpecs[entityType]; !ok {
				return options{}, fmt.Errorf("unsupported entity type %q", entityType)
			}
		}
	}
	return opts, nil
}

func effectiveWagoTableTimeout(value time.Duration) time.Duration {
	if value <= 0 {
		return defaultWagoTableTimeout
	}
	return value
}

func buildNumber(version string) (int, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	number, err := strconv.Atoi(parts[3])
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	return number, nil
}

func sourceName(source string) string {
	if source == "wago" {
		return "wago_tools"
	}
	return source
}

func wagoLocale(locale string) (string, error) {
	switch locale {
	case "en_US":
		return "enUS", nil
	case "ru_RU":
		return "ruRU", nil
	default:
		return "", fmt.Errorf("unsupported locale %q", locale)
	}
}

func regionForLocale(locale string) (string, error) {
	switch locale {
	case "en_US":
		return "us", nil
	case "ru_RU":
		return "eu", nil
	default:
		return "", fmt.Errorf("unsupported locale %q", locale)
	}
}

func battleNetNamespace(product, region string) (string, error) {
	region = strings.ToLower(strings.TrimSpace(region))
	if region != "us" && region != "eu" {
		return "", fmt.Errorf("unsupported Battle.net region %q", region)
	}
	switch strings.TrimSpace(product) {
	case "wow":
		return "static-" + region, nil
	case "wow_classic":
		return "static-classic-" + region, nil
	case "wow_classic_era", "wow_classic_hardcore":
		return "static-classic1x-" + region, nil
	default:
		return "", fmt.Errorf("unsupported Battle.net product %q", product)
	}
}

func integerField(row map[string]string, key string) int64 {
	value, _ := strconv.ParseInt(row[key], 10, 64)
	return value
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

func intEnv(key string) int {
	value, _ := strconv.Atoi(os.Getenv(key))
	return value
}
