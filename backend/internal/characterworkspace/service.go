package characterworkspace

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrConflict      = errors.New("workspace revision conflict")
	ErrNotFound      = errors.New("workspace document not found")
	characterPattern = regexp.MustCompile(`^[a-z0-9%-]+--[a-z0-9%-]+--[^\s/?#]{1,128}$`)
	specPattern      = regexp.MustCompile(`^[a-z0-9-]{2,64}$`)
	mutationPattern  = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)
)

var allowedKinds = map[string]bool{
	"talent-builds": true, "rotation-studio": true, "trainer-settings": true,
	"gear-owned": true, "character-settings": true,
}

type Scope struct {
	CharacterSlug      string
	SpecializationSlug string
}

type Document struct {
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
	Revision  int64           `json:"revision"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type WriteInput struct {
	Kind             string
	Payload          json.RawMessage
	ExpectedRevision int64
	MutationID       string
}

type MigrationInput struct {
	MigrationKey string
	Documents    []WriteInput
}

type MigrationResult struct {
	AlreadyImported   bool       `json:"alreadyImported"`
	ImportedDocuments int        `json:"importedDocuments"`
	Documents         []Document `json:"documents"`
}

type Service struct{ postgres *pgxpool.Pool }

func NewService(postgres *pgxpool.Pool) *Service { return &Service{postgres: postgres} }

func ValidateScope(scope Scope) error {
	scope.CharacterSlug = strings.ToLower(strings.TrimSpace(scope.CharacterSlug))
	scope.SpecializationSlug = strings.ToLower(strings.TrimSpace(scope.SpecializationSlug))
	if !characterPattern.MatchString(scope.CharacterSlug) {
		return errors.New("invalid character slug")
	}
	if !specPattern.MatchString(scope.SpecializationSlug) {
		return errors.New("invalid specialization slug")
	}
	return nil
}

func ValidateWrite(input WriteInput) error {
	if !allowedKinds[input.Kind] {
		return errors.New("invalid document kind")
	}
	if input.ExpectedRevision < 0 {
		return errors.New("invalid expected revision")
	}
	if !mutationPattern.MatchString(input.MutationID) {
		return errors.New("invalid mutation id")
	}
	if len(input.Payload) == 0 || len(input.Payload) > 256<<10 || !json.Valid(input.Payload) {
		return errors.New("invalid document payload")
	}
	var kind string
	if err := json.Unmarshal(input.Payload, &kind); err == nil {
		return errors.New("document payload must be an object or array")
	}
	var value any
	if err := json.Unmarshal(input.Payload, &value); err != nil {
		return errors.New("invalid document payload")
	}
	switch value.(type) {
	case map[string]any, []any:
	default:
		return errors.New("document payload must be an object or array")
	}
	return nil
}

func accountHash(subject string) ([32]byte, error) {
	subject = strings.TrimSpace(subject)
	if len(subject) < 2 || len(subject) > 256 {
		return [32]byte{}, errors.New("invalid account subject")
	}
	return sha256.Sum256([]byte("battlenet:" + subject)), nil
}

func normalizeScope(scope Scope) Scope {
	return Scope{CharacterSlug: strings.ToLower(strings.TrimSpace(scope.CharacterSlug)), SpecializationSlug: strings.ToLower(strings.TrimSpace(scope.SpecializationSlug))}
}

func (s *Service) List(ctx context.Context, subject string, scope Scope) ([]Document, error) {
	if err := ValidateScope(scope); err != nil {
		return nil, err
	}
	hash, err := accountHash(subject)
	if err != nil {
		return nil, err
	}
	scope = normalizeScope(scope)
	if _, err := s.postgres.Exec(ctx, `DELETE FROM wow_character_workspace_documents WHERE account_subject_hash=$1 AND deleted_at < now()-interval '30 days'`, hash[:]); err != nil {
		return nil, fmt.Errorf("purge deleted workspace documents: %w", err)
	}
	rows, err := s.postgres.Query(ctx, `SELECT document_kind,payload,revision,updated_at
		FROM wow_character_workspace_documents
		WHERE account_subject_hash=$1 AND character_slug=$2 AND specialization_slug=$3 AND deleted_at IS NULL
		ORDER BY document_kind`, hash[:], scope.CharacterSlug, scope.SpecializationSlug)
	if err != nil {
		return nil, fmt.Errorf("list workspace documents: %w", err)
	}
	defer rows.Close()
	documents := make([]Document, 0, 5)
	for rows.Next() {
		var document Document
		if err := rows.Scan(&document.Kind, &document.Payload, &document.Revision, &document.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan workspace document: %w", err)
		}
		documents = append(documents, document)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workspace documents: %w", err)
	}
	return documents, nil
}

func (s *Service) Put(ctx context.Context, subject string, scope Scope, input WriteInput) (Document, error) {
	if err := ValidateScope(scope); err != nil {
		return Document{}, err
	}
	if err := ValidateWrite(input); err != nil {
		return Document{}, err
	}
	hash, err := accountHash(subject)
	if err != nil {
		return Document{}, err
	}
	scope = normalizeScope(scope)
	tx, err := s.postgres.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Document{}, fmt.Errorf("begin workspace write: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, found, err := lockDocument(ctx, tx, hash[:], scope, input.Kind)
	if err != nil {
		return Document{}, err
	}
	if found && current.MutationID == input.MutationID {
		return current.Document, nil
	}
	if !found {
		if input.ExpectedRevision != 0 {
			return Document{}, ErrConflict
		}
		var result Document
		var documentID uuid.UUID
		err = tx.QueryRow(ctx, `INSERT INTO wow_character_workspace_documents(
			account_subject_hash,character_slug,specialization_slug,document_kind,payload,revision,last_mutation_id)
			VALUES($1,$2,$3,$4,$5,1,$6) ON CONFLICT(account_subject_hash,character_slug,specialization_slug,document_kind) DO NOTHING
			RETURNING id,document_kind,payload,revision,updated_at`, hash[:], scope.CharacterSlug, scope.SpecializationSlug, input.Kind, input.Payload, input.MutationID).
			Scan(&documentID, &result.Kind, &result.Payload, &result.Revision, &result.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			concurrent, exists, lockErr := lockDocument(ctx, tx, hash[:], scope, input.Kind)
			if lockErr != nil {
				return Document{}, lockErr
			}
			if exists && concurrent.MutationID == input.MutationID {
				return concurrent.Document, nil
			}
			if exists {
				return concurrent.Document, ErrConflict
			}
			return Document{}, ErrConflict
		}
		if err != nil {
			return Document{}, fmt.Errorf("insert workspace document: %w", err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wow_character_workspace_versions(document_id,revision,payload,mutation_id) VALUES($1,$2,$3,$4)`, documentID, result.Revision, result.Payload, input.MutationID); err != nil {
			return Document{}, fmt.Errorf("record workspace version: %w", err)
		}
		if err := pruneVersions(ctx, tx, documentID, result.Revision); err != nil {
			return Document{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return Document{}, fmt.Errorf("commit workspace document: %w", err)
		}
		return result, nil
	}
	if current.Revision != input.ExpectedRevision {
		return current.Document, ErrConflict
	}
	var result Document
	var documentID uuid.UUID
	err = tx.QueryRow(ctx, `UPDATE wow_character_workspace_documents SET payload=$5,revision=revision+1,last_mutation_id=$6,deleted_at=NULL,updated_at=now()
		WHERE account_subject_hash=$1 AND character_slug=$2 AND specialization_slug=$3 AND document_kind=$4
		RETURNING id,document_kind,payload,revision,updated_at`, hash[:], scope.CharacterSlug, scope.SpecializationSlug, input.Kind, input.Payload, input.MutationID).
		Scan(&documentID, &result.Kind, &result.Payload, &result.Revision, &result.UpdatedAt)
	if err != nil {
		return Document{}, fmt.Errorf("update workspace document: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wow_character_workspace_versions(document_id,revision,payload,mutation_id) VALUES($1,$2,$3,$4)`, documentID, result.Revision, result.Payload, input.MutationID); err != nil {
		return Document{}, fmt.Errorf("record workspace version: %w", err)
	}
	if err := pruneVersions(ctx, tx, documentID, result.Revision); err != nil {
		return Document{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Document{}, fmt.Errorf("commit workspace document: %w", err)
	}
	return result, nil
}

func (s *Service) Delete(ctx context.Context, subject string, scope Scope, kind string, expectedRevision int64, mutationID string) (Document, error) {
	if err := ValidateScope(scope); err != nil {
		return Document{}, err
	}
	if !allowedKinds[kind] || expectedRevision < 1 || !mutationPattern.MatchString(mutationID) {
		return Document{}, errors.New("invalid delete request")
	}
	hash, err := accountHash(subject)
	if err != nil {
		return Document{}, err
	}
	scope = normalizeScope(scope)
	tx, err := s.postgres.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Document{}, fmt.Errorf("begin workspace delete: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, found, err := lockDocument(ctx, tx, hash[:], scope, kind)
	if err != nil {
		return Document{}, err
	}
	if !found {
		return Document{}, ErrNotFound
	}
	if current.MutationID == mutationID {
		return current.Document, nil
	}
	if current.Revision != expectedRevision {
		return current.Document, ErrConflict
	}
	var result Document
	var documentID uuid.UUID
	err = tx.QueryRow(ctx, `UPDATE wow_character_workspace_documents SET payload='{}'::jsonb,revision=revision+1,last_mutation_id=$5,deleted_at=now(),updated_at=now()
		WHERE account_subject_hash=$1 AND character_slug=$2 AND specialization_slug=$3 AND document_kind=$4
		RETURNING id,document_kind,payload,revision,updated_at`, hash[:], scope.CharacterSlug, scope.SpecializationSlug, kind, mutationID).
		Scan(&documentID, &result.Kind, &result.Payload, &result.Revision, &result.UpdatedAt)
	if err != nil {
		return Document{}, fmt.Errorf("delete workspace document: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wow_character_workspace_versions(document_id,revision,payload,mutation_id,deleted) VALUES($1,$2,$3,$4,true)`, documentID, result.Revision, result.Payload, mutationID); err != nil {
		return Document{}, fmt.Errorf("record workspace deletion: %w", err)
	}
	if err := pruneVersions(ctx, tx, documentID, result.Revision); err != nil {
		return Document{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Document{}, fmt.Errorf("commit workspace delete: %w", err)
	}
	return result, nil
}

type lockedDocument struct {
	Document
	MutationID string
}

func lockDocument(ctx context.Context, tx pgx.Tx, hash []byte, scope Scope, kind string) (lockedDocument, bool, error) {
	var current lockedDocument
	err := tx.QueryRow(ctx, `SELECT document_kind,payload,revision,updated_at,last_mutation_id
		FROM wow_character_workspace_documents WHERE account_subject_hash=$1 AND character_slug=$2 AND specialization_slug=$3 AND document_kind=$4 FOR UPDATE`,
		hash, scope.CharacterSlug, scope.SpecializationSlug, kind).Scan(&current.Kind, &current.Payload, &current.Revision, &current.UpdatedAt, &current.MutationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return lockedDocument{}, false, nil
	}
	if err != nil {
		return lockedDocument{}, false, fmt.Errorf("lock workspace document: %w", err)
	}
	return current, true, nil
}

func (s *Service) Migrate(ctx context.Context, subject string, scope Scope, input MigrationInput) (MigrationResult, error) {
	if err := ValidateScope(scope); err != nil {
		return MigrationResult{}, err
	}
	if !mutationPattern.MatchString(input.MigrationKey) || len(input.Documents) > len(allowedKinds) {
		return MigrationResult{}, errors.New("invalid migration")
	}
	seen := map[string]bool{}
	for _, document := range input.Documents {
		if err := ValidateWrite(document); err != nil {
			return MigrationResult{}, err
		}
		if seen[document.Kind] {
			return MigrationResult{}, errors.New("duplicate migration document")
		}
		seen[document.Kind] = true
	}
	hash, err := accountHash(subject)
	if err != nil {
		return MigrationResult{}, err
	}
	scope = normalizeScope(scope)
	tx, err := s.postgres.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return MigrationResult{}, fmt.Errorf("begin workspace migration: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO wow_character_workspace_migrations(account_subject_hash,migration_key)
		VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING true`, hash[:], input.MigrationKey).Scan(&inserted)
	if errors.Is(err, pgx.ErrNoRows) {
		documents, listErr := listWithQuery(ctx, tx, hash[:], scope)
		if listErr != nil {
			return MigrationResult{}, listErr
		}
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return MigrationResult{}, commitErr
		}
		return MigrationResult{AlreadyImported: true, Documents: documents}, nil
	}
	if err != nil {
		return MigrationResult{}, fmt.Errorf("record workspace migration: %w", err)
	}
	imported := 0
	for _, document := range input.Documents {
		result, execErr := tx.Exec(ctx, `WITH inserted AS (INSERT INTO wow_character_workspace_documents(
			account_subject_hash,character_slug,specialization_slug,document_kind,payload,revision,last_mutation_id)
			VALUES($1,$2,$3,$4,$5,1,$6) ON CONFLICT(account_subject_hash,character_slug,specialization_slug,document_kind) DO NOTHING
			RETURNING id,revision,payload,last_mutation_id)
			INSERT INTO wow_character_workspace_versions(document_id,revision,payload,mutation_id)
			SELECT id,revision,payload,last_mutation_id FROM inserted`,
			hash[:], scope.CharacterSlug, scope.SpecializationSlug, document.Kind, document.Payload, document.MutationID)
		if execErr != nil {
			return MigrationResult{}, fmt.Errorf("import workspace document: %w", execErr)
		}
		imported += int(result.RowsAffected())
	}
	if _, err := tx.Exec(ctx, `UPDATE wow_character_workspace_migrations SET imported_documents=$3 WHERE account_subject_hash=$1 AND migration_key=$2`, hash[:], input.MigrationKey, imported); err != nil {
		return MigrationResult{}, err
	}
	documents, err := listWithQuery(ctx, tx, hash[:], scope)
	if err != nil {
		return MigrationResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MigrationResult{}, fmt.Errorf("commit workspace migration: %w", err)
	}
	return MigrationResult{ImportedDocuments: imported, Documents: documents}, nil
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func pruneVersions(ctx context.Context, tx pgx.Tx, documentID uuid.UUID, currentRevision int64) error {
	_, err := tx.Exec(ctx, `DELETE FROM wow_character_workspace_versions
		WHERE document_id=$1 AND revision<>$2 AND (revision <= $2-50 OR created_at < now()-interval '90 days')`, documentID, currentRevision)
	if err != nil {
		return fmt.Errorf("prune workspace versions: %w", err)
	}
	return nil
}

func listWithQuery(ctx context.Context, database queryer, hash []byte, scope Scope) ([]Document, error) {
	rows, err := database.Query(ctx, `SELECT document_kind,payload,revision,updated_at FROM wow_character_workspace_documents
		WHERE account_subject_hash=$1 AND character_slug=$2 AND specialization_slug=$3 AND deleted_at IS NULL ORDER BY document_kind`, hash, scope.CharacterSlug, scope.SpecializationSlug)
	if err != nil {
		return nil, fmt.Errorf("list migrated workspace: %w", err)
	}
	defer rows.Close()
	documents := []Document{}
	for rows.Next() {
		var item Document
		if err := rows.Scan(&item.Kind, &item.Payload, &item.Revision, &item.UpdatedAt); err != nil {
			return nil, err
		}
		documents = append(documents, item)
	}
	return documents, rows.Err()
}
