package gamecontentcollect

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrBusy = errors.New("collection target is already running")

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db} }

func (s *Store) Configure(ctx context.Context) error {
	for _, t := range Targets() {
		_, err := s.db.Exec(ctx, `INSERT INTO gc_collection_targets(target_key,context,module_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, t.Key(), canonical(t.Context), t.ModuleID)
		if err != nil {
			return err
		}
	}
	return nil
}

type lease struct {
	conn   *pgxpool.Conn
	target Target
	run    Run
}

func (l *lease) close() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var unlocked bool
	if err := l.conn.QueryRow(ctx, `SELECT pg_advisory_unlock(hashtextextended($1,4781))`, l.target.Key()).Scan(&unlocked); err != nil || !unlocked {
		_ = l.conn.Hijack().Close(ctx)
	} else {
		l.conn.Release()
	}
}

func scanRun(row pgx.Row) (Run, error) {
	var r Run
	err := row.Scan(&r.ID, &r.TargetKey, &r.RunKey, &r.Status, &r.Attempt, &r.Fence, &r.BaseGeneration, &r.FactsHash, &r.ErrorCode, &r.Retryable)
	return r, err
}

const runColumns = `id::text,target_key,run_key,status,attempt,fence,base_generation,facts_hash,error_code,retryable`

func (s *Store) acquire(ctx context.Context, t Target, key string, scheduled time.Time) (*lease, error) {
	conn, err := s.db.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	var locked bool
	if err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,4781))`, t.Key()).Scan(&locked); err != nil || !locked {
		conn.Release()
		if err != nil {
			return nil, err
		}
		return nil, ErrBusy
	}
	l := &lease{conn: conn, target: t}
	ok := false
	defer func() {
		if !ok {
			l.close()
		}
	}()
	var enabled bool
	if err = conn.QueryRow(ctx, `SELECT enabled FROM gc_collection_targets WHERE target_key=$1 AND mode='collect_only'`, t.Key()).Scan(&enabled); err != nil || !enabled {
		return nil, &Failure{Code: "target_not_enabled"}
	}
	r, err := scanRun(conn.QueryRow(ctx, `SELECT `+runColumns+` FROM gc_collection_runs WHERE target_key=$1 AND run_key=$2`, t.Key(), key))
	if err == nil && (r.Status == "candidate_ready" || r.Status == "no_change" || (r.Status == "failed" && !r.Retryable)) {
		l.run = r
		ok = true
		return l, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	var generation int64
	if err = conn.QueryRow(ctx, `SELECT COALESCE((SELECT p.generation FROM gc_contexts c JOIN gc_publication_channels p ON p.context_id=c.id WHERE c.context_key=$1),0)`, t.Context.Key()).Scan(&generation); err != nil {
		return nil, err
	}
	l.run, err = scanRun(conn.QueryRow(ctx, `INSERT INTO gc_collection_runs(target_key,run_key,scheduled_for,status,base_generation)
	 VALUES($1,$2,$3,'running',$4) ON CONFLICT(target_key,run_key) DO UPDATE SET
	 status='running',attempt=gc_collection_runs.attempt+1,fence=gc_collection_runs.fence+1,
	 base_generation=EXCLUDED.base_generation,error_code=NULL,retryable=false,started_at=now(),finished_at=NULL
	 RETURNING `+runColumns, t.Key(), key, scheduled, generation))
	if err != nil {
		return nil, err
	}
	ok = true
	return l, nil
}

func (l *lease) cached(ctx context.Context) (*CachedArtifact, error) {
	var a CachedArtifact
	err := l.conn.QueryRow(ctx, `SELECT a.id::text,a.body,o.etag,o.last_modified FROM gc_source_artifacts a
	 JOIN gc_collection_observations o ON o.artifact_id=a.id WHERE a.target_key=$1 AND a.request_key=$2
	 ORDER BY o.checked_at DESC LIMIT 1`, l.target.Key(), sourceURL(l.target)).Scan(&a.ID, &a.Body, &a.ETag, &a.LastModified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &a, err
}

// Provider backoff is shared by both modules and survives process restarts.
// A daily job created during a long Retry-After must not bypass that delay.
func (l *lease) cooldown(ctx context.Context) error {
	var until time.Time
	err := l.conn.QueryRow(ctx, `SELECT not_before FROM gc_source_cooldowns WHERE source_id='raiderio'`).Scan(&until)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if delay := time.Until(until); delay > 0 {
		return &Failure{Code: "source_cooldown", Retryable: true, RetryAfter: delay}
	}
	return nil
}

func (l *lease) backoff(ctx context.Context, failure *Failure) error {
	if (failure.Code != "source_http_429" && failure.Code != "source_http_503") || failure.RetryAfter <= 0 {
		return nil
	}
	_, err := l.conn.Exec(ctx, `INSERT INTO gc_source_cooldowns(source_id,not_before) VALUES('raiderio',$1)
	 ON CONFLICT(source_id) DO UPDATE SET not_before=GREATEST(gc_source_cooldowns.not_before,EXCLUDED.not_before)`, time.Now().UTC().Add(failure.RetryAfter))
	return err
}

func (l *lease) record(ctx context.Context, result FetchResult) error {
	tx, err := l.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO gc_source_artifacts(target_key,request_key,source_id,adapter_version,source_url,namespace,locale,sha256,body)
	 VALUES($1,$2,'raiderio.static',$3,$2,'expansion-11','en',$4,$5) ON CONFLICT DO NOTHING RETURNING id::text`,
		l.target.Key(), sourceURL(l.target), AdapterVersion, hash(result.Body), result.Body).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT id::text FROM gc_source_artifacts WHERE target_key=$1 AND request_key=$2 AND sha256=$3`, l.target.Key(), sourceURL(l.target), hash(result.Body)).Scan(&id)
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO gc_collection_observations(run_id,attempt,artifact_id,http_status,etag,last_modified) VALUES($1,$2,$3,$4,$5,$6)`, l.run.ID, l.run.Attempt, id, result.Status, result.ETag, result.LastModified)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (l *lease) fail(ctx context.Context, failure *Failure) error {
	_, err := l.conn.Exec(ctx, `UPDATE gc_collection_runs SET status='failed',error_code=$3,retryable=$4,finished_at=now() WHERE id=$1 AND fence=$2 AND status='running'`, l.run.ID, l.run.Fence, failure.Code, failure.Retryable)
	l.run.Status = "failed"
	l.run.ErrorCode = &failure.Code
	l.run.Retryable = failure.Retryable
	return err
}

func (l *lease) finish(ctx context.Context, facts map[string]any, warnings []string) error {
	tx, err := l.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var beforeRaw []byte
	var beforeHash *string
	err = tx.QueryRow(ctx, `SELECT facts,facts_hash FROM gc_collection_candidates WHERE target_key=$1 ORDER BY created_at DESC LIMIT 1`, l.target.Key()).Scan(&beforeRaw, &beforeHash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	raw := canonical(facts)
	sum := hash(raw)
	status := "no_change"
	if beforeHash == nil || *beforeHash != sum {
		var before map[string]any
		if len(beforeRaw) > 0 {
			if err = json.Unmarshal(beforeRaw, &before); err != nil {
				return err
			}
		}
		// Decode both sides the same way so numbers have identical semantics.
		var after map[string]any
		if err = json.Unmarshal(raw, &after); err != nil {
			return err
		}
		diff := Difference(before, after)
		_, err = tx.Exec(ctx, `INSERT INTO gc_collection_candidates(run_id,target_key,base_generation,previous_facts_hash,facts_hash,facts,diff,warnings) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
			l.run.ID, l.target.Key(), l.run.BaseGeneration, beforeHash, sum, raw, canonical(diff), canonical(warnings))
		if err != nil {
			return err
		}
		status = "candidate_ready"
	}
	result, err := tx.Exec(ctx, `UPDATE gc_collection_runs SET status=$3,facts_hash=$4,finished_at=now(),retryable=false WHERE id=$1 AND fence=$2 AND status='running'`, l.run.ID, l.run.Fence, status, sum)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return errors.New("stale collection fence")
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	l.run.Status = status
	l.run.FactsHash = &sum
	return nil
}

func (s *Store) Runs(ctx context.Context) ([]Run, error) {
	rows, err := s.db.Query(ctx, `SELECT `+runColumns+` FROM gc_collection_runs ORDER BY started_at DESC LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Run{}
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}
func (s *Store) Inspect(ctx context.Context, runID string) (json.RawMessage, error) {
	var raw []byte
	err := s.db.QueryRow(ctx, `SELECT jsonb_build_object('run',to_jsonb(r),'candidate',(SELECT to_jsonb(c) FROM gc_collection_candidates c WHERE c.run_id=r.id),
	 'observations',COALESCE((SELECT jsonb_agg(jsonb_build_object('artifactId',a.id,'sourceUrl',a.source_url,'sha256',a.sha256,'adapterVersion',a.adapter_version,'namespace',a.namespace,'locale',a.locale,'sourcePublishedAt',a.source_published_at,'contentBuild',a.content_build,'firstFetchedAt',a.first_fetched_at,'checkedAt',o.checked_at,'status',o.http_status)) FROM gc_collection_observations o JOIN gc_source_artifacts a ON a.id=o.artifact_id WHERE o.run_id=r.id),'[]'::jsonb))
	 FROM gc_collection_runs r WHERE r.id=$1`, runID).Scan(&raw)
	return raw, err
}
