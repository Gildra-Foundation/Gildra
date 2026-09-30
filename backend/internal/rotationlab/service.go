package rotationlab

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPresetNotFound = errors.New("rotation preset not found")

type Service struct {
	db     *pgxpool.Pool
	engine SimulationEngine
}

func NewService(db *pgxpool.Pool) *Service { return NewServiceWithEngine(db, EngineFromEnvironment()) }

func NewServiceWithEngine(db *pgxpool.Pool, engine SimulationEngine) *Service {
	if engine == nil {
		engine = DeterministicEngine{}
	}
	return &Service{db: db, engine: engine}
}

func (s *Service) Preset(ctx context.Context, slug, locale string) (json.RawMessage, error) {
	var payload []byte
	err := s.db.QueryRow(ctx, `SELECT data FROM rotation_lab_presets WHERE slug=$1 AND locale=$2 AND published_at IS NOT NULL`, slug, locale).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPresetNotFound
	}
	if err != nil {
		return nil, err
	}
	if !json.Valid(payload) {
		return nil, errors.New("rotation preset contains invalid json")
	}
	return json.RawMessage(payload), nil
}

func (s *Service) Simulate(ctx context.Context, input SimulationInput) (SimulationResult, error) {
	if err := ValidateInput(input); err != nil {
		return SimulationResult{}, err
	}
	result, err := s.engine.Simulate(ctx, input)
	if err != nil {
		return SimulationResult{}, err
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return SimulationResult{}, err
	}
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return SimulationResult{}, err
	}
	_, err = s.db.Exec(ctx, `INSERT INTO rotation_lab_runs(id,preset_slug,scenario,fight_length_seconds,target_count,input,result,engine_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`, result.ID, input.Spec, input.Scenario, input.FightLengthSeconds, input.Targets, inputJSON, resultJSON, result.Engine)
	if err != nil {
		return SimulationResult{}, err
	}
	return result, nil
}
