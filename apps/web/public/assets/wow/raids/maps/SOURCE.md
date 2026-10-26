# Authentic raid maps

Retrieved and verified 2026-10-26 UTC. These are game cartography and game-ground arena captures, not generated terrain. Native JPEG files were archived without retouching, then re-encoded for delivery as WebP without painting, cropping or recoloring. In `manifest.json`, `nativeSha256` identifies the source JPEG and `sha256` identifies the delivered WebP; source URLs and delivered dimensions are retained.

## Arena backgrounds: RaidPlan.io

- Catalog: `https://raidplan.io/api/catalog/bosses?raids=wow.midnight.voidspire,wow.midnight.dreamrift,wow.midnight.marchonqueldanas,wow.midnight.venomabyss,wow.midnight.sporefall`
- Public catalog client uses `https://cdn.raidplan.io/raid/{raid.cdnId}/map/{boss.cdnId}-{map.slug}.jpg`.
- All 31 non-hidden variants returned HTTP 200 and valid JPEG dimensions. Hidden/outdated variants were excluded.
- The Voidspire: 11 backgrounds for 6 encounters; Dreamrift: 1; March on Quel'Danas: 4 for 2 encounters; Venomous Abyss: 14 for 8 encounters; Sporefall: 1.
- Venomous Abyss variants include RaidPlan's published `yards`, world map ID 3004, world center, yaw, and world height. Earlier raids do not publish equivalent scale metadata in the catalog. Do not invent a yard scale for them.
- RaidPlan catalog provides arena metadata and encounter IDs. It does not provide NPC spawn positions, trash packs, or a surveyed whole-instance route.
- RaidPlan's [About page](https://raidplan.io/about) asks for a link back for commercial use of its tools. Include a visible `RaidPlan.io` credit/link when using these backgrounds. That page is not an asset-specific open-source license, and no independent blanket redistribution license was identified.

## Whole-instance floors: Wowhead game cartography

Source pages:

- [The Voidspire, zone 16340](https://www.wowhead.com/zone=16340/the-voidspire): floor 0 Voidspire, floor 1 Crown of the Cosmos.
- [The Dreamrift, zone 16531](https://www.wowhead.com/zone=16531/the-dreamrift): floor 0 The Dreamrift, floor 1 Den of the Undreamt.
- [March on Quel'Danas, zone 16342](https://www.wowhead.com/zone=16342/isle-of-queldanas): floor 0 March on Quel'Danas, floor 1 The Darkwell.
- [The Venomous Abyss, zone 16915](https://www.wowhead.com/zone=16915/the-venomous-abyss): floor 0 The Soulcoil Well, floor 1 Pit of Fangs, floor 2 The Vile Crypt, floor 3 Crypt of the Soulcoilers, floor 4 The Coiled Altar.
- [Sporefall, zone 16279](https://www.wowhead.com/zone=16279/sporefall): single map.

Floor identities/names come from Wowhead's public live `nether.wowhead.com/data/zones` (`Mapper.multiLevelZones`, `g_zone_areas`). The public Mapper client constructs image URLs under `https://wow.zamimg.com/images/wow/maps/enus/original/`. All 12 originals returned HTTP 200 and are 1024 × 683. Sporefall uses `16279.jpg`; the other maps use `{zoneId}-{floor}.jpg`. RU floor labels are interface translations, not a claim of verified Blizzard localization.

Boss pins come from `mapShowObject` on those zone pages; each pin retains the source URL and NPC ID. Two exceptions use individual NPC mapper samples: [Nek'zali 259927](https://www.wowhead.com/npc=259927) and [Vashnik 259181](https://www.wowhead.com/npc=259181). Their multiple coordinate samples are retained in the manifest; the displayed pin is the first reported sample, not a claim of a fixed arena center. Wowhead also exposes a separate Vashnik NPC 266403 at a different position; that NPC was not used.

Some encounters use a representative creature's map pin: Vaelgor for Vaelgor & Ezzorak, War Chaplain Senn for the Vanguard, Alleria for Crown, L'ura for Midnight Falls, Breath of Ula'tek for Sentinels, Mor'zahi for Lost Explorers, Vexhul for Twin Fangs and Zul'jan for Coiled Altar. This identity correspondence is explicit in the manifest through `bossSlug`, `sourceName` and `npcId`.

## Presentation and precision

The game-map floor and the per-boss arena have separate coordinate systems. Never reuse whole-instance trash/schematic positions on an arena background. Boss-to-boss lines represent progression order; they do not assert an exact walkable corridor, verified trash grouping, skip, or in-game tested route. Keep the existing draft route status attached to unverified trash plans.

World of Warcraft and its game artwork are © Blizzard Entertainment. RaidPlan.io and Wowhead are credited as the source services; no claim of ownership or new license is made for Blizzard terrain. This package contains no user-created RaidPlan plans and no private/account data.

Delivery:43maps re-encoded from archived native JPEG with Sharp, no repaint/crop/recolor; maxwidth1600 without enlargement, WebPquality88/effort5. Native/encoded hashes and final dimensions in manifest; native files retained in /home/debian/gildra-raid-atlas-20261026/research-maps/.
