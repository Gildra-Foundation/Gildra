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

// PublicationSource describes a data source that contributes to the catalog.
// Every registered source is publishable; the owner credits sources on the
// site (catalog_source_policies keeps display names and attribution text).
// The legacy grant/review fields stay in the struct so API consumers keep
// their shape; they always report an allowed state.
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

// PublicationService lists the sources that currently contribute to the
// catalog (or to a staged release). Publication is open by owner decision
// (2026-09-02): there is no per-source grant or review gate any more.
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

// ReleaseStatus lists the sources requested by a staging release rather than
// the sources in the currently published catalog.
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

// PrivateStatus reports the currently published catalog for the authenticated,
// internal-only surface.
func (s *PublicationService) PrivateStatus(ctx context.Context, environment string) (PublicationStatus, error) {
	status, err := s.Status(ctx, environment, "public_api")
	if err != nil {
		return PublicationStatus{}, err
	}
	return privatePublicationStatus(status), nil
}

// PrivateReleaseStatus reports a staged release for the internal-only surface.
func (s *PublicationService) PrivateReleaseStatus(
	ctx context.Context,
	environment string,
	releaseID uuid.UUID,
) (PublicationStatus, error) {
	status, err := s.ReleaseStatus(ctx, environment, "public_api", releaseID)
	if err != nil {
		return PublicationStatus{}, err
	}
	return privatePublicationStatus(status), nil
}

func privatePublicationStatus(status PublicationStatus) PublicationStatus {
	status.Surface = "private_api"
	status.Ready = true
	status.Sources = append([]PublicationSource(nil), status.Sources...)
	for index := range status.Sources {
		status.Sources[index].Allowed = true
		status.Sources[index].BlockingReasons = nil
	}
	return status
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
			WHERE $1::uuid IS NULL
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
			WHERE catalog_release.id=$1
			UNION ALL
			SELECT DISTINCT artifact.source
			FROM catalog_source_artifacts artifact
			JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
			WHERE snapshot.release_id=$1
		), active_sources AS (
			SELECT DISTINCT source FROM source_candidates
		)
		SELECT active.source,COALESCE(policy.display_name,active.source)
		FROM active_sources active
		LEFT JOIN catalog_source_policies policy ON policy.source=active.source
		ORDER BY active.source`, releaseID)
	if err != nil {
		return PublicationStatus{}, fmt.Errorf("load catalog publication status: %w", err)
	}
	defer rows.Close()

	status := PublicationStatus{Environment: environment, Surface: surface, Ready: true, CheckedAt: time.Now().UTC()}
	for rows.Next() {
		source := PublicationSource{
			PolicyStatus:     "allowed",
			CommercialStatus: "allowed",
			ReviewStatus:     "reviewed",
			GrantDecision:    "allowed",
			GrantReviewState: "allowed",
			Allowed:          true,
		}
		if err := rows.Scan(&source.Source, &source.DisplayName); err != nil {
			return PublicationStatus{}, fmt.Errorf("scan catalog publication source: %w", err)
		}
		status.Sources = append(status.Sources, source)
	}
	if err := rows.Err(); err != nil {
		return PublicationStatus{}, fmt.Errorf("iterate catalog publication sources: %w", err)
	}
	sort.Slice(status.Sources, func(i, j int) bool { return status.Sources[i].Source < status.Sources[j].Source })
	return status, nil
}
