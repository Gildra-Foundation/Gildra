-- +goose Up
INSERT INTO game_products (slug, name)
VALUES
    ('wow', 'World of Warcraft'),
    ('wow_classic', 'World of Warcraft Classic'),
    ('wow_classic_era', 'World of Warcraft Classic Era'),
    ('wow_classic_hardcore', 'World of Warcraft Classic Hardcore')
ON CONFLICT (slug) DO NOTHING;

-- +goose Down
DELETE FROM game_products
WHERE slug IN ('wow', 'wow_classic', 'wow_classic_era', 'wow_classic_hardcore');
