# The Voidspire planner — material redesign

The Voidspire planner now uses a dedicated set of substantial, hand-painted Warcraft materials with readable HTML labels. Pull choices have numbered seals; map backgrounds use illustrated plates; selectors, zoom tools, navigation, commands, creature fallbacks and the boss link share the same sculpted Voidspire metal and crystal vocabulary.

## Art and construction

- Eleven selected original transparent assets, 283,546 delivered bytes. Full prompts are in [PROMPTS.md](PROMPTS.md); native images and reproducible packing/proofs remain in `/home/debian/gildra-voidspire-materials-20261026/`.
- Whole pull/mode cards retain their original aspect ratio. Plaques and map/briefing panels use measured nine-slice geometry. Icon glyphs grow with the card; labels stay inside measured quiet faces. Native alpha, source/delivery hashes, cut points and provenance are recorded in `/assets/wow/raids/voidspire-planner/manifest.json` and `SOURCE.md`.
- Hover lifts the physical control and catches its painted edges in light, press depresses it, and selection has a short settling motion. OS/site/UI motion settings, reduced transparency and forced colors provide static/native alternatives. Text, numbers, state, links and accessible labels remain HTML.

## Scope and behavior

Scoped to `the-voidspire`. All seven pull choices, role filters, four backgrounds, floors, arenas, progression, zoom, sketch persistence, undo/clear and keyboard navigation retain their data/state contracts. Other raids retain their previous rendering. Existing route research and draft caveats remain; maps, combat spells and NPC portraits were not generated. Verified creature media bindings were unavailable for the trash list, so the new fallback crest is decorative and does not claim to depict a creature.

Latest source baseline: published library/3D revision `55e67d829929e7243aae61bbf557466aca31742b`, already containing raid atlas, Frost login/hover and CMS removal. Deployment must preserve the current full published web source and live nginx gzip/cache settings.

## Validation evidence

Final build, browser checks, source manifest, publication state and rollback are recorded in `/home/debian/gildra-voidspire-materials-20261026/REPORT.md`. This repository report documents the implementation and art; the external release report records the immutable built revision and actual runtime verification.
