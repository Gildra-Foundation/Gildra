# Enhancement data re-check — 2026-11-13

The earlier audit was incomplete: lack of locally accessible DB2 files does **not** mean that all rules are unavailable. The exact SimulationCraft revision pinned by `infra/simc/Dockerfile` is publicly accessible and includes real generated rule tables. This check fetched those files read-only at revision `18428cd3902412abc8ee274d19567d603e674e66`; no import, service, database or production mutation occurred.

## Newly confirmed evidence

- [Native item schema](https://raw.githubusercontent.com/simulationcraft/simc/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/item_data.hpp) contains three socket colors, socket bonus, gem properties, required profession/rank and crafting quality. `item.parsed.data` is already available where the project native report patch emits variant metadata. Exporting resolved socket colors and socket bonus there is feasible; a new socket service is unnecessary.
- [Native permanent enchant table](https://raw.githubusercontent.com/simulationcraft/simc/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/generated/permanent_enchant.inc) gives enchant IDs, ranks and equipment class/inventory/subclass masks. It is build `12.1.0.69587`, not an assumed latest build.
- Concrete examples: enchant 7961 (rank 2, helm) has inventory mask `0x2`; enchant 7973 (rank 2, shoulders) has mask `0x8`; enchant 7967 is a ring enchant with mask `0x800`. Helm/shoulder masks are armor class 4 and armor subclass mask `0x1f`.
- [Native enchant schema](https://raw.githubusercontent.com/simulationcraft/simc/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/spell_item_enchantment.hpp) includes minimum/maximum item level and required profession/rank. The generated records for 7961 and 7967 have minimum item level 120, no maximum, no profession requirement, and **zero reverse spell ID**. Consequently the reverse field does not establish a consumable mapping for these enchants.
- [Native item data](https://raw.githubusercontent.com/simulationcraft/simc/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/generated/item_data.inc) maps gem item 240967 to GemProperties 4408. [Gem properties](https://raw.githubusercontent.com/simulationcraft/simc/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/generated/gem_data.inc) map 4408 to enchant 8556 and color mask `0x0e`. This is a verified ID chain for a gem, unlike the earlier report's profile-only example.
- The native item schema does not carry ItemLimitCategory. A flag for individually unique-equipped items does not prove absence of a shared category restriction. Do not certify arbitrary gem combinations using this table alone.
- Local `apps/web/data/wow/professions/enchanting.json` and `jewelcrafting.json` provide real bounded candidate IDs and recipe spell IDs. Example: recipe 52967, spell 1236086, output item 244010. However the stored enchant recipe has no ranked output list, while the native table has two different Thalassian Haste enchant IDs (8020/8021). Naming or adjacent item IDs cannot establish which purchasable quality corresponds to which enchant.

## Concrete implementation fix

`gearSimulation.ts` previously rejected **all** HEAD and SHOULDER enchant customization even though the project's pinned worker supports those slots. Its broad slot-level guard now admits both slots. This is transport support only, not a claim that any enchant ID is valid on those slots. Negative IDs and unsupported trinket slots remain rejected.

`scripts/test-gear-simulation.mjs` now covers exact preservation of the verified helm/shoulder IDs, their slot conversion, invalid IDs, and forbidden trinket enchants. The existing gear suite passed through the quiet wrapper: `.artifacts/logs/gear-enhancement-slots-20261113-194329.log`.

An analogous older missing-enhancement indicator whitelist exists in `battleNetCharacterDetails.ts:236`; it was reported to the coordinator and was outside this agent's edit ownership.

## Remaining external/data boundary

The project's [upstream extraction algorithm](https://raw.githubusercontent.com/simulationcraft/simc/18428cd3902412abc8ee274d19567d603e674e66/dbc_extract3/dbc/filter.py) is more complete than a simple ItemEffect join:

- unranked enchants use effect 53;
- crafted items use effect 24 followed by their item effect;
- ranked direct enchants use effect 301 → CraftingData → CraftingDataEnchantQuality;
- ranked consumables use effect 288 → CraftingDataItemQuality → item effect → enchant effect.

The local professions builder also reads CraftingDataEnchantQuality, but its cache `.artifacts/professions-cache` is absent here. Public pinned Wago request `https://wago.tools/db2/CraftingDataEnchantQuality/csv?build=12.1.0.69587` returned **HTTP 403**. The catalog request through the configured public host also returned 403. No credentials or access controls were bypassed. The generated native item/effect tables do not include scroll item 244010; reverse spell ID zero prevents reconstructing its consumable mapping from the native enchant row.

The next actionable work is an additive, build-pinned authoritative mapping from accessible DB2 rows (including ranked crafting tables), exact resolved variant sockets from native output, and equipment-wide unique-category/profession checks. Only then connect bounded candidates to exact commodity ladders and simulation. No permanently-unknown resolver or guessed whitelist was added merely to make the scope look implemented.
