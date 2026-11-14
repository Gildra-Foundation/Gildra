-- +goose Up
-- Map 0 is Eastern Kingdoms. Retain this real client row for geographic
-- joins, while the entity/cohort registry still requires positive IDs.
-- No existing entity, cohort decision or published pointer is rewritten.
DROP TRIGGER catalog_db2_rows_midnight_expansion_sync ON catalog_db2_rows;
CREATE TRIGGER catalog_db2_rows_midnight_expansion_sync
AFTER INSERT OR UPDATE OF payload, source_artifact_id, source_url ON catalog_db2_rows
FOR EACH ROW WHEN (NOT (NEW.table_name='Map' AND NEW.row_id=0))
EXECUTE FUNCTION catalog_sync_midnight_expansion_row();

-- +goose Down
DROP TRIGGER catalog_db2_rows_midnight_expansion_sync ON catalog_db2_rows;
CREATE TRIGGER catalog_db2_rows_midnight_expansion_sync
AFTER INSERT OR UPDATE OF payload, source_artifact_id, source_url ON catalog_db2_rows
FOR EACH ROW EXECUTE FUNCTION catalog_sync_midnight_expansion_row();
