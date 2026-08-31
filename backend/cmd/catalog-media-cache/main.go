package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogmedia"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, root, publicBase, environment, accessMode, product string
	var limit, seedIconLimit int
	var confirm, skipMediaCache bool
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&root, "directory", os.Getenv("CATALOG_MEDIA_DIRECTORY"), "absolute local media cache directory")
	flag.StringVar(&publicBase, "public-base-url", envOr("CATALOG_MEDIA_PUBLIC_BASE_URL", "https://api.gildra.net"), "public HTTPS API origin")
	flag.StringVar(&environment, "environment", envOr("CATALOG_PUBLICATION_ENVIRONMENT", "development"), "grant environment")
	flag.StringVar(&accessMode, "access-mode", envOr("CATALOG_ACCESS_MODE", "public"), "catalog access mode: public or private")
	flag.StringVar(&product, "product", "wow", "game product for official icon seeding")
	flag.IntVar(&limit, "limit", 100, "maximum assets per run")
	flag.IntVar(&seedIconLimit, "seed-icon-limit", 0, "download and link this many missing official icons before the normal cache run")
	flag.BoolVar(&skipMediaCache, "skip-media-cache", false, "seed official icons without processing other remote media")
	flag.BoolVar(&confirm, "confirm", false, "download eligible assets")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" || root == "" {
		return errors.New("DATABASE_URL and CATALOG_MEDIA_DIRECTORY are required")
	}
	if skipMediaCache && seedIconLimit == 0 {
		return errors.New("skip-media-cache requires a positive seed-icon-limit")
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
	if !confirm {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"dry_run": true, "environment": environment, "access_mode": accessMode, "limit": limit, "seed_icon_limit": seedIconLimit, "skip_media_cache": skipMediaCache})
	}
	var iconResult catalogmedia.IconSeedResult
	if seedIconLimit > 0 {
		iconResult, err = cache.SeedOfficialIcons(ctx, product, seedIconLimit)
		if err != nil {
			return err
		}
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if skipMediaCache {
		return encoder.Encode(map[string]any{"icons": iconResult})
	}
	result, err := cache.RunWithAccessMode(ctx, environment, limit, accessMode)
	if err != nil {
		return err
	}
	return encoder.Encode(map[string]any{"icons": iconResult, "media": result})
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
