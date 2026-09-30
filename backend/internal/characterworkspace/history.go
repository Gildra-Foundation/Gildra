package characterworkspace

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrShareGone       = errors.New("shared result is unavailable")
	clientRunPattern   = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)
	fingerprintPattern = regexp.MustCompile(`^[A-Za-z0-9._:%+-]{1,160}$`)
	tokenPattern       = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
)

var allowedRunKinds = map[string]bool{"talent": true, "rotation": true, "gear": true}

type RunScenario struct {
	ID              string `json:"id"`
	DurationSeconds int    `json:"durationSeconds"`
	Targets         int    `json:"targets"`
}

type RunMetrics struct {
	DPS             *float64 `json:"dps,omitempty"`
	BaselineDPS     *float64 `json:"baselineDps,omitempty"`
	CandidateDPS    *float64 `json:"candidateDps,omitempty"`
	DeltaDPS        *float64 `json:"deltaDps,omitempty"`
	DeltaPercent    *float64 `json:"deltaPercent,omitempty"`
	AoeDPS          *float64 `json:"aoeDps,omitempty"`
	AoeDeltaPercent *float64 `json:"aoeDeltaPercent,omitempty"`
	Confidence      *float64 `json:"confidence,omitempty"`
	Iterations      *int     `json:"iterations,omitempty"`
}

type CreateRunInput struct {
	ClientRunID        string      `json:"clientRunId"`
	Kind               string      `json:"kind"`
	GameBuild          string      `json:"gameBuild"`
	ProfileFingerprint string      `json:"profileFingerprint"`
	Scenario           RunScenario `json:"scenario"`
	Engine             string      `json:"engine"`
	Metrics            RunMetrics  `json:"metrics"`
	Label              string      `json:"label"`
}

type RunRecord struct {
	ID                 uuid.UUID   `json:"id"`
	Kind               string      `json:"kind"`
	GameBuild          string      `json:"gameBuild"`
	ProfileFingerprint string      `json:"profileFingerprint"`
	Scenario           RunScenario `json:"scenario"`
	Engine             string      `json:"engine"`
	Metrics            RunMetrics  `json:"metrics"`
	Label              string      `json:"label"`
	CreatedAt          time.Time   `json:"createdAt"`
	Stale              bool        `json:"stale"`
	ActiveShareID      *uuid.UUID  `json:"activeShareId,omitempty"`
}

type ShareCreated struct {
	ID    uuid.UUID `json:"id"`
	Token string    `json:"token"`
}

type PublicRun struct {
	SchemaVersion      int         `json:"schemaVersion"`
	Kind               string      `json:"kind"`
	SpecializationSlug string      `json:"specializationSlug"`
	GameBuild          string      `json:"gameBuild"`
	Scenario           RunScenario `json:"scenario"`
	Engine             string      `json:"engine"`
	Metrics            RunMetrics  `json:"metrics"`
	Label              string      `json:"label"`
	CreatedAt          time.Time   `json:"createdAt"`
}

func ValidateCreateRun(input CreateRunInput) error {
	input.ClientRunID = strings.TrimSpace(input.ClientRunID)
	input.Kind = strings.TrimSpace(input.Kind)
	input.GameBuild = strings.TrimSpace(input.GameBuild)
	input.ProfileFingerprint = strings.TrimSpace(input.ProfileFingerprint)
	input.Scenario.ID = strings.TrimSpace(input.Scenario.ID)
	input.Engine = strings.TrimSpace(input.Engine)
	input.Label = strings.TrimSpace(input.Label)
	if !clientRunPattern.MatchString(input.ClientRunID) || !allowedRunKinds[input.Kind] {
		return errors.New("invalid run identity")
	}
	if len(input.GameBuild) < 1 || len(input.GameBuild) > 64 || !fingerprintPattern.MatchString(input.ProfileFingerprint) {
		return errors.New("invalid run provenance")
	}
	if len(input.Scenario.ID) < 1 || len(input.Scenario.ID) > 64 || input.Scenario.DurationSeconds < 1 || input.Scenario.DurationSeconds > 3600 || input.Scenario.Targets < 1 || input.Scenario.Targets > 40 {
		return errors.New("invalid run scenario")
	}
	if len(input.Engine) < 1 || len(input.Engine) > 120 || len(input.Label) < 1 || len(input.Label) > 120 {
		return errors.New("invalid run description")
	}
	metricCount := 0
	for _, metric := range []*float64{input.Metrics.DPS, input.Metrics.BaselineDPS, input.Metrics.CandidateDPS, input.Metrics.DeltaDPS, input.Metrics.DeltaPercent, input.Metrics.AoeDPS, input.Metrics.AoeDeltaPercent, input.Metrics.Confidence} {
		if metric == nil {
			continue
		}
		metricCount++
		if math.IsNaN(*metric) || math.IsInf(*metric, 0) || *metric < -1e9 || *metric > 1e9 {
			return errors.New("invalid run metrics")
		}
	}
	if input.Metrics.Iterations != nil {
		metricCount++
		if *input.Metrics.Iterations < 1 || *input.Metrics.Iterations > 10_000_000 {
			return errors.New("invalid run iterations")
		}
	}
	if metricCount == 0 {
		return errors.New("run metrics are required")
	}
	return nil
}

func (s *Service) CreateRun(ctx context.Context, subject string, scope Scope, input CreateRunInput) (RunRecord, error) {
	if err := ValidateScope(scope); err != nil {
		return RunRecord{}, err
	}
	if err := ValidateCreateRun(input); err != nil {
		return RunRecord{}, err
	}
	input.ClientRunID = strings.TrimSpace(input.ClientRunID)
	input.Kind = strings.TrimSpace(input.Kind)
	input.GameBuild = strings.TrimSpace(input.GameBuild)
	input.ProfileFingerprint = strings.TrimSpace(input.ProfileFingerprint)
	input.Scenario.ID = strings.TrimSpace(input.Scenario.ID)
	input.Engine = strings.TrimSpace(input.Engine)
	input.Label = strings.TrimSpace(input.Label)
	hash, err := accountHash(subject)
	if err != nil {
		return RunRecord{}, err
	}
	scope = normalizeScope(scope)
	scenario, _ := json.Marshal(input.Scenario)
	metrics, _ := json.Marshal(input.Metrics)
	var record RunRecord
	err = s.postgres.QueryRow(ctx, `INSERT INTO wow_character_run_history(
		account_subject_hash,character_slug,specialization_slug,client_run_id,run_kind,game_build,profile_fingerprint,scenario,engine,metrics,label)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT(account_subject_hash,character_slug,specialization_slug,client_run_id) DO UPDATE SET client_run_id=EXCLUDED.client_run_id
		RETURNING id,run_kind,game_build,profile_fingerprint,scenario,engine,metrics,label,created_at`,
		hash[:], scope.CharacterSlug, scope.SpecializationSlug, input.ClientRunID, input.Kind, input.GameBuild, input.ProfileFingerprint, scenario, input.Engine, metrics, input.Label).
		Scan(&record.ID, &record.Kind, &record.GameBuild, &record.ProfileFingerprint, &record.Scenario, &record.Engine, &record.Metrics, &record.Label, &record.CreatedAt)
	if err != nil {
		return RunRecord{}, fmt.Errorf("create character run: %w", err)
	}
	return record, nil
}

func (s *Service) ListRuns(ctx context.Context, subject string, scope Scope, currentFingerprint string) ([]RunRecord, error) {
	if err := ValidateScope(scope); err != nil {
		return nil, err
	}
	if !fingerprintPattern.MatchString(strings.TrimSpace(currentFingerprint)) {
		return nil, errors.New("invalid current fingerprint")
	}
	hash, err := accountHash(subject)
	if err != nil {
		return nil, err
	}
	scope = normalizeScope(scope)
	rows, err := s.postgres.Query(ctx, `SELECT history.id,history.run_kind,history.game_build,history.profile_fingerprint,
		history.scenario,history.engine,history.metrics,history.label,history.created_at,shares.id
		FROM wow_character_run_history history
		LEFT JOIN wow_character_run_shares shares ON shares.run_id=history.id AND shares.revoked_at IS NULL
		WHERE history.account_subject_hash=$1 AND history.character_slug=$2 AND history.specialization_slug=$3
		ORDER BY history.created_at DESC LIMIT 100`, hash[:], scope.CharacterSlug, scope.SpecializationSlug)
	if err != nil {
		return nil, fmt.Errorf("list character runs: %w", err)
	}
	defer rows.Close()
	runs := make([]RunRecord, 0, 20)
	for rows.Next() {
		var record RunRecord
		if err := rows.Scan(&record.ID, &record.Kind, &record.GameBuild, &record.ProfileFingerprint, &record.Scenario, &record.Engine, &record.Metrics, &record.Label, &record.CreatedAt, &record.ActiveShareID); err != nil {
			return nil, fmt.Errorf("scan character run: %w", err)
		}
		record.Stale = record.ProfileFingerprint != currentFingerprint
		runs = append(runs, record)
	}
	return runs, rows.Err()
}

func (s *Service) CreateShare(ctx context.Context, subject string, scope Scope, runID uuid.UUID) (ShareCreated, error) {
	if err := ValidateScope(scope); err != nil {
		return ShareCreated{}, err
	}
	hash, err := accountHash(subject)
	if err != nil {
		return ShareCreated{}, err
	}
	scope = normalizeScope(scope)
	tx, err := s.postgres.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return ShareCreated{}, fmt.Errorf("begin share: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var public PublicRun
	err = tx.QueryRow(ctx, `SELECT run_kind,specialization_slug,game_build,scenario,engine,metrics,label,created_at
		FROM wow_character_run_history WHERE id=$1 AND account_subject_hash=$2 AND character_slug=$3 AND specialization_slug=$4 FOR UPDATE`,
		runID, hash[:], scope.CharacterSlug, scope.SpecializationSlug).
		Scan(&public.Kind, &public.SpecializationSlug, &public.GameBuild, &public.Scenario, &public.Engine, &public.Metrics, &public.Label, &public.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ShareCreated{}, ErrNotFound
	}
	if err != nil {
		return ShareCreated{}, fmt.Errorf("load share run: %w", err)
	}
	public.SchemaVersion = 1
	if _, err := tx.Exec(ctx, `UPDATE wow_character_run_shares SET revoked_at=now() WHERE run_id=$1 AND revoked_at IS NULL`, runID); err != nil {
		return ShareCreated{}, fmt.Errorf("rotate active share: %w", err)
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return ShareCreated{}, fmt.Errorf("generate share token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(secret)
	tokenHash := sha256.Sum256([]byte(token))
	payload, err := json.Marshal(public)
	if err != nil {
		return ShareCreated{}, fmt.Errorf("serialize public run: %w", err)
	}
	var share ShareCreated
	err = tx.QueryRow(ctx, `INSERT INTO wow_character_run_shares(run_id,account_subject_hash,token_hash,public_payload)
		VALUES($1,$2,$3,$4) RETURNING id`, runID, hash[:], tokenHash[:], payload).Scan(&share.ID)
	if err != nil {
		return ShareCreated{}, fmt.Errorf("create run share: %w", err)
	}
	share.Token = token
	if err := tx.Commit(ctx); err != nil {
		return ShareCreated{}, fmt.Errorf("commit run share: %w", err)
	}
	return share, nil
}

func (s *Service) RevokeShare(ctx context.Context, subject string, scope Scope, shareID uuid.UUID) error {
	if err := ValidateScope(scope); err != nil {
		return err
	}
	hash, err := accountHash(subject)
	if err != nil {
		return err
	}
	scope = normalizeScope(scope)
	result, err := s.postgres.Exec(ctx, `UPDATE wow_character_run_shares shares SET revoked_at=COALESCE(revoked_at,now())
		FROM wow_character_run_history history
		WHERE shares.id=$1 AND shares.run_id=history.id AND shares.account_subject_hash=$2
		AND history.character_slug=$3 AND history.specialization_slug=$4`, shareID, hash[:], scope.CharacterSlug, scope.SpecializationSlug)
	if err != nil {
		return fmt.Errorf("revoke run share: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) PublicShare(ctx context.Context, token string) (PublicRun, error) {
	if !tokenPattern.MatchString(token) {
		return PublicRun{}, ErrShareGone
	}
	hash := sha256.Sum256([]byte(token))
	var payload json.RawMessage
	err := s.postgres.QueryRow(ctx, `SELECT public_payload FROM wow_character_run_shares WHERE token_hash=$1 AND revoked_at IS NULL`, hash[:]).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicRun{}, ErrShareGone
	}
	if err != nil {
		return PublicRun{}, fmt.Errorf("load public run: %w", err)
	}
	var public PublicRun
	if err := json.Unmarshal(payload, &public); err != nil {
		return PublicRun{}, fmt.Errorf("decode public run: %w", err)
	}
	return public, nil
}
