-- +goose Up
-- These six sets have no domain reward entry in the 6.7 genshin-db source.
-- Normal/weekly boss drops are intentionally shown as a single source; the
-- game selects the set piece from the boss reward pool.
INSERT INTO genshin_artifact_acquisition_sources
    (artifact_slug, locale, source_slug, source_kind, name, region, entrance_name, note)
VALUES
    ('gladiatorsfinale', 'en_US', 'world-bosses', 'world_boss', 'Normal and Weekly Bosses', 'All regions', 'Boss reward screens', 'Random artifact drops from normal and weekly bosses.'),
    ('gladiatorsfinale', 'ru_RU', 'world-bosses', 'world_boss', 'Обычные и еженедельные боссы', 'Все регионы', 'Награды за победу над боссами', 'Случайные артефакты выпадают из обычных и еженедельных боссов.'),
    ('gladiatorsfinale', 'en_US', 'artifact-strongbox', 'artifact_strongbox', 'Artifact Strongbox', 'Alchemy Bench', 'Artifact Strongbox conversion', 'Exchange unwanted 5-star artifacts at an Alchemy Bench.'),
    ('gladiatorsfinale', 'ru_RU', 'artifact-strongbox', 'artifact_strongbox', 'Сильнейший артефактор', 'Алхимический верстак', 'Обмен в Сильнейшем артефакторе', 'Обмен ненужных пятизвёздочных артефактов на верстаке алхимии.'),
    ('wandererstroupe', 'en_US', 'world-bosses', 'world_boss', 'Normal and Weekly Bosses', 'All regions', 'Boss reward screens', 'Random artifact drops from normal and weekly bosses.'),
    ('wandererstroupe', 'ru_RU', 'world-bosses', 'world_boss', 'Обычные и еженедельные боссы', 'Все регионы', 'Награды за победу над боссами', 'Случайные артефакты выпадают из обычных и еженедельных боссов.'),
    ('wandererstroupe', 'en_US', 'artifact-strongbox', 'artifact_strongbox', 'Artifact Strongbox', 'Alchemy Bench', 'Artifact Strongbox conversion', 'Exchange unwanted 5-star artifacts at an Alchemy Bench.'),
    ('wandererstroupe', 'ru_RU', 'artifact-strongbox', 'artifact_strongbox', 'Сильнейший артефактор', 'Алхимический верстак', 'Обмен в Сильнейшем артефакторе', 'Обмен ненужных пятизвёздочных артефактов на верстаке алхимии.'),
    ('prayersfordestiny', 'en_US', 'world-bosses', 'world_boss', 'Normal and Weekly Bosses', 'All regions', 'Boss reward screens', 'One-piece Prayer set drops from normal and weekly bosses.'),
    ('prayersfordestiny', 'ru_RU', 'world-bosses', 'world_boss', 'Обычные и еженедельные боссы', 'Все регионы', 'Награды за победу над боссами', 'Одночастный набор молитвы выпадает из обычных и еженедельных боссов.'),
    ('prayersforillumination', 'en_US', 'world-bosses', 'world_boss', 'Normal and Weekly Bosses', 'All regions', 'Boss reward screens', 'One-piece Prayer set drops from normal and weekly bosses.'),
    ('prayersforillumination', 'ru_RU', 'world-bosses', 'world_boss', 'Обычные и еженедельные боссы', 'Все регионы', 'Награды за победу над боссами', 'Одночастный набор молитвы выпадает из обычных и еженедельных боссов.'),
    ('prayersforwisdom', 'en_US', 'world-bosses', 'world_boss', 'Normal and Weekly Bosses', 'All regions', 'Boss reward screens', 'One-piece Prayer set drops from normal and weekly bosses.'),
    ('prayersforwisdom', 'ru_RU', 'world-bosses', 'world_boss', 'Обычные и еженедельные боссы', 'Все регионы', 'Награды за победу над боссами', 'Одночастный набор молитвы выпадает из обычных и еженедельных боссов.'),
    ('prayerstospringtime', 'en_US', 'world-bosses', 'world_boss', 'Normal and Weekly Bosses', 'All regions', 'Boss reward screens', 'One-piece Prayer set drops from normal and weekly bosses.'),
    ('prayerstospringtime', 'ru_RU', 'world-bosses', 'world_boss', 'Обычные и еженедельные боссы', 'Все регионы', 'Награды за победу над боссами', 'Одночастный набор молитвы выпадает из обычных и еженедельных боссов.');

-- +goose Down
DELETE FROM genshin_artifact_acquisition_sources
WHERE artifact_slug IN ('gladiatorsfinale', 'wandererstroupe', 'prayersfordestiny',
                        'prayersforillumination', 'prayersforwisdom', 'prayerstospringtime');
