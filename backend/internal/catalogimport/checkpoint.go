package catalogimport

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type enrichmentCheckpoint struct {
	TargetVersion string `json:"target_version"`
	ID            int64  `json:"id"`
	Complete      bool   `json:"complete"`
	SourceKey     string `json:"source_record_key"`
	SourceHash    string `json:"source_content_hash"`
	// Set when the record was completed from an earlier observation of the
	// same build-pinned namespace instead of a new request.
	ReusedFromArtifact string `json:"reused_from_artifact,omitempty"`
	ReusedObservedAt   string `json:"reused_observed_at,omitempty"`
}

func verifyCheckpointRecord(payload, hash []byte) error {
	var decoded any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return err
	}
	canonical, err := json.Marshal(decoded)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(canonical)
	if !bytes.Equal(digest[:], hash) {
		return errors.New("invalid enrichment checkpoint source hash")
	}
	return nil
}

// Internal control records are explicitly named checkpoint/*, not masqueraded
// as official data. Each is bound to the preserved detail/404 content hash and
// follows all record effects, including media. The artifact remains unready
// until the entire pass completes; a checkpoint cannot satisfy a source gate.
func (s *Store) BattleNetCheckpoint(ctx context.Context, ic ImportContext, entityType string, artifact uuid.UUID, id int64) (bool, error) {
	var payload, hash []byte
	err := s.db.QueryRow(ctx, `SELECT payload,content_hash FROM catalog_source_records WHERE artifact_id=$1 AND record_key=$2`, artifact, fmt.Sprintf("checkpoint/%d", id)).Scan(&payload, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := verifyCheckpointRecord(payload, hash); err != nil {
		return false, err
	}
	var doc enrichmentCheckpoint
	if err := json.Unmarshal(payload, &doc); err != nil {
		return false, err
	}
	if doc.ID != id || !doc.Complete || (doc.SourceKey != strconv.FormatInt(id, 10) && doc.SourceKey != battleNetUnavailableDetailRecordKey(id)) {
		return false, errors.New("invalid enrichment checkpoint")
	}
	target, err := s.enrichmentTargetVersion(ctx, ic, entityType, id)
	if err != nil {
		return false, err
	}
	if target != doc.TargetVersion {
		return false, nil
	}
	if err := s.db.QueryRow(ctx, `SELECT payload,content_hash FROM catalog_source_records WHERE artifact_id=$1 AND record_key=$2`, artifact, doc.SourceKey).Scan(&payload, &hash); err != nil {
		return false, err
	}
	if hex.EncodeToString(hash) != doc.SourceHash {
		return false, errors.New("enrichment checkpoint source changed")
	}
	if err := verifyCheckpointRecord(payload, hash); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) CompleteBattleNetRecord(ctx context.Context, ic ImportContext, entityType string, artifact uuid.UUID, id int64, origin *EvidenceOrigin) error {
	var key string
	var source, hash []byte
	if err := s.db.QueryRow(ctx, `SELECT record_key,payload,content_hash FROM catalog_source_records
 WHERE artifact_id=$1 AND record_key IN ($2,$3) ORDER BY record_key LIMIT 1`, artifact, strconv.FormatInt(id, 10), battleNetUnavailableDetailRecordKey(id)).Scan(&key, &source, &hash); err != nil {
		return err
	}
	if err := verifyCheckpointRecord(source, hash); err != nil {
		return err
	}
	target, err := s.enrichmentTargetVersion(ctx, ic, entityType, id)
	if err != nil {
		return err
	}
	checkpoint := enrichmentCheckpoint{TargetVersion: target, ID: id, Complete: true, SourceKey: key, SourceHash: hex.EncodeToString(hash)}
	if origin != nil {
		checkpoint.ReusedFromArtifact = origin.ArtifactID.String()
		checkpoint.ReusedObservedAt = origin.ObservedAt.UTC().Format(time.RFC3339)
	}
	payload, err := json.Marshal(checkpoint)
	if err != nil {
		return err
	}
	_, err = s.UpsertSourceRecord(ctx, artifact, fmt.Sprintf("checkpoint/%d", id), payload)
	return err
}

// A replayed upstream stage can create a different canonical version even for
// the same build. Never skip applying the official detail/media to that version.
func (s *Store) enrichmentTargetVersion(ctx context.Context, ic ImportContext, entityType string, id int64) (string, error) {
	var target string
	err := s.db.QueryRow(ctx, `SELECT version.id::text
 FROM game_entities entity JOIN game_entity_versions version ON version.entity_id=entity.id
 LEFT JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
 WHERE entity.product_id=$1 AND entity.entity_type=$2 AND entity.external_id=$3 AND version.build_id=$4
 AND (version.snapshot_id=$5 OR ($6::uuid IS NOT NULL AND snapshot.release_id=$6) OR version.id=entity.published_version_id)
 ORDER BY CASE WHEN version.snapshot_id=$5 OR snapshot.release_id=$6 THEN 0 ELSE 1 END,
 snapshot.created_at DESC NULLS LAST,version.revision DESC LIMIT 1`, ic.ProductID, entityType, id, ic.BuildID, ic.SnapshotID, ic.ReleaseID).Scan(&target)
	return target, err
}
