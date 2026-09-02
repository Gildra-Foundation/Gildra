package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/leagueimport"
	"github.com/jackc/pgx/v5/pgxpool"
)

type options struct {
	version        string
	mediaDirectory string
	databaseURL    string
	workers        int
	confirm        bool
}

func main() {
	if err := run(); err != nil {
		slog.Error("League of Legends import stopped", "error", err)
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
	ctx, cancel := context.WithTimeout(ctx, 6*time.Hour)
	defer cancel()

	dataset, err := leagueimport.NewSource(nil, opts.workers).Load(ctx, opts.version)
	if err != nil {
		return fmt.Errorf("load Riot Data Dragon: %w", err)
	}
	preview := map[string]any{
		"dryRun": !opts.confirm, "version": dataset.Version, "counts": dataset.Counts(),
		"mediaFiles": len(dataset.MediaURLs()), "locales": []string{leagueimport.LocaleEnglish, leagueimport.LocaleRussian},
	}
	if !opts.confirm {
		return writeJSON(preview)
	}
	fetcher, err := leagueimport.NewMediaFetcher(opts.mediaDirectory, opts.workers)
	if err != nil {
		return err
	}
	assets, err := fetcher.Fetch(ctx, dataset.MediaURLs(), dataset.MediaFallbacks())
	if err != nil {
		return err
	}
	database, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return fmt.Errorf("open League catalog database: %w", err)
	}
	defer database.Close()
	if err := database.Ping(ctx); err != nil {
		return fmt.Errorf("ping League catalog database: %w", err)
	}
	release, err := leagueimport.NewStore(database).Publish(ctx, dataset, assets)
	if err != nil {
		return err
	}
	return writeJSON(map[string]any{"dryRun": false, "release": release})
}

func parseOptions() (options, error) {
	var opts options
	flag.StringVar(&opts.version, "version", "latest", "Data Dragon version, for example 16.17.1, or latest")
	flag.StringVar(&opts.mediaDirectory, "media-directory", os.Getenv("CATALOG_MEDIA_DIRECTORY"), "local catalog media directory")
	flag.StringVar(&opts.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.IntVar(&opts.workers, "workers", 12, "concurrent Data Dragon requests")
	flag.BoolVar(&opts.confirm, "confirm", false, "download media and atomically publish the release")
	flag.Parse()
	if opts.workers < 1 || opts.workers > 32 {
		return options{}, errors.New("workers must be between 1 and 32")
	}
	if opts.confirm && (opts.mediaDirectory == "" || opts.databaseURL == "") {
		return options{}, errors.New("confirm requires media-directory and database-url")
	}
	return opts, nil
}

func writeJSON(value any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}
