-- +goose Up
ALTER TABLE genshin_characters
    DROP CONSTRAINT genshin_characters_element_check;

ALTER TABLE genshin_characters
    ADD CONSTRAINT genshin_characters_element_check
    CHECK (element IN ('none', 'anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro', 'cryo'));

-- +goose Down
ALTER TABLE genshin_characters
    DROP CONSTRAINT genshin_characters_element_check;

ALTER TABLE genshin_characters
    ADD CONSTRAINT genshin_characters_element_check
    CHECK (element IN ('anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro', 'cryo'));
