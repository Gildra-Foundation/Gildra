package gamecontent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

// Prepare stores an immutable, reproducible release without making it public.
// Identical inputs reuse the same snapshots and release, even across retries.
func (s *Store) Prepare(ctx context.Context, seed Seed) (Release, error) {
	if err := seed.Validate(); err != nil {
		return Release{}, err
	}
	hash, modules, err := releaseHash(seed.Modules)
	if err != nil {
		return Release{}, err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Release{}, err
	}
	defer tx.Rollback(ctx)
	contextJSON, _ := json.Marshal(seed.Context)
	if _, err = tx.Exec(ctx, `INSERT INTO gc_contexts(context_key, context) VALUES ($1,$2) ON CONFLICT(context_key) DO NOTHING`, seed.Context.Key(), contextJSON); err != nil {
		return Release{}, err
	}
	var contextID string
	if err = tx.QueryRow(ctx, `SELECT id::text FROM gc_contexts WHERE context_key=$1`, seed.Context.Key()).Scan(&contextID); err != nil {
		return Release{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO gc_publication_channels(context_id) VALUES ($1) ON CONFLICT DO NOTHING`, contextID); err != nil {
		return Release{}, err
	}
	result := Release{SchemaVersion: 1, Context: seed.Context, ContentHash: hash, Modules: map[string]string{}}
	for _, module := range modules {
		moduleJSON, _ := json.Marshal(module)
		moduleHash := digest(moduleJSON)
		var id string
		err = tx.QueryRow(ctx, `INSERT INTO gc_module_snapshots(context_id,module_id,schema_version,content_hash,payload)
			VALUES($1,$2,$3,$4,$5) ON CONFLICT(context_id,module_id,content_hash) DO NOTHING RETURNING id::text`,
			contextID, module.ModuleID, module.SchemaVersion, moduleHash, module.Payload).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `SELECT id::text FROM gc_module_snapshots WHERE context_id=$1 AND module_id=$2 AND content_hash=$3`, contextID, module.ModuleID, moduleHash).Scan(&id)
		}
		if err != nil {
			return Release{}, err
		}
		result.Modules[module.ModuleID] = id
	}
	err = tx.QueryRow(ctx, `INSERT INTO gc_releases(context_id,content_hash) VALUES($1,$2)
		ON CONFLICT(context_id,content_hash) DO NOTHING RETURNING id::text`, contextID, hash).Scan(&result.ReleaseID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT id::text FROM gc_releases WHERE context_id=$1 AND content_hash=$2`, contextID, hash).Scan(&result.ReleaseID)
	}
	if err != nil {
		return Release{}, err
	}
	for moduleID, id := range result.Modules {
		if _, err = tx.Exec(ctx, `INSERT INTO gc_release_modules(release_id,context_id,module_id,snapshot_id)
			VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, result.ReleaseID, contextID, moduleID, id); err != nil {
			return Release{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Release{}, err
	}
	return result, nil
}

// Publish serializes publishers on the channel, checks the expected generation,
// and writes pointer, history and outbox atomically. Rollback uses the same path.
func (s *Store) Publish(ctx context.Context, req PublishRequest) (Publication, error) {
	if _, err := uuid.Parse(req.ReleaseID); err != nil {
		return Publication{}, fmt.Errorf("%w: invalid release id", ErrInvalid)
	}
	if req.ExpectedGeneration < 0 || strings.TrimSpace(req.RequestKey) == "" || len(req.RequestKey) > 200 ||
		strings.TrimSpace(req.Actor) == "" || len(req.Actor) > 200 || strings.TrimSpace(req.Reason) == "" || len(req.Reason) > 2000 ||
		(req.Kind != "publish" && req.Kind != "rollback") {
		return Publication{}, fmt.Errorf("%w: publication requires generation, key, actor, reason and kind", ErrInvalid)
	}
	rawRequest, _ := json.Marshal(req)
	requestHash := digest(rawRequest)
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Publication{}, err
	}
	defer tx.Rollback(ctx)
	var contextID string
	var contextJSON []byte
	err = tx.QueryRow(ctx, `SELECT r.context_id::text,c.context FROM gc_releases r JOIN gc_contexts c ON c.id=r.context_id WHERE r.id=$1`, req.ReleaseID).Scan(&contextID, &contextJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return Publication{}, ErrNotFound
	}
	if err != nil {
		return Publication{}, err
	}
	var contentContext Context
	if json.Unmarshal(contextJSON, &contentContext) != nil {
		return Publication{}, ErrInvalid
	}
	if req.Public && contentContext.Channel != "live" {
		return Publication{}, fmt.Errorf("%w: only live content can be public", ErrInvalid)
	}
	var generation int64
	var previousReleaseID *string
	err = tx.QueryRow(ctx, `SELECT generation,current_release_id::text FROM gc_publication_channels WHERE context_id=$1 FOR UPDATE`, contextID).Scan(&generation, &previousReleaseID)
	if err != nil {
		return Publication{}, err
	}
	var existing Publication
	var existingHash string
	err = tx.QueryRow(ctx, `SELECT release_id::text,generation,id::text,request_hash FROM gc_publication_events WHERE context_id=$1 AND request_key=$2`, contextID, req.RequestKey).
		Scan(&existing.ReleaseID, &existing.Generation, &existing.EventID, &existingHash)
	if err == nil {
		if existingHash != requestHash {
			return Publication{}, ErrConflict
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Publication{}, err
	}
	if generation != req.ExpectedGeneration {
		return Publication{}, ErrConflict
	}
	if previousReleaseID != nil {
		var omitted bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM gc_release_modules old WHERE old.release_id=$1
			AND NOT EXISTS(SELECT 1 FROM gc_release_modules proposed WHERE proposed.release_id=$2 AND proposed.module_id=old.module_id)
		)`, *previousReleaseID, req.ReleaseID).Scan(&omitted)
		if err != nil {
			return Publication{}, err
		}
		if omitted && req.Kind != "rollback" {
			return Publication{}, fmt.Errorf("%w: release omits an already published module", ErrInvalid)
		}
	}
	if req.Kind == "rollback" {
		var published bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM gc_publication_events WHERE context_id=$1 AND release_id=$2)`, contextID, req.ReleaseID).Scan(&published); err != nil {
			return Publication{}, err
		}
		if !published {
			return Publication{}, fmt.Errorf("%w: rollback target was never published", ErrInvalid)
		}
	}
	result := Publication{ReleaseID: req.ReleaseID, Generation: generation + 1}
	if _, err = tx.Exec(ctx, `UPDATE gc_publication_channels SET current_release_id=$2,generation=$3,is_public=$4,published_at=now()
		WHERE context_id=$1 AND generation=$5`, contextID, req.ReleaseID, result.Generation, req.Public, generation); err != nil {
		return Publication{}, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO gc_publication_events(context_id,generation,release_id,previous_release_id,kind,actor,reason,request_key,request_hash,is_public)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`, contextID, result.Generation, req.ReleaseID, previousReleaseID, req.Kind, req.Actor, req.Reason, req.RequestKey, requestHash, req.Public).Scan(&result.EventID)
	if err != nil {
		return Publication{}, err
	}
	event, _ := json.Marshal(struct {
		Publication
		Context Context `json:"context"`
	}{result, contentContext})
	if _, err = tx.Exec(ctx, `INSERT INTO gc_outbox(id,event_type,payload) VALUES($1,'game_content.published',$2)`, result.EventID, event); err != nil {
		return Publication{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Publication{}, err
	}
	return result, nil
}

func (s *Store) Catalog(ctx context.Context, contentContext Context) (Release, error) {
	if err := contentContext.Validate(); err != nil {
		return Release{}, err
	}
	var result Release
	var rawContext []byte
	err := s.db.QueryRow(ctx, `SELECT r.id::text,r.content_hash,c.context,p.generation,p.published_at
		FROM gc_contexts c JOIN gc_publication_channels p ON p.context_id=c.id
		JOIN gc_releases r ON r.id=p.current_release_id AND r.context_id=c.id
		WHERE c.context_key=$1 AND p.is_public AND c.context->>'channel'='live'`, contentContext.Key()).
		Scan(&result.ReleaseID, &result.ContentHash, &rawContext, &result.Generation, &result.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, ErrNotFound
	}
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal(rawContext, &result.Context); err != nil {
		return result, err
	}
	result.SchemaVersion = 1
	result.Modules = map[string]string{}
	rows, err := s.db.Query(ctx, `SELECT module_id,snapshot_id::text FROM gc_release_modules WHERE release_id=$1`, result.ReleaseID)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var moduleID, id string
		if err = rows.Scan(&moduleID, &id); err != nil {
			return result, err
		}
		result.Modules[moduleID] = id
	}
	return result, rows.Err()
}

func (s *Store) Snapshot(ctx context.Context, releaseID, moduleID string) (Snapshot, error) {
	if _, err := uuid.Parse(releaseID); err != nil {
		return Snapshot{}, ErrNotFound
	}
	if !identifier.MatchString(moduleID) {
		return Snapshot{}, ErrNotFound
	}
	var result Snapshot
	var rawContext []byte
	err := s.db.QueryRow(ctx, `SELECT s.id::text,s.schema_version,s.content_hash,s.payload,c.context
		FROM gc_release_modules m JOIN gc_module_snapshots s ON s.id=m.snapshot_id AND s.context_id=m.context_id AND s.module_id=m.module_id
		JOIN gc_contexts c ON c.id=m.context_id JOIN gc_publication_channels p ON p.context_id=c.id
		WHERE m.release_id=$1 AND m.module_id=$2 AND p.is_public AND c.context->>'channel'='live'
		AND EXISTS(SELECT 1 FROM gc_publication_events e WHERE e.release_id=m.release_id AND e.context_id=c.id AND e.is_public)`, releaseID, moduleID).
		Scan(&result.SnapshotID, &result.SchemaVersion, &result.ContentHash, &result.Payload, &rawContext)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, ErrNotFound
	}
	if err != nil {
		return result, err
	}
	result.ReleaseID, result.ModuleID = releaseID, moduleID
	return result, json.Unmarshal(rawContext, &result.Context)
}
