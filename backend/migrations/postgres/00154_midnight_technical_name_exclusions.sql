-- +goose Up
-- The original Midnight classifiers escaped square brackets twice inside a
-- PostgreSQL string literal.  Names such as "[PH] ..." and "[DNT]..." were
-- therefore treated as eligible despite being explicit client placeholders.
-- Keep the raw rows, but make the exclusion rule deterministic and apply it
-- both to the current snapshot and to every subsequent classifier refresh.

-- Use bracket character classes ([[] and []]) so the expression is identical
-- in SQL source, migrations and query plans without string-literal escaping.
ALTER FUNCTION catalog_refresh_midnight_item_usability(BIGINT)
    RENAME TO catalog_refresh_midnight_item_usability_legacy;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_midnight_item_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    refreshed BIGINT;
    excluded BIGINT;
BEGIN
    SELECT catalog_refresh_midnight_item_usability_legacy(target_build_id) INTO refreshed;
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='technical_or_placeholder_marker',
        rule_version='midnight-item-usability-v4',
        evidence=usability.evidence || jsonb_build_object('technical_name_policy','bracket-marker-v1'),
        assessed_at=now()
    WHERE usability.build_id=target_build_id
      AND usability.entity_type='item'
      AND usability.decision='eligible'
      AND COALESCE(usability.evidence->>'name','') ~*
          '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]';
    GET DIAGNOSTICS excluded = ROW_COUNT;
    RETURN refreshed + excluded;
END;
$$;
-- +goose StatementEnd

ALTER FUNCTION catalog_refresh_midnight_nonitem_usability(BIGINT)
    RENAME TO catalog_refresh_midnight_nonitem_usability_legacy;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_midnight_nonitem_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    refreshed BIGINT;
    excluded BIGINT;
BEGIN
    SELECT catalog_refresh_midnight_nonitem_usability_legacy(target_build_id) INTO refreshed;
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='technical_or_placeholder_marker',
        rule_version='midnight-nonitem-usability-v2',
        evidence=usability.evidence || jsonb_build_object('technical_name_policy','bracket-marker-v1'),
        assessed_at=now()
    WHERE usability.build_id=target_build_id
      AND usability.entity_type IN ('map','transmog_set')
      AND usability.decision='eligible'
      AND COALESCE(usability.evidence->>'name','') ~*
          '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]';
    GET DIAGNOSTICS excluded = ROW_COUNT;
    RETURN refreshed + excluded;
END;
$$;
-- +goose StatementEnd

-- Reclassify already imported cohorts immediately.  This is intentionally
-- evidence-driven and does not delete or rewrite the raw source rows.
UPDATE catalog_entity_usability usability
SET decision='excluded',
    reason_code='technical_or_placeholder_marker',
    rule_version='midnight-usability-v4',
    evidence=usability.evidence || jsonb_build_object('technical_name_policy','bracket-marker-v1'),
    assessed_at=now()
WHERE usability.decision='eligible'
  AND COALESCE(usability.evidence->>'name','') ~*
      '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]';

SELECT refresh_catalog_public_summary_stats(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS catalog_refresh_midnight_nonitem_usability(BIGINT);
ALTER FUNCTION catalog_refresh_midnight_nonitem_usability_legacy(BIGINT)
    RENAME TO catalog_refresh_midnight_nonitem_usability;
DROP FUNCTION IF EXISTS catalog_refresh_midnight_item_usability(BIGINT);
ALTER FUNCTION catalog_refresh_midnight_item_usability_legacy(BIGINT)
    RENAME TO catalog_refresh_midnight_item_usability;
