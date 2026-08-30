-- +goose Up
-- Dataset tooltip coverage must reflect the published read model, not dataset
-- membership.  Keep this as a follow-up migration so 00091 remains immutable.
-- The function body is patched in place and the existing rows are recalculated
-- immediately; failed imports cannot make an entity look tooltip-complete.
-- +goose StatementBegin
DO $$
DECLARE
    function_definition TEXT;
    old_expression CONSTANT TEXT := 'count(membership.entity_id) AS tooltip_count,';
    new_expression CONSTANT TEXT := $tooltip$
            count(membership.entity_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM catalog_entity_tooltips tooltip
                WHERE tooltip.version_id=membership.version_id
                  AND tooltip.locale=locale.locale
            )) AS tooltip_count,
$tooltip$;
BEGIN
    SELECT pg_get_functiondef('public.refresh_catalog_library_datasets(smallint)'::regprocedure)
    INTO function_definition;

    IF function_definition IS NULL
       OR length(function_definition) - length(replace(function_definition, old_expression, '')) <> length(old_expression) THEN
        RAISE EXCEPTION 'refresh_catalog_library_datasets has an unexpected tooltip_count implementation';
    END IF;

    EXECUTE replace(function_definition, old_expression, new_expression);
END;
$$;
-- +goose StatementEnd

-- Recalculate the persisted coverage so existing API responses become truthful
-- as soon as this migration is applied.
SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
-- Restore the 00091 membership-based implementation when rolling back this
-- migration.  This is intentionally reversible for local/test environments;
-- production rollback should use a forward migration after review.
-- +goose StatementBegin
DO $$
DECLARE
    function_definition TEXT;
    old_expression CONSTANT TEXT := $tooltip$
            count(membership.entity_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM catalog_entity_tooltips tooltip
                WHERE tooltip.version_id=membership.version_id
                  AND tooltip.locale=locale.locale
            )) AS tooltip_count,
$tooltip$;
    new_expression CONSTANT TEXT := 'count(membership.entity_id) AS tooltip_count,';
BEGIN
    SELECT pg_get_functiondef('public.refresh_catalog_library_datasets(smallint)'::regprocedure)
    INTO function_definition;

    IF function_definition IS NULL
       OR length(function_definition) - length(replace(function_definition, old_expression, '')) <> length(old_expression) THEN
        RAISE EXCEPTION 'refresh_catalog_library_datasets has an unexpected tooltip_count implementation';
    END IF;

    EXECUTE replace(function_definition, old_expression, new_expression);
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_library_datasets(NULL);
