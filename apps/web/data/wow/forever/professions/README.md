# Forever profession snapshot

Current client: **1.60.1.70862**, extracted 2026-11-09T10:55Z. Classic Era **1.15.9.69722** is comparison provenance only; this module never reads Retail profession recipes, prices or Knowledge.

`import.py` reproducibly normalizes the twelve `https://foreverdb.net/data/professions/{slug}.json` sources against their current item/spell indexes and exact-ID Russian search index. Invocation is in its docstring. SHA-256 and per-profession totals, exclusions, relations, localization and suppressed fields are in `evidence.json`. Inputs are archived at `/tmp/forever-platform-20261111/{DATA,GUIDES}/sources` on the task host.

Admission rules:

- Exclude `spec` rows (SoD, duplicates and other speculative labels), missing current spells, absent/speculative reagent or output items, learning skill over 300 and required character level over 60.
- Exclude speculative acquisition-item relations independently; a valid current crafting spell can remain without a known acquisition method.
- Suppress `reqC` (Classic-only minimum learning skill), all inherited trainer prices and unobserved trainer associations. Use `src.fv` for recipe trainers and `trainer.fv` for the profession list. Coordinates/zone require `at: forever`; no inherited Classic location is rendered.
- `req` = minimum learning skill, `y` = yellow threshold, `g` = grey threshold. Never substitute camping-item use skill for learning skill. No inferred four-colour difficulty bar: the source does not supply all boundaries.
- `make` count is an average where `mkR` exists; display the actual range. Recipe reagents scale by number of crafts, never by a guessed output count.
- Native Russian names are joined by item/spell ID. Missing native translations retain English names. Interface text is localized independently.

Measured result after speculative reagent filtering: **2493 source rows → 2190 admitted, 303 excluded**. DATA and GUIDES contain the same 2190 unique recipe IDs (zero differences). The raw source has 2493 profession rows but 2492 unique IDs; repeated ID 461692 is excluded. All twelve source files are byte-identical between tracks. This is an availability-filtered client catalogue, not proof every craft is obtainable in the present phase. Unknown acquisition stays absent; raid-material recipes are not advertised as currently obtainable.

Additional corroboration and authored short copy:

- [Blizzard: camping and the twelve professions](https://worldofwarcraft.blizzard.com/en-us/news/24301516/gather-around-the-campfire-in-world-of-warcraft-forever).
- [Wowhead: profession overview](https://www.wowhead.com/forever/guide/professions/overview), [camping](https://www.wowhead.com/forever/guide/camping-overview-unlock-rewards).
- [Engineering specializations](https://www.wowhead.com/forever/guide/professions/engineering-overview-trainer-locations-recipes), [Blacksmithing specializations](https://www.wowhead.com/forever/guide/professions/blacksmithing/overview), [Leatherworking specializations](https://www.wowhead.com/forever/guide/professions/leatherworking-overview-trainer-locations-recipes).

No guide prose or third-party restricted bulk dataset is imported. The description of each profession is original. No live auction cost/profit, automatic cheapest leveling path, weekly Knowledge, reagent-quality ranks or missing acquisition facts are manufactured.
