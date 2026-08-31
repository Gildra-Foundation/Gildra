-- +goose Up
-- Include context, effect, duration and nested-expression placeholders in the
-- readiness index.  The old predicate in 00113 missed values such as $A1,
-- $ec1, $o1 and $?diff15, allowing unresolved descriptions to look complete.
DROP INDEX IF EXISTS game_entity_localizations_unresolved_template_idx;
CREATE INDEX game_entity_localizations_unresolved_template_idx
    ON game_entity_localizations (version_id)
    WHERE description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])';

-- +goose Down
DROP INDEX IF EXISTS game_entity_localizations_unresolved_template_idx;
CREATE INDEX game_entity_localizations_unresolved_template_idx
    ON game_entity_localizations (version_id)
    WHERE description ~ '\$(?:@spelldesc|[0-9]*d|[0-9]*s[0-9]+|d|s[0-9]+|\{)';
