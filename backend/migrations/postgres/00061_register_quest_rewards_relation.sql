-- +goose Up
INSERT INTO catalog_relation_types(
    relation_type,inverse_relation_type,allowed_source_types,allowed_target_types,attribute_schema
) VALUES (
    'rewards','obtained_from',ARRAY['quest'],ARRAY['item','currency','spell','faction','title'],
    '{"type":"object","properties":{"reward_type":{"type":"string"},"reward_index":{"type":"integer"},"amount":{"type":"number"},"is_choice":{"type":"boolean"},"source":{"type":"string"}}}'::jsonb
)
ON CONFLICT(relation_type) DO UPDATE SET
    inverse_relation_type=EXCLUDED.inverse_relation_type,
    allowed_source_types=EXCLUDED.allowed_source_types,
    allowed_target_types=EXCLUDED.allowed_target_types,
    attribute_schema=EXCLUDED.attribute_schema,
    updated_at=now();

INSERT INTO catalog_relation_type_localizations(relation_type,locale,name,description) VALUES
('rewards','en_US','Rewards','Awards the target entity as a quest reward'),
('rewards','ru_RU','Награждает','Выдаёт целевую сущность в награду за задание')
ON CONFLICT(relation_type,locale) DO UPDATE SET
    name=EXCLUDED.name,description=EXCLUDED.description;

-- +goose Down
DELETE FROM game_entity_links WHERE relation_type='rewards';
DELETE FROM catalog_relation_types WHERE relation_type='rewards';
