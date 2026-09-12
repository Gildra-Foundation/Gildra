package catalog

// publicCatalogUsabilityPredicate returns the player-facing eligibility gate
// for an entity/version pair.  catalog_entity_usability is deliberately
// joined by the published version's build: a decision from another build must
// never make a raw entity public.
//
// The DB2 importer reserves a review decision for every confirmed entity before
// type-specific classification. Keeping the hot-path predicate to this small
// decision table matters: the public catalog lists hundreds of thousands of
// historical rows, while quality cohorts are build-pinned and indexed. An
// An entity without a decision remains public for products/types that have not
// opted into a quality cohort yet; once a cohort row exists, every non-eligible
// decision is held from public reads. Retail quests are deliberately stricter:
// they are an explicit source-backed quality cohort, so a missing decision is
// held as review rather than passing through during the short interval before
// the post-publish usability refresh runs.
func publicCatalogUsabilityPredicate(entityAlias, versionAlias string) string {
	return `
		AND NOT EXISTS (
			SELECT 1
			FROM catalog_entity_usability usability
			WHERE usability.product_id=` + entityAlias + `.product_id
			  AND usability.build_id=` + versionAlias + `.build_id
			  AND usability.entity_type=` + entityAlias + `.entity_type
			  AND usability.external_id=` + entityAlias + `.external_id
			  AND usability.decision <> 'eligible'
		)
		AND (` + entityAlias + `.entity_type <> 'quest'
			OR ` + entityAlias + `.product_id <> (SELECT id FROM game_products WHERE slug='wow')
			OR EXISTS (
				SELECT 1
				FROM catalog_entity_usability usability
				WHERE usability.product_id=` + entityAlias + `.product_id
				  AND usability.build_id=` + versionAlias + `.build_id
				  AND usability.entity_type='quest'
				  AND usability.external_id=` + entityAlias + `.external_id
				  AND usability.decision='eligible'
			)
		)`
}
