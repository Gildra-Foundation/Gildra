# Auction item effects: native integration check

The auction runner already sends exact item IDs, bonuses, contexts and modifiers
to SimulationCraft with `actionListMode: "native"`. The maintained specialization
APL supplies item activations. The planner ranks the resulting full-character DPS;
item level, tooltip text and static stat totals are not substitute DPS scores.

This opt-in check runs an offline SimC binary and passes its actual measurements
through the auction search and assembly code. From `apps/web`:

```sh
GILDRA_ITEM_EFFECTS_SIMC=/absolute/path/to/simc \
  node --experimental-strip-types --no-warnings \
  --import ./tests/auction/resolve.mjs scripts/test-auction-item-effects.mjs
```

Optionally set `GILDRA_ITEM_EFFECTS_OUTPUT` to retain the compact JSON evidence.
The test removes its private temporary files, including reports, on completion.

The public Fury reference comes from
[SimC revision18428cd](https://github.com/simulationcraft/simc/blob/18428cd3902412abc8ee274d19567d603e674e66/profiles/MID2/MID2_Warrior_Fury.simc),
under GPL-3.0. It retains talents and equipment but removes explicit action lists,
matching the worker's native APL mode. Use the pinned binary from `infra/simc`.

Five calculations compare the reference, identical-stat replicas replacing each
trinket separately, both replicas, and a higher-level replica with more crit.
The replicas have no item ID and genuinely have no built-in effects; appending
`equip=none,use=none` to a real item does not disable its built-in special effects.
Assertions verify actual activation, passive damage, unchanged base stats,
improvements beyond measurement noise, lower-ilvl selection and the combined set.

The fixture and replicas are test controls. They make no claim about a character
account, current auction availability or a purchasable higher-level variant.
Differences measure the whole character and its native cooldown interactions;
they are not additive per-effect DPS bonuses. Support remains limited to effects
implemented by the pinned SimC version; an unavailable tooltip alone does not
mean the effect is missing from the combat simulation.
