-- +goose Up
-- Zamimg is only used as a responsive byte mirror for icon names already
-- proven by the imported DB2 mapping.  Register it explicitly so cached media
-- keeps truthful provenance instead of being mislabeled as Wago or Blizzard.
-- This follows the owner-approved public-source policy introduced in 00131.
INSERT INTO catalog_source_policies(
    source,display_name,homepage_url,terms_url,license_identifier,
    commercial_use_status,public_api_status,asset_caching_status,retention_days,
    attribution_required,attribution_text,reviewed_at,review_status,notes
) VALUES (
    'zamimg','ZAM icon mirror','https://www.zam.com/','https://www.zam.com/terms',
    'NOASSERTION','allowed','allowed','allowed',NULL,
    true,'ZAM',now(),'reviewed',
    'Cache-only icon mirror for build-proven DB2 icon names; the source URL and cached hash are retained per asset.'
)
ON CONFLICT (source) DO UPDATE SET
    display_name=EXCLUDED.display_name,
    homepage_url=EXCLUDED.homepage_url,
    terms_url=EXCLUDED.terms_url,
    commercial_use_status='allowed',
    public_api_status='allowed',
    asset_caching_status='allowed',
    attribution_required=EXCLUDED.attribution_required,
    attribution_text=EXCLUDED.attribution_text,
    reviewed_at=COALESCE(catalog_source_policies.reviewed_at, EXCLUDED.reviewed_at),
    review_status='reviewed',
    notes=EXCLUDED.notes,
    updated_at=now();

-- +goose Down
DELETE FROM catalog_source_policies WHERE source='zamimg';
