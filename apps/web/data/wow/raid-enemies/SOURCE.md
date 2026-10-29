# The Voidspire enemy map sources

Checked 29 October 2026 UTC.

The 407 points are observed NPC-location samples from Wowhead `g_mapperData`, covering 15 NPC records. They are not a simultaneous population, fixed spawn positions, pull composition or a patrol route. Source `count` values are deliberately excluded. No point is jittered, averaged or generated.

The mapper zone is `16340`. Array index `0` maps to floor `16340-0`; explicit key `1` maps to `16340-1`. Coordinates are percentages of the original Wowhead floor image. RaidPlan arena images have a different coordinate system and receive no floor markers.

The JSON preserves the retrieval date, source URL and SHA-256 of the fetched EN page. Only the names, actual floor points and source URL are projected into the client plan.

| NPC | Recorded points | Source |
| --- | ---: | --- |
| Unbound Wraith (240545) | 175 | [Wowhead](https://www.wowhead.com/npc=240545) |
| Abyssal Caller (240548) | 4 | [Wowhead](https://www.wowhead.com/npc=240548) |
| Voltaic Voidtamer (240738) | 123 | [Wowhead](https://www.wowhead.com/npc=240738) |
| Celestial Drifter (240851) | 2 | [Wowhead](https://www.wowhead.com/npc=240851) |
| Phasing Flickerblade (240856) | 16 | [Wowhead](https://www.wowhead.com/npc=240856) |
| Darkspawn (240857) | 29 | [Wowhead](https://www.wowhead.com/npc=240857) |
| Harrower (240955) | 10 | [Wowhead](https://www.wowhead.com/npc=240955) |
| Seething Slayer (241254) | 4 | [Wowhead](https://www.wowhead.com/npc=241254) |
| Stronghold Enforcer (242917) | 18 | [Wowhead](https://www.wowhead.com/npc=242917) |
| Terrace Watcher (252067) | 1 | [Wowhead](https://www.wowhead.com/npc=252067) |
| Celestial Behemoth (252070) | 1 | [Wowhead](https://www.wowhead.com/npc=252070) |
| Invasive Consumptor (252240) | 1 | [Wowhead](https://www.wowhead.com/npc=252240) |
| Voracious Shredclaw (252241) | 2 | [Wowhead](https://www.wowhead.com/npc=252241) |
| Fleshy Monstrosity (253036) | 16 | [Wowhead](https://www.wowhead.com/npc=253036) |
| Obscurion Obliterator (264857) | 5 | [Wowhead](https://www.wowhead.com/npc=264857) |

No coordinate samples were returned for Blinky (`240864`), Voidlight Everdawn (`240831`) or Gladius Slauros (`252066`). Their reviewed textual directions remain in the briefing. Those directions are not converted into invented map pins. Entrance Obscurion Obliterator (`240549`) also has no sample; the separately observed NPC variant `264857` is shown under its own identity without inheriting another record’s pull or abilities.

The source was checked for 31 candidate NPC records, not every creature potentially present in the raid. This layer does not claim complete trash coverage.

## Celestial Behemoth correction

The raid NPC is [252070](https://www.wowhead.com/npc=252070), with Cosmic Injection (`1259291`) and Celestial Zone (`1259328`; effect `1259329`). The previous `256598` is a Voidstorm NPC, not the raid lieutenant. Its Umbral Ejection / Lightning Surge / Shocking Tendrils mechanics were removed from this raid pull. The correct spell names were checked in both EN and RU. Icons are original Wowhead-hosted game icons:

- `1259291.jpg`: [inv_cosmicvoid_buff](https://wow.zamimg.com/images/wow/icons/large/inv_cosmicvoid_buff.jpg), SHA-256 `236e2ec25e4d6acf9b5f031433c6f18a87f1eab7d0cbc9b3350f84bb52384f0d`.
- `1259328.jpg`: [inv_cosmicvoid_groundsate](https://wow.zamimg.com/images/wow/icons/large/inv_cosmicvoid_groundsate.jpg), SHA-256 `2018c9cade333cc4590ab351542de73fa4c93afab69485612080cf9be432f85a`.

The published selected abilities for all eight trash NPC records were checked against each record’s spell list on 29 October 2026; all current bindings were present. Evidence: `/home/debian/gildra-voidspire-mob-map-20261029/source-review.json`.

Lieutenant identity and progression reference: [Wowhead lieutenant guide](https://www.wowhead.com/news/all-lieutenant-enemies-that-drop-boes-in-midnight-season-1-raids-381260).

## Grouped route — 29 October 2026

The observation layer is no longer shipped to the planner. Individual observations
are retained here only as source evidence, never clustered into claimed fixed packs.
The planner uses the reviewed named-enemy groups and a recommended left-wing,
right-wing, central-stairs order. Map markers are authored gathering callouts,
not measured NPC spawn locations. Arena callouts use an explicitly labelled
schematic plane, separate from floor coordinates. The seventh stop is a rally.
Entrance instructions apply to successive packs and explicitly avoid merging the
whole entrance. Small jellyfish before the Behemoth are documented in the
lieutenant article; their count, NPC identities and spells are not established.

https://www.wowhead.com/news/all-lieutenant-enemies-that-drop-boes-in-midnight-season-1-raids-381260

## Boss and arena selection correction — 29 October 2026

Boss portraits and the progression rail open the corresponding boss strategy.
They no longer select the first trash stage sharing that boss as a destination.
The Voidspire arena has its own named pull selector, NPC roster with priorities,
and reviewed spell responses inside the arena frame. The previous seven generic
route markers are removed from boss arena art; no NPC coordinates are inferred.
Map gathering callouts, the global route list and all original provenance remain.
Arena sketches are scoped by boss, preventing unrelated arenas from sharing a
`main`/`alt` sketch key.
