-- +goose Up
INSERT INTO catalog_entity_tooltips (
    version_id, locale, plain_text, blocks, content_hash, source_url, generated_at
)
SELECT version_id, locale, plain_text, blocks, content_hash, source_url, generated_at
FROM catalog_item_tooltips
ON CONFLICT (version_id, locale) DO NOTHING;

-- +goose Down
DELETE FROM catalog_entity_tooltips target
USING catalog_item_tooltips source
WHERE target.version_id = source.version_id
  AND target.locale = source.locale
  AND target.content_hash = source.content_hash;
