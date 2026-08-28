package catalog

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PublicationSource struct {
	Source           string
	DisplayName      string
	PolicyStatus     string
	CommercialStatus string
	ReviewStatus     string
	GrantDecision    string
	GrantExpiresAt   *time.Time
	GrantReviewID    *uuid.UUID
	GrantReviewKind  string
	GrantReviewState string
	GrantReviewUntil *time.Time
	Allowed          bool
	BlockingReasons  []string
}

type PublicationStatus struct {
	Environment string
	Surface     string
	Ready       bool
	CheckedAt   time.Time
	Sources     []PublicationSource
}

// PublicationService evaluates the sources that currently contribute to the
// public catalog. It deliberately requires both a compatible reviewed policy
// and an explicit grant for the requested environment and surface.
type PublicationService struct {
	postgres *pgxpool.Pool
	ttl      time.Duration
	mu       sync.RWMutex
	cache    map[string]PublicationStatus
}

func NewPublicationService(postgres *pgxpool.Pool, ttl time.Duration) *PublicationService {
	if ttl <= 0 {
		ttl = time.Minute
	}
	return &PublicationService{postgres: postgres, ttl: ttl, cache: make(map[string]PublicationStatus)}
}

func (s *PublicationService) Status(ctx context.Context, environment, surface string) (PublicationStatus, error) {
	key := environment + ":" + surface
	s.mu.RLock()
	cached, ok := s.cache[key]
	s.mu.RUnlock()
	if ok && time.Since(cached.CheckedAt) < s.ttl {
		return cached, nil
	}

	status, err := s.load(ctx, environment, surface, nil)
	if err != nil {
		return PublicationStatus{}, err
	}
	s.mu.Lock()
	s.cache[key] = status
	s.mu.Unlock()
	return status, nil
}

// ReleaseStatus evaluates the sources requested by a staging release rather
// than the sources in the currently published catalog. This prevents a new,
// unapproved source from passing the gate merely because it is not public yet.
func (s *PublicationService) ReleaseStatus(
	ctx context.Context,
	environment, surface string,
	releaseID uuid.UUID,
) (PublicationStatus, error) {
	if releaseID == uuid.Nil {
		return PublicationStatus{}, fmt.Errorf("catalog release ID is required")
	}
	var exists bool
	if err := s.postgres.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_releases WHERE id=$1)`, releaseID).Scan(&exists); err != nil {
		return PublicationStatus{}, fmt.Errorf("find catalog release: %w", err)
	}
	if !exists {
		return PublicationStatus{}, fmt.Errorf("catalog release %s does not exist", releaseID)
	}
	return s.load(ctx, environment, surface, &releaseID)
}

func (s *PublicationService) Invalidate() {
	s.mu.Lock()
	s.cache = make(map[string]PublicationStatus)
	s.mu.Unlock()
}

func (s *PublicationService) load(ctx context.Context, environment, surface string, releaseID *uuid.UUID) (PublicationStatus, error) {
	rows, err := s.postgres.Query(ctx, `
		WITH source_candidates AS (
			SELECT dependency.source
			FROM catalog_published_source_dependencies dependency
			WHERE $3::uuid IS NULL
			UNION ALL
			SELECT DISTINCT CASE requested.source
				WHEN 'wago' THEN 'wago_tools'
				WHEN 'db2' THEN 'wago_tools'
				WHEN 'battlenet' THEN 'blizzard_api'
				WHEN 'listfile' THEN 'wow_listfile'
				ELSE requested.source
			END
			FROM catalog_releases catalog_release
			CROSS JOIN LATERAL unnest(catalog_release.requested_sources) AS requested(source)
			WHERE catalog_release.id=$3
			UNION ALL
			SELECT DISTINCT artifact.source
			FROM catalog_source_artifacts artifact
			JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
			WHERE snapshot.release_id=$3
		), active_sources AS (
			SELECT DISTINCT source FROM source_candidates
		)
		SELECT active.source,COALESCE(policy.display_name,active.source),
			COALESCE(policy.public_api_status,'unknown'),COALESCE(policy.commercial_use_status,'unknown'),
			COALESCE(policy.review_status,'pending'),
			COALESCE(grant_record.decision,'blocked'),grant_record.expires_at,
			review.id,COALESCE(review.review_kind,''),COALESCE(review.decision,'blocked'),review.expires_at
		FROM active_sources active
		LEFT JOIN catalog_source_policies policy ON policy.source=active.source
		LEFT JOIN catalog_publication_grants grant_record ON grant_record.source=active.source
			AND grant_record.environment=$1 AND grant_record.surface=$2
		LEFT JOIN catalog_source_policy_reviews review ON review.id=grant_record.policy_review_id
		ORDER BY active.source`, environment, surface, releaseID)
	if err != nil {
		return PublicationStatus{}, fmt.Errorf("load catalog publication status: %w", err)
	}
	defer rows.Close()

	status := PublicationStatus{Environment: environment, Surface: surface, Ready: true, CheckedAt: time.Now().UTC()}
	for rows.Next() {
		var source PublicationSource
		if err := rows.Scan(&source.Source, &source.DisplayName, &source.PolicyStatus, &source.CommercialStatus, &source.ReviewStatus,
			&source.GrantDecision, &source.GrantExpiresAt, &source.GrantReviewID, &source.GrantReviewKind,
			&source.GrantReviewState, &source.GrantReviewUntil); err != nil {
			return PublicationStatus{}, fmt.Errorf("scan catalog publication source: %w", err)
		}
		now := status.CheckedAt
		if source.ReviewStatus != "reviewed" {
			source.BlockingReasons = append(source.BlockingReasons, "source policy is not currently reviewed")
		}
		if !policyStatusCanBeGranted(source.PolicyStatus) {
			source.BlockingReasons = append(source.BlockingReasons, "public API use is not permitted by policy")
		}
		if !policyStatusCanBeGranted(source.CommercialStatus) {
			source.BlockingReasons = append(source.BlockingReasons, "commercial use is not permitted by policy")
		}
		if source.GrantDecision != "allowed" {
			source.BlockingReasons = append(source.BlockingReasons, "no explicit publication grant")
		}
		if source.GrantExpiresAt != nil && !source.GrantExpiresAt.After(now) {
			source.BlockingReasons = append(source.BlockingReasons, "publication grant expired")
		}
		if source.GrantReviewID == nil || source.GrantReviewState != "allowed" ||
			(source.GrantReviewKind != "owner_approval" && source.GrantReviewKind != "legal") {
			source.BlockingReasons = append(source.BlockingReasons, "publication grant has no matching owner or legal review")
		}
		if source.GrantReviewUntil != nil && !source.GrantReviewUntil.After(now) {
			source.BlockingReasons = append(source.BlockingReasons, "publication grant review expired")
		}
		source.Allowed = len(source.BlockingReasons) == 0
		status.Ready = status.Ready && source.Allowed
		status.Sources = append(status.Sources, source)
	}
	if err := rows.Err(); err != nil {
		return PublicationStatus{}, fmt.Errorf("iterate catalog publication sources: %w", err)
	}
	sort.Slice(status.Sources, func(i, j int) bool { return status.Sources[i].Source < status.Sources[j].Source })
	return status, nil
}

func policyStatusCanBeGranted(status string) bool {
	return status == "allowed" || status == "restricted" || status == "permission_required"
}
