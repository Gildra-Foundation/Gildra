package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
		opts.sourceBuildNumber, opts.sourceBuildVersion = detectedBuild, detectedVersion
		if opts.buildNumber != 0 || opts.buildVersion != "" {
			if opts.buildNumber == 0 || opts.buildVersion == "" {
				return errors.New("Battle.net imports require both -build and -version when pinning a build")
			}
			if opts.buildNumber != detectedBuild || opts.buildVersion != detectedVersion {
				if !opts.allowBuildMismatch {
					return fmt.Errorf("configured Battle.net build %s (%d) differs from current API build %s (%d)",
						opts.buildVersion, opts.buildNumber, detectedVersion, detectedBuild)
				}
				slog.Warn("configured Battle.net build differs from the currently published API namespace; retaining the pinned release build", "configured_version", opts.buildVersion, "configured_build", opts.buildNumber, "published_version", detectedVersion, "published_build", detectedBuild)
			}
		} else {
			opts.buildNumber, opts.buildVersion = detectedBuild, detectedVersion
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
	if opts.missingOnly && releaseID == nil {
		return errors.New("-missing-only requires CATALOG_RELEASE_ID so enrichment stays inside an atomic release")
	}
	parameters := map[string]any{
		"source": opts.source, "locales": opts.locales, "entity_types": opts.entityTypes,
		"page_size": opts.pageSize, "max_records_per_type": opts.maxRecords,
		"detail_workers": opts.detailWorkers, "media_only": opts.mediaOnly,
		"missing_only":       opts.missingOnly,
		"wago_table_timeout": effectiveWagoTableTimeout(opts.wagoTableTimeout).String(),
	}
	if opts.source == "battlenet" {
		parameters["source_build_number"] = opts.sourceBuildNumber
		parameters["source_build_version"] = opts.sourceBuildVersion
		parameters["build_mismatch_allowed"] = opts.allowBuildMismatch
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
