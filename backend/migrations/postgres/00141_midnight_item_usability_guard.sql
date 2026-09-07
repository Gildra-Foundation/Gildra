-- +goose Up
-- The public read path uses catalog_entity_usability directly so a catalog
-- page does not have to correlate against the entire expansion-facts table.
-- Reserve a non-public decision as soon as a future Midnight ItemSparse row
-- becomes confirmed; db2-import subsequently replaces it with the assessed
-- decision after all related DB2 tables for the build are available.
-- +goose StatementBegin
CREATE FUNCTION catalog_guard_midnight_item_usability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.entity_type <> 'item' OR NEW.classification <> 'confirmed' OR NEW.expansion_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM catalog_expansions expansion
        WHERE expansion.id=NEW.expansion_id AND expansion.expansion_key='midnight'
    ) THEN
        RETURN NEW;
    END IF;

    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at
    ) VALUES (
        NEW.product_id,NEW.build_id,'item',NEW.external_id,'review','awaiting_usability_refresh',
        NEW.source_artifact_id,
        jsonb_build_object('source','catalog_entity_expansions','state','pending_assessment'),
        'midnight-item-usability-guard-v1',now()
    ) ON CONFLICT(product_id,build_id,entity_type,external_id) DO NOTHING;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_entity_expansions_midnight_item_usability_guard
AFTER INSERT OR UPDATE OF expansion_id, classification, source_artifact_id
ON catalog_entity_expansions
FOR EACH ROW EXECUTE FUNCTION catalog_guard_midnight_item_usability();

-- +goose Down
DROP TRIGGER IF EXISTS catalog_entity_expansions_midnight_item_usability_guard ON catalog_entity_expansions;
DROP FUNCTION IF EXISTS catalog_guard_midnight_item_usability();
