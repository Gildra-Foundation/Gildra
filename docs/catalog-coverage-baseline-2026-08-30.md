# Catalog coverage baseline — 2026-08-30

This is a measured baseline of the last published read model, not a claim that
the catalog is semantically complete. Run 4 (`6a22b1ae-bb0e-42aa-9239-1a7028576e29`)
is still a candidate and is not included in these published counts.

## Published products

| Product | Published entities | What is present | Blocking gaps |
| --- | ---: | --- | --- |
| Retail (`wow`) | 733,283 | Named item/spell rows, spell effects, item variants/effects, recipes, acquisition facts, NPC roles/locations, quest rewards, source provenance | Item/quest tooltips absent; descriptions are sparse; unresolved spell template tokens; media does not cover every icon |
| Classic | 225,762 | Named item/spell foundation, high icon coverage, item acquisition and recipe IO | Quest names/descriptions/tooltips, entity links, spell effects, NPC roles/locations, loot and quest rewards are absent |
| Classic Era | 64,380 | Named item/spell foundation, icons, recipe IO, variants/effects | Quest and NPC graph is absent; no creature images, loot, acquisition or quest rewards |
| Hardcore | 64,380 | Same scale as Era and independent product identity | Requires its own source-backed snapshot and the same missing quest/NPC/loot graph work; it must not be treated as a copy of Era |

## Field coverage that currently matters

Retail has approximately 413,962 spells and 175,164 items in the published
directory. Spell names and item names are present in both requested locales,
but descriptions are only present for 193,124 spells (46.7%) and 34,143 items
(19.5%). Quest names exist for 6,655 of 66,902 retail quests and descriptions
for 440 (0.66%). These empty fields are not silently converted into a valid
description: the API must expose `missing`, `not_applicable` or `unresolved`.

The current retail icon projection covers 408,603 spells (98.7%) and 121,821
items (69.5%). The media registry contains 120,977 observations, of which
119,528 are cached, 1,426 remain remote and 23 failed. A decorative dataset
symbol is never counted as a source-backed image.

The published relationship layer is useful but incomplete: 107,473 entity
links, 12,892 NPC role rows, 27,300 locations, 4,927 loot entries, 33,656
acquisition rows, 391,290 item variants, 59,758 item/variant effects, 629,284
spell effects, 8,423 recipe outputs, 25,684 reagents and 40,750 quest rewards
were measured for retail. The denominator for each relation must be added to
the quality report before a product can claim full graph coverage.

The published raw localization audit currently finds 113,659 English and
113,965 Russian rows containing a client template token such as `$s`, `$d` or
`$@spelldesc` (the broad detector also includes token-bearing non-spell rows).
They remain source text with an explicit unresolved state; the renderer must
not label them as resolved descriptions. The post-resolver count must be
reported separately before a complete badge is allowed.

## Release interpretation

The current database is a reliable versioned DB2 foundation with provenance,
not yet a complete Warcraft reference library. A production release may expose
the measured foundation in the private owner-approved panel, but the “complete”
badge remains blocked until the following are measured and pass for every
product:

1. type-specific description and tooltip coverage with zero unclassified raw
   template tokens;
2. required icon/media coverage with failed and remote observations explicitly
   reported;
3. NPC roles, locations and proved `NPC → loot → item` resolution;
4. quest objectives/chains and all reward kinds;
5. item variants/effects, recipes and reagent links;
6. independent Classic, Era and Hardcore snapshots with applicable-empty
   datasets explicitly classified;
7. API detail smoke tests for item, spell, quest, NPC and recipe in both
   locales, including provenance and media state;
8. a verified same-server backup and restore for the exact candidate schema.

If a later import fails, these published pointers remain unchanged and this
baseline remains the comparison point for the next candidate.
