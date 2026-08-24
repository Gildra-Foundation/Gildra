package catalogpipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrAlreadyRunning = errors.New("catalog pipeline is already running for this product")
var ErrPublicationBlocked = errors.New("catalog refresh succeeded but public release is blocked by source policy")

type Options struct {
	PipelineKey            string
	Trigger                string
	Mode                   string
	Product                string
	Sources                []string
	BuildVersion           string
	MaxRecords             int
	BinaryDirectory        string
	PublicationEnvironment string
}

type Stage struct {
	Key        string   `json:"key"`
	Executable string   `json:"executable,omitempty"`
	Arguments  []string `json:"arguments,omitempty"`
}

type Result struct {
	RunID            int64                     `json:"run_id"`
	Mode             string                    `json:"mode"`
	Status           string                    `json:"status"`
	PublicationReady bool                      `json:"publication_ready"`
	Stages           []Stage                   `json:"stages"`
	Publication      catalog.PublicationStatus `json:"publication"`
}

type Runner struct {
	DB     *pgxpool.Pool
	Stdout io.Writer
	Stderr io.Writer
}

func BuildPlan(options Options) ([]Stage, error) {
	if options.MaxRecords < 0 {
		return nil, errors.New("max-records cannot be negative")
	}
	allowed := map[string]bool{"wago": true, "raidbots": true, "db2": true, "battlenet": true, "listfile": true}
	seen := make(map[string]bool)
	sources := make([]string, 0, len(options.Sources))
	for _, raw := range options.Sources {
		source := strings.ToLower(strings.TrimSpace(raw))
		if source == "" || seen[source] {
			continue
		}
		if !allowed[source] {
			return nil, fmt.Errorf("unsupported catalog source %q", source)
		}
		seen[source] = true
		sources = append(sources, source)
	}
	if len(sources) == 0 {
		return nil, errors.New("at least one catalog source is required")
	}
	plan := make([]Stage, 0, len(sources)+8)
	for _, source := range sources {
		switch source {
		case "wago":
			args := []string{"-source", "wago", "-product", options.Product, "-locales", "en_US,ru_RU", "-types", "item,spell", "-max-records", fmt.Sprint(options.MaxRecords)}
			if options.BuildVersion != "" {
				args = append(args, "-version", options.BuildVersion)
			}
			plan = append(plan, Stage{Key: "import-wago", Executable: "catalog-import", Arguments: args})
		case "raidbots":
			plan = append(plan, Stage{Key: "import-raidbots", Executable: "raidbots-import", Arguments: []string{"-environment", "live", "-max-records", fmt.Sprint(options.MaxRecords)}})
		case "db2":
			args := []string{"-max-records", fmt.Sprint(options.MaxRecords), "-confirm"}
			if options.BuildVersion != "" {
				args = append(args, "-version", options.BuildVersion)
			}
			plan = append(plan, Stage{Key: "import-db2", Executable: "db2-import", Arguments: args})
		case "battlenet":
			plan = append(plan,
				Stage{Key: "import-battlenet", Executable: "catalog-import", Arguments: []string{"-source", "battlenet", "-product", options.Product, "-locales", "en_US,ru_RU", "-types", "all", "-page-size", "1000", "-detail-workers", "8", "-max-records", fmt.Sprint(options.MaxRecords)}},
				Stage{Key: "import-battlenet-media", Executable: "catalog-import", Arguments: []string{"-source", "battlenet", "-product", options.Product, "-locales", "en_US,ru_RU", "-types", "class,specialization,profession,instance,battle_pet,achievement", "-media-only", "-page-size", "1000", "-detail-workers", "8", "-max-records", fmt.Sprint(options.MaxRecords)}},
			)
		case "listfile":
			plan = append(plan, Stage{Key: "import-listfile", Executable: "listfile-import", Arguments: []string{"-confirm"}})
		}
	}
	plan = append(plan,
		Stage{Key: "rebuild-descriptions", Executable: "catalog-index", Arguments: []string{"-descriptions-only", "-confirm"}},
		Stage{Key: "rebuild-item-variants", Executable: "catalog-index", Arguments: []string{"-variants-only", "-confirm"}},
		Stage{Key: "rebuild-spell-effects", Executable: "catalog-index", Arguments: []string{"-spell-effects-only", "-confirm"}},
		Stage{Key: "rebuild-projections", Executable: "catalog-index", Arguments: []string{"-confirm"}},
		Stage{Key: "rebuild-entity-graph", Executable: "catalog-index", Arguments: []string{"-graph-only", "-confirm"}},
		Stage{Key: "refresh-coverage", Executable: "catalog-index", Arguments: []string{"-stats-only", "-confirm"}},
		Stage{Key: "validate-catalog"},
		Stage{Key: "publication-gate"},
	)
	return plan, nil
}

func (r *Runner) Run(ctx context.Context, options Options) (result Result, runErr error) {
	plan, err := BuildPlan(options)
	if err != nil {
		return Result{}, err
	}
	result.Mode, result.Stages = options.Mode, plan
	connection, err := r.DB.Acquire(ctx)
	if err != nil {
		return result, fmt.Errorf("acquire pipeline connection: %w", err)
	}
	defer connection.Release()
	lockKey := "gildra:catalog-pipeline:" + options.Product
	var acquired bool
	if err := connection.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0))`, lockKey).Scan(&acquired); err != nil {
		return result, fmt.Errorf("acquire pipeline lock: %w", err)
	}
	if !acquired {
		return result, ErrAlreadyRunning
	}
	defer func() {
		_, _ = connection.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtextextended($1,0))`, lockKey)
	}()

	var generationBefore *int64
	_ = connection.QueryRow(ctx, `SELECT generation FROM catalog_read_model_state state JOIN game_products product ON product.id=state.product_id WHERE product.slug=$1`, options.Product).Scan(&generationBefore)
	if err := connection.QueryRow(ctx, `
		INSERT INTO catalog_pipeline_runs(pipeline_key,trigger_kind,mode,status,product,requested_sources,build_version,
			publication_environment,read_model_generation_before,started_at,current_stage)
		VALUES($1,$2,$3,'running',$4,$5,$6,$7,$8,now(),'preflight') RETURNING id`,
		options.PipelineKey, options.Trigger, options.Mode, options.Product, options.Sources,
		options.BuildVersion, options.PublicationEnvironment, generationBefore).Scan(&result.RunID); err != nil {
		return result, fmt.Errorf("create pipeline run: %w", err)
	}
	defer func() {
		if runErr != nil && !errors.Is(runErr, ErrPublicationBlocked) {
			_, _ = r.DB.Exec(context.Background(), `UPDATE catalog_pipeline_runs SET status='failed',error_code='pipeline_failed',error_summary=$2,finished_at=now() WHERE id=$1 AND status='running'`, result.RunID, boundedError(runErr))
		}
	}()
	for ordinal, stage := range plan {
		status := "queued"
		if options.Mode == "dry_run" && stage.Executable != "" {
			status = "skipped"
		}
		arguments := stage.Arguments
		if arguments == nil {
			arguments = []string{}
		}
		if _, err := connection.Exec(ctx, `INSERT INTO catalog_pipeline_stages(run_id,stage_key,ordinal,status,executable,safe_arguments) VALUES($1,$2,$3,$4,$5,$6)`,
			result.RunID, stage.Key, ordinal+1, status, stage.Executable, arguments); err != nil {
			return result, fmt.Errorf("create pipeline stage %s: %w", stage.Key, err)
		}
	}
	if options.Mode == "dry_run" {
		if _, err := connection.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='skipped',started_at=now(),finished_at=now() WHERE run_id=$1 AND status='queued'`, result.RunID); err != nil {
			return result, fmt.Errorf("finish dry-run stages: %w", err)
		}
		if _, err := connection.Exec(ctx, `UPDATE catalog_pipeline_runs SET status='succeeded',current_stage='complete',finished_at=now() WHERE id=$1`, result.RunID); err != nil {
			return result, fmt.Errorf("finish dry-run pipeline: %w", err)
		}
		result.Status = "succeeded"
		return result, nil
	}

	for _, stage := range plan {
		if stage.Executable == "" {
			continue
		}
		if err := r.executeStage(ctx, result.RunID, options.BinaryDirectory, stage); err != nil {
			return result, err
		}
	}
	if err := r.validate(ctx, result.RunID, options.Product); err != nil {
		return result, err
	}

	publicationService := catalog.NewPublicationService(r.DB, time.Second)
	publication, err := publicationService.Status(ctx, options.PublicationEnvironment, "public_api")
	if err != nil {
		return result, r.failStage(ctx, result.RunID, "publication-gate", "publication_status_failed", err)
	}
	result.Publication, result.PublicationReady = publication, publication.Ready
	stageStatus := "succeeded"
	if !publication.Ready {
		stageStatus = "blocked"
	}
	_, _ = r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status=$3,started_at=COALESCE(started_at,now()),finished_at=now(),counters=$4 WHERE run_id=$1 AND stage_key=$2`,
		result.RunID, "publication-gate", stageStatus, jsonObject(map[string]any{"sources": len(publication.Sources), "ready": publication.Ready}))
	var generationAfter *int64
	_ = r.DB.QueryRow(ctx, `SELECT generation FROM catalog_read_model_state state JOIN game_products product ON product.id=state.product_id WHERE product.slug=$1`, options.Product).Scan(&generationAfter)
	result.Status = "succeeded"
	if !publication.Ready && options.Mode == "apply" {
		result.Status = "blocked"
	}
	errorCode, errorSummary := "", ""
	if result.Status == "blocked" {
		errorCode, errorSummary = "publication_blocked", ErrPublicationBlocked.Error()
	}
	_, err = r.DB.Exec(ctx, `UPDATE catalog_pipeline_runs SET status=$2,publication_ready=$3,read_model_generation_after=$4,current_stage='complete',finished_at=now(),error_code=$5,error_summary=$6 WHERE id=$1`,
		result.RunID, result.Status, publication.Ready, generationAfter, errorCode, errorSummary)
	if err != nil {
		return result, fmt.Errorf("finish pipeline run: %w", err)
	}
	if result.Status == "blocked" {
		return result, ErrPublicationBlocked
	}
	return result, nil
}

func (r *Runner) executeStage(ctx context.Context, runID int64, binaryDirectory string, stage Stage) error {
	if _, err := r.DB.Exec(ctx, `UPDATE catalog_pipeline_runs SET current_stage=$2 WHERE id=$1`, runID, stage.Key); err != nil {
		return fmt.Errorf("select pipeline stage %s: %w", stage.Key, err)
	}
	if _, err := r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='running',started_at=now() WHERE run_id=$1 AND stage_key=$2`, runID, stage.Key); err != nil {
		return fmt.Errorf("start pipeline stage %s: %w", stage.Key, err)
	}
	executable, err := resolveExecutable(binaryDirectory, stage.Executable)
	if err != nil {
		return r.failStage(ctx, runID, stage.Key, "executable_missing", err)
	}
	command := exec.CommandContext(ctx, executable, stage.Arguments...)
	command.Env = os.Environ()
	command.Stdout = r.Stdout
	command.Stderr = r.Stderr
	if err := command.Run(); err != nil {
		return r.failStage(ctx, runID, stage.Key, "stage_command_failed", err)
	}
	_, err = r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='succeeded',finished_at=now() WHERE run_id=$1 AND stage_key=$2`, runID, stage.Key)
	if err != nil {
		return fmt.Errorf("finish pipeline stage %s: %w", stage.Key, err)
	}
	return nil
}

func (r *Runner) validate(ctx context.Context, runID int64, product string) error {
	_, _ = r.DB.Exec(ctx, `UPDATE catalog_pipeline_runs SET current_stage='validate-catalog' WHERE id=$1`, runID)
	_, _ = r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='running',started_at=now() WHERE run_id=$1 AND stage_key='validate-catalog'`, runID)
	var entities, missingLatest, registryOnlyQuests, invalidRelations, staleReadModels int64
	err := r.DB.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM game_entities WHERE deleted_at IS NULL),
			(SELECT count(*) FROM game_entities WHERE deleted_at IS NULL AND latest_version_id IS NULL AND entity_type<>'quest'),
			(SELECT count(*) FROM game_entities WHERE deleted_at IS NULL AND latest_version_id IS NULL AND entity_type='quest'),
			(SELECT count(*) FROM game_entity_links link LEFT JOIN catalog_relation_types relation ON relation.relation_type=link.relation_type WHERE relation.relation_type IS NULL),
			(SELECT count(*) FROM catalog_read_model_state state JOIN game_products product ON product.id=state.product_id WHERE product.slug=$1 AND state.status<>'fresh')`, product).Scan(&entities, &missingLatest, &registryOnlyQuests, &invalidRelations, &staleReadModels)
	if err != nil {
		return r.failStage(ctx, runID, "validate-catalog", "validation_query_failed", err)
	}
	counts := map[string]any{"active_entities": entities, "missing_latest_versions": missingLatest, "registry_only_quests": registryOnlyQuests, "invalid_relations": invalidRelations, "stale_read_models": staleReadModels}
	if entities == 0 || missingLatest != 0 || invalidRelations != 0 || staleReadModels != 0 {
		return r.failStage(ctx, runID, "validate-catalog", "catalog_invariants_failed", fmt.Errorf("catalog validation failed: %v", counts))
	}
	_, err = r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='succeeded',finished_at=now(),counters=$3 WHERE run_id=$1 AND stage_key=$2`, runID, "validate-catalog", jsonObject(counts))
	return err
}

func (r *Runner) failStage(ctx context.Context, runID int64, stageKey, code string, stageErr error) error {
	_, _ = r.DB.Exec(ctx, `UPDATE catalog_pipeline_stages SET status='failed',finished_at=now(),error_code=$3,error_summary=$4 WHERE run_id=$1 AND stage_key=$2`, runID, stageKey, code, boundedError(stageErr))
	return fmt.Errorf("%s: %w", stageKey, stageErr)
}

func resolveExecutable(directory, name string) (string, error) {
	if directory == "" {
		path, err := exec.LookPath(name)
		if err == nil {
			return path, nil
		}
		if runtime.GOOS == "windows" {
			return exec.LookPath(name + ".exe")
		}
		return "", err
	}
	path := filepath.Join(directory, name)
	if runtime.GOOS == "windows" {
		path += ".exe"
	}
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("find %s: %w", path, err)
	}
	return path, nil
}

func boundedError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if len(message) > 2000 {
		message = message[:2000]
	}
	return message
}

func jsonObject(value map[string]any) []byte {
	data, _ := json.Marshal(value)
	return data
}

func SortedSources(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	order := map[string]int{"wago": 0, "raidbots": 1, "db2": 2, "battlenet": 3, "listfile": 4}
	sort.SliceStable(result, func(i, j int) bool {
		left, leftKnown := order[result[i]]
		right, rightKnown := order[result[j]]
		if leftKnown && rightKnown {
			return left < right
		}
		if leftKnown != rightKnown {
			return leftKnown
		}
		return result[i] < result[j]
	})
	return result
}
