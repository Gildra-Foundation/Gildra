-- +goose Up
INSERT INTO catalog_relation_types(
    relation_type, inverse_relation_type, allowed_source_types, allowed_target_types, attribute_schema
) VALUES (
    'modifies', NULL, ARRAY['talent','pvp_talent'], ARRAY['spell'],
    '{"type":"object","properties":{"definition_id":{"type":"integer"},"operation":{"type":"string"},"effect_points":{"type":"array"}}}'::jsonb
)
ON CONFLICT(relation_type) DO UPDATE SET
    allowed_source_types=EXCLUDED.allowed_source_types,
    allowed_target_types=EXCLUDED.allowed_target_types,
    attribute_schema=EXCLUDED.attribute_schema,
    updated_at=now();

INSERT INTO catalog_relation_type_localizations(relation_type,locale,name,description) VALUES
('modifies','en_US','Modifies','Changes the target spell or one of its calculated effects'),
('modifies','ru_RU','Изменяет','Изменяет целевое заклинание или один из его рассчитываемых эффектов')
ON CONFLICT(relation_type,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

-- +goose Down
DELETE FROM game_entity_links WHERE relation_type='modifies';
DELETE FROM catalog_relation_types WHERE relation_type='modifies';
