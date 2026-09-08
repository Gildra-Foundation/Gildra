-- +goose Up
-- QuestObjective type 1 is the client's item-collection objective.  It is a
-- direct statement that the player must obtain the referenced Item.db2 row;
-- unlike a name or an adjacent numeric ID, it is sufficient gameplay proof.
-- Require the same content-addressed source-artifact evidence as the other
-- DB2-derived usability signals.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION catalog_refresh_midnight_item_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH target_build AS (
        SELECT id,product_id FROM game_builds WHERE id=target_build_id
    ), midnight_items AS (
        SELECT raw.row_id,raw.payload,raw.source_artifact_id
        FROM catalog_db2_rows raw
        JOIN target_build build ON build.id=raw.build_id
        WHERE raw.table_name='ItemSparse' AND raw.locale='en_US'
          AND raw.payload->>'ExpansionID'='11'
    ), appearances AS (
        SELECT DISTINCT (raw.payload->>'ItemID')::bigint AS item_id
        FROM catalog_db2_rows raw
        WHERE raw.build_id=target_build_id AND raw.table_name='ItemModifiedAppearance'
          AND raw.locale='en_US' AND raw.payload->>'ItemID' ~ '^[0-9]+$'
    ), effects AS (
        SELECT DISTINCT (raw.payload->>'ItemID')::bigint AS item_id
        FROM catalog_db2_rows raw
        WHERE raw.build_id=target_build_id AND raw.table_name='ItemXItemEffect'
          AND raw.locale='en_US' AND raw.payload->>'ItemID' ~ '^[0-9]+$'
    ), encounter_loot AS (
        SELECT DISTINCT (raw.payload->>'ItemID')::bigint AS item_id
        FROM catalog_db2_rows raw
        WHERE raw.build_id=target_build_id AND raw.table_name='JournalEncounterItem'
          AND raw.locale='en_US' AND raw.payload->>'ItemID' ~ '^[0-9]+$'
    ), currency_costs AS (
        SELECT DISTINCT (raw.payload->>'ItemID')::bigint AS item_id
        FROM catalog_db2_rows raw
        JOIN catalog_source_artifacts artifact ON artifact.id=raw.source_artifact_id
        WHERE raw.build_id=target_build_id AND raw.table_name='ItemCurrencyCost'
          AND raw.locale='en_US' AND raw.payload->>'ItemID' ~ '^[0-9]+$'
          AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
    ), quest_objective_items AS (
        SELECT DISTINCT (raw.payload->>'ObjectID')::bigint AS item_id
        FROM catalog_db2_rows raw
        JOIN catalog_source_artifacts artifact ON artifact.id=raw.source_artifact_id
        WHERE raw.build_id=target_build_id AND raw.table_name='QuestObjective'
          AND raw.locale='en_US' AND raw.payload->>'Type'='1'
          AND raw.payload->>'ObjectID' ~ '^[0-9]+$'
          AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
    ), classified AS (
        SELECT build.product_id,item.row_id AS external_id,item.source_artifact_id,
            CASE
                WHEN NULLIF(BTRIM(item.payload->>'Display_lang'),'') IS NULL
                  OR item.payload->>'Display_lang' ~* '(^|[ _-])(dnt|test|unused|deprecated|internal|zzold)([ _-]|$)'
                    THEN 'excluded'
                WHEN appearances.item_id IS NOT NULL OR effects.item_id IS NOT NULL
                  OR encounter_loot.item_id IS NOT NULL OR currency_costs.item_id IS NOT NULL
                  OR quest_objective_items.item_id IS NOT NULL
                  OR COALESCE(NULLIF(item.payload->>'ItemSet','')::int,0)>0
                  OR COALESCE(NULLIF(item.payload->>'ModifiedCraftingReagentItemID','')::bigint,0)>0
                  OR COALESCE(NULLIF(item.payload->>'StartQuestID','')::bigint,0)>0
                  OR COALESCE(NULLIF(item.payload->>'RequiredSkill','')::int,0)>0
                  OR COALESCE(NULLIF(item.payload->>'InventoryType','')::int,0)>0
                  OR COALESCE(NULLIF(item.payload->>'SellPrice','')::bigint,0)>0
                    THEN 'eligible'
                ELSE 'review'
            END AS decision,
            jsonb_build_object(
                'source_table','ItemSparse','expansion_id',11,
                'name',item.payload->>'Display_lang',
                'appearance',appearances.item_id IS NOT NULL,
                'item_effect',effects.item_id IS NOT NULL,
                'encounter_loot',encounter_loot.item_id IS NOT NULL,
                'currency_cost',currency_costs.item_id IS NOT NULL,
                'quest_objective_item',quest_objective_items.item_id IS NOT NULL,
                'item_set',COALESCE(NULLIF(item.payload->>'ItemSet','')::int,0)>0,
                'crafting_reagent',COALESCE(NULLIF(item.payload->>'ModifiedCraftingReagentItemID','')::bigint,0)>0,
                'starts_quest',COALESCE(NULLIF(item.payload->>'StartQuestID','')::bigint,0)>0,
                'required_skill',COALESCE(NULLIF(item.payload->>'RequiredSkill','')::int,0)>0,
                'equippable',COALESCE(NULLIF(item.payload->>'InventoryType','')::int,0)>0,
                'sellable',COALESCE(NULLIF(item.payload->>'SellPrice','')::bigint,0)>0
            ) AS evidence
        FROM midnight_items item
        JOIN target_build build ON true
        LEFT JOIN appearances ON appearances.item_id=item.row_id
        LEFT JOIN effects ON effects.item_id=item.row_id
        LEFT JOIN encounter_loot ON encounter_loot.item_id=item.row_id
        LEFT JOIN currency_costs ON currency_costs.item_id=item.row_id
        LEFT JOIN quest_objective_items ON quest_objective_items.item_id=item.row_id
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at
    )
    SELECT product_id,target_build_id,'item',external_id,decision,
        CASE decision
            WHEN 'excluded' THEN 'explicit_internal_or_placeholder_marker'
            WHEN 'eligible' THEN 'gameplay_signal_present'
            ELSE 'insufficient_gameplay_evidence'
        END,
        source_artifact_id,evidence,'midnight-item-usability-v3',now()
    FROM classified
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=EXCLUDED.assessed_at;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- Re-evaluate every imported Midnight build under the new direct objective
-- evidence rule.  Raw data remains retained regardless of its decision.
-- +goose StatementBegin
DO $$
DECLARE
    build_record RECORD;
BEGIN
    FOR build_record IN
        SELECT DISTINCT raw.build_id
        FROM catalog_db2_rows raw
        WHERE raw.table_name='ItemSparse' AND raw.locale='en_US'
          AND raw.payload->>'ExpansionID'='11'
    LOOP
        PERFORM catalog_refresh_midnight_item_usability(build_record.build_id);
    END LOOP;
END;
$$;
-- +goose StatementEnd

-- The public directory reads its headline totals from this exact usability
-- projection, so refresh it in the same migration as the decisions.
SELECT refresh_catalog_public_summary_stats(NULL);

-- +goose Down
-- The function remains forward-compatible if the schema is rolled back by
-- one step; migration 00143's v2 logic is restored when rolling back further.
