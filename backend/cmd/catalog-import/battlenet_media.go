package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"path"
	"strconv"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

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
					"proof_scope":         "source_record_manifest_v1",
					"source_build_number": opts.sourceBuildNumber, "source_build_version": opts.sourceBuildVersion,
					"build_mismatch_allowed": opts.allowBuildMismatch,
					"bounded":                opts.maxRecords > 0, "max_records": opts.maxRecords,
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

func fetchBattleNetSearchMedia(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	region, entityType, locale string,
	details []battleNetSearchDetail,
	workers int,
) error {
	if workers < 1 {
		return errors.New("media worker count must be positive")
	}
	persisted := make([]battleNetSearchDetail, 0, len(details))
	for _, detail := range details {
		if !detail.Missing {
			persisted = append(persisted, detail)
		}
	}
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(workers)
	for _, detail := range persisted {
		detail := detail
		group.Go(func() error {
			return fetchAndStoreBattleNetMedia(groupCtx, client, store, importContext, artifactID,
				region, entityType, locale, detail.ID, detail.Payload)
		})
	}
	return group.Wait()
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
		if battlenet.IsNotFound(err) || battlenet.IsForbidden(err) {
			// Media is an optional enrichment. Blizzard may omit an asset or
			// reject a legacy media link while the entity detail remains valid;
			// retain the omission in the run log and let the release quality
			// gate report the coverage gap instead of aborting the whole page.
			slog.Warn("skipping unavailable Battle.net media", "type", entityType,
				"id", id, "status", mediaStatus(err))
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

func mediaStatus(err error) string {
	if battlenet.IsNotFound(err) {
		return "not_found"
	}
	if battlenet.IsForbidden(err) {
		return "forbidden"
	}
	return "error"
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
