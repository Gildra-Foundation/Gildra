-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    existing_unique TEXT;
BEGIN
    SELECT constraint_name INTO existing_unique
    FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='catalog_entity_source_documents'
      AND constraint_type='UNIQUE'
    ORDER BY constraint_name
    LIMIT 1;
    IF existing_unique IS NOT NULL THEN
        EXECUTE format('ALTER TABLE catalog_entity_source_documents DROP CONSTRAINT %I', existing_unique);
    END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE catalog_entity_source_documents
    ADD CONSTRAINT catalog_entity_source_documents_identity_hash_key
        UNIQUE (build_id,entity_type,external_id,source,locale,content_hash),
    ADD CONSTRAINT catalog_entity_source_documents_locale_check
        CHECK (locale ~ '^[a-z]{2}_[A-Z]{2}$'),
    ADD CONSTRAINT catalog_entity_source_documents_payload_check
        CHECK (jsonb_typeof(payload)='object'),
    ADD CONSTRAINT catalog_entity_source_documents_hash_check
        CHECK (octet_length(content_hash)=32),
    ADD CONSTRAINT catalog_entity_source_documents_url_check
        CHECK (btrim(source_url)<>'');

CREATE INDEX catalog_entity_source_documents_latest_idx
    ON catalog_entity_source_documents
        (build_id,entity_type,external_id,source,locale,imported_at DESC);

-- +goose Down
DROP INDEX IF EXISTS catalog_entity_source_documents_latest_idx;
ALTER TABLE catalog_entity_source_documents
    DROP CONSTRAINT IF EXISTS catalog_entity_source_documents_url_check,
    DROP CONSTRAINT IF EXISTS catalog_entity_source_documents_hash_check,
    DROP CONSTRAINT IF EXISTS catalog_entity_source_documents_payload_check,
    DROP CONSTRAINT IF EXISTS catalog_entity_source_documents_locale_check,
    DROP CONSTRAINT IF EXISTS catalog_entity_source_documents_identity_hash_key;
ALTER TABLE catalog_entity_source_documents
    ADD CONSTRAINT catalog_entity_source_documents_identity_key
        UNIQUE (build_id,entity_type,external_id,source,locale);
