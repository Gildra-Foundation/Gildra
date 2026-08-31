package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
)

// productSpec is intentionally explicit: Retail, Classic, Classic Era and
// Hardcore are separate catalogs and must never share a release pointer.
type productSpec struct {
	Alias     string
	Product   string
	Profile   string
	Source    string
	WagoKey   string
	Edition   string
	Namespace string
}

var productSpecs = []productSpec{
	{Alias: "retail", Product: "wow", Profile: catalogpipeline.ProfileRetailFoundation, Source: "wago_tools", WagoKey: "wow", Edition: "retail"},
	{Alias: "classic", Product: "wow_classic", Profile: catalogpipeline.ProfileClassicFoundation, Source: "wago_tools", WagoKey: "wow_classic", Edition: "classic", Namespace: "static-classic-us"},
	{Alias: "classic-era", Product: "wow_classic_era", Profile: catalogpipeline.ProfileClassicEraFoundation, Source: "wago_tools", WagoKey: "wow_classic_era", Edition: "classic-era", Namespace: "static-classic1x-us"},
	{Alias: "hardcore", Product: "wow_classic_hardcore", Profile: catalogpipeline.ProfileClassicHardcoreFoundation, Source: "wago_tools", WagoKey: "wow_classic_era", Edition: "hardcore", Namespace: "static-classic1x-us"},
}

type refreshOptions struct {
	databaseURL       string
	mode              string
	requireUpdate     bool
	publicationEnv    string
	accessMode        string
	recoveryPolicy    string
	binaryDirectory   string
	products          []string
	timeout           time.Duration
	battlenetClientID string
	battlenetSecret   string
}

type productResult struct {
	Alias          string `json:"edition"`
	Product        string `json:"product"`
	Profile        string `json:"profile"`
	Source         string `json:"source"`
	CurrentBuild   string `json:"current_build,omitempty"`
	RemoteBuild    string `json:"remote_build,omitempty"`
	Update         bool   `json:"update_available"`
	Status         string `json:"status"`
	PipelineStatus string `json:"pipeline_status,omitempty"`
	PipelineRunID  int64  `json:"pipeline_run_id,omitempty"`
	Error          string `json:"error,omitempty"`
}

type refreshSummary struct {
	Mode            string          `json:"mode"`
	CheckedAt       time.Time       `json:"checked_at"`
	UpdatesDetected int             `json:"updates_detected"`
	Applied         int             `json:"applied"`
	Results         []productResult `json:"results"`
}

type buildObservation struct {
	Current string
	Remote  string
	Changed bool
}

func main() {
	summary, exitCode, err := run()
	if summary != nil {
		if encodeErr := json.NewEncoder(os.Stdout).Encode(summary); encodeErr != nil && err == nil {
			err = fmt.Errorf("encode refresh summary: %w", encodeErr)
			exitCode = 2
		}
	}
	if err != nil && exitCode == 0 {
		exitCode = 2
	}
	if err != nil && exitCode != 1 {
		slog.Error("catalog refresh all failed", "error", err)
	}
	os.Exit(exitCode)
}

// run returns exit code 1 only for the expected systemd ExecCondition case:
// no edition has a newer build while -require-update is enabled. Other errors
// use 2 so a failed scheduler is distinguishable from a healthy no-op.
func run() (*refreshSummary, int, error) {
	opts, err := parseOptions()
	if err != nil {
		return nil, 2, err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, opts.timeout)
	defer cancel()

	db, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return nil, 2, fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return nil, 2, fmt.Errorf("ping catalog database: %w", err)
	}

	unlock, acquired, err := acquireRefreshLock(ctx, db)
	if err != nil {
		return nil, 2, err
	}
	if !acquired {
		return nil, 2, errors.New("catalog refresh all is already running")
	}
	defer unlock()

	selected, err := selectProducts(opts.products)
	if err != nil {
		return nil, 2, err
	}
	wagoClient := wago.New(wago.Config{RetryMax: 3, RetryDelay: time.Second})
	var battleNetClient *battlenet.Client
	if containsBattleNetProduct(selected) {
		battleNetClient, err = battlenet.New(battlenet.Config{
			ClientID: opts.battlenetClientID, ClientSecret: opts.battlenetSecret,
		})
		if err != nil {
			// Keep Retail checks useful when a Classic credential is temporarily
			// unavailable; each Classic result receives its own failed status.
			slog.Warn("Battle.net client unavailable; Classic editions will be marked failed", "error", err)
		}
	}

	summary := &refreshSummary{Mode: opts.mode, CheckedAt: time.Now().UTC(), Results: make([]productResult, 0, len(selected))}
	observations := make(map[string]buildObservation, len(selected))
	var checkErrors []error
	for _, spec := range selected {
		result := productResult{Alias: spec.Alias, Product: spec.Product, Profile: spec.Profile, Source: spec.Source, Status: "checked"}
		observation, checkErr := observeBuild(ctx, db, spec, wagoClient, battleNetClient)
		if checkErr != nil {
			result.Status = "failed"
			result.Error = boundedError(checkErr)
			if recordErr := recordBuildCheck(ctx, db, spec, "", "", false, checkErr); recordErr != nil {
				checkErrors = append(checkErrors, fmt.Errorf("%s: record failed check: %w", spec.Alias, recordErr))
			}
			checkErrors = append(checkErrors, fmt.Errorf("%s: %w", spec.Alias, checkErr))
			summary.Results = append(summary.Results, result)
			continue
		}
		result.CurrentBuild, result.RemoteBuild, result.Update = observation.Current, observation.Remote, observation.Changed
		if observation.Changed {
			summary.UpdatesDetected++
		}
		if err := recordBuildCheck(ctx, db, spec, observation.Current, observation.Remote, observation.Changed, nil); err != nil {
			result.Status = "failed"
			result.Error = boundedError(err)
			checkErrors = append(checkErrors, fmt.Errorf("%s: record build check: %w", spec.Alias, err))
		}
		observations[spec.Product] = observation
		summary.Results = append(summary.Results, result)
	}

	if opts.mode == "check" {
		if len(checkErrors) > 0 {
			return summary, 2, errors.Join(checkErrors...)
		}
		if opts.requireUpdate && summary.UpdatesDetected == 0 {
			return summary, 1, nil
		}
		return summary, 0, nil
	}

	var applyErrors []error
	for index := range summary.Results {
		result := &summary.Results[index]
		if result.Status == "failed" {
			continue
		}
		observation, ok := observations[result.Product]
		if !ok || !observation.Changed {
			if result.Status != "failed" {
				result.Status = "current"
			}
			continue
		}
		pipelineResult, pipelineErr := (&catalogpipeline.Runner{DB: db, Stdout: os.Stdout, Stderr: os.Stderr}).Run(ctx, catalogpipeline.Options{
			PipelineKey:            "catalog-refresh-all",
			Trigger:                "schedule",
			Mode:                   "apply",
			Profile:                result.Profile,
			Product:                result.Product,
			BuildVersion:           observation.Remote,
			MaxRecords:             0,
			ConfirmFullImport:      true,
			BinaryDirectory:        opts.binaryDirectory,
			PublicationEnvironment: opts.publicationEnv,
			CatalogAccessMode:      opts.accessMode,
			RecoveryPolicy:         opts.recoveryPolicy,
		})
		result.PipelineRunID, result.PipelineStatus = pipelineResult.RunID, pipelineResult.Status
		if pipelineErr != nil {
			result.Status = "failed"
			result.Error = boundedError(pipelineErr)
			applyErrors = append(applyErrors, fmt.Errorf("%s: %w", result.Alias, pipelineErr))
			continue
		}
		result.Status = "applied"
		summary.Applied++
	}
	if len(checkErrors) > 0 || len(applyErrors) > 0 {
		return summary, 2, errors.Join(append(checkErrors, applyErrors...)...)
	}
	return summary, 0, nil
}

func parseOptions() (refreshOptions, error) {
	var databaseURL, mode, publicationEnv, accessMode, recoveryPolicy, binaryDirectory, products string
	var timeout time.Duration
	var requireUpdate bool
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&mode, "mode", "check", "check or apply")
	flag.BoolVar(&requireUpdate, "require-update", false, "in check mode, return exit code 1 when all editions are current")
	flag.StringVar(&products, "products", "", "optional comma-separated editions: retail,classic,classic-era,hardcore (default: all)")
	flag.StringVar(&publicationEnv, "publication-environment", envOr("CATALOG_PUBLICATION_ENVIRONMENT", "production"), "development, staging, or production")
	flag.StringVar(&accessMode, "access-mode", envOr("CATALOG_ACCESS_MODE", "private"), "public or private")
	flag.StringVar(&recoveryPolicy, "recovery-policy", envOr("CATALOG_RECOVERY_POLICY", catalogquality.RecoveryPolicyVerifiedSameHost), "off_host or verified_same_host")
	flag.StringVar(&binaryDirectory, "bin-dir", envOr("CATALOG_BINARY_DIRECTORY", "/usr/local/bin"), "directory containing importer executables")
	flag.DurationVar(&timeout, "timeout", 24*time.Hour, "whole refresh timeout")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if strings.TrimSpace(databaseURL) == "" {
		return refreshOptions{}, errors.New("DATABASE_URL or -database-url is required")
	}
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode != "check" && mode != "apply" {
		return refreshOptions{}, errors.New("mode must be check or apply")
	}
	publicationEnv = strings.ToLower(strings.TrimSpace(publicationEnv))
	if publicationEnv != "development" && publicationEnv != "staging" && publicationEnv != "production" {
		return refreshOptions{}, errors.New("publication-environment must be development, staging, or production")
	}
	accessMode = strings.ToLower(strings.TrimSpace(accessMode))
	if accessMode != "public" && accessMode != "private" {
		return refreshOptions{}, errors.New("access-mode must be public or private")
	}
	if timeout <= 0 {
		return refreshOptions{}, errors.New("timeout must be positive")
	}
	selected, err := selectProducts(splitList(products))
	if err != nil {
		return refreshOptions{}, err
	}
	return refreshOptions{
		databaseURL:       databaseURL,
		mode:              mode,
		requireUpdate:     requireUpdate,
		publicationEnv:    publicationEnv,
		accessMode:        accessMode,
		recoveryPolicy:    strings.TrimSpace(recoveryPolicy),
		binaryDirectory:   strings.TrimSpace(binaryDirectory),
		products:          aliases(selected),
		timeout:           timeout,
		battlenetClientID: strings.TrimSpace(os.Getenv("BATTLENET_CLIENT_ID")),
		battlenetSecret:   strings.TrimSpace(os.Getenv("BATTLENET_CLIENT_SECRET")),
	}, nil
}

func observeBuild(ctx context.Context, db *pgxpool.Pool, spec productSpec, wagoClient *wago.Client, battleNetClient *battlenet.Client) (buildObservation, error) {
	var current string
	if err := db.QueryRow(ctx, `
		SELECT COALESCE(build.version, '')
		FROM game_products product
		LEFT JOIN LATERAL (
			SELECT candidate.version
			FROM game_builds candidate
			WHERE candidate.product_id=product.id AND candidate.is_active
			ORDER BY candidate.build_number DESC LIMIT 1
		) build ON true
		WHERE product.slug=$1`, spec.Product).Scan(&current); err != nil {
		return buildObservation{}, fmt.Errorf("load active build: %w", err)
	}
	var remote string
	if spec.Source == "wago_tools" {
		var err error
		if spec.WagoKey == "wow" {
			remote, err = wagoClient.CurrentBuild(ctx, "ItemSparse", "enUS")
		} else {
			remote, err = wagoClient.CurrentBuildForProduct(ctx, spec.WagoKey)
		}
		if err != nil {
			return buildObservation{}, fmt.Errorf("resolve Wago build: %w", err)
		}
	} else {
		if battleNetClient == nil {
			return buildObservation{}, errors.New("Battle.net credentials are not configured")
		}
		_, remoteVersion, err := battleNetClient.CurrentBuildForNamespace(ctx, "us", "en_US", spec.Namespace)
		if err != nil {
			return buildObservation{}, fmt.Errorf("resolve Battle.net build: %w", err)
		}
		remote = remoteVersion
	}
	if _, err := parseBuildNumber(remote); err != nil {
		return buildObservation{}, err
	}
	return buildObservation{Current: current, Remote: remote, Changed: strings.TrimSpace(current) != strings.TrimSpace(remote)}, nil
}

func recordBuildCheck(ctx context.Context, db *pgxpool.Pool, spec productSpec, current, remote string, changed bool, observationErr error) error {
	var productID int16
	if err := db.QueryRow(ctx, `SELECT id FROM game_products WHERE slug=$1`, spec.Product).Scan(&productID); err != nil {
		return fmt.Errorf("resolve product: %w", err)
	}
	status := "current"
	if changed {
		status = "update_available"
	}
	if observationErr != nil {
		status = "failed"
	}
	observed := strings.TrimSpace(remote)
	if observed == "" {
		observed = strings.TrimSpace(current)
	}
	if observed == "" {
		observed = "unavailable"
	}
	var observedNumber any
	if number, err := parseBuildNumber(observed); err == nil {
		observedNumber = number
	}
	hash := sha256.Sum256([]byte(observed))
	metadata := map[string]any{
		"edition": spec.Edition,
		"product": spec.Product,
		"source":  spec.Source,
	}
	if spec.Namespace != "" {
		metadata["namespace"] = spec.Namespace
	} else {
		metadata["table"] = "ItemSparse"
		metadata["locale"] = "enUS"
	}
	if observationErr != nil {
		metadata["error"] = boundedError(observationErr)
	}
	_, err := db.Exec(ctx, `
		INSERT INTO catalog_build_update_checks(product_id,source,channel,observed_build,observed_build_number,manifest_hash,status,metadata,checked_at)
		VALUES($1,$2,'live',$3,$4,$5,$6,$7,now())
		ON CONFLICT(product_id,source,channel) DO UPDATE SET observed_build=EXCLUDED.observed_build,
			observed_build_number=EXCLUDED.observed_build_number,manifest_hash=EXCLUDED.manifest_hash,
			status=EXCLUDED.status,metadata=EXCLUDED.metadata,checked_at=EXCLUDED.checked_at`,
		productID, spec.Source, observed, observedNumber, hash[:], status, jsonObject(metadata))
	if err != nil {
		return fmt.Errorf("upsert build check: %w", err)
	}
	return nil
}

func acquireRefreshLock(ctx context.Context, db *pgxpool.Pool) (func(), bool, error) {
	connection, err := db.Acquire(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("acquire refresh connection: %w", err)
	}
	var acquired bool
	if err := connection.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended('gildra:catalog-refresh-all',0))`).Scan(&acquired); err != nil {
		connection.Release()
		return nil, false, fmt.Errorf("acquire refresh lock: %w", err)
	}
	if !acquired {
		connection.Release()
		return nil, false, nil
	}
	return func() {
		defer connection.Release()
		_, _ = connection.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtextextended('gildra:catalog-refresh-all',0))`)
	}, true, nil
}

func selectProducts(values []string) ([]productSpec, error) {
	if len(values) == 0 {
		result := append([]productSpec(nil), productSpecs...)
		return result, nil
	}
	allowed := make(map[string]productSpec, len(productSpecs))
	for _, spec := range productSpecs {
		allowed[spec.Alias], allowed[spec.Product] = spec, spec
	}
	seen := make(map[string]bool, len(values))
	result := make([]productSpec, 0, len(values))
	for _, raw := range values {
		value := strings.ToLower(strings.TrimSpace(raw))
		if value == "" {
			continue
		}
		spec, ok := allowed[value]
		if !ok {
			return nil, fmt.Errorf("unsupported catalog edition/product %q", raw)
		}
		if seen[spec.Product] {
			continue
		}
		seen[spec.Product] = true
		result = append(result, spec)
	}
	if len(result) == 0 {
		return nil, errors.New("at least one catalog edition is required")
	}
	return result, nil
}

func aliases(specs []productSpec) []string {
	result := make([]string, len(specs))
	for i, spec := range specs {
		result[i] = spec.Alias
	}
	return result
}

func containsBattleNetProduct(specs []productSpec) bool {
	// Battle.net remains a required enrichment source for every non-Retail
	// edition even though Wago is the build-discovery source. The two sources
	// serve different purposes: Wago pins DB2 rows, while Battle.net supplies
	// official localized details and media where the client export is sparse.
	return slices.ContainsFunc(specs, func(spec productSpec) bool { return spec.Product != "wow" })
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

func parseBuildNumber(version string) (int64, error) {
	parts := strings.Split(strings.TrimSpace(version), ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	for _, part := range parts[:3] {
		if _, err := strconv.ParseInt(part, 10, 64); err != nil {
			return 0, fmt.Errorf("invalid build version %q", version)
		}
	}
	number, err := strconv.ParseInt(parts[3], 10, 64)
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	return number, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func boundedError(err error) string {
	if err == nil {
		return ""
	}
	value := strings.TrimSpace(err.Error())
	if len(value) <= 2000 {
		return value
	}
	return value[:2000]
}

func jsonObject(value map[string]any) []byte {
	data, _ := json.Marshal(value)
	return data
}
