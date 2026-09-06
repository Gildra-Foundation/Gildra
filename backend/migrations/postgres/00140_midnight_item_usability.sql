-- +goose Up
-- Keep raw client data intact, but make the player-facing item denominator
-- explicit. A client build contains test, DNT and otherwise unproven rows;
-- those must never silently become public catalog entries.
CREATE TABLE catalog_entity_usability (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    decision TEXT NOT NULL CHECK (decision IN ('eligible', 'review', 'excluded')),
    reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
    rule_version TEXT NOT NULL DEFAULT 'midnight-item-usability-v1',
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, build_id, entity_type, external_id)
);

CREATE INDEX catalog_entity_usability_decision_idx
    ON catalog_entity_usability(product_id, build_id, entity_type, decision, external_id);

COMMENT ON TABLE catalog_entity_usability IS
    'Build-pinned public-catalog eligibility. Raw client rows are retained; review and excluded rows are not player-facing defaults.';

-- This is intentionally a refresh function instead of an ItemSparse trigger:
-- gameplay links may arrive after ItemSparse in a DB2 import, so classification
-- occurs once the complete build is present.
-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_midnight_item_usability(target_build_id BIGINT)
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
    ), classified AS (
        SELECT build.product_id,item.row_id AS external_id,item.source_artifact_id,
            CASE
                WHEN NULLIF(BTRIM(item.payload->>'Display_lang'),'') IS NULL
                  OR item.payload->>'Display_lang' ~* '(^|[ _-])(dnt|test|unused|deprecated|internal|zzold)([ _-]|$)'
                    THEN 'excluded'
                WHEN appearances.item_id IS NOT NULL OR effects.item_id IS NOT NULL
                  OR encounter_loot.item_id IS NOT NULL
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
        source_artifact_id,evidence,'midnight-item-usability-v1',now()
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

-- Backfill every already imported build that has an authoritative Midnight
-- ItemSparse cohort. Future DB2 imports call the same function after all
-- related tables are present.
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

CREATE VIEW catalog_midnight_public_items AS
SELECT usability.product_id,usability.build_id,usability.external_id,
       usability.source_artifact_id,usability.evidence
FROM catalog_entity_usability usability
WHERE usability.entity_type='item' AND usability.decision='eligible';

COMMENT ON VIEW catalog_midnight_public_items IS
    'Default player-facing Midnight items. Review/excluded client rows remain available only for data-quality review.';

-- +goose Down
DROP VIEW IF EXISTS catalog_midnight_public_items;
DROP FUNCTION IF EXISTS catalog_refresh_midnight_item_usability(BIGINT);
DROP TABLE IF EXISTS catalog_entity_usability;
