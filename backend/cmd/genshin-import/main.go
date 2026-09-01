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

	"github.com/Gildra-Foundation/Gildra/backend/internal/genshinimport"
	"github.com/jackc/pgx/v5/pgxpool"
)

type options struct {
	sourceDirectory  string
	mediaDirectory   string
	mediaBaseURL     string
	databaseURL      string
	sourceRevision   string
	sourceRepository string
	gameVersion      string
	workers          int
	confirm          bool
}

func main() {
	if err := run(); err != nil {
		slog.Error("genshin import stopped", "error", err)
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
	ctx, cancel := context.WithTimeout(ctx, 4*time.Hour)
	defer cancel()

	dataset, err := genshinimport.LoadSource(opts.sourceDirectory)
	if err != nil {
		return fmt.Errorf("load genshin source: %w", err)
	}
	filenames := dataset.MediaFilenames()
	preview := map[string]any{
		"dryRun":             !opts.confirm,
		"sourceRevision":     opts.sourceRevision,
		"gameVersion":        opts.gameVersion,
		"counts":             dataset.Counts(),
		"mediaFiles":         len(filenames),
		"optionalMediaFiles": len(dataset.OptionalMediaFilenames()),
		"locales":            []string{genshinimport.LocaleEnglish, genshinimport.LocaleRussian},
	}
	if !opts.confirm {
		return writeJSON(preview)
	}
	fetcher, err := genshinimport.NewMediaFetcher(opts.mediaDirectory, opts.mediaBaseURL, opts.workers)
	if err != nil {
		return err
	}
	assets, err := fetcher.Fetch(ctx, filenames, dataset.MediaFallbacks())
	if err != nil {
		return err
	}
	optionalAssets, err := fetcher.FetchOptional(ctx, dataset.OptionalMediaFilenames())
	if err != nil {
		return err
	}
	for filename, asset := range optionalAssets {
		if _, exists := assets[filename]; !exists {
			assets[filename] = asset
		}
	}
	database, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return fmt.Errorf("open genshin database: %w", err)
	}
	defer database.Close()
	if err := database.Ping(ctx); err != nil {
		return fmt.Errorf("ping genshin database: %w", err)
	}
	release, err := genshinimport.NewStore(database).Publish(ctx, dataset, assets, genshinimport.PublishOptions{
		SourceRevision:   opts.sourceRevision,
		GameVersion:      opts.gameVersion,
		SourceRepository: opts.sourceRepository,
		MediaBaseURL:     opts.mediaBaseURL,
	})
	if err != nil {
		return err
	}
	return writeJSON(map[string]any{"dryRun": false, "release": release})
}

func parseOptions() (options, error) {
	var opts options
	flag.StringVar(&opts.sourceDirectory, "source-directory", "", "genshin-db checkout directory")
	flag.StringVar(&opts.mediaDirectory, "media-directory", os.Getenv("CATALOG_MEDIA_DIRECTORY"), "local catalog media directory")
	flag.StringVar(&opts.mediaBaseURL, "media-base-url", "https://enka.network/ui", "source base URL for PNG game assets")
	flag.StringVar(&opts.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&opts.sourceRevision, "source-revision", "", "exact 40-character genshin-db Git revision")
	flag.StringVar(&opts.sourceRepository, "source-repository", "https://github.com/theBowja/genshin-db", "source repository URL")
	flag.StringVar(&opts.gameVersion, "game-version", "", "Genshin Impact data version")
	flag.IntVar(&opts.workers, "media-workers", 12, "concurrent media downloads")
	flag.BoolVar(&opts.confirm, "confirm", false, "download media and publish the imported release")
	flag.Parse()
	if opts.sourceDirectory == "" || opts.sourceRevision == "" || opts.gameVersion == "" {
		return options{}, errors.New("source-directory, source-revision and game-version are required")
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
