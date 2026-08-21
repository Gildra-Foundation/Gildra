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
	"github.com/Gildra-Foundation/Gildra/backend/internal/config"
	"github.com/Gildra-Foundation/Gildra/backend/internal/datasetrefresh"
	"github.com/Gildra-Foundation/Gildra/backend/internal/graphqlapi"
	"github.com/Gildra-Foundation/Gildra/backend/internal/httpapi"
	"github.com/Gildra-Foundation/Gildra/backend/internal/indexnow"
	"github.com/Gildra-Foundation/Gildra/backend/internal/joberrors"
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
		EnableTracing: cfg.SentryDSN != "", TracesSampleRate: 0.1,
	}); err != nil {
		return err
	}
	defer sentry.Flush(2 * time.Second)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	postgres, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer postgres.Close()

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
	riverClient, err := river.NewClient(riverpgxv5.New(postgres), &river.Config{
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
	server := httpapi.NewServer(analyticsService, catalogService, indexnow.NewQueue(riverClient, cfg.IndexNowHost))
	restHandler := api.Handler(api.NewStrictHandler(server, nil))
	graphqlHandler := handler.NewDefaultServer(graphqlapi.NewExecutableSchema(graphqlapi.Config{
		Resolvers: &graphqlapi.Resolver{Catalog: catalogService},
	}))
	router := http.NewServeMux()
	adminpanel.New(authService, analyticsService, postgres, clickhouseConn, redisClient).Register(router)
	router.Handle("/graphql", graphqlHandler)
	router.Handle("/", restHandler)
	apiHandler := http.MaxBytesHandler(router, 8<<20)
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
