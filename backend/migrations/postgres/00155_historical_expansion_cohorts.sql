-- +goose Up
-- Extend the build-pinned cohort model beyond Midnight.  ExpansionID is a
-- source field from the exact DB2 row; it is not inferred from an item ID.
-- Raw rows remain intact and rows without usable evidence stay reviewable.

ALTER TABLE catalog_expansions
    DROP CONSTRAINT IF EXISTS catalog_expansions_external_expansion_id_check;
ALTER TABLE catalog_expansions
    ADD CONSTRAINT catalog_expansions_external_expansion_id_check
    CHECK (external_expansion_id IS NULL OR external_expansion_id >= 0);

INSERT INTO catalog_expansions(product_id, expansion_key, external_expansion_id, name_en, name_ru, attributes)
SELECT product.id, mapped.expansion_key, mapped.external_expansion_id, mapped.name_en, mapped.name_ru,
       jsonb_build_object('source_field','ExpansionID',
                          'source_tables',jsonb_build_array('ItemSparse','Map','TransmogSet'),
                          'historical_cohort',true)
FROM game_products product
CROSS JOIN (VALUES
    ('classic',0,'Classic','Классика'),
    ('the_burning_crusade',1,'The Burning Crusade','The Burning Crusade'),
    ('wrath_of_the_lich_king',2,'Wrath of the Lich King','Wrath of the Lich King'),
    ('cataclysm',3,'Cataclysm','Cataclysm'),
    ('mists_of_pandaria',4,'Mists of Pandaria','Mists of Pandaria'),
    ('warlords_of_draenor',5,'Warlords of Draenor','Warlords of Draenor'),
    ('legion',6,'Legion','Legion'),
    ('battle_for_azeroth',7,'Battle for Azeroth','Battle for Azeroth'),
    ('shadowlands',8,'Shadowlands','Shadowlands'),
    ('dragonflight',9,'Dragonflight','Dragonflight'),
    ('the_war_within',10,'The War Within','The War Within')
) AS mapped(expansion_key,external_expansion_id,name_en,name_ru)
WHERE product.slug='wow'
ON CONFLICT (product_id, expansion_key) DO UPDATE SET
    external_expansion_id=EXCLUDED.external_expansion_id,
    name_en=EXCLUDED.name_en,
    name_ru=EXCLUDED.name_ru,
    attributes=EXCLUDED.attributes,
    updated_at=now();

-- The same source denominator is used for items, maps and transmog sets.  A
-- row is confirmed only when the immutable source artifact is complete.
INSERT INTO catalog_entity_expansions(
    product_id,build_id,entity_type,external_id,expansion_id,classification,
    evidence_kind,evidence_build_id,source_artifact_id,evidence)
SELECT build.product_id,raw.build_id,
       CASE raw.table_name
           WHEN 'ItemSparse' THEN 'item'
           WHEN 'Map' THEN 'map'
           WHEN 'TransmogSet' THEN 'transmog_set'
       END,
       raw.row_id,expansion.id,'confirmed','db2',raw.build_id,
       raw.source_artifact_id,
       jsonb_build_object('table_name',raw.table_name,'field','ExpansionID',
                          'value',raw.payload->'ExpansionID','source_url',raw.source_url)
FROM catalog_db2_rows raw
JOIN game_builds build ON build.id=raw.build_id
JOIN game_products product ON product.id=build.product_id AND product.slug='wow'
JOIN catalog_source_artifacts artifact
  ON artifact.id=raw.source_artifact_id
 AND artifact.status='ready'
 AND artifact.content_hash IS NOT NULL
 AND artifact.byte_size IS NOT NULL
JOIN catalog_expansions expansion
  ON expansion.product_id=build.product_id
 AND expansion.external_expansion_id=CASE
     WHEN raw.payload->>'ExpansionID' ~ '^(0|[1-9][0-9]*)$'
     THEN (raw.payload->>'ExpansionID')::int END
WHERE raw.table_name IN ('ItemSparse','Map','TransmogSet')
  AND raw.locale='en_US'
  AND raw.payload->>'ExpansionID' ~ '^(0|[1-9][0-9]*)$'
  AND (raw.payload->>'ExpansionID')::int BETWEEN 0 AND 10
ON CONFLICT (product_id,build_id,entity_type,external_id) DO UPDATE SET
    expansion_id=EXCLUDED.expansion_id,
    classification=EXCLUDED.classification,
    evidence_kind=EXCLUDED.evidence_kind,
    evidence_build_id=EXCLUDED.evidence_build_id,
    source_artifact_id=EXCLUDED.source_artifact_id,
    evidence=EXCLUDED.evidence,
    updated_at=now();

-- Historical item eligibility is intentionally conservative.  A valid name
-- alone is not enough: an item must also have a build-pinned gameplay signal
-- (appearance, effect, encounter loot, set/crafting/quest link, equippable
-- slot, or a non-zero vendor value).  Missing/technical names never publish.
-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_historical_item_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH target_build AS (
        SELECT id,product_id FROM game_builds WHERE id=target_build_id
    ), historical_items AS (
        SELECT raw.row_id,raw.payload,raw.source_artifact_id
        FROM catalog_db2_rows raw
        JOIN target_build build ON build.id=raw.build_id
        JOIN catalog_source_artifacts artifact
          ON artifact.id=raw.source_artifact_id
         AND artifact.status='ready'
         AND artifact.content_hash IS NOT NULL
         AND artifact.byte_size IS NOT NULL
        WHERE raw.table_name='ItemSparse'
          AND raw.locale='en_US'
          AND raw.payload->>'ExpansionID' ~ '^(0|[1-9][0-9]*)$'
          AND (raw.payload->>'ExpansionID')::int BETWEEN 0 AND 10
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
                  OR item.payload->>'Display_lang' ~* '(^|[ _:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([ _:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
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
                'source_table','ItemSparse',
                'expansion_id',(item.payload->>'ExpansionID')::int,
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
        FROM historical_items item
        JOIN target_build build ON true
        LEFT JOIN appearances ON appearances.item_id=item.row_id
        LEFT JOIN effects ON effects.item_id=item.row_id
        LEFT JOIN encounter_loot ON encounter_loot.item_id=item.row_id
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at)
    SELECT product_id,target_build_id,'item',external_id,decision,
        CASE decision
            WHEN 'excluded' THEN CASE WHEN NULLIF(BTRIM(evidence->>'name'),'') IS NULL
                THEN 'missing_display_name' ELSE 'technical_or_placeholder_marker' END
            WHEN 'eligible' THEN 'gameplay_signal_present'
            ELSE 'insufficient_gameplay_evidence'
        END,
        source_artifact_id,evidence,'historical-item-usability-v1',now()
    FROM classified
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=now();

    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- Seed active retail and every already imported retail build.  The function
-- is idempotent and does not touch Midnight rows (ExpansionID 11).
DO $$
DECLARE build_record RECORD;
BEGIN
    FOR build_record IN
        SELECT DISTINCT raw.build_id
        FROM catalog_db2_rows raw
        JOIN game_builds build ON build.id=raw.build_id
        JOIN game_products product ON product.id=build.product_id AND product.slug='wow'
        WHERE raw.table_name='ItemSparse' AND raw.locale='en_US'
          AND raw.payload->>'ExpansionID' ~ '^(0|[1-9][0-9]*)$'
          AND (raw.payload->>'ExpansionID')::int BETWEEN 0 AND 10
    LOOP
        PERFORM catalog_refresh_historical_item_usability(build_record.build_id);
    END LOOP;
END;
$$;

-- +goose Down
DROP FUNCTION IF EXISTS catalog_refresh_historical_item_usability(BIGINT);
DELETE FROM catalog_entity_usability WHERE rule_version='historical-item-usability-v1';
DELETE FROM catalog_entity_expansions cohort
USING catalog_expansions expansion
WHERE cohort.expansion_id=expansion.id
  AND expansion.expansion_key IN ('classic','the_burning_crusade','wrath_of_the_lich_king',
      'cataclysm','mists_of_pandaria','warlords_of_draenor','legion',
      'battle_for_azeroth','shadowlands','dragonflight','the_war_within');
DELETE FROM catalog_expansions WHERE expansion_key IN ('classic','the_burning_crusade',
    'wrath_of_the_lich_king','cataclysm','mists_of_pandaria','warlords_of_draenor',
    'legion','battle_for_azeroth','shadowlands','dragonflight','the_war_within');
ALTER TABLE catalog_expansions
    DROP CONSTRAINT IF EXISTS catalog_expansions_external_expansion_id_check;
ALTER TABLE catalog_expansions
    ADD CONSTRAINT catalog_expansions_external_expansion_id_check
    CHECK (external_expansion_id IS NULL OR external_expansion_id > 0);
