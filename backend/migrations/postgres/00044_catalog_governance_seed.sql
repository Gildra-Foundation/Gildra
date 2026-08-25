-- +goose Up
INSERT INTO catalog_source_policies(
    source,display_name,homepage_url,terms_url,license_identifier,
    commercial_use_status,public_api_status,asset_caching_status,retention_days,
    attribution_required,attribution_text,reviewed_at,review_status,notes
) VALUES
('blizzard_api','Blizzard Game Data API','https://community.developer.battle.net/','https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use','LicenseRef-Blizzard-Developer-API','restricted','restricted','restricted',30,true,'World of Warcraft and Blizzard Entertainment',now(),'reviewed','The current API terms restrict charging for applications whose features use the API. Commercial launch requires counsel and a product-specific review.'),
('wago_tools','Wago.Tools','https://wago.tools/','https://wago.tools/','NOASSERTION','permission_required','permission_required','permission_required',NULL,true,'Wago.Tools',NULL,'pending','No commercial redistribution permission is asserted by this registry.'),
('raidbots','Raidbots static data','https://www.raidbots.com/developers','https://www.raidbots.com/developers','NOASSERTION','permission_required','permission_required','restricted',NULL,true,'Raidbots / SimulationCraft',NULL,'pending','Developer documentation permits fetching static files and requests local caching; commercial redistribution still needs explicit review.'),
('wow_listfile','wow-listfile','https://github.com/wowdev/wow-listfile','','NOASSERTION','permission_required','permission_required','permission_required',NULL,true,'wowdev/wow-listfile',now(),'reviewed','No repository-level license was present at review time. Verified and community filenames have different stability; redistribution requires a separate rights review.'),
('wow_export','wow.export','https://github.com/Kruithne/wow.export','https://github.com/Kruithne/wow.export/blob/master/LICENSE','MIT','allowed','allowed','allowed',NULL,true,'Kruithne/wow.export',now(),'reviewed','Software license does not grant rights to redistribute extracted game content.'),
('wowhead_tooltip','Wowhead tooltip verification','https://www.wowhead.com/','https://www.zam.com/terms','NOASSERTION','permission_required','prohibited','permission_required',NULL,true,'Wowhead',NULL,'blocked','Public API redistribution is blocked until written permission and a current legal review exist.')
ON CONFLICT (source) DO NOTHING;

INSERT INTO catalog_relation_types(relation_type,inverse_relation_type,allowed_source_types,allowed_target_types,attribute_schema) VALUES
('belongs_to',NULL,'{}','{}','{}'),
('creates','obtained_from',ARRAY['recipe','profession','spell'],ARRAY['item'],'{"type":"object"}'),
('grants','obtained_from',ARRAY['talent','pvp_talent','quest','item'],ARRAY['spell','item','currency'],'{"type":"object"}'),
('mentions',NULL,'{}','{}','{"type":"object","properties":{"locale":{"type":"string"},"text":{"type":"string"}}}'),
('obtained_from',NULL,ARRAY['item','spell','currency','mount','toy','battle_pet'],ARRAY['encounter','creature','quest','recipe','profession'],'{"type":"object"}'),
('owned_by',NULL,ARRAY['spell','talent','pvp_talent'],ARRAY['class','specialization'],'{"type":"object"}'),
('replaces',NULL,ARRAY['spell','talent'],ARRAY['spell'],'{"type":"object"}'),
('teaches','grants',ARRAY['profession','recipe','item','spell'],ARRAY['recipe','spell','profession'],'{"type":"object"}'),
('uses_reagent',NULL,ARRAY['recipe','spell'],ARRAY['item','currency'],'{"type":"object","properties":{"quantity":{"type":"number"}}}')
ON CONFLICT (relation_type) DO NOTHING;

-- Preserve any relationship imported before the registry existed. New names
-- remain visible for review instead of being silently discarded.
INSERT INTO catalog_relation_types(relation_type,is_public,attribute_schema)
SELECT DISTINCT relation_type,true,'{}'::jsonb FROM game_entity_links
ON CONFLICT (relation_type) DO NOTHING;

INSERT INTO catalog_relation_type_localizations(relation_type,locale,name,description) VALUES
('belongs_to','en_US','Belongs to','Hierarchical membership'),('belongs_to','ru_RU','Относится к','Иерархическая принадлежность'),
('creates','en_US','Creates','Produces the target entity'),('creates','ru_RU','Создаёт','Создаёт целевую сущность'),
('grants','en_US','Grants','Unlocks or awards the target'),('grants','ru_RU','Даёт','Открывает или выдаёт цель'),
('mentions','en_US','Mentions','References the target in verified text'),('mentions','ru_RU','Упоминает','Ссылается на цель в проверенном тексте'),
('obtained_from','en_US','Obtained from','Verified acquisition source'),('obtained_from','ru_RU','Добывается из','Проверенный источник получения'),
('owned_by','en_US','Owned by','Class or specialization ownership'),('owned_by','ru_RU','Принадлежит','Принадлежность классу или специализации'),
('replaces','en_US','Replaces','Replaces another ability'),('replaces','ru_RU','Заменяет','Заменяет другую способность'),
('teaches','en_US','Teaches','Teaches a recipe or ability'),('teaches','ru_RU','Обучает','Обучает рецепту или способности'),
('uses_reagent','en_US','Uses reagent','Consumes a crafting reagent'),('uses_reagent','ru_RU','Использует реагент','Расходует ремесленный реагент')
ON CONFLICT (relation_type,locale) DO NOTHING;

WITH entity_types(entity_type,group_key,icon_symbol,sort_order,en_name,ru_name,en_description,ru_description) AS (VALUES
('item','equipment','#ic-bag',10,'Items & equipment','Предметы и экипировка','Weapons, armor, consumables and equipment','Оружие, броня, расходники и экипировка'),
('gem','equipment','#ic-gem',20,'Gems','Камни','Socketable gems','Камни для гнёзд'),
('enchantment','equipment','#ic-spark',30,'Enchantments','Чары','Item enchantments','Чары для предметов'),
('item_set','equipment','#ic-star',40,'Item sets','Комплекты','Equipment sets and bonuses','Комплекты экипировки и бонусы'),
('food','equipment','#ic-bag',50,'Food','Еда','Food consumables','Еда и расходуемые предметы'),
('flask','equipment','#ic-bag',60,'Flasks','Настои','Flasks and long-duration consumables','Настои и длительные усиления'),
('potion','equipment','#ic-bag',70,'Potions','Зелья','Potions and short-duration consumables','Зелья и кратковременные усиления'),
('spell','combat','#ic-spark',100,'Spells','Заклинания','Abilities, auras and effects','Способности, ауры и эффекты'),
('class','combat','#ic-sword',110,'Classes','Классы','Playable classes','Игровые классы'),
('specialization','combat','#ic-sword',120,'Specializations','Специализации','Class specializations','Специализации классов'),
('talent','combat','#ic-sword',130,'Talents','Таланты','Class and specialization talents','Таланты классов и специализаций'),
('pvp_talent','combat','#ic-sword',140,'PvP talents','PvP-таланты','Player-versus-player talents','Таланты для PvP'),
('talent_tree','combat','#ic-sword',150,'Talent trees','Деревья талантов','Class, specialization and hero trees','Деревья классов, специализаций и героических талантов'),
('instance','encounters','#ic-shield',200,'Instances','Подземелья и рейды','Dungeons and raids','Подземелья и рейды'),
('encounter','encounters','#ic-skull',210,'Encounters','Сражения','Boss and journal encounters','Боссы и сражения из журнала'),
('profession','crafting','#ic-hammer',300,'Professions & crafting','Профессии и ремесло','Professions, recipes and crafting systems','Профессии, рецепты и ремесленные системы'),
('recipe','crafting','#ic-scroll',310,'Recipes','Рецепты','Crafting recipes','Ремесленные рецепты'),
('creature','world','#ic-skull',400,'Creatures & NPCs','Существа и NPC','Creatures, vendors, trainers and other NPCs','Существа, торговцы, учителя и другие NPC'),
('quest','world','#ic-scroll',410,'Quests & story','Задания и сюжет','Quests, objectives and rewards','Задания, цели и награды'),
('map','world','#ic-map',420,'Maps','Карты','World and instance maps','Карты мира и подземелий'),
('area','world','#ic-map',430,'Zones','Зоны','World areas and zones','Области и зоны мира'),
('faction','world','#ic-shield',440,'Factions','Фракции','Factions and reputations','Фракции и репутации'),
('currency','collections','#ic-gem',500,'Currencies','Валюты','Account and character currencies','Валюты учётной записи и персонажа'),
('mount','collections','#ic-shield',510,'Mounts','Транспорт','Collectible mounts','Коллекционный транспорт'),
('battle_pet','collections','#ic-star',520,'Battle pets','Боевые питомцы','Collectible battle pets','Коллекционные боевые питомцы'),
('toy','collections','#ic-star',530,'Toys','Игрушки','Collectible toys','Коллекционные игрушки'),
('transmog_set','collections','#ic-star',540,'Transmog sets','Комплекты трансмогрификации','Appearance sets','Комплекты обликов'),
('achievement','collections','#ic-gem',550,'Achievements','Достижения','Achievements, criteria and rewards','Достижения, критерии и награды'),
('season','system','#ic-map',600,'Seasons','Сезоны','Game seasons','Игровые сезоны')
), products AS (SELECT id FROM game_products)
INSERT INTO catalog_entity_type_registry(product_id,entity_type,group_key,icon_symbol,sort_order)
SELECT products.id,entity_types.entity_type,entity_types.group_key,entity_types.icon_symbol,entity_types.sort_order
FROM products CROSS JOIN entity_types
ON CONFLICT (product_id,entity_type) DO UPDATE SET
group_key=EXCLUDED.group_key,icon_symbol=EXCLUDED.icon_symbol,sort_order=EXCLUDED.sort_order,updated_at=now();

WITH entity_types(entity_type,en_name,ru_name,en_description,ru_description) AS (VALUES
('item','Items & equipment','Предметы и экипировка','Weapons, armor, consumables and equipment','Оружие, броня, расходники и экипировка'),
('gem','Gems','Камни','Socketable gems','Камни для гнёзд'),('enchantment','Enchantments','Чары','Item enchantments','Чары для предметов'),
('item_set','Item sets','Комплекты','Equipment sets and bonuses','Комплекты экипировки и бонусы'),('food','Food','Еда','Food consumables','Еда и расходуемые предметы'),
('flask','Flasks','Настои','Flasks and long-duration consumables','Настои и длительные усиления'),('potion','Potions','Зелья','Potions and short-duration consumables','Зелья и кратковременные усиления'),
('spell','Spells','Заклинания','Abilities, auras and effects','Способности, ауры и эффекты'),('class','Classes','Классы','Playable classes','Игровые классы'),
('specialization','Specializations','Специализации','Class specializations','Специализации классов'),('talent','Talents','Таланты','Class and specialization talents','Таланты классов и специализаций'),
('pvp_talent','PvP talents','PvP-таланты','Player-versus-player talents','Таланты для PvP'),('talent_tree','Talent trees','Деревья талантов','Class, specialization and hero trees','Деревья классов, специализаций и героических талантов'),
('instance','Instances','Подземелья и рейды','Dungeons and raids','Подземелья и рейды'),('encounter','Encounters','Сражения','Boss and journal encounters','Боссы и сражения из журнала'),
('profession','Professions & crafting','Профессии и ремесло','Professions, recipes and crafting systems','Профессии, рецепты и ремесленные системы'),('recipe','Recipes','Рецепты','Crafting recipes','Ремесленные рецепты'),
('creature','Creatures & NPCs','Существа и NPC','Creatures, vendors, trainers and other NPCs','Существа, торговцы, учителя и другие NPC'),
('quest','Quests & story','Задания и сюжет','Quests, objectives and rewards','Задания, цели и награды'),('map','Maps','Карты','World and instance maps','Карты мира и подземелий'),
('area','Zones','Зоны','World areas and zones','Области и зоны мира'),('faction','Factions','Фракции','Factions and reputations','Фракции и репутации'),
('currency','Currencies','Валюты','Account and character currencies','Валюты учётной записи и персонажа'),('mount','Mounts','Транспорт','Collectible mounts','Коллекционный транспорт'),
('battle_pet','Battle pets','Боевые питомцы','Collectible battle pets','Коллекционные боевые питомцы'),('toy','Toys','Игрушки','Collectible toys','Коллекционные игрушки'),
('transmog_set','Transmog sets','Комплекты трансмогрификации','Appearance sets','Комплекты обликов'),('achievement','Achievements','Достижения','Achievements, criteria and rewards','Достижения, критерии и награды'),
('season','Seasons','Сезоны','Game seasons','Игровые сезоны')
), products AS (SELECT id FROM game_products), localized AS (
SELECT products.id,entity_types.entity_type,'en_US'::text locale,entity_types.en_name name,entity_types.en_description description FROM products CROSS JOIN entity_types
UNION ALL SELECT products.id,entity_types.entity_type,'ru_RU',entity_types.ru_name,entity_types.ru_description FROM products CROSS JOIN entity_types
)
INSERT INTO catalog_entity_type_localizations(product_id,entity_type,locale,name,description)
SELECT id,entity_type,locale,name,description FROM localized
ON CONFLICT (product_id,entity_type,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO catalog_read_model_state(product_id,status)
SELECT id,'stale' FROM game_products ON CONFLICT (product_id) DO NOTHING;

-- +goose Down
DELETE FROM catalog_relation_type_localizations;
DELETE FROM catalog_relation_types;
DELETE FROM catalog_entity_type_localizations;
DELETE FROM catalog_entity_type_registry;
DELETE FROM catalog_source_policies;
