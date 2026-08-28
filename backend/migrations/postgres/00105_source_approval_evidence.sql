-- +goose Up
-- Publication grants are operational decisions, not importer side effects.
-- Every new allow must point to an immutable owner/legal review that in turn
-- references the evidence used for the decision.
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

CREATE INDEX catalog_source_policy_reviews_lookup_idx
    ON catalog_source_policy_reviews(source,environment,surface,created_at DESC,id DESC);
CREATE INDEX catalog_source_policy_reviews_active_idx
    ON catalog_source_policy_reviews(source,environment,surface,expires_at)
    WHERE decision='allowed';

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION validate_catalog_source_policy_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_review catalog_source_policy_reviews%ROWTYPE;
BEGIN
    IF NEW.review_kind<>'owner_approval' THEN
        RETURN NEW;
    END IF;
    SELECT * INTO parent_review FROM catalog_source_policy_reviews WHERE id=NEW.parent_review_id;
    IF NOT FOUND
       OR parent_review.source<>NEW.source
       OR parent_review.environment<>NEW.environment
       OR parent_review.surface<>NEW.surface
       OR parent_review.review_kind<>'evidence' THEN
        RAISE EXCEPTION 'owner approval must reference matching source-policy evidence';
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_source_policy_reviews_validate
BEFORE INSERT ON catalog_source_policy_reviews
FOR EACH ROW EXECUTE FUNCTION validate_catalog_source_policy_review();

ALTER TABLE catalog_publication_grants
    ADD COLUMN policy_review_id UUID REFERENCES catalog_source_policy_reviews(id) ON DELETE RESTRICT;

ALTER TABLE catalog_publication_grants
    ADD CONSTRAINT catalog_publication_grants_allowed_review_check
    CHECK (decision='blocked' OR policy_review_id IS NOT NULL) NOT VALID;

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

CREATE INDEX catalog_publication_grant_events_lookup_idx
    ON catalog_publication_grant_events(source,environment,surface,occurred_at DESC,id DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION validate_catalog_publication_grant_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE linked_review catalog_source_policy_reviews%ROWTYPE;
BEGIN
    IF NEW.decision='blocked' THEN
        RETURN NEW;
    END IF;
    IF NEW.policy_review_id IS NULL THEN
        RAISE EXCEPTION 'allowed publication grant requires policy_review_id';
    END IF;
    SELECT * INTO linked_review FROM catalog_source_policy_reviews WHERE id=NEW.policy_review_id;
    IF NOT FOUND
       OR linked_review.source<>NEW.source
       OR linked_review.environment<>NEW.environment
       OR linked_review.surface<>NEW.surface
       OR linked_review.decision<>'allowed'
       OR linked_review.review_kind NOT IN ('owner_approval','legal')
       OR linked_review.expires_at IS NOT NULL AND linked_review.expires_at<=now() THEN
        RAISE EXCEPTION 'publication grant review is missing, mismatched, blocked, or expired';
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_publication_grants_validate_review
BEFORE INSERT OR UPDATE ON catalog_publication_grants
FOR EACH ROW EXECUTE FUNCTION validate_catalog_publication_grant_review();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION audit_catalog_publication_grant_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE event_actor TEXT;
BEGIN
    event_actor := COALESCE(
        NULLIF(current_setting('gildra.approval_actor',true),''),
        NULLIF(CASE WHEN TG_OP='DELETE' THEN OLD.approved_by ELSE NEW.approved_by END,''),
        session_user
    );
    INSERT INTO catalog_publication_grant_events(
        source,environment,surface,operation,actor,old_record,new_record
    ) VALUES(
        CASE WHEN TG_OP='DELETE' THEN OLD.source ELSE NEW.source END,
        CASE WHEN TG_OP='DELETE' THEN OLD.environment ELSE NEW.environment END,
        CASE WHEN TG_OP='DELETE' THEN OLD.surface ELSE NEW.surface END,
        lower(TG_OP),event_actor,
        CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END
    );
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_publication_grants_audit
AFTER INSERT OR UPDATE OR DELETE ON catalog_publication_grants
FOR EACH ROW EXECUTE FUNCTION audit_catalog_publication_grant_change();

-- Reviews are append-only evidence. Corrections create a superseding row.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_catalog_source_policy_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'catalog source policy reviews are immutable; insert a superseding review';
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_source_policy_reviews_immutable
BEFORE UPDATE OR DELETE ON catalog_source_policy_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_catalog_source_policy_review_mutation();

INSERT INTO catalog_source_policy_reviews(
    source,environment,surface,review_kind,decision,reviewer,reason,
    terms_url,terms_content_sha256,observed_at,evidence
) VALUES
('all_the_things','production','public_api','evidence','blocked','codex-source-evidence',
 'MIT covers the repository, but included game-derived and third-party data require an owner/legal redistribution decision.',
 'https://raw.githubusercontent.com/ATTWoWAddon/AllTheThings/master/LICENSE',
 decode('955281b9174e0f66b08c8e83d31e0f38b2fcaa247ca3af92d1723d81a13cddfb','hex'),
 '2026-08-28T12:00:00Z','{"license":"MIT","third_party_data_review_required":true}'::jsonb),
('blizzard_api','production','public_api','evidence','blocked','codex-source-evidence',
 'Terms permit dynamic end-user display through a registered application but require attribution, privacy policy, non-monetization and a 30-day data TTL.',
 'https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use',
 decode('1ef777849b22c5188e7bf512ba71036cc115230524bce78684dd223a35fb0777','hex'),
 '2026-08-28T12:00:00Z','{"registered_application_required":true,"privacy_policy_required":true,"attribution_required":true,"retention_days":30,"monetization_restricted":true}'::jsonb),
('blizzard_api','production','asset_cache','evidence','blocked','codex-source-evidence',
 'Local image caching is not self-authorized; any owner/legal approval must preserve attribution, deletion and the 30-day API-data TTL.',
 'https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use',
 decode('1ef777849b22c5188e7bf512ba71036cc115230524bce78684dd223a35fb0777','hex'),
 '2026-08-28T12:00:00Z','{"local_only":true,"retention_days":30,"revocation_deletes_public_access":true}'::jsonb),
('wago_tools','production','public_api','evidence','blocked','codex-source-evidence',
 'The service exposes downloadable DB2 CSV files but no separate redistribution terms were found on the official service page.',
 'https://wago.tools/',decode('1b63738a70ab451204347cc5325c8a575b4d45aefb149fb9baa14be7b0c59df9','hex'),
 '2026-08-28T12:00:00Z','{"redistribution_terms_found":false,"permission_required":true}'::jsonb),
('wow_listfile','production','public_api','evidence','blocked','codex-source-evidence',
 'The official repository publishes verified and community listfiles but has no repository-level license; explicit permission is required.',
 'https://raw.githubusercontent.com/wowdev/wow-listfile/master/README.md',
 decode('38673f60dd03a566220b661d2c671292e309a7a92f359e7a0b08cff0aba33b04','hex'),
 '2026-08-28T12:00:00Z','{"repository_license_found":false,"verified_and_community_data":true,"permission_required":true}'::jsonb);

UPDATE catalog_source_policies
SET commercial_use_status='permission_required',public_api_status='permission_required',
    asset_caching_status='permission_required',review_status='reviewed',
    reviewed_at='2026-08-28T12:00:00Z',updated_at=now(),
    notes='MIT covers the ATT repository. Game-derived and attributed third-party records remain permission-gated until an explicit owner/legal review is linked to the production grant.'
WHERE source='all_the_things' AND review_status='pending';

UPDATE catalog_source_policies
SET review_status='reviewed',reviewed_at='2026-08-28T12:00:00Z',updated_at=now(),
    notes='The official service exposes DB2 CSV downloads but no separate redistribution terms were found. Public redistribution and caching remain permission-gated.'
WHERE source='wago_tools' AND review_status='pending';

-- +goose Down
UPDATE catalog_source_policies
SET commercial_use_status='unknown',public_api_status='unknown',asset_caching_status='unknown',
    review_status='pending',reviewed_at=NULL,updated_at=now(),
    notes='Candidate for item acquisition, quest, NPC, vendor, cost and recipe relations. Repository code and included files are MIT-licensed; public redistribution of derived game data still requires an explicit owner review.'
WHERE source='all_the_things' AND reviewed_at='2026-08-28T12:00:00Z';

UPDATE catalog_source_policies
SET review_status='pending',reviewed_at=NULL,updated_at=now(),
    notes='No commercial redistribution permission is asserted by this registry.'
WHERE source='wago_tools' AND reviewed_at='2026-08-28T12:00:00Z';

DROP TRIGGER IF EXISTS catalog_source_policy_reviews_immutable ON catalog_source_policy_reviews;
DROP FUNCTION IF EXISTS prevent_catalog_source_policy_review_mutation();
DROP TRIGGER IF EXISTS catalog_source_policy_reviews_validate ON catalog_source_policy_reviews;
DROP FUNCTION IF EXISTS validate_catalog_source_policy_review();
DROP TRIGGER IF EXISTS catalog_publication_grants_audit ON catalog_publication_grants;
DROP FUNCTION IF EXISTS audit_catalog_publication_grant_change();
DROP TRIGGER IF EXISTS catalog_publication_grants_validate_review ON catalog_publication_grants;
DROP FUNCTION IF EXISTS validate_catalog_publication_grant_review();
DROP TABLE IF EXISTS catalog_publication_grant_events;
ALTER TABLE catalog_publication_grants DROP CONSTRAINT IF EXISTS catalog_publication_grants_allowed_review_check;
ALTER TABLE catalog_publication_grants DROP COLUMN IF EXISTS policy_review_id;
DROP TABLE IF EXISTS catalog_source_policy_reviews;
