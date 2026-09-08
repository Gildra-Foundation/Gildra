package catalog

// publicCatalogUsabilityPredicate returns the player-facing eligibility gate
// for an entity/version pair.  catalog_entity_usability is deliberately
// joined by the published version's build: a decision from another build must
// never make a raw entity public.
//
// The DB2 importer reserves a review decision for every confirmed Midnight
// entity before type-specific classification. Keeping the hot-path predicate
// to this small decision table matters: the public catalog lists hundreds of
// thousands of historical rows, while the Midnight cohort is only a few
// thousand records. Non-Midnight entities are unchanged.
func publicCatalogUsabilityPredicate(entityAlias, versionAlias string) string {
	return `
		AND (
			` + entityAlias + `.product_id <> (SELECT id FROM game_products WHERE slug='wow')
			OR (` + entityAlias + `.product_id,` + versionAlias + `.build_id,` + entityAlias + `.entity_type,` + entityAlias + `.external_id) NOT IN (
				SELECT usability.product_id,usability.build_id,usability.entity_type,usability.external_id
				FROM catalog_entity_usability usability WHERE usability.decision <> 'eligible'
			)
		)`
}
