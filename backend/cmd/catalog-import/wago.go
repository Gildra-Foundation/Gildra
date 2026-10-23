package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/google/uuid"
)

var errWagoRecordMissingName = errors.New("Wago record has no localized name")

const defaultWagoTableTimeout = 2 * time.Hour

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
	payload := map[string]any{
		"id": id, "name": name, "description": strings.TrimSpace(row["Description_lang"]),
		"db2": row,
	}
	if entityType == "spell" {
		if text, ok := spellTexts[id]; ok {
			payload["description"] = text.Description
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
