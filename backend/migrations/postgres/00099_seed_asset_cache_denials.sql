-- +goose Up
-- Asset publication is fail-closed. These rows make the missing approval
-- explicit in governance reports without granting download permission.
INSERT INTO catalog_publication_grants("source","environment","surface","decision","reason")
SELECT policy.source,target.environment,'asset_cache','blocked',
    'Asset caching is fail-closed until a reviewed, source-specific grant is recorded.'
FROM catalog_source_policies policy
CROSS JOIN (VALUES ('development'::text),('staging'),('production')) AS target(environment)
ON CONFLICT("source","environment","surface") DO NOTHING;

-- +goose Down
DELETE FROM catalog_publication_grants
WHERE surface='asset_cache' AND decision='blocked'
  AND reviewed_at IS NULL AND approved_by=''
  AND reason='Asset caching is fail-closed until a reviewed, source-specific grant is recorded.';
