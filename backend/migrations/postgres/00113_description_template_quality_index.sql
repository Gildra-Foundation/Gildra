-- +goose Up
-- Keep the readiness check bounded without rescanning every localization row.
-- The predicate intentionally matches the classifier in catalogquality/readiness.go.
CREATE INDEX game_entity_localizations_unresolved_template_idx
    ON game_entity_localizations (version_id)
    WHERE description ~ '\$(?:@spelldesc|[0-9]*d|[0-9]*s[0-9]+|d|s[0-9]+|\{)';

-- +goose Down
DROP INDEX IF EXISTS game_entity_localizations_unresolved_template_idx;
