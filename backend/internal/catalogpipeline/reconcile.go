package catalogpipeline

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ReconcileFailedRun is an explicit operator operation, not automatic inference
// from age or absence of a heartbeat. The caller must attest that the old worker
// and its descendants have stopped. A current/changed release is never touched.
func (r *Runner) ReconcileFailedRun(ctx context.Context, runID int64, product string, workerStopped bool) (int64, error) {
	if !workerStopped || runID <= 0 {
		return 0, errors.New("reconciliation requires a run ID and confirmed stopped worker")
	}
	var affected int64
	err := pgx.BeginFunc(ctx, r.DB, func(tx pgx.Tx) error {
		var locked bool
		if err := tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))`, "gildra:catalog-pipeline:"+product).Scan(&locked); err != nil {
			return err
		}
		if !locked {
			return ErrAlreadyRunning
		}
		var releaseID string
		if err := tx.QueryRow(ctx, `SELECT release.id::text FROM catalog_pipeline_runs run
   JOIN catalog_releases release ON release.pipeline_run_id=run.id
   JOIN game_products product ON product.id=release.product_id
   WHERE run.id=$1 AND run.product=$2 AND product.slug=$2
    AND run.status IN ('failed','cancelled') AND release.status='failed'
   FOR UPDATE OF run,release`, runID, product).Scan(&releaseID); err != nil {
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
   ON CONFLICT(import_run_id) DO NOTHING`, releaseID)
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
