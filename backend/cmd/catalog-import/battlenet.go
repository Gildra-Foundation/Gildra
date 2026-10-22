package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync/atomic"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

type battleNetEntitySpec struct {
	Resource        string
	IndexFields     []string
	Search          bool
	FetchDetail     bool
	FetchMedia      bool
	QuestCategories bool
}

var battleNetEntitySpecs = map[string]battleNetEntitySpec{
	"item":           {Resource: "item", Search: true, FetchDetail: true, FetchMedia: true},
	"spell":          {Resource: "spell", Search: true, FetchDetail: true, FetchMedia: true},
	"creature":       {Resource: "creature", Search: true, FetchDetail: true, FetchMedia: true},
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
			if opts.missingOnly {
				collectionURL, urlErr := client.SearchURL(region, namespace, locale, spec.Resource, 1, opts.pageSize)
				if entityType == "quest" {
					collectionURL, urlErr = client.IndexURL(region, namespace, locale, spec.Resource)
				}
				if urlErr != nil {
					return urlErr
				}
				artifactID, registerErr := store.RegisterPendingArtifact(ctx, importContext, "blizzard_api",
					"battlenet-missing/"+entityType, locale, collectionURL, map[string]any{
						"entity_type": entityType, "namespace": namespace, "locale": locale,
						"proof_scope": "source_record_manifest_v1", "missing_only": true,
						"source_build_number": opts.sourceBuildNumber, "source_build_version": opts.sourceBuildVersion,
					})
				if registerErr != nil {
					return registerErr
				}
				if err := runBattleNetArtifact(ctx, store, artifactID, entityType, locale, func() error {
					return importBattleNetMissingType(ctx, client, store, importContext, opts,
						region, namespace, locale, entityType, spec, artifactID, seen, written)
				}); err != nil {
					return err
				}
				continue
			}
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
					"source_build_number": opts.sourceBuildNumber, "source_build_version": opts.sourceBuildVersion,
					"build_mismatch_allowed": opts.allowBuildMismatch,
					"bounded":                opts.maxRecords > 0, "max_records": opts.maxRecords,
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
				// Static Classic namespaces do not expose every Retail collection
				// (for example talent and PvP-talent indexes). Treat a deterministic
				// 404 as an explicit source gap and continue with the DB2/listfile
				// foundation instead of failing the whole release. Detail-level 404s
				// are already handled by the per-record import helpers, so this branch
				// is limited to an unavailable collection/index.
				if battlenet.IsNotFound(err) {
					reason := fmt.Sprintf("Battle.net collection unavailable for %s (%s): %v", entityType, locale, err)
					if markErr := store.MarkArtifactUnavailable(context.WithoutCancel(ctx), artifactID, reason); markErr != nil {
						return markErr
					}
					slog.Warn("Battle.net collection unavailable; recorded explicit source gap",
						"type", entityType, "locale", locale, "product", opts.product, "error", err)
					continue
				}
				return err
			}
		}
	}
	return nil
}

// importBattleNetMissingType enriches already imported build versions with
// official localized details. It deliberately avoids a wildcard search: the
// catalog itself is the denominator, so only records with a missing or
// unresolved description (and, for English, a missing icon observation) are
// requested. This keeps the recurring pass bounded and idempotent.
func importBattleNetMissingType(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	opts options,
	region, namespace, locale, entityType string,
	spec battleNetEntitySpec,
	artifactID uuid.UUID,
	seen, written *int64,
) error {
	includeMedia := locale == "en_US" && spec.FetchMedia
	targets, err := store.MissingBattleNetIDs(ctx, importContext, entityType, locale, includeMedia, opts.maxRecords)
	if err != nil {
		return err
	}
	slog.Info("enriching missing Battle.net catalog fields", "type", entityType, "locale", locale,
		"targets", len(targets), "include_media", includeMedia)
	if len(targets) == 0 {
		return nil
	}
	// Resource links returned by search are build-pinned. Construct the same
	// namespace for direct detail requests so a moving static alias cannot mix
	// source data from another client build into this release.
	detailNamespace := namespace
	if pinned, pinErr := pinnedBattleNetNamespace(opts.product, opts.sourceBuildVersion, region); pinErr == nil {
		detailNamespace = pinned
	} else {
		slog.Warn("using moving Battle.net namespace for missing-field enrichment", "type", entityType, "locale", locale, "error", pinErr)
	}
	workers := opts.detailWorkers
	if workers > len(targets) {
		workers = len(targets)
	}
	var processed int64
	jobs := make(chan int64)
	group, groupCtx := errgroup.WithContext(ctx)
	for range workers {
		group.Go(func() error {
			for {
				select {
				case <-groupCtx.Done():
					return groupCtx.Err()
				case id, ok := <-jobs:
					if !ok {
						return nil
					}
					atomic.AddInt64(seen, 1)
					payload, sourceURL, fetchErr := client.Detail(groupCtx, region, detailNamespace, locale, spec.Resource, id)
					if fetchErr != nil {
						if battlenet.IsNotFound(fetchErr) {
							slog.Warn("Battle.net enrichment target is not available", "type", entityType, "id", id, "locale", locale)
							if statusCode, ok := battlenet.RemoteStatusCode(fetchErr); ok {
								if err := store.RecordBattleNetUnavailableDetail(groupCtx, artifactID, entityType, locale,
									id, int64(statusCode), sourceURL, "detail_not_found"); err != nil {
									return err
								}
							}
							continue
						}
						return fmt.Errorf("fetch missing %s %d (%s): %w", entityType, id, locale, fetchErr)
					}
					if err := storeBattleNetRecord(groupCtx, store, importContext, artifactID, entityType, locale, id, payload, sourceURL); err != nil {
						return err
					}
					if includeMedia {
						if err := fetchAndStoreBattleNetMedia(groupCtx, client, store, importContext, artifactID,
							region, entityType, locale, id, payload); err != nil {
							return err
						}
					}
					atomic.AddInt64(written, 1)
					processedCount := atomic.AddInt64(&processed, 1)
					logBattleNetProgress(entityType, locale, int(processedCount),
						atomic.LoadInt64(seen), atomic.LoadInt64(written))
				}
			}
		})
	}
	group.Go(func() error {
		defer close(jobs)
		for _, id := range targets {
			select {
			case jobs <- id:
			case <-groupCtx.Done():
				return groupCtx.Err()
			}
		}
		return nil
	})
	if err := group.Wait(); err != nil {
		return err
	}
	return nil
}

func pinnedBattleNetNamespace(product, version, region string) (string, error) {
	parts := strings.Split(strings.TrimSpace(version), ".")
	if len(parts) != 4 || strings.TrimSpace(region) == "" {
		return "", fmt.Errorf("invalid source build version %q", version)
	}
	for index, part := range parts {
		if part == "" {
			return "", fmt.Errorf("invalid source build version %q", version)
		}
		for _, character := range part {
			if character < '0' || character > '9' {
				return "", fmt.Errorf("invalid source build version %q", version)
			}
		}
		if index == len(parts)-1 && strings.TrimLeft(part, "0") == "" {
			return "", fmt.Errorf("invalid source build version %q", version)
		}
	}
	suffix := ""
	switch strings.TrimSpace(product) {
	case "wow":
	case "wow_classic":
		suffix = "-classic"
	case "wow_classic_era", "wow_classic_hardcore":
		suffix = "-classic1x"
	default:
		return "", fmt.Errorf("unsupported Battle.net product %q", product)
	}
	return fmt.Sprintf("static-%s_%s%s-%s", strings.Join(parts[:3], "."), parts[3], suffix, strings.ToLower(strings.TrimSpace(region))), nil
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
				if spec.FetchMedia && locale == "en_US" {
					if err := fetchBattleNetSearchMedia(ctx, client, store, importContext, artifactID,
						region, entityType, locale, details, detailWorkers); err != nil {
						return fmt.Errorf("fetch %s search media range [%d,%d] page %d (%s): %w",
							entityType, rangeStart, rangeEnd, pageNumber, locale, err)
					}
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
				if spec.FetchMedia && locale == "en_US" {
					if err := fetchAndStoreBattleNetMedia(ctx, client, store, importContext, artifactID,
						region, entityType, locale, id, payload); err != nil {
						return err
					}
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
			if spec.FetchMedia && locale == "en_US" {
				if err := fetchAndStoreBattleNetMedia(ctx, client, store, importContext, artifactID,
					region, entityType, locale, id, payload); err != nil {
					return err
				}
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
	ID         int64
	Payload    json.RawMessage
	SourceURL  string
	StatusCode int
	Missing    bool
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
					details[i].SourceURL = sourceURL
					if statusCode, ok := battlenet.RemoteStatusCode(err); ok {
						details[i].StatusCode = statusCode
					}
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
			if err := fetchBattleNetSearchMedia(ctx, client, store, importContext, artifactID,
				region, entityType, locale, details, detailWorkers); err != nil {
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
				statusCode := detail.StatusCode
				if statusCode == 0 {
					statusCode = 404
				}
				if err := store.RecordBattleNetUnavailableDetail(ctx, artifactID, entityType, locale,
					detail.ID, int64(statusCode), detail.SourceURL, "detail_not_found"); err != nil {
					return err
				}
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
