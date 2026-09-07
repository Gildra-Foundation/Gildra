package catalog

// publicCatalogUsabilityPredicate returns the player-facing eligibility gate
// for an entity/version pair.  catalog_entity_usability is deliberately
// joined by the published version's build: a decision from another build must
// never make a raw entity public.
//
// The DB2 importer refreshes an explicit usability decision for every
// confirmed Midnight item after importing ItemSparse.  Keeping the hot-path
// predicate to that small decision table matters: the public catalog lists
// hundreds of thousands of historical items, while the Midnight cohort is
// only a few thousand rows.  Non-Midnight entities are unchanged.
func publicCatalogUsabilityPredicate(entityAlias, versionAlias string) string {
	return `
		AND (
			` + entityAlias + `.entity_type <> 'item'
			OR ` + entityAlias + `.product_id <> (SELECT id FROM game_products WHERE slug='wow')
			OR (` + entityAlias + `.product_id,` + versionAlias + `.build_id,` + entityAlias + `.external_id) NOT IN (
				SELECT usability.product_id,usability.build_id,usability.external_id
				FROM catalog_entity_usability usability
				WHERE usability.entity_type='item' AND usability.decision <> 'eligible'
			)
		)`
}
