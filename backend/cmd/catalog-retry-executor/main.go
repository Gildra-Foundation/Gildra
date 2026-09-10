// catalog-retry-executor resumes one due, transient import failure at a time.
// It deliberately resumes only the source stage that failed, then runs the
// normal release validation/publication gates. A failed retry is quarantined;
// the importer will create a new scheduled queue item only when it observes a
// new, explicitly retryable source failure.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type retryCandidate struct {
	QueueID      uuid.UUID `json:"queueId"`
	ImportRunID  uuid.UUID `json:"importRunId"`
	ReleaseID    uuid.UUID `json:"releaseId"`
	Product      string    `json:"product"`
	BuildVersion string    `json:"buildVersion"`
	Source       string    `json:"source"`
	Environment  string    `json:"environment"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, binaryDirectory string
	var execute bool
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&binaryDirectory, "bin-dir", "", "directory containing catalog importer executables")
	flag.BoolVar(&execute, "execute", false, "claim and execute one due retry (default reports the next candidate)")
	flag.DurationVar(&timeout, "timeout", 6*time.Hour, "whole retry timeout")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if !execute {
		candidate, err := nextCandidate(ctx, db, false)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(candidate)
	}
	if strings.TrimSpace(binaryDirectory) == "" {
		return errors.New("-bin-dir is required with -execute")
	}
	candidate, err := nextCandidate(ctx, db, true)
	if err != nil {
		return err
	}
	if candidate == nil {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "idle"})
	}
	options, err := retryOptions(*candidate, binaryDirectory)
	if err != nil {
		return finishRetry(ctx, db, *candidate, "quarantined", "retry_plan_invalid", err)
	}
	result, runErr := (&catalogpipeline.Runner{DB: db, Stdout: os.Stdout, Stderr: os.Stderr}).Run(ctx, options)
	if runErr != nil {
		state, code := "quarantined", "retry_pipeline_failed"
		if errors.Is(runErr, catalogpipeline.ErrAlreadyRunning) {
			state, code = "retry_scheduled", "retry_pipeline_busy"
		}
		if err := finishRetry(ctx, db, *candidate, state, code, runErr); err != nil {
			return errors.Join(runErr, err)
		}
		return runErr
	}
	if err := finishRetry(ctx, db, *candidate, "resolved", "retry_succeeded", nil); err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func nextCandidate(ctx context.Context, db *pgxpool.Pool, claim bool) (*retryCandidate, error) {
	if !claim {
		var candidate retryCandidate
		err := db.QueryRow(ctx, `
			SELECT queue.id,queue.import_run_id,release.id,product.slug,release.build_version,import_run.source,pipeline.publication_environment
			FROM catalog_import_failure_queue queue
			JOIN catalog_import_runs import_run ON import_run.id=queue.import_run_id
			JOIN catalog_snapshots snapshot ON snapshot.id=import_run.snapshot_id
			JOIN catalog_releases release ON release.id=snapshot.release_id
			JOIN game_products product ON product.id=import_run.product_id
			JOIN catalog_pipeline_runs pipeline ON pipeline.id=release.pipeline_run_id
			WHERE queue.state='retry_scheduled' AND queue.retry_after<=now()
			ORDER BY queue.retry_after,queue.created_at
			LIMIT 1`).Scan(&candidate.QueueID, &candidate.ImportRunID, &candidate.ReleaseID, &candidate.Product, &candidate.BuildVersion, &candidate.Source, &candidate.Environment)
		if err != nil {
			if strings.Contains(err.Error(), "no rows") {
				return nil, nil
			}
			return nil, fmt.Errorf("read due catalog retry: %w", err)
		}
		return &candidate, nil
	}
	statement := `
		WITH due AS (
			SELECT queue.id
			FROM catalog_import_failure_queue queue
			WHERE queue.state='retry_scheduled' AND queue.retry_after<=now()
			ORDER BY queue.retry_after,queue.created_at
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		), selected AS (
			UPDATE catalog_import_failure_queue queue
			SET state='retrying',attempts=queue.attempts+1,updated_at=now()
			FROM due WHERE queue.id=due.id
			RETURNING queue.id,queue.import_run_id
		)
		SELECT selected.id,selected.import_run_id,release.id,product.slug,release.build_version,import_run.source,pipeline.publication_environment
		FROM selected
		JOIN catalog_import_runs import_run ON import_run.id=selected.import_run_id
		JOIN catalog_snapshots snapshot ON snapshot.id=import_run.snapshot_id
		JOIN catalog_releases release ON release.id=snapshot.release_id
		JOIN game_products product ON product.id=import_run.product_id
		JOIN catalog_pipeline_runs pipeline ON pipeline.id=release.pipeline_run_id`
	var candidate retryCandidate
	err := db.QueryRow(ctx, statement).Scan(&candidate.QueueID, &candidate.ImportRunID, &candidate.ReleaseID, &candidate.Product, &candidate.BuildVersion, &candidate.Source, &candidate.Environment)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return nil, nil
		}
		return nil, fmt.Errorf("claim due catalog retry: %w", err)
	}
	return &candidate, nil
}

func retryOptions(candidate retryCandidate, binaryDirectory string) (catalogpipeline.Options, error) {
	stage, ok := map[string]string{
		"wago_tools": "import-wago", "raidbots": "import-raidbots", "casc_db2": "import-db2",
		"battlenet": "import-battlenet", "wow_listfile": "import-listfile",
	}[candidate.Source]
	if !ok {
		return catalogpipeline.Options{}, fmt.Errorf("unsupported retry source %q", candidate.Source)
	}
	profile, ok := map[string]string{
		"wow":                  catalogpipeline.ProfileRetailFoundation,
		"wow_classic":          catalogpipeline.ProfileClassicFoundation,
		"wow_classic_era":      catalogpipeline.ProfileClassicEraFoundation,
		"wow_classic_hardcore": catalogpipeline.ProfileClassicHardcoreFoundation,
	}[candidate.Product]
	if !ok {
		return catalogpipeline.Options{}, fmt.Errorf("unsupported retry product %q", candidate.Product)
	}
	return catalogpipeline.Options{
		PipelineKey: "catalog-retry", Trigger: "retry", Mode: "apply", Profile: profile,
		Product: candidate.Product, BuildVersion: candidate.BuildVersion, ConfirmFullImport: true,
		BinaryDirectory: binaryDirectory, PublicationEnvironment: candidate.Environment,
		CatalogAccessMode: "public", RecoveryPolicy: "off_host", ResumeReleaseID: candidate.ReleaseID.String(),
		ResumeStages: []string{stage, "rebuild-projections", "rebuild-entity-graph", "refresh-coverage"},
	}, nil
}

func finishRetry(ctx context.Context, db *pgxpool.Pool, candidate retryCandidate, state, code string, cause error) error {
	summary := ""
	if cause != nil {
		summary = cause.Error()
	}
	_, err := db.Exec(ctx, `
		UPDATE catalog_import_failure_queue
		SET state=$2,retry_after=CASE WHEN $2='retry_scheduled' THEN now()+interval '5 minutes' ELSE retry_after END,
			resolution_code=$3,resolution_summary=$4,resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END,updated_at=now()
		WHERE id=$1 AND state='retrying'`, candidate.QueueID, state, code, summary)
	if err != nil {
		return fmt.Errorf("finish catalog retry %s: %w", candidate.QueueID, err)
	}
	return nil
}
