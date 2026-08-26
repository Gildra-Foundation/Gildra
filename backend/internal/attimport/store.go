package attimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/attparser"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

type Result struct {
	Nodes      int64
	References int64
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// ReplaceFile atomically replaces the staged graph extracted from one source
// artifact. Resolution and publication are intentionally outside this method.
func (s *Store) ReplaceFile(
	ctx context.Context,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	source string,
	nodes []attparser.Node,
) (Result, error) {
	if artifactID == uuid.Nil || importContext.BuildID <= 0 || strings.TrimSpace(source) == "" {
		return Result{}, errors.New("build, source, and source artifact are required")
	}
	var result Result
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var artifactReady bool
		if err := tx.QueryRow(ctx, `
			SELECT status='fetching'
			FROM catalog_source_artifacts
			WHERE id=$1 AND build_id=$2 AND source=$3
			FOR UPDATE`, artifactID, importContext.BuildID, source).Scan(&artifactReady); err != nil {
			return fmt.Errorf("verify staged source artifact: %w", err)
		}
		if !artifactReady {
			return errors.New("staged source artifact is not fetching")
		}
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_staged_source_nodes WHERE source_artifact_id=$1`, artifactID); err != nil {
			return fmt.Errorf("clear staged source artifact: %w", err)
		}

		nodeRows := make([][]any, 0, len(nodes))
		for _, node := range nodes {
			ancestorPathValue := node.AncestorPath
			if ancestorPathValue == nil {
				ancestorPathValue = []attparser.Identity{}
			}
			ancestorPath, err := json.Marshal(ancestorPathValue)
			if err != nil {
				return fmt.Errorf("encode ancestor path for %s: %w", node.RecordKey, err)
			}
			fieldsValue := node.Fields
			if fieldsValue == nil {
				fieldsValue = map[string]any{}
			}
			fields, err := json.Marshal(fieldsValue)
			if err != nil {
				return fmt.Errorf("encode staged fields for %s: %w", node.RecordKey, err)
			}
			nodeRows = append(nodeRows, []any{
				importContext.BuildID, source, artifactID, node.RecordKey,
				nullIfEmpty(node.ParentRecordKey), node.Kind, node.ExternalID, node.SourceLine,
				json.RawMessage(ancestorPath), json.RawMessage(fields), node.RawSource, node.ContentHash[:],
			})
		}
		copied, err := tx.CopyFrom(ctx, pgx.Identifier{"catalog_staged_source_nodes"}, []string{
			"build_id", "source", "source_artifact_id", "record_key", "parent_record_key",
			"node_kind", "external_id", "source_line", "ancestor_path", "fields", "raw_source", "content_hash",
		}, pgx.CopyFromRows(nodeRows))
		if err != nil {
			return fmt.Errorf("copy staged source nodes: %w", err)
		}
		result.Nodes = copied

		rows, err := tx.Query(ctx, `
			SELECT id,record_key FROM catalog_staged_source_nodes
			WHERE source_artifact_id=$1`, artifactID)
		if err != nil {
			return fmt.Errorf("read staged source node IDs: %w", err)
		}
		nodeIDs := make(map[string]int64, len(nodes))
		for rows.Next() {
			var id int64
			var recordKey string
			if err := rows.Scan(&id, &recordKey); err != nil {
				rows.Close()
				return fmt.Errorf("scan staged source node ID: %w", err)
			}
			nodeIDs[recordKey] = id
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return fmt.Errorf("read staged source node IDs: %w", err)
		}
		rows.Close()
		if len(nodeIDs) != len(nodes) {
			return fmt.Errorf("staged %d of %d source nodes", len(nodeIDs), len(nodes))
		}

		referenceRows := make([][]any, 0)
		for _, node := range nodes {
			nodeID := nodeIDs[node.RecordKey]
			for _, reference := range node.References {
				attributesValue := reference.Attributes
				if attributesValue == nil {
					attributesValue = map[string]any{}
				}
				attributes, err := json.Marshal(attributesValue)
				if err != nil {
					return fmt.Errorf("encode staged reference for %s: %w", node.RecordKey, err)
				}
				referenceRows = append(referenceRows, []any{
					nodeID, reference.Kind, reference.TargetType, reference.TargetExternalID,
					reference.Ordinal, json.RawMessage(attributes), reference.ContentHash[:],
				})
			}
		}
		if len(referenceRows) == 0 {
			return nil
		}
		copied, err = tx.CopyFrom(ctx, pgx.Identifier{"catalog_staged_source_references"}, []string{
			"node_id", "reference_kind", "target_type", "target_external_id",
			"ordinal", "attributes", "content_hash",
		}, pgx.CopyFromRows(referenceRows))
		if err != nil {
			return fmt.Errorf("copy staged source references: %w", err)
		}
		result.References = copied
		return nil
	})
	return result, err
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
