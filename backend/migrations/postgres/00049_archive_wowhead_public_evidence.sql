-- +goose Up
UPDATE catalog_item_acquisition_sources
SET attributes = attributes || jsonb_build_object(
        'archived_external_drop_evidence',
        jsonb_strip_nulls(jsonb_build_object('chance_percent', chance_percent, 'source_url', source_url))
    ),
    chance_source = 'wowhead_tooltip',
    chance_percent = NULL,
    source_url = NULL
WHERE chance_percent IS NOT NULL OR source_url LIKE '%wowhead%';

-- +goose Down
UPDATE catalog_item_acquisition_sources
SET chance_percent = CASE
        WHEN attributes #>> '{archived_external_drop_evidence,chance_percent}' ~ '^[0-9]+([.][0-9]+)?$'
        THEN (attributes #>> '{archived_external_drop_evidence,chance_percent}')::numeric
    END,
    source_url = NULLIF(attributes #>> '{archived_external_drop_evidence,source_url}', ''),
    chance_source = NULL,
    attributes = attributes - 'archived_external_drop_evidence'
WHERE chance_source = 'wowhead_tooltip'
  AND attributes ? 'archived_external_drop_evidence';
