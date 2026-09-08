-- +goose Up
-- Every confirmed Midnight record needs an explicit player-facing decision.
-- Items already receive one from the gameplay-signal classifier; maps and
-- transmog sets used to be implicitly eligible, which leaked client test
-- entries such as "DELETE ME" into the public catalogue.

CREATE TABLE catalog_entity_usability_overrides (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    decision TEXT NOT NULL CHECK (decision IN ('eligible','review','excluded')),
    reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
    reviewer TEXT NOT NULL CHECK (btrim(reviewer) <> ''),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id,build_id,entity_type,external_id)
);

CREATE TABLE catalog_entity_usability_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id SMALLINT NOT NULL,
    build_id BIGINT NOT NULL,
    entity_type TEXT NOT NULL,
    external_id BIGINT NOT NULL,
    decision TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('baseline','decision_inserted','decision_updated')),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX catalog_entity_usability_audit_entity_idx
    ON catalog_entity_usability_audit(product_id,build_id,entity_type,external_id,recorded_at DESC);

-- Keep an append-only record of automatic refreshes and operator overrides.
-- +goose StatementBegin
CREATE FUNCTION catalog_audit_entity_usability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO catalog_entity_usability_audit(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        rule_version,event_kind,evidence
    ) VALUES (
        NEW.product_id,NEW.build_id,NEW.entity_type,NEW.external_id,NEW.decision,NEW.reason_code,
        NEW.rule_version,CASE WHEN TG_OP='INSERT' THEN 'decision_inserted' ELSE 'decision_updated' END,NEW.evidence
    );
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_entity_usability_audit_trigger
AFTER INSERT OR UPDATE OF decision,reason_code,source_artifact_id,evidence,rule_version
ON catalog_entity_usability
FOR EACH ROW EXECUTE FUNCTION catalog_audit_entity_usability();

INSERT INTO catalog_entity_usability_audit(
    product_id,build_id,entity_type,external_id,decision,reason_code,rule_version,event_kind,evidence,recorded_at
)
SELECT product_id,build_id,entity_type,external_id,decision,reason_code,rule_version,'baseline',evidence,assessed_at
FROM catalog_entity_usability;

-- The cohort trigger reserves review for every entity type.  A raw client row
-- can therefore never be publicly visible in the interval before its specific
-- classifier runs.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION catalog_guard_midnight_item_usability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.classification <> 'confirmed' OR NEW.expansion_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM catalog_expansions expansion
        WHERE expansion.id=NEW.expansion_id AND expansion.expansion_key='midnight'
    ) THEN
        RETURN NEW;
    END IF;
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at
    ) VALUES (
        NEW.product_id,NEW.build_id,NEW.entity_type,NEW.external_id,'review','awaiting_usability_refresh',
        NEW.source_artifact_id,
        jsonb_build_object('source','catalog_entity_expansions','state','pending_assessment'),
        'midnight-entity-usability-guard-v1',now()
    ) ON CONFLICT(product_id,build_id,entity_type,external_id) DO NOTHING;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_midnight_nonitem_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH target_build AS (
        SELECT id,product_id FROM game_builds WHERE id=target_build_id
    ), classified AS (
        SELECT build.product_id,raw.build_id,
            CASE raw.table_name WHEN 'Map' THEN 'map' WHEN 'TransmogSet' THEN 'transmog_set' END AS entity_type,
            raw.row_id AS external_id,raw.source_artifact_id,
            COALESCE(NULLIF(btrim(raw.payload->>'MapName_lang'),''),NULLIF(btrim(raw.payload->>'Name_lang'),''),'') AS display_name,
            raw.table_name
        FROM catalog_db2_rows raw
        JOIN target_build build ON build.id=raw.build_id
        WHERE raw.locale='en_US' AND raw.table_name IN ('Map','TransmogSet')
          AND raw.payload->>'ExpansionID'='11' AND raw.source_artifact_id IS NOT NULL
    ), decisions AS (
        SELECT *,CASE
            WHEN display_name ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\\]'
                THEN 'excluded'
            WHEN entity_type='map' AND display_name ~* '(^|[[:space:]_:-])old([[:space:]_:-]|$)'
                THEN 'review'
            ELSE 'eligible'
        END AS decision
        FROM classified
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at
    )
    SELECT product_id,build_id,entity_type,external_id,decision,
        CASE decision WHEN 'eligible' THEN 'source_backed_entity'
            WHEN 'review' THEN 'ambiguous_legacy_marker'
            ELSE 'explicit_internal_or_placeholder_marker' END,
        source_artifact_id,
        jsonb_build_object('source_table',table_name,'expansion_id',11,'name',display_name),
        'midnight-nonitem-usability-v1',now()
    FROM decisions
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=EXCLUDED.assessed_at;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION catalog_apply_midnight_usability_overrides(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        evidence,rule_version,assessed_at
    )
    SELECT product_id,build_id,entity_type,external_id,decision,reason_code,
        evidence,'midnight-usability-override-v1',now()
    FROM catalog_entity_usability_overrides
    WHERE build_id=target_build_id AND is_active
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=EXCLUDED.assessed_at;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- `[NYI] Lockpick Power` is an explicit unfinished client placeholder.  Keep
-- it retained for audit but never eligible, even if it has a gameplay signal.
INSERT INTO catalog_entity_usability_overrides(
    product_id,build_id,entity_type,external_id,decision,reason_code,reviewer,evidence
)
SELECT product_id,build_id,'item',external_id,'excluded','explicit_nyi_marker','quality-policy',
       jsonb_build_object('name','[NYI] Lockpick Power','policy','explicit unfinished marker')
FROM catalog_entity_usability
WHERE entity_type='item' AND external_id=235637
ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
    decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,reviewer=EXCLUDED.reviewer,
    evidence=EXCLUDED.evidence,is_active=true,updated_at=now();

-- +goose StatementBegin
DO $$
DECLARE build_record RECORD;
BEGIN
    FOR build_record IN
        SELECT DISTINCT build_id FROM catalog_entity_expansions cohort
        JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id AND expansion.expansion_key='midnight'
        WHERE cohort.classification='confirmed'
    LOOP
        PERFORM catalog_refresh_midnight_nonitem_usability(build_record.build_id);
        PERFORM catalog_apply_midnight_usability_overrides(build_record.build_id);
    END LOOP;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_public_summary_stats(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS catalog_apply_midnight_usability_overrides(BIGINT);
DROP FUNCTION IF EXISTS catalog_refresh_midnight_nonitem_usability(BIGINT);
DROP TRIGGER IF EXISTS catalog_entity_usability_audit_trigger ON catalog_entity_usability;
DROP FUNCTION IF EXISTS catalog_audit_entity_usability();
DROP TABLE IF EXISTS catalog_entity_usability_audit;
DROP TABLE IF EXISTS catalog_entity_usability_overrides;
