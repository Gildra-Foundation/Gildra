-- +goose Up
-- Keep the original quality implementation intact and wrap only the one
-- monotonic-build check that is intentionally relaxed for an explicit repair
-- release. All other checks (snapshots, provenance, names, regressions, and
-- media/description warnings) remain unchanged.
ALTER FUNCTION catalog_release_quality_gate(UUID)
    RENAME TO catalog_release_quality_gate_v1;

-- +goose StatementBegin
CREATE FUNCTION catalog_release_quality_gate(p_release_id UUID)
RETURNS TABLE(
    check_key TEXT,
    failed_count BIGINT,
    blocking BOOLEAN,
    details JSONB
)
LANGUAGE sql
STABLE
AS $$
    SELECT gate.check_key,gate.failed_count,gate.blocking,gate.details
    FROM catalog_release_quality_gate_v1(p_release_id) gate
    WHERE NOT (
        gate.check_key='release_build_regression'
        AND EXISTS (
            SELECT 1 FROM catalog_releases release_record
            WHERE release_record.id=p_release_id AND release_record.is_repair
        )
    )
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS catalog_release_quality_gate(UUID);
ALTER FUNCTION catalog_release_quality_gate_v1(UUID)
    RENAME TO catalog_release_quality_gate;
