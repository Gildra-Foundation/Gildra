-- +goose Up
ALTER TABLE tierlist_entries
    DROP CONSTRAINT tierlist_entries_description_check,
    DROP CONSTRAINT tierlist_entries_description_paragraphs_check,
    ADD CONSTRAINT tierlist_entries_description_check
        CHECK (description = '' OR length(description) >= 100);

-- +goose Down
ALTER TABLE tierlist_entries
    DROP CONSTRAINT tierlist_entries_description_check,
    ADD CONSTRAINT tierlist_entries_description_check
        CHECK (length(description) >= 100),
    ADD CONSTRAINT tierlist_entries_description_paragraphs_check
        CHECK (cardinality(description_paragraphs) > 0);
