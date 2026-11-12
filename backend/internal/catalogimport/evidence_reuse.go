package catalogimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// BattleNetEvidence is one preserved official response (or 404 observation)
// from an earlier enrichment artifact.
type BattleNetEvidence struct {
	RecordKey  string
	Payload    json.RawMessage
	ArtifactID uuid.UUID
	ImportedAt time.Time
}

// EvidenceOrigin names the earlier observation a record was completed from
// instead of a new request. It is stored in the record checkpoint.
type EvidenceOrigin struct {
	ArtifactID uuid.UUID
	ObservedAt time.Time
}

// BattleNetEvidenceArtifacts lists earlier artifacts of the same enrichment
// family, product and locale. A build-pinned Battle.net namespace is immutable,
// and the API build usually lags several client builds, so a new client build
// would otherwise re-request hundreds of thousands of identical documents at
// the hourly API quota. Callers must still prove per record that the preserved
// response came from the namespace they would request now.
func (s *Store) BattleNetEvidenceArtifacts(ctx context.Context, ic ImportContext, artifactKey, locale string, current uuid.UUID, limit int) ([]uuid.UUID, error) {
	if ic.ProductID <= 0 || current == uuid.Nil || limit <= 0 {
		return nil, errors.New("product, current artifact and limit are required")
	}
	rows, err := s.db.Query(ctx, `
		SELECT artifact.id
		FROM catalog_source_artifacts artifact
		JOIN game_builds build ON build.id=artifact.build_id
		WHERE build.product_id=$1 AND artifact.source='blizzard_api'
		  AND artifact.artifact_key=$2 AND artifact.locale=$3 AND artifact.id<>$4
		  AND artifact.status IN ('ready','fetching','failed')
		ORDER BY artifact.fetched_at DESC
		LIMIT $5`, ic.ProductID, artifactKey, locale, current, limit)
	if err != nil {
		return nil, fmt.Errorf("list earlier Battle.net evidence artifacts: %w", err)
	}
	defer rows.Close()
	result := make([]uuid.UUID, 0, limit)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result = append(result, id)
	}
	return result, rows.Err()
}

// BattleNetEvidenceFor returns the preserved detail, 404 observation and
// unprefixed media response for one entity, newest first. Every row is checked
// against its stored content hash before it is returned.
func (s *Store) BattleNetEvidenceFor(ctx context.Context, artifacts []uuid.UUID, id int64, notBefore time.Time) ([]BattleNetEvidence, error) {
	if len(artifacts) == 0 {
		return nil, nil
	}
	keys := []string{strconv.FormatInt(id, 10), battleNetUnavailableDetailRecordKey(id), fmt.Sprintf("media/%d", id)}
	rows, err := s.db.Query(ctx, `
		SELECT record_key,payload,content_hash,artifact_id,imported_at
		FROM catalog_source_records
		WHERE artifact_id=ANY($1) AND record_key=ANY($2) AND imported_at>=$3
		ORDER BY imported_at DESC`, artifacts, keys, notBefore)
	if err != nil {
		return nil, fmt.Errorf("read earlier Battle.net evidence for %d: %w", id, err)
	}
	defer rows.Close()
	result := make([]BattleNetEvidence, 0, 3)
	for rows.Next() {
		var evidence BattleNetEvidence
		var payload, hash []byte
		if err := rows.Scan(&evidence.RecordKey, &payload, &hash, &evidence.ArtifactID, &evidence.ImportedAt); err != nil {
			return nil, err
		}
		if err := verifyCheckpointRecord(payload, hash); err != nil {
			return nil, fmt.Errorf("earlier Battle.net evidence %s in artifact %s: %w", evidence.RecordKey, evidence.ArtifactID, err)
		}
		evidence.Payload = payload
		result = append(result, evidence)
	}
	return result, rows.Err()
}
