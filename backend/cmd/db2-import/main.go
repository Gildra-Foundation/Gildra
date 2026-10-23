package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
	if importErr == nil && contains(opts.tables, "ItemSparse") {
		var assessed int64
		if err := db.QueryRow(ctx, `SELECT catalog_refresh_midnight_item_usability($1)`, ic.BuildID).Scan(&assessed); err != nil {
			importErr = fmt.Errorf("refresh Midnight item usability: %w", err)
		} else if assessed > 0 {
			slog.Info("Midnight item usability refreshed", "build", opts.version, "assessed", assessed)
		}
	}
	if importErr == nil && (contains(opts.tables, "Map") || contains(opts.tables, "TransmogSet")) {
		var assessed int64
		if err := db.QueryRow(ctx, `SELECT catalog_refresh_midnight_nonitem_usability($1)`, ic.BuildID).Scan(&assessed); err != nil {
			importErr = fmt.Errorf("refresh Midnight non-item usability: %w", err)
		} else if assessed > 0 {
			slog.Info("Midnight non-item usability refreshed", "build", opts.version, "assessed", assessed)
		}
	}
	if importErr == nil && (contains(opts.tables, "ItemSparse") || contains(opts.tables, "Map") || contains(opts.tables, "TransmogSet")) {
		if _, err := db.Exec(ctx, `SELECT catalog_apply_midnight_usability_overrides($1)`, ic.BuildID); err != nil {
			importErr = fmt.Errorf("apply Midnight usability overrides: %w", err)
		}
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
