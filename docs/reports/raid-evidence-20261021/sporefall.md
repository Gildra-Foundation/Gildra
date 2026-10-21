# Sporefall / Rotmire evidence review

Reviewed 2026-10-21 20:17:45 UTC. Scope: only `apps/web/data/wow/raid-reviews/sporefall.json` and this report; downloaded evidence under `/tmp/gildra-sporefall-evidence/`. Shared memory: `/var/lib/gildra/codex-team/memory/gildra/` (root agent owns session wrap-up).

## Verified additions

- Official Blizzard article confirms Harandar; one boss; level 90; Raid Finder minimum item level 240; LFR/Normal/Heroic/Mythic; Mythic flex 15–25.
- Live EN/RU tooltips verify **Sporefall / Споропад**, zone 16279, and **Rotmire / Гнилотоп**, NPC 254176. Canonical repository localization has null RU fields; root integration may replace them from this evidence.
- Added qualitative encounter cycle, corpse placement, Fungal Bloom and Bursting Shrooms, tank swap, vines positioning, Heroic/Mythic Poison Burst interrupts, Mythic corpse separation and ramping Rotting Pustules. 7 original tips per locale.
- Eight real spell icons fetched from official Blizzard render CDN based on current EN/RU tooltip `icon` fields. Bytes, JPEG header, size and SHA256 verified. No guessed icons. All files remain in `/tmp` for root integration; requested destination `reviewed-spells/<spellId>.jpg` is in JSON.
- Season 1 / 12.0.7 legacy manifest identity matches current Season 2 announcement; no claim that this is current progression or current best gearing.

## Source hierarchy and limitations

[Blizzard overview](https://worldofwarcraft.blizzard.com/en-gb/news/24272110/prepare-to-face-rotmire-in-the-sporefall-raid) was readable through indexed browser search, while direct browser open returned 403. [Revelations notes](https://worldofwarcraft.blizzard.com/en-us/news/24244888) corroborated the raid and rewards. [Current Season 2 announcement](https://worldofwarcraft.blizzard.com/en-gb/news/24294369/the-shadows-deepen-midnight-season-2-begins-19-august) confirms the season transition.

[Wowhead by iMX3](https://www.wowhead.com/guide/midnight/raids/sporefall-rotmire-boss-strategy-abilities-cheat-sheet-rewards), updated 2026-06-29, provided the encounter's Adventure Guide ability links. [Panthea's Icy Veins guide](https://www.icy-veins.com/wow/rotmire-raid-guide/), dated 2026-06-08, was read as the author's own tactical account. These are corroborated against current spell tooltip descriptions; the guide is not represented as fresh October tuning testing.

Live public tooltip requests used `https://nether.wowhead.com/tooltip/spell/<ID>?dataEnv=1&locale=0` (EN) and `locale=7` (RU). Zone/NPC endpoints use the same syntax. JSON snapshots are in `/tmp/gildra-sporefall-evidence/`. These are live retail public data mirrors, not Blizzard API exact-build evidence. Tooltip numeric damage differs from guide scaled values: none of those numbers are published. NPC tooltip level 84 conflicts with official entry level 90: the guide uses the official entry requirement. No in-game or authenticated exact-build encounter test is claimed.

No exact journal/encounter ID has been established. Root must preserve existing guarded Adventure Guide / numeric publication checks. Spell identity and qualitative editorial notes can render separately. Release-era loot item levels, bonus-roll lockout claims, current best gear recommendations and numerical tuning are deliberately excluded.

## Icon manifest

| Spell ID | EN / RU verified identity | SHA256 |
| --- | --- | --- |
| 1221622 | Awaken Fungi / Грибное пробуждение | `69c215e4de2922484e269a1d817ce1566be1afda3c590b690c2fe544abcc656c` |
| 1221637 | Fungal Bloom / Плеснецвет | `1ed6ec6d4baf6fb779dc32002b49721d6cd4c139d289aadf57093e7be1729a1f` |
| 1222088 | Festering Vines / Гнойные лианы | `e94b1dc7bb84aff659d5e8a6c499b29a1d9e74cb1e987e77cb77d743b1054851` |
| 1221781 | Putrid Fist / Гнилостный кулак | `56b0a9fd6b1f207d6b18f09b73bc19a2d3580d63d3c2b66347048e0b58e3940c` |
| 1222684 | Cross Fertilization / Перекрестное удобрение | `1674ccffcd0f8650c20cd0416c9542d67171bbbed708e5ab5ae6b0281965feb7` |
| 1221965 | Bursting Shroom / Разрывающийся гриб | `e3cfc1214aa37f9dd2d4dec174136dcdf6c5cba294a3b249717c582612bea208` |
| 1221714 | Poison Burst / Выброс яда | `91b759b1c2da671fd82965f3f4dd0d428c102f6160e470c824e4b76dd6ff456a` |
| 1222176 | Rotting Pustules / Гнойные пустулы | `65d8dc7647d88781d47dea7e63123038ea65a7105ebd26bd418dacda6bd71e20` |

## Checks and next action

JSON parsed successfully; 1 expected boss; EN/RU tip counts 7/7; 8 unique spell IDs; every downloaded icon passed JPEG/size/hash checks. No commit, push, deployment, production write or source component edit performed by this agent.

Root next action: integrate review into `published-reviews.json`, copy the 8 verified icon files to the configured assets directory, add references via current reviewed identity component, and replace canonical null RU names if desired. Run parent integration checks and browser verification before completion. Root records merged session results in shared memory under the write lock.
