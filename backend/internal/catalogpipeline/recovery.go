package catalogpipeline

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
)

// Retry projections after publication, even when the build is already current.
// Freshness and every projection commit together, preserving last-good on error.
func (r *Runner) refreshPostPublish(ctx context.Context, runID int64, product, version string) error {
	if _, err := r.DB.Exec(ctx, `UPDATE catalog_pipeline_runs SET current_stage='refresh-post-publish' WHERE id=$1`, runID); err != nil {
		return err
	}
	if _, err := r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='running',started_at=now() WHERE run_id=$1 AND stage_key='refresh-post-publish'`, runID); err != nil {
		return err
	}
	err := pgx.BeginFunc(ctx, r.DB, func(tx pgx.Tx) error {
		var productID int16
		var buildID int64
		if err := tx.QueryRow(ctx, `SELECT product.id,build.id FROM game_products product JOIN game_builds build ON build.product_id=product.id WHERE product.slug=$1 AND build.version=$2 AND build.is_active FOR SHARE OF build`, product, version).Scan(&productID, &buildID); err != nil {
			return fmt.Errorf("resolve active published build: %w", err)
		}
		switch product {
		case "wow":
			if _, err := tx.Exec(ctx, `SELECT catalog_refresh_quest_usability($1)`, buildID); err != nil {
				return err
			}
		case "wow_classic", "wow_classic_era", "wow_classic_hardcore":
			if _, err := tx.Exec(ctx, `SELECT catalog_refresh_classic_quest_usability($1,$2)`, productID, buildID); err != nil {
				return err
			}
		}
		for _, query := range []string{
			`SELECT refresh_catalog_read_models($1)`,
			`SELECT refresh_catalog_public_summary_stats($1)`,
			`SELECT refresh_catalog_published_source_dependencies()`,
			`SELECT refresh_catalog_library_datasets($1)`,
			`SELECT refresh_catalog_library_media_previews($1)`,
		} {
			args := []any{productID}
			if query == `SELECT refresh_catalog_published_source_dependencies()` {
				args = nil
			}
			if _, err := tx.Exec(ctx, query, args...); err != nil {
				return fmt.Errorf("post-publication projection: %w", err)
			}
		}
		_, err := tx.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='succeeded',finished_at=now(),error_code='',error_summary='',counters='{"read_models_refreshed":true,"atomic_refresh":true}' WHERE run_id=$1 AND stage_key='refresh-post-publish'`, runID)
		return err
	})
	if err != nil {
		return r.failStage(ctx, runID, "refresh-post-publish", "post_publish_read_model_refresh_failed", err)
	}
	return nil
}

// Retaining an import requires recorded execution success in this release.
// A typo or an arbitrary resume-from must never turn a missing source into a skip.
func (r *Runner) validateResumeEvidence(ctx context.Context, options Options, plan []Stage) error {
	reached := false
	for _, stage := range plan {
		if stage.Executable == "" || resumeStageAllowed(options, stage.Key, &reached) {
			continue
		}
		var proven bool
		err := r.DB.QueryRow(ctx, `SELECT EXISTS(
   SELECT 1 FROM catalog_pipeline_stages stage
   JOIN catalog_pipeline_stages start ON start.run_id=stage.run_id AND start.stage_key='release-start'
   WHERE start.counters->>'release_id'=$1 AND stage.stage_key=$2 AND stage.status='succeeded'
  )`, options.ResumeReleaseID, stage.Key).Scan(&proven)
		if err != nil {
			return err
		}
		if !proven {
			return fmt.Errorf("cannot retain stage %s: no successful execution for release %s; resume from that stage", stage.Key, options.ResumeReleaseID)
		}
	}
	return nil
}
