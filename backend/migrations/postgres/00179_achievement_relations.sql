-- +goose Up
INSERT INTO catalog_relation_types(relation_type,allowed_source_types,allowed_target_types,attribute_schema) VALUES
('achievement_criteria',ARRAY['achievement'],ARRAY['achievement','quest','creature','item','spell','currency','faction','area','map','profession','class'],'{"type":"object"}'),
('achievement_reward',ARRAY['achievement'],ARRAY['item','mount','spell','title'],'{"type":"object"}'),
('achievement_supersedes',ARRAY['achievement'],ARRAY['achievement'],'{"type":"object"}')
ON CONFLICT(relation_type) DO NOTHING;
INSERT INTO catalog_relation_type_localizations(relation_type,locale,name,description) VALUES
('achievement_criteria','en_US','Criteria','Required by the achievement'),
('achievement_criteria','ru_RU','Критерии','Требуется для достижения'),
('achievement_reward','en_US','Rewards','Awarded by the achievement'),
('achievement_reward','ru_RU','Награды','Награда за достижение'),
('achievement_supersedes','en_US','Previous achievement','Earlier step in the achievement chain'),
('achievement_supersedes','ru_RU','Предыдущее достижение','Предыдущий этап цепочки достижений')
ON CONFLICT(relation_type,locale) DO NOTHING;

-- +goose Down
DELETE FROM game_entity_links WHERE relation_type IN ('achievement_criteria','achievement_reward','achievement_supersedes');
DELETE FROM catalog_relation_types WHERE relation_type IN ('achievement_criteria','achievement_reward','achievement_supersedes');
