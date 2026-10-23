package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	clickhouse "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/getsentry/sentry-go"
	"github.com/getsentry/sentry-go/http"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/Gildra-Foundation/Gildra/backend/internal/adminpanel"
	"github.com/Gildra-Foundation/Gildra/backend/internal/analytics"
	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/auth"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogmedia"
	"github.com/Gildra-Foundation/Gildra/backend/internal/characterworkspace"
	"github.com/Gildra-Foundation/Gildra/backend/internal/config"
	"github.com/Gildra-Foundation/Gildra/backend/internal/datasetrefresh"
	"github.com/Gildra-Foundation/Gildra/backend/internal/gamemeta"
	"github.com/Gildra-Foundation/Gildra/backend/internal/genshin"
	"github.com/Gildra-Foundation/Gildra/backend/internal/graphqlapi"
	"github.com/Gildra-Foundation/Gildra/backend/internal/httpapi"
	"github.com/Gildra-Foundation/Gildra/backend/internal/indexnow"
	"github.com/Gildra-Foundation/Gildra/backend/internal/joberrors"
	"github.com/Gildra-Foundation/Gildra/backend/internal/league"
	"github.com/Gildra-Foundation/Gildra/backend/internal/platformhome"
	"github.com/Gildra-Foundation/Gildra/backend/internal/rotationlab"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if err := sentry.Init(sentry.ClientOptions{
		Dsn: cfg.SentryDSN, Environment: cfg.SentryEnvironment,
		EnableTracing: cfg.SentryDSN != "" && cfg.SentryTracesSampleRate > 0, TracesSampleRate: cfg.SentryTracesSampleRate,
	}); err != nil {
		return err
	}
	defer sentry.Flush(2 * time.Second)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	postgres, err := newPostgresPool(ctx, cfg.DatabaseURL, "gildra-api", cfg.DatabaseMaxConns)
	if err != nil {
		return err
	}
	defer postgres.Close()
	// River holds a LISTEN connection and polls continuously; a pool of its
	// own keeps job processing and slow API queries from starving each other.
	workerPostgres, err := newPostgresPool(ctx, cfg.DatabaseURL, "gildra-worker", cfg.WorkerDatabaseMaxConns)
	if err != nil {
		return err
	}
	defer workerPostgres.Close()

	clickhouseConn, err := clickhouse.Open(&clickhouse.Options{
		Addr:        []string{cfg.ClickHouseAddr},
		Auth:        clickhouse.Auth{Database: cfg.ClickHouseDatabase, Username: cfg.ClickHouseUser, Password: cfg.ClickHousePassword},
		DialTimeout: 5 * time.Second,
		Compression: &clickhouse.Compression{Method: clickhouse.CompressionLZ4},
	})
	if err != nil {
		return err
	}
	defer clickhouseConn.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword})
	defer redisClient.Close()

	workers := river.NewWorkers()
	river.AddWorker(workers, indexnow.NewWorker(indexnow.HTTPClient(), cfg.IndexNowHost, cfg.IndexNowKey))
	river.AddWorker(workers, datasetrefresh.NewWorker(
		datasetrefresh.HTTPClient(cfg.DatasetWorkerTimeout),
		cfg.DatasetWorkerURL,
	))
	river.AddWorker(workers, datasetrefresh.NewArchonWorker(
		datasetrefresh.HTTPClient(cfg.DatasetWorkerTimeout),
		cfg.DatasetWorkerURL,
	))
	river.AddWorker(workers, datasetrefresh.NewWowGGWorker(
		datasetrefresh.HTTPClient(cfg.DatasetWorkerTimeout),
		cfg.DatasetWorkerURL,
	))
	river.AddWorker(workers, datasetrefresh.NewIcyVeinsWorker(
		datasetrefresh.HTTPClient(cfg.DatasetWorkerTimeout),
		cfg.DatasetWorkerURL,
	))
	riverClient, err := river.NewClient(riverpgxv5.New(workerPostgres), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault:       {MaxWorkers: 10},
			datasetrefresh.QueueName: {MaxWorkers: 1},
		},
		PeriodicJobs: []*river.PeriodicJob{
			datasetrefresh.PeriodicJob(time.Now),
			datasetrefresh.ArchonPeriodicJob(time.Now),
			datasetrefresh.WowGGPeriodicJob(time.Now),
			datasetrefresh.IcyVeinsPeriodicJob(time.Now),
		},
		ErrorHandler: &joberrors.SentryHandler{},
		Workers:      workers,
	})
	if err != nil {
		return err
	}
	if err := riverClient.Start(ctx); err != nil {
		return err
	}

	analyticsService := analytics.NewService(clickhouseConn, postgres, redisClient, cfg.AnalyticsCacheTTL)
	authService := auth.NewService(postgres, cfg.AdminSessionTTL)
	if err := authService.EnsureAdmin(ctx, cfg.AdminBootstrapEmail, cfg.AdminBootstrapPassword); err != nil {
		return err
	}
	catalogService := catalog.NewService(postgres)
	publicationService := catalog.NewPublicationService(postgres, time.Minute)
	server := httpapi.NewServer(analyticsService, catalogService, indexnow.NewQueue(riverClient, cfg.IndexNowHost))
	restHandler := http.Handler(api.Handler(api.NewStrictHandler(server, nil)))
	graphqlHandler := handler.NewDefaultServer(graphqlapi.NewExecutableSchema(graphqlapi.Config{
		Resolvers: &graphqlapi.Resolver{Catalog: catalogService},
	}))
	// Keep GraphQL requests bounded independently of HTTP body limits. The
	// catalog payload is intentionally rich, but an unbounded selection tree
	// must not turn one authenticated request into an expensive database fanout.
	graphqlHandler.Use(extension.FixedComplexityLimit(1000))
	graphqlCatalogHandler := http.Handler(graphqlHandler)
	if cfg.CatalogAccessMode == "private" {
		restHandler = httpapi.RequireCatalogAuthentication(restHandler, authService, cfg.CatalogAccessMode)
		graphqlCatalogHandler = httpapi.RequireCatalogAuthentication(graphqlCatalogHandler, authService, cfg.CatalogAccessMode)
	} else {
		restHandler = httpapi.CachePublicCatalog(restHandler)
		restHandler = httpapi.EnforceCatalogPublication(restHandler, publicationService, cfg.CatalogPublicationMode, cfg.CatalogPublicationEnv)
		graphqlCatalogHandler = httpapi.EnforceCatalogPublication(graphqlCatalogHandler, publicationService, cfg.CatalogPublicationMode, cfg.CatalogPublicationEnv)
	}
	router := http.NewServeMux()
	adminpanel.New(authService, analyticsService, postgres, clickhouseConn, redisClient, cfg.CatalogRecoveryPolicy).Register(router)
	genshin.NewHandler(genshin.NewService(postgres)).Register(router)
	gamemeta.NewHandler(gamemeta.NewService(postgres)).Register(router)
	league.NewHandler(league.NewService(postgres)).Register(router)
	platformhome.NewHandler(platformhome.NewService(postgres)).Register(router)
	rotationlab.NewHandler(rotationlab.NewService(postgres)).Register(router)
	characterworkspace.NewHandler(characterworkspace.NewService(postgres), characterworkspace.NewBattleNetVerifier()).Register(router)
	if cfg.CatalogMediaDirectory != "" {
		genshinMediaHandler, genshinMediaErr := genshin.NewMediaHandler(cfg.CatalogMediaDirectory)
		if genshinMediaErr != nil {
			return genshinMediaErr
		}
		router.Handle("/genshin-impact/media/", genshinMediaHandler)
		leagueMediaHandler, leagueMediaErr := league.NewMediaHandler(cfg.CatalogMediaDirectory)
		if leagueMediaErr != nil {
			return leagueMediaErr
		}
		router.Handle("/league-of-legends/media/", leagueMediaHandler)

		mediaHandler, mediaErr := catalogmedia.NewHandlerWithAccessMode(postgres, cfg.CatalogMediaDirectory, cfg.CatalogPublicationEnv, cfg.CatalogAccessMode)
		if mediaErr != nil {
			return mediaErr
		}
		defer mediaHandler.Close() //nolint:errcheck
		router.Handle("/v1/media/", httpapi.RequireCatalogAuthentication(mediaHandler, authService, cfg.CatalogAccessMode))
	}
	router.Handle("/graphql", graphqlCatalogHandler)
	router.Handle("/", restHandler)
	// Observe the request the router sees: MaxBytesHandler hands the router a
	// copy, so outside it the matched route pattern was lost ("unmatched").
	apiHandler := httpapi.ObserveRequests(httpapi.LimitRequestDuration(router, cfg.RequestTimeout, httpapi.LongRunningPrefixes), slog.Default())
	apiHandler = http.MaxBytesHandler(apiHandler, 8<<20)
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle(apiHandler)

	httpServer := &http.Server{
		Addr: cfg.HTTPAddr, Handler: sentryHandler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("Gildra API listening", "address", cfg.HTTPAddr)
		serverErrors <- httpServer.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := riverClient.Stop(shutdownCtx); err != nil {
		return err
	}
	return nil
}

// newPostgresPool opens a pool tagged with applicationName (visible in
// pg_stat_activity). maxConns 0 keeps the pgx default of max(4, CPUs).
func newPostgresPool(ctx context.Context, databaseURL, applicationName string, maxConns int32) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	if maxConns > 0 {
		poolConfig.MaxConns = maxConns
	}
	if poolConfig.ConnConfig.RuntimeParams["application_name"] == "" {
		poolConfig.ConnConfig.RuntimeParams["application_name"] = applicationName
	}
	// The catalog projections cost past jit_above_cost, so Postgres compiled
	// each page query with LLVM: 8.3 of 8.5 s for /v1/game/entities?limit=100,
	// which executes in 54 ms (EXPLAIN ANALYZE on production, 2026-10-23).
	// A database URL that sets jit explicitly still wins.
	if poolConfig.ConnConfig.RuntimeParams["jit"] == "" {
		poolConfig.ConnConfig.RuntimeParams["jit"] = "off"
	}
	return pgxpool.NewWithConfig(ctx, poolConfig)
}
