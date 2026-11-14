package catalogpipeline

import (
	"context"
	"errors"
	"fmt"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogrelease"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ReconcileFailedRun is an explicit operator operation, not automatic inference
// from age or absence of a heartbeat. The caller must attest that the old worker
// and its descendants have stopped. A current/changed release is never touched.
//
// A pipeline holds a session advisory lock for its whole life. Taking that lock
// here proves no pipeline of the product is connected, so a run still marked
// running belongs to a process that died without recording its end (SIGKILL,
// host restart, a stop that did not wait for the release to be failed). Such a
// run is closed the way the pipeline itself would have closed it: the run and
// its running stage fail, the staging release fails and published pointers are
// restored. Only then are the imports of the failed release closed.
func (r *Runner) ReconcileFailedRun(ctx context.Context, runID int64, product string, workerStopped bool) (int64, error) {
	if !workerStopped || runID <= 0 {
		return 0, errors.New("reconciliation requires a run ID and confirmed stopped worker")
	}
	connection, err := r.DB.Acquire(ctx)
	if err != nil {
		return 0, fmt.Errorf("acquire reconciliation connection: %w", err)
	}
	defer connection.Release()
	lockKey := "gildra:catalog-pipeline:" + product
	var locked bool
	if err := connection.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0))`, lockKey).Scan(&locked); err != nil {
		return 0, fmt.Errorf("acquire pipeline lock: %w", err)
	}
	if !locked {
		return 0, ErrAlreadyRunning
	}
	defer func() {
		_, _ = connection.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock(hashtextextended($1,0))`, lockKey)
	}()

	var runStatus, releaseStatus string
	var releaseID uuid.UUID
	if err := r.DB.QueryRow(ctx, `SELECT run.status,release.id,release.status FROM catalog_pipeline_runs run
   JOIN catalog_releases release ON release.pipeline_run_id=run.id
   JOIN game_products product ON product.id=release.product_id
   WHERE run.id=$1 AND run.product=$2 AND product.slug=$2`, runID, product).Scan(&runStatus, &releaseID, &releaseStatus); err != nil {
		return 0, fmt.Errorf("reconcile only the current release attempt of a run: %w", err)
	}
	const summary = "Operator confirmed interrupted pipeline stopped"
	if runStatus == "running" {
		if releaseStatus == "staging" {
			if err := catalogrelease.NewManager(r.DB).Fail(ctx, releaseID, errors.New(summary)); err != nil {
				return 0, fmt.Errorf("fail release of the interrupted run: %w", err)
			}
		}
		if _, err := r.DB.Exec(ctx, `UPDATE catalog_pipeline_runs SET status='failed',error_code='interrupted_pipeline_stopped',
   error_summary=$2,finished_at=now() WHERE id=$1 AND status='running'`, runID, summary); err != nil {
			return 0, fmt.Errorf("close interrupted pipeline run: %w", err)
		}
	}

	var affected int64
	err = pgx.BeginFunc(ctx, r.DB, func(tx pgx.Tx) error {
		var failedRelease string
		if err := tx.QueryRow(ctx, `SELECT release.id::text FROM catalog_pipeline_runs run
   JOIN catalog_releases release ON release.pipeline_run_id=run.id
   JOIN game_products product ON product.id=release.product_id
   WHERE run.id=$1 AND run.product=$2 AND product.slug=$2
    AND run.status IN ('failed','cancelled') AND release.status='failed'
   FOR UPDATE OF run,release`, runID, product).Scan(&failedRelease); err != nil {
			return fmt.Errorf("reconcile only the current failed release attempt: %w", err)
		}
		command, err := tx.Exec(ctx, `WITH stopped AS (
   UPDATE catalog_import_runs run SET status='FAILED',finished_at=now(),
    error_summary='Operator confirmed interrupted worker stopped',failure_code='interrupted_worker_stopped',failure_retryable=true
   FROM catalog_snapshots snapshot WHERE run.snapshot_id=snapshot.id
    AND snapshot.release_id=$1::uuid AND snapshot.status='failed' AND run.status='RUNNING'
   RETURNING run.id
  ) INSERT INTO catalog_import_failure_queue(import_run_id,state,failure_code,last_error_summary)
   SELECT id,'quarantined','interrupted_worker_stopped','Operator confirmed interrupted worker stopped' FROM stopped
   ON CONFLICT(import_run_id) DO NOTHING`, failedRelease)
		if err != nil {
			return err
		}
		affected = command.RowsAffected()
		_, err = tx.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='failed',finished_at=now(),
   error_code='interrupted_worker_stopped',error_summary='Operator confirmed interrupted worker stopped'
   WHERE run_id=$1 AND status='running'`, runID)
		return err
	})
	return affected, err
}
