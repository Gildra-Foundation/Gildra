package mythicbuilds

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalid  = errors.New("invalid mythic talent build")
	ErrConflict = errors.New("mythic build revision conflict")
	ErrLimit    = errors.New("mythic build limit reached")
	codePattern = regexp.MustCompile(`^[A-Za-z0-9+/]+$`)
)

type Build struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	Revision  int64     `json:"revision"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type Input struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	Code             string    `json:"code"`
	ExpectedRevision int64     `json:"expectedRevision"`
	MutationID       uuid.UUID `json:"mutationId"`
}
type ImportInput struct {
	Builds []Input `json:"builds"`
}
type DeleteInput struct {
	ExpectedRevision int64     `json:"expectedRevision"`
	MutationID       uuid.UUID `json:"mutationId"`
}
type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

func OwnerKey(subject string) (string, error) {
	subject = strings.TrimSpace(subject)
	if len(subject) < 1 || len(subject) > 256 {
		return "", ErrInvalid
	}
	hash := sha256.Sum256([]byte("gildra:mythic-builds:" + subject))
	return hex.EncodeToString(hash[:]), nil
}
func owner(subject string) ([]byte, error) {
	key, err := OwnerKey(subject)
	if err != nil {
		return nil, err
	}
	return hex.DecodeString(key)
}
func Validate(input Input) error {
	name := strings.TrimSpace(input.Name)
	if input.ID == uuid.Nil || input.MutationID == uuid.Nil || input.ExpectedRevision < 0 || !utf8.ValidString(name) || len(utf16.Encode([]rune(name))) < 1 || len(utf16.Encode([]rune(name))) > 64 || len(input.Code) < 26 || len(input.Code) > 4096 || !codePattern.MatchString(input.Code) {
		return ErrInvalid
	}
	return nil
}
func (s *Service) List(ctx context.Context, subject string) ([]Build, error) {
	hash, err := owner(subject)
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id,name,code,revision,updated_at FROM wow_mythic_talent_builds WHERE account_hash=$1 AND deleted_at IS NULL ORDER BY created_at,id`, hash)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	builds := []Build{}
	for rows.Next() {
		var b Build
		if err := rows.Scan(&b.ID, &b.Name, &b.Code, &b.Revision, &b.UpdatedAt); err != nil {
			return nil, err
		}
		builds = append(builds, b)
	}
	return builds, rows.Err()
}
func (s *Service) transaction(ctx context.Context, subject string) (pgx.Tx, []byte, error) {
	hash, err := owner(subject)
	if err != nil {
		return nil, nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	// Serialize account writes, including different IDs and bulk imports, to enforce the limit.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(binary.BigEndian.Uint64(hash[:8]))); err != nil {
		_ = tx.Rollback(ctx)
		return nil, nil, err
	}
	return tx, hash, nil
}
func (s *Service) Put(ctx context.Context, subject string, input Input) (bool, error) {
	if err := Validate(input); err != nil {
		return false, err
	}
	tx, hash, err := s.transaction(ctx, subject)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	duplicate, err := put(ctx, tx, hash, input)
	if err != nil {
		return false, err
	}
	return duplicate, tx.Commit(ctx)
}
func put(ctx context.Context, tx pgx.Tx, hash []byte, input Input) (bool, error) {
	var rev int64
	var mutation uuid.UUID
	var oldCode string
	var deleted bool
	err := tx.QueryRow(ctx, `SELECT revision,last_mutation_id,code,deleted_at IS NOT NULL FROM wow_mythic_talent_builds WHERE account_hash=$1 AND id=$2 FOR UPDATE`, hash, input.ID).Scan(&rev, &mutation, &oldCode, &deleted)
	if err == nil {
		if mutation == input.MutationID {
			return false, nil
		}
		if deleted || rev != input.ExpectedRevision {
			return false, ErrConflict
		}
		if oldCode != input.Code {
			return false, ErrInvalid
		}
		_, err = tx.Exec(ctx, `UPDATE wow_mythic_talent_builds SET name=$3,revision=revision+1,last_mutation_id=$4,updated_at=now() WHERE account_hash=$1 AND id=$2`, hash, input.ID, strings.TrimSpace(input.Name), input.MutationID)
		return false, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if input.ExpectedRevision != 0 {
		return false, ErrConflict
	}
	codeHash := sha256.Sum256([]byte(input.Code))
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wow_mythic_talent_builds WHERE account_hash=$1 AND code_hash=$2 AND deleted_at IS NULL)`, hash, codeHash[:]).Scan(&exists); err != nil {
		return false, err
	}
	// Another device already saved this allocation. Preserve its ID/name; never silently rename it.
	if exists {
		return true, nil
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM wow_mythic_talent_builds WHERE account_hash=$1 AND deleted_at IS NULL`, hash).Scan(&count); err != nil {
		return false, err
	}
	if count >= 20 {
		return false, ErrLimit
	}
	_, err = tx.Exec(ctx, `INSERT INTO wow_mythic_talent_builds(account_hash,id,name,code,code_hash,last_mutation_id) VALUES($1,$2,$3,$4,$5,$6)`, hash, input.ID, strings.TrimSpace(input.Name), input.Code, codeHash[:], input.MutationID)
	return false, err
}
func (s *Service) Delete(ctx context.Context, subject string, id uuid.UUID, input DeleteInput) error {
	if id == uuid.Nil || input.MutationID == uuid.Nil || input.ExpectedRevision < 1 {
		return ErrInvalid
	}
	tx, hash, err := s.transaction(ctx, subject)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var rev int64
	var deleted bool
	err = tx.QueryRow(ctx, `SELECT revision,deleted_at IS NOT NULL FROM wow_mythic_talent_builds WHERE account_hash=$1 AND id=$2 FOR UPDATE`, hash, id).Scan(&rev, &deleted)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if deleted {
		return tx.Commit(ctx)
	}
	if rev != input.ExpectedRevision {
		return ErrConflict
	}
	// Keep only a tombstone to reject delayed offline writes, not the deleted talent string or name.
	_, err = tx.Exec(ctx, `UPDATE wow_mythic_talent_builds SET name='',code='',deleted_at=now(),updated_at=now(),revision=revision+1,last_mutation_id=$3 WHERE account_hash=$1 AND id=$2`, hash, id, input.MutationID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (s *Service) Import(ctx context.Context, subject string, inputs []Input) error {
	if len(inputs) < 1 || len(inputs) > 20 {
		return ErrInvalid
	}
	for i := range inputs {
		inputs[i].ID = uuid.New()
		inputs[i].MutationID = uuid.New()
		inputs[i].ExpectedRevision = 0
		if err := Validate(inputs[i]); err != nil {
			return err
		}
	}
	tx, hash, err := s.transaction(ctx, subject)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, input := range inputs {
		if _, err = put(ctx, tx, hash, input); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
