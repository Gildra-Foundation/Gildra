# Content review — 19 October 2026

This is an editorial source review for Midnight Season 2, not an in-game completion claim.
Publication readiness covers the guides below in English and Russian. Account/OAuth,
release deployment and operational acceptance are separate gates.

## Mythic+

Eight complete baseline walkthroughs use Tactyks' current-season Method guides and
his linked Wago routes. NPC IDs, clone positions and enemy-force values were matched
to Mythic Dungeon Tools revision `2a2df3bb28471ec9900942f1856215f85fdefe31`.
The source routes use no mandatory invisibility or death skips. Pulls may be split;
combining neighboring packs is optional. Map tiles include the full dungeon layout.

| Dungeon | Route source | Forces / required | Bosses |
| --- | --- | --- | --- |
| Altar of Fangs | https://wago.io/qak6G3Uvs | 821 / 817 | 3 |
| Murder Row | https://wago.io/mWO70E5hA | 660 / 655 | 4 |
| Den of Nalorakk | https://wago.io/b69_rKkRL | 730 / 729 | 3 |
| The Blinding Vale | https://wago.io/HLI3Wq7sA | 693 / 686 | 4 |
| Voidscar Arena | https://wago.io/1s56kmJ_N | 743 / 738 | 3 |
| Kings' Rest | https://wago.io/U22_Bys16 | 617 / 608 | 4 |
| Ruby Life Pools | https://wago.io/IEtQSuWgA | 552 / 551 | 3 |
| Temple of Sethraliss | https://wago.io/1pqM1h0ez | 687 / 687 | 4 |

All 28 encounter stops contain role assignments and dangerous abilities. The Blinding
Vale's Trinity is one encounter with three bosses; boss-count assertions use encounter
stops. The Temple route removes two obsolete clone references, includes their required
companion pack, and adds a Shrouded Fang at the entrance to complete forces. The
manifest retains source version and adjustment details. Timers were checked against
Raider.IO static data on 19 October.

Review corrections include Coil tether breaks/damage mirroring, Kystia's Nibbles and
image removal, separate barrel cover at Zaen, Temple's current eye interaction,
mandatory Nalorakk offerings and Murder Row bar event, and Ruby boss phases. 146
trash recommendations cover interrupts, dispels, priority targets and role duties.
The full route version is `midnight-s2-20261019.2`; personal notes are not shared.

Evidence: `route-map-checks.json` (32 views), route-map screenshots, source/clone data
in `mvpRoutes.json`, route completeness tests. These establish the documented route,
not the timing of a player-run key.

## The Venomous Abyss

All eight encounters have Normal/Heroic notes, role assignments, progression,
dangerous-ability responses and item links. Each publication entry cites its Icy
Veins encounter guide and Method Heroic guide. Normal-only and Heroic differences
were compared separately. Mythic tactics are excluded from the public page.

Corrections include Nek'zali's health transition and Heroic corpses, Sentinel target
swaps and dispel positioning, Lost Explorer mushrooms and crate damage, Vashnik's
uncontrollable splitting adds, Sszorak's tunnel order and alternating Heroic soaks,
Twin Fangs' three-hit groups, the Altar's damage-broken shields and fragment phase,
and Ula'tek's paired tethers, egg order and platform movement.

The 37 Adventure Guide ability identities and 104 unique loot IDs all resolve to
matching names in the current Wowhead tooltip endpoint (`raid-identities.json`).
105 boss-drop records include one item shared between encounters. Drop chances,
unknown exact item levels and item icons are not fabricated. Normal/Heroic base
item levels come from the linked current-season rewards table.

Exact-build journal verification remains distinct: 12 spell descriptions are
verified and 25 raw descriptions with unresolved client tokens remain withheld.
Those abilities have original editorial response instructions instead. No invented
resolved Blizzard description or numeric damage value is substituted.

## Lair and world bosses

Nymrissa, Lu'ashal, Cragpine, Thorm'belan and Predaxas have location/access, mechanics,
role instructions, reward limitations and item links. Nymrissa's access and group
sizes were checked against Blizzard's “Step Into Lairs and Face the Foes Inside”.
World-boss material was compared against the Wowhead world-boss guide and Icy Veins.

All 54 referenced spell/item identities match the live tooltip endpoint
(`lair-identities.json`). Cragpine uses Zul'Aman; Predaxas includes Devour; Nymrissa
includes all 13 item drops. Unknown icons remain absent. World-quest guaranteed
weekly rewards are described at Warband scope; reward levels defer to the live quest.
There is no asserted weekly rotation: an empty or expired regional confirmation
shows the unconfirmed-week state.

## Publication and limits

One `publication.ready` flag controls public routing, navigation, search and sitemap.
Every required guide now has sources, a dated review and both locales. Archive
publication remains limited to the previously reviewed Voidspire guides.

This review does not certify Battle.net login, device synchronization in real user
sessions, current production tier snapshots, backup recovery or deployment. The
release report must record those results independently before calling the MVP ready.
