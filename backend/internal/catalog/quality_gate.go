package catalog

// publicCatalogUsabilityPredicate returns the player-facing eligibility gate
// for an entity/version pair.  catalog_entity_usability is deliberately
// joined by the published version's build: a decision from another build must
// never make a raw entity public.
//
// The expansion membership check makes a missing usability row fail closed for
// a confirmed Midnight item.  The usability-row check also handles review or
// excluded rows even when a cohort fixture has not materialized the expansion
// membership row yet.  Non-Midnight entities are unchanged.
func publicCatalogUsabilityPredicate(entityAlias, versionAlias string) string {
	return `
		AND (
			` + entityAlias + `.entity_type <> 'item'
			OR ` + entityAlias + `.product_id <> (SELECT id FROM game_products WHERE slug='wow')
			OR (
				NOT EXISTS (
					SELECT 1
					FROM catalog_entity_expansions midnight_membership
					JOIN catalog_expansions midnight ON midnight.id=midnight_membership.expansion_id
					WHERE midnight.expansion_key='midnight'
					  AND midnight_membership.product_id=` + entityAlias + `.product_id
					  AND midnight_membership.build_id=` + versionAlias + `.build_id
					  AND midnight_membership.entity_type='item'
					  AND midnight_membership.external_id=` + entityAlias + `.external_id
					  AND midnight_membership.classification='confirmed'
				)
				AND NOT EXISTS (
					SELECT 1
					FROM catalog_entity_usability usability
					WHERE usability.product_id=` + entityAlias + `.product_id
					  AND usability.build_id=` + versionAlias + `.build_id
					  AND usability.entity_type='item'
					  AND usability.external_id=` + entityAlias + `.external_id
				)
			)
			OR EXISTS (
				SELECT 1
				FROM catalog_entity_usability usability
				WHERE usability.product_id=` + entityAlias + `.product_id
				  AND usability.build_id=` + versionAlias + `.build_id
				  AND usability.entity_type='item'
				  AND usability.external_id=` + entityAlias + `.external_id
				  AND usability.decision='eligible'
			)
		)`
}
