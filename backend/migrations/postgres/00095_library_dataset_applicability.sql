-- +goose Up
-- Applicability is an operator-reviewed product fact. It prevents an intended
-- empty dataset from looking like a broken import, while keeping a source gap
-- visibly different from a game system that does not exist for that product.
CREATE TABLE catalog_library_dataset_applicability (
    dataset_slug TEXT NOT NULL REFERENCES catalog_library_dataset_definitions(slug) ON DELETE CASCADE,
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('applicable','pending_source','not_applicable')),
    reason_en TEXT NOT NULL DEFAULT '',
    reason_ru TEXT NOT NULL DEFAULT '',
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_slug,product_id),
    CHECK ((status='applicable') OR (btrim(reason_en)<>'' AND btrim(reason_ru)<>''))
);

INSERT INTO catalog_library_dataset_applicability(dataset_slug,product_id,status)
SELECT definition.slug,product.id,'applicable'
FROM catalog_library_dataset_definitions definition
CROSS JOIN game_products product;

UPDATE catalog_library_dataset_applicability applicability
SET status='pending_source',
    reason_en='The game system is applicable, but no publishable source-backed records are loaded yet.',
    reason_ru='Раздел применим к этой версии игры, но подтверждённые источником записи ещё не загружены.'
FROM game_products product
WHERE product.id=applicability.product_id AND (
    (product.slug='wow_classic' AND applicability.dataset_slug='reagents') OR
    (product.slug IN ('wow_classic_era','wow_classic_hardcore') AND applicability.dataset_slug IN (
        'gems','item-enhancements','specializations','instances','encounters','currencies','mounts'
    ))
);

UPDATE catalog_library_dataset_applicability applicability
SET status='not_applicable',
    reason_en=CASE
        WHEN applicability.dataset_slug='pvp-talents' THEN 'This product does not use the modern PvP talent system.'
        WHEN applicability.dataset_slug='battle-pets' THEN 'This product does not use the battle-pet combat and collection system.'
        WHEN applicability.dataset_slug='toys' THEN 'This product does not use the account-wide toy collection system.'
        ELSE 'This product does not use the transmog-set collection system.'
    END,
    reason_ru=CASE
        WHEN applicability.dataset_slug='pvp-talents' THEN 'В этой версии игры нет современной системы PvP-талантов.'
        WHEN applicability.dataset_slug='battle-pets' THEN 'В этой версии игры нет системы боевых питомцев и их коллекции.'
        WHEN applicability.dataset_slug='toys' THEN 'В этой версии игры нет общей коллекции игрушек.'
        ELSE 'В этой версии игры нет системы коллекций комплектов трансмогрификации.'
    END
FROM game_products product
WHERE product.id=applicability.product_id AND (
    (product.slug IN ('wow_classic','wow_classic_era','wow_classic_hardcore')
        AND applicability.dataset_slug='pvp-talents') OR
    (product.slug IN ('wow_classic_era','wow_classic_hardcore')
        AND applicability.dataset_slug IN ('battle-pets','toys','transmog-sets'))
);

-- +goose Down
DROP TABLE IF EXISTS catalog_library_dataset_applicability;
