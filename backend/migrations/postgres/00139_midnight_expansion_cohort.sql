-- +goose Up
-- Expansion membership is a fact with provenance, not a name/ID heuristic.
-- A mapping is pinned to the build in which the fact was observed and keeps
-- the exact DB2/curated evidence artifact used to make the decision.
CREATE TABLE catalog_expansions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    expansion_key TEXT NOT NULL CHECK (expansion_key ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_expansion_id INTEGER CHECK (external_expansion_id IS NULL OR external_expansion_id > 0),
    name_en TEXT NOT NULL CHECK (btrim(name_en) <> ''),
    name_ru TEXT NOT NULL CHECK (btrim(name_ru) <> ''),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, expansion_key),
    UNIQUE (product_id, external_expansion_id)
);

CREATE TABLE catalog_entity_expansions (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    expansion_id BIGINT REFERENCES catalog_expansions(id) ON DELETE RESTRICT,
    classification TEXT NOT NULL CHECK (classification IN ('confirmed', 'unclassified', 'excluded')),
    evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('db2', 'curated')),
    evidence_build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE RESTRICT,
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, build_id, entity_type, external_id),
    CHECK ((classification = 'confirmed' AND expansion_id IS NOT NULL AND source_artifact_id IS NOT NULL)
        OR (classification <> 'confirmed' AND expansion_id IS NULL)),
    CHECK (evidence_build_id IS NOT NULL)
);

CREATE INDEX catalog_entity_expansions_cohort_idx
    ON catalog_entity_expansions (product_id, expansion_id, build_id, entity_type, external_id)
    WHERE classification = 'confirmed';
CREATE INDEX catalog_entity_expansions_review_idx
    ON catalog_entity_expansions (product_id, build_id, classification, entity_type, external_id);

COMMENT ON TABLE catalog_expansions IS
    'Product-specific expansion registry. external_expansion_id is a source field, not an inferred membership rule.';
COMMENT ON TABLE catalog_entity_expansions IS
    'Build-versioned entity expansion facts with DB2/curated provenance. Unclassified rows are explicit review work.';

INSERT INTO catalog_expansions(product_id, expansion_key, external_expansion_id, name_en, name_ru, attributes)
SELECT id, 'midnight', 11, 'Midnight', 'Midnight',
       jsonb_build_object('source_field', 'ExpansionID', 'source_tables', jsonb_build_array('ItemSparse', 'Map', 'TransmogSet'))
FROM game_products
WHERE slug = 'wow'
ON CONFLICT (product_id, expansion_key) DO UPDATE SET
    external_expansion_id = EXCLUDED.external_expansion_id,
    name_en = EXCLUDED.name_en,
    name_ru = EXCLUDED.name_ru,
    attributes = EXCLUDED.attributes,
    updated_at = now();

-- Existing DB2 rows are the authoritative automatic seed. A missing artifact
-- is deliberately left unclassified rather than silently treated as proof.
INSERT INTO catalog_entity_expansions(
    product_id, build_id, entity_type, external_id, expansion_id,
    classification, evidence_kind, evidence_build_id, source_artifact_id, evidence)
SELECT build.product_id, raw.build_id,
       CASE raw.table_name WHEN 'ItemSparse' THEN 'item' WHEN 'Map' THEN 'map'
            WHEN 'TransmogSet' THEN 'transmog_set' END,
       raw.row_id,
       CASE WHEN raw.payload->>'ExpansionID' = '11' AND raw.source_artifact_id IS NOT NULL
                  AND expansion.id IS NOT NULL
            THEN expansion.id END,
       CASE WHEN raw.payload->>'ExpansionID' = '11' AND raw.source_artifact_id IS NOT NULL
                  AND expansion.id IS NOT NULL
            THEN 'confirmed' ELSE 'unclassified' END,
       'db2', raw.build_id, raw.source_artifact_id,
       jsonb_build_object('table_name', raw.table_name, 'field', 'ExpansionID',
                          'value', raw.payload->'ExpansionID', 'source_url', raw.source_url)
FROM catalog_db2_rows raw
JOIN game_builds build ON build.id = raw.build_id
LEFT JOIN catalog_expansions expansion
  ON expansion.product_id = build.product_id AND expansion.external_expansion_id = 11
WHERE raw.table_name IN ('ItemSparse', 'Map', 'TransmogSet') AND raw.locale = 'en_US'
ON CONFLICT (product_id, build_id, entity_type, external_id) DO UPDATE SET
    expansion_id = EXCLUDED.expansion_id, classification = EXCLUDED.classification,
    evidence_kind = EXCLUDED.evidence_kind, evidence_build_id = EXCLUDED.evidence_build_id,
    source_artifact_id = EXCLUDED.source_artifact_id, evidence = EXCLUDED.evidence,
    updated_at = now();

-- Keep the denominator explicit for entity types whose expansion is not
-- directly exposed by the current DB2 importer. These rows become confirmed
-- only through a later DB2 or curated evidence insert.
INSERT INTO catalog_entity_expansions(
    product_id, build_id, entity_type, external_id, classification,
    evidence_kind, evidence_build_id, evidence)
SELECT entity.product_id, version.build_id, entity.entity_type, entity.external_id,
       'unclassified', 'curated', version.build_id,
       jsonb_build_object('reason', 'no_expansion_fact_available')
FROM game_entities entity
JOIN game_entity_versions version ON version.id = entity.latest_version_id
WHERE entity.entity_type IN ('quest','spell','creature','achievement','talent','recipe')
  AND entity.deleted_at IS NULL
ON CONFLICT (product_id, build_id, entity_type, external_id) DO NOTHING;

-- DB2 imports already carry source_artifact_id. This trigger makes future
-- ItemSparse/Map/TransmogSet rows participate automatically without a separate
-- import step, while retaining an explicit unclassified state when proof is
-- incomplete.
-- +goose StatementBegin
CREATE FUNCTION catalog_sync_midnight_expansion_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    mapped_type TEXT;
    mapped_expansion BIGINT;
    mapped_classification TEXT;
BEGIN
    mapped_type := CASE NEW.table_name
        WHEN 'ItemSparse' THEN 'item' WHEN 'Map' THEN 'map' WHEN 'TransmogSet' THEN 'transmog_set' END;
    IF mapped_type IS NULL OR NEW.locale <> 'en_US' THEN RETURN NEW; END IF;
    SELECT expansion.id INTO mapped_expansion
    FROM game_builds build JOIN catalog_expansions expansion
      ON expansion.product_id = build.product_id AND expansion.external_expansion_id = 11
    WHERE build.id = NEW.build_id;
    mapped_classification := CASE WHEN NEW.payload->>'ExpansionID' = '11'
                                      AND NEW.source_artifact_id IS NOT NULL
                                      AND mapped_expansion IS NOT NULL
                                  THEN 'confirmed' ELSE 'unclassified' END;
    INSERT INTO catalog_entity_expansions(
        product_id,build_id,entity_type,external_id,expansion_id,classification,
        evidence_kind,evidence_build_id,source_artifact_id,evidence)
    SELECT build.product_id, NEW.build_id, mapped_type, NEW.row_id,
           CASE WHEN mapped_classification = 'confirmed' THEN mapped_expansion END,
           mapped_classification, 'db2', NEW.build_id, NEW.source_artifact_id,
           jsonb_build_object('table_name',NEW.table_name,'field','ExpansionID',
                              'value',NEW.payload->'ExpansionID','source_url',NEW.source_url)
    FROM game_builds build WHERE build.id = NEW.build_id
    ON CONFLICT (product_id,build_id,entity_type,external_id) DO UPDATE SET
        expansion_id=EXCLUDED.expansion_id,classification=EXCLUDED.classification,
        evidence_kind=EXCLUDED.evidence_kind,evidence_build_id=EXCLUDED.evidence_build_id,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,updated_at=now();
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER catalog_db2_rows_midnight_expansion_sync
AFTER INSERT OR UPDATE OF payload, source_artifact_id, source_url ON catalog_db2_rows
FOR EACH ROW EXECUTE FUNCTION catalog_sync_midnight_expansion_row();

-- +goose Down
DROP TRIGGER IF EXISTS catalog_db2_rows_midnight_expansion_sync ON catalog_db2_rows;
DROP FUNCTION IF EXISTS catalog_sync_midnight_expansion_row();
DROP TABLE IF EXISTS catalog_entity_expansions;
DROP TABLE IF EXISTS catalog_expansions;
