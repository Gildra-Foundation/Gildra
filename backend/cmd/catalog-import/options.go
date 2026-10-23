package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"
)

type options struct {
	source             string
	databaseURL        string
	clientID           string
	clientSecret       string
	product            string
	buildNumber        int
	buildVersion       string
	locales            []string
	entityTypes        []string
	pageSize           int
	maxRecords         int
	detailWorkers      int
	mediaOnly          bool
	missingOnly        bool
	allowBuildMismatch bool
	sourceBuildNumber  int
	sourceBuildVersion string
	wagoTableTimeout   time.Duration
}

func contains(values []string, expected string) bool {
	return slices.Contains(values, expected)
}

func parseOptions() (options, error) {
	var locales, entityTypes string
	opts := options{}
	flag.StringVar(&opts.source, "source", "wago", "catalog source: wago or battlenet")
	// Keep credentials and connection strings out of `-h` output.  The flag
	// package prints default values verbatim, so using environment values as
	// defaults would disclose passwords/secrets to logs and support bundles.
	flag.StringVar(&opts.databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&opts.clientID, "client-id", "", "Battle.net OAuth client ID (defaults to BATTLENET_CLIENT_ID)")
	flag.StringVar(&opts.clientSecret, "client-secret", "", "Battle.net OAuth client secret (defaults to BATTLENET_CLIENT_SECRET)")
	flag.StringVar(&opts.product, "product", "wow", "game_products slug")
	flag.IntVar(&opts.buildNumber, "build", intEnv("BATTLENET_BUILD_NUMBER"), "positive WoW build number")
	flag.StringVar(&opts.buildVersion, "version", os.Getenv("BATTLENET_BUILD_VERSION"), "WoW version; Wago auto-detects when empty")
	flag.StringVar(&locales, "locales", "en_US,ru_RU", "comma-separated storage locales")
	flag.StringVar(&entityTypes, "types", "item,spell", "comma-separated entity types or all")
	flag.IntVar(&opts.pageSize, "page-size", 100, "Battle.net search page size")
	flag.IntVar(&opts.maxRecords, "max-records", 100, "maximum records per type and locale; 0 imports all")
	flag.IntVar(&opts.detailWorkers, "detail-workers", 8, "maximum concurrent Battle.net detail requests")
	flag.DurationVar(&opts.wagoTableTimeout, "wago-table-timeout", defaultWagoTableTimeout, "maximum time to stream and project one Wago DB2 table")
	flag.BoolVar(&opts.mediaOnly, "media-only", false, "fetch official media for previously imported Battle.net documents")
	flag.BoolVar(&opts.missingOnly, "missing-only", false, "enrich only build records with missing descriptions or icons")
	flag.BoolVar(&opts.allowBuildMismatch, "allow-build-mismatch", false, "allow a pinned release build to differ from the currently published Battle.net API build; source build is recorded in provenance")
	flag.Parse()
	if opts.databaseURL == "" {
		opts.databaseURL = os.Getenv("DATABASE_URL")
	}
	if opts.clientID == "" {
		opts.clientID = os.Getenv("BATTLENET_CLIENT_ID")
	}
	if opts.clientSecret == "" {
		opts.clientSecret = os.Getenv("BATTLENET_CLIENT_SECRET")
	}
	opts.source = strings.ToLower(strings.TrimSpace(opts.source))
	opts.locales = splitList(locales)
	opts.entityTypes = splitList(entityTypes)
	if len(opts.entityTypes) == 1 && opts.entityTypes[0] == "all" {
		opts.entityTypes = slices.Clone(battleNetAllEntityTypes)
	}

	switch {
	case opts.source != "wago" && opts.source != "battlenet":
		return options{}, fmt.Errorf("unsupported source %q", opts.source)
	case opts.source == "wago" && opts.product != "wow":
		return options{}, errors.New("Wago imports currently support only the wow Retail product")
	case opts.databaseURL == "":
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	case opts.source == "battlenet" && (opts.clientID == "" || opts.clientSecret == ""):
		return options{}, errors.New("BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET are required for -source battlenet")
	case opts.mediaOnly && opts.source != "battlenet":
		return options{}, errors.New("-media-only requires -source battlenet")
	case opts.missingOnly && opts.source != "battlenet":
		return options{}, errors.New("-missing-only requires -source battlenet")
	case opts.mediaOnly && opts.missingOnly:
		return options{}, errors.New("-media-only and -missing-only cannot be combined")
	case len(opts.locales) == 0 || opts.locales[0] != "en_US":
		return options{}, errors.New("en_US must be the first canonical locale")
	case opts.pageSize < 1 || opts.pageSize > 1000:
		return options{}, errors.New("page-size must be between 1 and 1000")
	case opts.maxRecords < 0:
		return options{}, errors.New("max-records cannot be negative")
	case opts.detailWorkers < 1 || opts.detailWorkers > 32:
		return options{}, errors.New("detail-workers must be between 1 and 32")
	case opts.wagoTableTimeout <= 0:
		return options{}, errors.New("wago-table-timeout must be positive")
	}
	if opts.source == "battlenet" {
		if _, err := battleNetNamespace(opts.product, "us"); err != nil {
			return options{}, err
		}
	}
	for _, locale := range opts.locales {
		if _, err := regionForLocale(locale); err != nil {
			return options{}, err
		}
	}
	for _, entityType := range opts.entityTypes {
		if opts.source == "wago" && entityType != "item" && entityType != "spell" {
			return options{}, fmt.Errorf("unsupported entity type %q", entityType)
		}
		if opts.source == "battlenet" {
			if _, ok := battleNetEntitySpecs[entityType]; !ok {
				return options{}, fmt.Errorf("unsupported entity type %q", entityType)
			}
		}
	}
	return opts, nil
}

func effectiveWagoTableTimeout(value time.Duration) time.Duration {
	if value <= 0 {
		return defaultWagoTableTimeout
	}
	return value
}

func buildNumber(version string) (int, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	number, err := strconv.Atoi(parts[3])
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	return number, nil
}

func sourceName(source string) string {
	if source == "wago" {
		return "wago_tools"
	}
	return source
}

func wagoLocale(locale string) (string, error) {
	switch locale {
	case "en_US":
		return "enUS", nil
	case "ru_RU":
		return "ruRU", nil
	default:
		return "", fmt.Errorf("unsupported locale %q", locale)
	}
}

func regionForLocale(locale string) (string, error) {
	switch locale {
	case "en_US":
		return "us", nil
	case "ru_RU":
		return "eu", nil
	default:
		return "", fmt.Errorf("unsupported locale %q", locale)
	}
}

func battleNetNamespace(product, region string) (string, error) {
	region = strings.ToLower(strings.TrimSpace(region))
	if region != "us" && region != "eu" {
		return "", fmt.Errorf("unsupported Battle.net region %q", region)
	}
	switch strings.TrimSpace(product) {
	case "wow":
		return "static-" + region, nil
	case "wow_classic":
		return "static-classic-" + region, nil
	case "wow_classic_era", "wow_classic_hardcore":
		return "static-classic1x-" + region, nil
	default:
		return "", fmt.Errorf("unsupported Battle.net product %q", product)
	}
}

func integerField(row map[string]string, key string) int64 {
	value, _ := strconv.ParseInt(row[key], 10, 64)
	return value
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

func intEnv(key string) int {
	value, _ := strconv.Atoi(os.Getenv(key))
	return value
}
