-- +goose Up
ALTER TABLE tierlist_entries
    DROP CONSTRAINT tierlist_entries_tier_check,
    ADD CONSTRAINT tierlist_entries_tier_check CHECK (tier ~ '^[A-FS][+]?$');

-- +goose Down
ALTER TABLE tierlist_entries
    DROP CONSTRAINT tierlist_entries_tier_check,
    ADD CONSTRAINT tierlist_entries_tier_check CHECK (tier ~ '^[A-F][+]?$');
