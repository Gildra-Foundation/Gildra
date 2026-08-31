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
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, root, publicBase, environment, accessMode, product, products string
	var limit, seedIconLimit int
	var confirm, skipMediaCache bool
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&root, "directory", os.Getenv("CATALOG_MEDIA_DIRECTORY"), "absolute local media cache directory")
	flag.StringVar(&publicBase, "public-base-url", envOr("CATALOG_MEDIA_PUBLIC_BASE_URL", "https://api.gildra.net"), "public HTTPS API origin")
	flag.StringVar(&environment, "environment", envOr("CATALOG_PUBLICATION_ENVIRONMENT", "development"), "grant environment")
	flag.StringVar(&accessMode, "access-mode", envOr("CATALOG_ACCESS_MODE", "public"), "catalog access mode: public or private")
	flag.StringVar(&product, "product", "wow", "game product for official icon seeding")
	flag.StringVar(&products, "products", "", "optional comma-separated game products; overrides -product")
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
	selectedProducts, err := parseProducts(products, product)
	if err != nil {
		return err
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
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"dry_run": true, "environment": environment, "access_mode": accessMode, "products": selectedProducts, "limit": limit, "seed_icon_limit": seedIconLimit, "skip_media_cache": skipMediaCache})
	}
	type productResult struct {
		Product string                      `json:"product"`
		Icons   catalogmedia.IconSeedResult `json:"icons"`
		Error   string                      `json:"error,omitempty"`
	}
	results := make([]productResult, 0, len(selectedProducts))
	var runErrors []error
	for _, selectedProduct := range selectedProducts {
		result := productResult{Product: selectedProduct}
		if seedIconLimit > 0 {
			result.Icons, err = cache.SeedOfficialIcons(ctx, selectedProduct, seedIconLimit)
			if err != nil {
				result.Error = err.Error()
				runErrors = append(runErrors, fmt.Errorf("%s icon seed: %w", selectedProduct, err))
			}
		}
		results = append(results, result)
	}
	var mediaResult catalogmedia.Result
	if !skipMediaCache {
		// Media rows are shared by all products and the cache worker already
		// selects eligible assets across the catalog. Run this once after all
		// product-specific icon seeds instead of repeating the global scan.
		mediaResult, err = cache.RunWithAccessMode(ctx, environment, limit, accessMode)
		if err != nil {
			runErrors = append(runErrors, fmt.Errorf("media cache: %w", err))
		}
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if len(selectedProducts) == 1 {
		result := results[0]
		if skipMediaCache {
			return errors.Join(encoder.Encode(map[string]any{"product": result.Product, "icons": result.Icons}), errors.Join(runErrors...))
		}
		return errors.Join(encoder.Encode(map[string]any{"product": result.Product, "icons": result.Icons, "media": mediaResult}), errors.Join(runErrors...))
	}
	if skipMediaCache {
		return errors.Join(encoder.Encode(map[string]any{"products": results}), errors.Join(runErrors...))
	}
	return errors.Join(encoder.Encode(map[string]any{"products": results, "media": mediaResult}), errors.Join(runErrors...))
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func parseProducts(value, fallback string) ([]string, error) {
	values := splitList(value)
	if len(values) == 0 {
		values = splitList(fallback)
	}
	if len(values) == 0 {
		return nil, errors.New("at least one catalog product is required")
	}
	allowed := map[string]bool{
		"wow": true, "wow_classic": true, "wow_classic_era": true, "wow_classic_hardcore": true,
	}
	seen := make(map[string]bool, len(values))
	products := make([]string, 0, len(values))
	for _, raw := range values {
		product := strings.ToLower(strings.TrimSpace(raw))
		if !allowed[product] {
			return nil, fmt.Errorf("unsupported catalog product %q", raw)
		}
		if seen[product] {
			continue
		}
		seen[product] = true
		products = append(products, product)
	}
	return products, nil
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
