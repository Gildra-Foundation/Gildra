package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/argon2"
)

const (
	argonMemory      = 64 * 1024
	argonIterations  = 3
	argonParallelism = 2
	argonSaltLength  = 16
	argonKeyLength   = 32
)

var ErrInvalidCredentials = errors.New("invalid credentials")

type User struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
}

type Service struct {
	postgres   *pgxpool.Pool
	sessionTTL time.Duration
}

func NewService(postgres *pgxpool.Pool, sessionTTL time.Duration) *Service {
	return &Service{postgres: postgres, sessionTTL: sessionTTL}
}

func (s *Service) EnsureAdmin(ctx context.Context, email, password string) error {
	if strings.TrimSpace(email) == "" || password == "" {
		return nil
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = s.postgres.Exec(ctx, `
		INSERT INTO users (email, display_name, locale, password_hash, role)
		VALUES ($1, 'Администратор', 'ru', $2, 'admin')
		ON CONFLICT (email) DO UPDATE
		SET password_hash = CASE WHEN users.password_hash = '' THEN EXCLUDED.password_hash ELSE users.password_hash END,
			role = 'admin', updated_at = now()`, strings.ToLower(strings.TrimSpace(email)), hash)
	if err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	return nil
}

func (s *Service) Login(ctx context.Context, email, password, userAgent string) (User, string, time.Time, error) {
	var user User
	var passwordHash string
	err := s.postgres.QueryRow(ctx, `
		SELECT id, email::text, display_name, role, password_hash
		FROM users WHERE email = $1`, strings.ToLower(strings.TrimSpace(email))).Scan(
		&user.ID, &user.Email, &user.DisplayName, &user.Role, &passwordHash,
	)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && !VerifyPassword(password, passwordHash) {
		return User{}, "", time.Time{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("find user: %w", err)
	}
	if user.Role != "admin" {
		return User{}, "", time.Time{}, ErrInvalidCredentials
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("create session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	tokenHash := sha256.Sum256([]byte(token))
	expiresAt := time.Now().UTC().Add(s.sessionTTL)
	if len(userAgent) > 500 {
		userAgent = userAgent[:500]
	}
	tx, err := s.postgres.Begin(ctx)
	if err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("begin session: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `
		UPDATE auth_sessions SET revoked_at = now()
		WHERE id IN (
			SELECT id FROM auth_sessions
			WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
			ORDER BY last_seen_at DESC, created_at DESC
			OFFSET 4
		)`, user.ID); err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("limit active sessions: %w", err)
	}
	if _, err = tx.Exec(ctx, `
		DELETE FROM auth_sessions
		WHERE user_id = $1
		  AND (expires_at < now() - interval '30 days'
		       OR revoked_at < now() - interval '30 days')`, user.ID); err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("prune old sessions: %w", err)
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent)
		VALUES ($1, $2, $3, $4)`, user.ID, tokenHash[:], expiresAt, userAgent); err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("create session: %w", err)
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, user.ID); err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("update last login: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return User{}, "", time.Time{}, fmt.Errorf("commit session: %w", err)
	}
	return user, token, expiresAt, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, ErrInvalidCredentials
	}
	tokenHash := sha256.Sum256([]byte(token))
	var user User
	err := s.postgres.QueryRow(ctx, `
		UPDATE auth_sessions s SET last_seen_at = now()
		FROM users u
		WHERE s.token_hash = $1 AND s.user_id = u.id
		  AND s.revoked_at IS NULL AND s.expires_at > now() AND u.role = 'admin'
		RETURNING u.id, u.email::text, u.display_name, u.role`, tokenHash[:]).Scan(
		&user.ID, &user.Email, &user.DisplayName, &user.Role,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, fmt.Errorf("authenticate session: %w", err)
	}
	return user, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	tokenHash := sha256.Sum256([]byte(token))
	_, err := s.postgres.Exec(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1`, tokenHash[:])
	return err
}

func (s *Service) SetPassword(ctx context.Context, email, password string) error {
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := s.postgres.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin password rotation: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `
		UPDATE users SET password_hash = $2, updated_at = now()
		WHERE email = $1 AND role = 'admin'`, strings.ToLower(strings.TrimSpace(email)), hash)
	if err != nil {
		return fmt.Errorf("rotate admin password: %w", err)
	}
	if result.RowsAffected() != 1 {
		return errors.New("admin user not found")
	}
	if _, err := tx.Exec(ctx, `
		UPDATE auth_sessions SET revoked_at = now()
		WHERE user_id = (SELECT id FROM users WHERE email = $1) AND revoked_at IS NULL`,
		strings.ToLower(strings.TrimSpace(email))); err != nil {
		return fmt.Errorf("revoke sessions after password rotation: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit password rotation: %w", err)
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if len(password) < 12 {
		return "", errors.New("password must contain at least 12 characters")
	}
	salt := make([]byte, argonSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("create password salt: %w", err)
	}
	hash := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonIterations, argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}
	var memory uint64
	var iterations uint64
	var parallelism uint64
	for _, value := range strings.Split(parts[3], ",") {
		pair := strings.SplitN(value, "=", 2)
		if len(pair) != 2 {
			return false
		}
		parsed, err := strconv.ParseUint(pair[1], 10, 32)
		if err != nil {
			return false
		}
		switch pair[0] {
		case "m":
			memory = parsed
		case "t":
			iterations = parsed
		case "p":
			parallelism = parsed
		}
	}
	if memory != argonMemory || iterations != argonIterations || parallelism != argonParallelism {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) != argonSaltLength {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) != argonKeyLength {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, uint32(iterations), uint32(memory), uint8(parallelism), uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}
