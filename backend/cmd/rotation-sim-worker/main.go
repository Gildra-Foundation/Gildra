package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/rotationlab"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		slog.Error("rotation simulation worker stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	binary := strings.TrimSpace(os.Getenv("SIMC_BINARY"))
	profile := strings.TrimSpace(os.Getenv("SIMC_FURY_PROFILE"))
	iterations := 750
	if raw := strings.TrimSpace(os.Getenv("SIMC_ITERATIONS")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return err
		}
		iterations = value
	}
	engine, err := rotationlab.NewSimCEngine(binary, profile, iterations)
	if err != nil {
		return err
	}
	mux := http.NewServeMux()
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	var postgres *pgxpool.Pool
	if databaseURL == "" {
		rotationlab.NewWorkerHandler(engine).Register(mux)
	} else {
		postgres, err = pgxpool.New(context.Background(), databaseURL)
		if err != nil {
			return err
		}
		defer postgres.Close()
		pingCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err = postgres.Ping(pingCtx)
		cancel()
		if err != nil {
			return err
		}
		rotationlab.NewHandler(rotationlab.NewServiceWithEngine(postgres, engine)).Register(mux)
		mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_, _ = w.Write([]byte(`{"status":"ok","engine":"simulationcraft","storage":"postgres"}`))
		})
	}
	server := &http.Server{
		Addr:              envOr("ROTATION_WORKER_ADDR", "127.0.0.1:58081"),
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      55 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	errorsCh := make(chan error, 1)
	go func() {
		slog.Info("rotation simulation worker listening", "address", server.Addr, "iterations", iterations)
		errorsCh <- server.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
	case err := <-errorsCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
