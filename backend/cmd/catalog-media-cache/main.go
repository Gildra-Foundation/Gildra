package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogmedia"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, root, publicBase, environment, accessMode, product, expansion string
	var derivedMode, derivedGroups, derivedEntitiesOut string
	var entityIDsRaw string
	var buildID int64
	var limit, seedIconLimit, derivedLimit int
	var confirm, skipMediaCache, refreshIcons bool
	var refreshLimit, refreshBatch, refreshHeadroom int
	var refreshInterval, refreshRetryFailed time.Duration
	var refreshCheckpoint string
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&root, "directory", os.Getenv("CATALOG_MEDIA_DIRECTORY"), "absolute local media cache directory")
	flag.StringVar(&publicBase, "public-base-url", envOr("CATALOG_MEDIA_PUBLIC_BASE_URL", "https://api.wowarcana.com"), "public HTTPS API origin")
	flag.StringVar(&environment, "environment", envOr("CATALOG_PUBLICATION_ENVIRONMENT", "development"), "grant environment")
	flag.StringVar(&accessMode, "access-mode", envOr("CATALOG_ACCESS_MODE", "public"), "catalog access mode: public or private")
	flag.StringVar(&product, "product", "wow", "game product for official icon seeding")
	flag.StringVar(&expansion, "expansion", os.Getenv("CATALOG_MEDIA_EXPANSION"), "optional confirmed expansion key to scope icon seeding")
	flag.StringVar(&entityIDsRaw, "entity-ids", "", "exact published entity UUIDs for icon repair")
	flag.Int64Var(&buildID, "build-id", 0, "pin icon repair to this product build; default active build")
	flag.IntVar(&limit, "limit", 100, "maximum assets per run")
	flag.IntVar(&seedIconLimit, "seed-icon-limit", 0, "download and link this many missing official icons before the normal cache run")
	flag.BoolVar(&skipMediaCache, "skip-media-cache", false, "seed official icons without processing other remote media")
	flag.BoolVar(&confirm, "confirm", false, "download eligible assets")
	flag.StringVar(&derivedMode, "derived-mode", "", "derived media for records without an icon: plan (read-only), verify (download and link in a rolled-back transaction) or apply (requires -confirm)")
	flag.StringVar(&derivedGroups, "derived-groups", "default", "comma-separated derived media groups, default or all")
	flag.IntVar(&derivedLimit, "derived-limit", 1000, "maximum unique derived assets downloaded per run")
	flag.StringVar(&derivedEntitiesOut, "derived-entities-out", "", "optional JSON file receiving planned or linked entity IDs by group")
	flag.BoolVar(&refreshIcons, "refresh-icons", false, "renew cached icons across the whole published build; without -confirm only reports the planned downloads and row updates")
	flag.IntVar(&refreshLimit, "refresh-limit", 3000, "maximum distinct icons downloaded in this run (up to 100000)")
	flag.IntVar(&refreshBatch, "refresh-batch", 100, "icons committed per resumable batch (up to 500)")
	flag.IntVar(&refreshHeadroom, "refresh-headroom-days", 10, "renew an icon this many days before its source retention expires")
	flag.DurationVar(&refreshInterval, "refresh-interval", 500*time.Millisecond, "minimum interval between HTTP requests, including fallbacks")
	flag.StringVar(&refreshCheckpoint, "refresh-checkpoint", "", "absolute path of the resumable cursor file; required with -confirm")
	flag.DurationVar(&refreshRetryFailed, "refresh-retry-failed-after", 72*time.Hour, "keep an icon no source could serve out of later runs for this long")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" || root == "" {
		return errors.New("DATABASE_URL and CATALOG_MEDIA_DIRECTORY are required")
	}
	if skipMediaCache && !refreshIcons && seedIconLimit == 0 && derivedMode != catalogmedia.DerivedModeApply {
		return errors.New("skip-media-cache requires a positive seed-icon-limit or -derived-mode=apply")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 2*time.Hour)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	cache, err := catalogmedia.New(db, root, publicBase, nil)
	if err != nil {
		return err
	}
	defer cache.Close() //nolint:errcheck
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if refreshIcons {
		if expansion != "" || entityIDsRaw != "" || seedIconLimit > 0 || derivedMode != "" {
			return errors.New("refresh-icons is a whole-catalog operation; do not combine with scoped seed or derived modes")
		}
		result, refreshErr := cache.RefreshIcons(ctx, catalogmedia.RefreshOptions{
			Product: product, Environment: environment, BuildID: buildID,
			Limit: refreshLimit, BatchSize: refreshBatch, HeadroomDays: refreshHeadroom,
			Interval: refreshInterval, Checkpoint: refreshCheckpoint, RetryFailedAfter: refreshRetryFailed,
			PlanOnly: !confirm,
			Progress: func(progress catalogmedia.RefreshResult) {
				fmt.Fprintf(os.Stderr, "icon refresh batch=%d fetched=%d failed=%d linked=%d bytes=%d elapsed=%.1fs\n",
					progress.Batches, progress.IconsCached, progress.Failed, progress.Entities, progress.Bytes, progress.ElapsedSeconds)
			},
		})
		if err := encoder.Encode(map[string]any{"dry_run": !confirm, "refresh": result}); err != nil {
			return err
		}
		return refreshErr
	}
	var derivedResult *catalogmedia.DerivedMediaResult
	if derivedMode != "" && (derivedMode != catalogmedia.DerivedModeApply || confirm) {
		derived, err := cache.SeedDerivedMedia(ctx, catalogmedia.DerivedMediaOptions{
			Product: product, Environment: environment, Groups: strings.Split(derivedGroups, ","),
			Limit: derivedLimit, Mode: derivedMode,
		})
		if err != nil {
			return err
		}
		if derivedEntitiesOut != "" {
			encoded, err := json.Marshal(derived.Entities)
			if err != nil {
				return err
			}
			if err := os.WriteFile(derivedEntitiesOut, encoded, 0o640); err != nil {
				return err
			}
		}
		if derivedMode != catalogmedia.DerivedModeApply {
			return encoder.Encode(map[string]any{"derived": derived})
		}
		derivedResult = &derived
	}
	var entityIDs []uuid.UUID
	if entityIDsRaw != "" {
		for _, value := range strings.Split(entityIDsRaw, ",") {
			id, err := uuid.Parse(strings.TrimSpace(value))
			if err != nil {
				return err
			}
			entityIDs = append(entityIDs, id)
		}
	}
	if !confirm && seedIconLimit > 0 {
		plan, err := cache.SeedOfficialIcons(ctx, catalogmedia.IconSeedOptions{Product: product, BuildID: buildID, Expansion: expansion, Limit: seedIconLimit, MissingOnly: true, EntityIDs: entityIDs, PlanOnly: true})
		if err != nil {
			return err
		}
		return encoder.Encode(map[string]any{"dry_run": true, "icons": plan})
	}
	if !confirm {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"dry_run": true, "environment": environment, "access_mode": accessMode, "limit": limit, "seed_icon_limit": seedIconLimit, "skip_media_cache": skipMediaCache})
	}
	var iconResult catalogmedia.IconSeedResult
	if seedIconLimit > 0 {
		iconResult, err = cache.SeedOfficialIcons(ctx, catalogmedia.IconSeedOptions{
			Product: product, BuildID: buildID, Expansion: expansion, Limit: seedIconLimit, MissingOnly: true, EntityIDs: entityIDs,
		})
		if err != nil {
			return err
		}
	}
	if skipMediaCache {
		return encoder.Encode(map[string]any{"icons": iconResult, "derived": derivedResult})
	}
	result, err := cache.RunWithAccessMode(ctx, environment, limit, accessMode)
	if err != nil {
		return err
	}
	return encoder.Encode(map[string]any{"icons": iconResult, "derived": derivedResult, "media": result})
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
