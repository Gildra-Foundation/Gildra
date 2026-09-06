-- +goose Up
-- A published release's snapshots are promoted from validated to published.
-- The original v3 gate treated every published snapshot as invalid, selected
-- no candidates, and used catalog_public_release_state (which points at the
-- target release) as its "previous" release.  Re-write the already deployed
-- function definition in a forward migration so the historical migrations
-- remain immutable.
-- +goose StatementBegin
DO $repair$
DECLARE
    definition text;
    rewritten text;
BEGIN
    SELECT pg_get_functiondef('catalog_release_quality_gate_v3(uuid)'::regprocedure)
      INTO definition;

    IF definition IS NULL THEN
        RAISE EXCEPTION 'catalog_release_quality_gate_v3(uuid) is missing';
    END IF;

    rewritten := replace(
        definition,
        'count(*) FILTER (WHERE snapshot.status<>''validated'')',
        'count(*) FILTER (WHERE snapshot.status NOT IN (''validated'',''published''))'
    );
    rewritten := replace(
        rewritten,
        'snapshot.status=''validated''',
        'snapshot.status IN (''validated'',''published'')'
    );
    rewritten := replace(
        rewritten,
        '    LEFT JOIN catalog_public_release_state public_state
        ON public_state.product_id=release_record.product_id
    LEFT JOIN catalog_releases previous_release
        ON previous_release.id=public_state.release_id
    LEFT JOIN game_builds previous_build
        ON previous_build.id=previous_release.build_id',
        '    LEFT JOIN LATERAL (
        SELECT prior_build.build_number
        FROM catalog_releases prior_release
        JOIN game_builds prior_build ON prior_build.id=prior_release.build_id
        WHERE prior_release.product_id=release_record.product_id
          AND prior_release.status=''published''
          AND prior_build.build_number < build.build_number
        ORDER BY prior_build.build_number DESC,
                 prior_release.published_at DESC NULLS LAST,
                 prior_release.id DESC
        LIMIT 1
    ) previous_build ON TRUE'
    );

    IF rewritten = definition
       OR rewritten LIKE '%catalog_public_release_state public_state%'
       OR rewritten NOT LIKE '%prior_build.build_number < build.build_number%' THEN
        RAISE EXCEPTION 'quality gate repair did not rewrite snapshot status and previous-build selection';
    END IF;
    EXECUTE rewritten;
END
$repair$;
-- +goose StatementEnd

-- +goose Down
-- The repaired definition is intentionally retained on rollback.  Restoring
-- the pre-00138 function would reintroduce false blocking failures for every
-- published release.
SELECT 1;
