-- +goose Up
-- Owner decision (2026-09-02): every registered catalog source is public and
-- credited on the site. The per-source review / grant workflow (00047, 00099,
-- 00105) is retired: its tables, triggers and functions go away, and
-- catalog_source_policies stays as the attribution registry with every status
-- set to allowed.
UPDATE catalog_source_policies
SET review_status='reviewed',
    public_api_status='allowed',
    commercial_use_status='allowed',
    asset_caching_status='allowed',
    reviewed_at=COALESCE(reviewed_at, now()),
    updated_at=now();

INSERT INTO catalog_source_policies(
    source, display_name, homepage_url, terms_url, license_identifier,
    commercial_use_status, public_api_status, asset_caching_status,
    retention_days, attribution_required, attribution_text, reviewed_at, review_status, notes
) VALUES (
    'raidbots', 'Raidbots', 'https://www.raidbots.com', '', '',
    'allowed', 'allowed', 'allowed',
    NULL, true, 'Talent trees and community data: Raidbots', now(), 'reviewed',
    'Community enrichment source enabled for talent trees by the owner on 2026-09-02.'
)
ON CONFLICT (source) DO UPDATE SET
    commercial_use_status='allowed',
    public_api_status='allowed',
    asset_caching_status='allowed',
    review_status='reviewed',
    reviewed_at=COALESCE(catalog_source_policies.reviewed_at, now()),
    updated_at=now();

DROP TRIGGER IF EXISTS catalog_source_policy_reviews_immutable ON catalog_source_policy_reviews;
DROP TRIGGER IF EXISTS catalog_source_policy_reviews_validate ON catalog_source_policy_reviews;
DROP TRIGGER IF EXISTS catalog_publication_grants_audit ON catalog_publication_grants;
DROP TRIGGER IF EXISTS catalog_publication_grants_validate_review ON catalog_publication_grants;
DROP FUNCTION IF EXISTS prevent_catalog_source_policy_review_mutation();
DROP FUNCTION IF EXISTS validate_catalog_source_policy_review();
DROP FUNCTION IF EXISTS audit_catalog_publication_grant_change();
DROP FUNCTION IF EXISTS validate_catalog_publication_grant_review();
DROP TABLE IF EXISTS catalog_publication_grant_events;
DROP TABLE IF EXISTS catalog_publication_grants;
DROP TABLE IF EXISTS catalog_source_policy_reviews;

-- +goose Down
-- Recreates the retired tables (schema from 00047 + 00105) without data, so
-- older application versions can still boot; the review triggers are not
-- restored because their approvals cannot be reconstructed.
CREATE TABLE catalog_source_policy_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL REFERENCES catalog_source_policies(source) ON DELETE RESTRICT,
    environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
    surface TEXT NOT NULL CHECK (surface IN ('website','public_api','bulk_export','asset_cache')),
    review_kind TEXT NOT NULL CHECK (review_kind IN ('evidence','owner_approval','legal')),
    decision TEXT NOT NULL CHECK (decision IN ('allowed','blocked')),
    reviewer TEXT NOT NULL CHECK (btrim(reviewer)<>''),
    reason TEXT NOT NULL CHECK (btrim(reason)<>''),
    terms_url TEXT NOT NULL DEFAULT '' CHECK (terms_url='' OR terms_url ~ '^https://'),
    terms_content_sha256 BYTEA CHECK (terms_content_sha256 IS NULL OR octet_length(terms_content_sha256)=32),
    observed_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    parent_review_id UUID REFERENCES catalog_source_policy_reviews(id) ON DELETE RESTRICT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at IS NULL OR expires_at>observed_at),
    CHECK (decision='blocked' OR review_kind IN ('owner_approval','legal')),
    CHECK (review_kind<>'owner_approval' OR parent_review_id IS NOT NULL)
);
CREATE TABLE catalog_publication_grants (
    source TEXT NOT NULL REFERENCES catalog_source_policies(source) ON DELETE CASCADE,
    environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
    surface TEXT NOT NULL CHECK (surface IN ('website','public_api','bulk_export','asset_cache')),
    decision TEXT NOT NULL DEFAULT 'blocked' CHECK (decision IN ('allowed','blocked')),
    scope JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    approved_by TEXT NOT NULL DEFAULT '',
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    policy_review_id UUID REFERENCES catalog_source_policy_reviews(id) ON DELETE RESTRICT,
    PRIMARY KEY (source, environment, surface),
    CHECK (expires_at IS NULL OR reviewed_at IS NULL OR expires_at > reviewed_at),
    CHECK (decision = 'blocked' OR (btrim(approved_by) <> '' AND reviewed_at IS NOT NULL))
);
CREATE TABLE catalog_publication_grant_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source TEXT NOT NULL,
    environment TEXT NOT NULL,
    surface TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
    actor TEXT NOT NULL,
    old_record JSONB,
    new_record JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (old_record IS NULL OR jsonb_typeof(old_record)='object'),
    CHECK (new_record IS NULL OR jsonb_typeof(new_record)='object')
);
