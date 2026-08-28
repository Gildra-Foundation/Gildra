package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maximumApprovalDuration = 366 * 24 * time.Hour

type options struct {
	databaseURL   string
	source        string
	environment   string
	surface       string
	decision      string
	approvedBy    string
	reason        string
	evidenceSHA   string
	expiresAtText string
	confirm       bool
}

type result struct {
	Source      string     `json:"source"`
	Environment string     `json:"environment"`
	Surface     string     `json:"surface"`
	Decision    string     `json:"decision"`
	ReviewID    *uuid.UUID `json:"reviewId,omitempty"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	Applied     bool       `json:"applied"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var input options
	flag.StringVar(&input.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&input.source, "source", "", "registered catalog source")
	flag.StringVar(&input.environment, "environment", "production", "development, staging, or production")
	flag.StringVar(&input.surface, "surface", "", "website, public_api, bulk_export, or asset_cache")
	flag.StringVar(&input.decision, "decision", "", "allowed or blocked")
	flag.StringVar(&input.approvedBy, "approved-by", "", "accountable owner or legal reviewer")
	flag.StringVar(&input.reason, "reason", "", "approval or revocation rationale")
	flag.StringVar(&input.evidenceSHA, "evidence-sha256", "", "SHA-256 of the reviewed terms evidence")
	flag.StringVar(&input.expiresAtText, "expires-at", "", "approval expiry in RFC3339 format")
	flag.BoolVar(&input.confirm, "confirm", false, "apply the decision; without this flag the command only validates input")
	flag.Parse()
	input.source = strings.TrimSpace(input.source)
	input.environment = strings.TrimSpace(input.environment)
	input.surface = strings.TrimSpace(input.surface)
	input.decision = strings.TrimSpace(input.decision)
	input.approvedBy = strings.TrimSpace(input.approvedBy)
	input.reason = strings.TrimSpace(input.reason)
	input.evidenceSHA = strings.TrimSpace(input.evidenceSHA)
	input.expiresAtText = strings.TrimSpace(input.expiresAtText)

	now := time.Now().UTC()
	expiresAt, evidenceHash, err := validate(input, now)
	if err != nil {
		return err
	}
	output := result{
		Source:      input.source,
		Environment: input.environment,
		Surface:     input.surface,
		Decision:    input.decision,
		ExpiresAt:   expiresAt,
		Applied:     false,
	}
	if !input.confirm {
		return encodeResult(output)
	}
	if input.databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required with -confirm")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, input.databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	reviewID, err := apply(ctx, db, input, evidenceHash, expiresAt, now)
	if err != nil {
		return err
	}
	output.ReviewID = reviewID
	output.Applied = true
	return encodeResult(output)
}

func validate(input options, now time.Time) (*time.Time, []byte, error) {
	if input.source == "" || input.approvedBy == "" || input.reason == "" {
		return nil, nil, errors.New("source, approved-by, and reason are required")
	}
	if !member(input.environment, "development", "staging", "production") {
		return nil, nil, errors.New("environment must be development, staging, or production")
	}
	if !member(input.surface, "website", "public_api", "bulk_export", "asset_cache") {
		return nil, nil, errors.New("surface must be website, public_api, bulk_export, or asset_cache")
	}
	if !member(input.decision, "allowed", "blocked") {
		return nil, nil, errors.New("decision must be allowed or blocked")
	}
	if input.decision == "blocked" {
		if input.evidenceSHA != "" || input.expiresAtText != "" {
			return nil, nil, errors.New("blocked decisions must not include evidence-sha256 or expires-at")
		}
		return nil, nil, nil
	}
	if input.evidenceSHA == "" || input.expiresAtText == "" {
		return nil, nil, errors.New("allowed decisions require evidence-sha256 and expires-at")
	}
	evidenceHash, err := hex.DecodeString(input.evidenceSHA)
	if err != nil || len(evidenceHash) != 32 {
		return nil, nil, errors.New("evidence-sha256 must contain exactly 64 hexadecimal characters")
	}
	expiresAt, err := time.Parse(time.RFC3339, input.expiresAtText)
	if err != nil {
		return nil, nil, errors.New("expires-at must use RFC3339 format")
	}
	expiresAt = expiresAt.UTC()
	if !expiresAt.After(now) {
		return nil, nil, errors.New("expires-at must be in the future")
	}
	if expiresAt.Sub(now) > maximumApprovalDuration {
		return nil, nil, errors.New("approval duration must not exceed 366 days")
	}
	return &expiresAt, evidenceHash, nil
}

func apply(ctx context.Context, db *pgxpool.Pool, input options, evidenceHash []byte, expiresAt *time.Time, observedAt time.Time) (*uuid.UUID, error) {
	transaction, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin approval transaction: %w", err)
	}
	defer transaction.Rollback(ctx) //nolint:errcheck
	if _, err := transaction.Exec(ctx, `SELECT set_config('gildra.approval_actor',$1,true)`, input.approvedBy); err != nil {
		return nil, fmt.Errorf("set approval actor: %w", err)
	}

	if input.decision == "blocked" {
		command, err := transaction.Exec(ctx, `
			UPDATE catalog_publication_grants
			SET decision='blocked',reason=$4,approved_by=$5,reviewed_at=$6,
				expires_at=NULL,policy_review_id=NULL,updated_at=$6
			WHERE source=$1 AND environment=$2 AND surface=$3`,
			input.source, input.environment, input.surface, input.reason, input.approvedBy, observedAt)
		if err != nil {
			return nil, fmt.Errorf("block publication grant: %w", err)
		}
		if command.RowsAffected() != 1 {
			return nil, errors.New("publication grant was not found")
		}
		if err := transaction.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit revocation: %w", err)
		}
		return nil, nil
	}

	var evidenceID uuid.UUID
	if err := transaction.QueryRow(ctx, `
		SELECT id
		FROM catalog_source_policy_reviews
		WHERE source=$1 AND environment=$2 AND surface=$3
		  AND review_kind='evidence' AND terms_content_sha256=$4
		ORDER BY observed_at DESC,created_at DESC,id DESC
		LIMIT 1`, input.source, input.environment, input.surface, evidenceHash).Scan(&evidenceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("no matching source-policy evidence exists for this source, environment, surface, and SHA-256")
		}
		return nil, fmt.Errorf("find source-policy evidence: %w", err)
	}
	var reviewID uuid.UUID
	if err := transaction.QueryRow(ctx, `
		INSERT INTO catalog_source_policy_reviews(
			source,environment,surface,review_kind,decision,reviewer,reason,
			observed_at,expires_at,parent_review_id,evidence
		) VALUES($1,$2,$3,'owner_approval','allowed',$4,$5,$6,$7,$8,
			jsonb_build_object('command','catalog-source-approval'))
		RETURNING id`, input.source, input.environment, input.surface, input.approvedBy,
		input.reason, observedAt, *expiresAt, evidenceID).Scan(&reviewID); err != nil {
		return nil, fmt.Errorf("record owner approval: %w", err)
	}
	command, err := transaction.Exec(ctx, `
		UPDATE catalog_publication_grants
		SET decision='allowed',reason=$4,approved_by=$5,reviewed_at=$6,
			expires_at=$7,policy_review_id=$8,updated_at=$6
		WHERE source=$1 AND environment=$2 AND surface=$3`,
		input.source, input.environment, input.surface, input.reason, input.approvedBy,
		observedAt, *expiresAt, reviewID)
	if err != nil {
		return nil, fmt.Errorf("allow publication grant: %w", err)
	}
	if command.RowsAffected() != 1 {
		return nil, errors.New("publication grant was not found")
	}
	if err := transaction.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit approval: %w", err)
	}
	return &reviewID, nil
}

func encodeResult(value result) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func member(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
