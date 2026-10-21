# Dreamrift audit — 2026-10-21T20:14:34Z

Scope: one boss, Chimaerus (2795). Repository data and present-day online sources reviewed; no production mutations, commit or push.

## Verified changes

- Separate current Season 2 status from the historical Season 1 encounter; seasonal first-season feats are no longer obtainable.
- Clarify Dissonance as an 8-yard restriction against all opposing-realm players, not a special counterpart.
- Heroic+ Miasma: overlap the dispel circle with pools, isolate from teammates; standing inside the pool is unnecessary.
- Mythic swaps require assigned healer/DPS replacements. Extra Upheaval preserves the split into intermission; fast Fearsome Cry needs planned interrupts.
- Maintain shield-breaking below and immediate add kills above; face the frontal away, clear survivors before Consume/Dive.

## Evidence and limits

Canonical content-manifest is a symlink to packages/game-data/src/content-manifest.json. season-one-publication gives 4 recorded / 0 safe / 4 withheld abilities for 2795. midnightRaidData renders that publication, not the obsolete 7-row midnightRaidSpells list. Keep its exact-build safeguards. This review adds separately sourced qualitative strategy; it does not certify exact numerical tooltips.

Fetched EN/RU live retail tooltips for 15 IDs. Selected 11 distinct mechanic icon bindings have genuine Blizzard CDN JPEG bytes; 5 existing local files match exactly, 6 are missing locally. All downloadable JPEGs are in /tmp/gildra-dreamrift-evidence, with sha256/bytes in JSON. Tooltip slugs for Alnshroud/Alnsight returned CDN 403; do not claim those two byte matches. Consume localization disagrees on damage school, so editorial text avoids it. Tooltips are not pinned to repository build 12.1.0.69587 or specific difficulty.

Read-only live route probe returned HTTP 403; no visual live verification claimed. Blizzard current-season announcement and author guides opened via web search; direct urllib to guide was also blocked. Icy Veins displays May 19, 2026 update. No evidence supports assuming later numeric tuning unchanged.

## Sources

- [Blizzard: Midnight Season 1 schedule](https://worldofwarcraft.blizzard.com/en-us/news/24266321/)
- [Blizzard: Midnight Season 2 is now live](https://worldofwarcraft.blizzard.com/en-us/news/24294369/)
- [Blizzard: Season 1 achievements and rewards ending](https://worldofwarcraft.blizzard.com/en-us/news/24293280/)
- [Blizzard: hotfixes through April 17, 2026](https://worldofwarcraft.blizzard.com/en-us/news/24266320/)
- [Chimaerus game Encounter Journal on Wowhead](https://www.wowhead.com/npc=256116/chimaerus)
- [Icy Veins: Chimaerus Normal/Heroic and Mythic](https://www.icy-veins.com/wow/chimaerus-raid-guide)
- [Method: Mythic Chimaerus strategy](https://www.method.gg/guides/the-dreamrift/chimaerus-the-undreamt-god)

## Validation and handoff

JSON parses; both locales have seven paired tips. Every icon binding has a downloaded local temporary JPEG and its SHA256. Parent agent integrates the reviewed JSON and copies only intended missing icons. Parent owns common rendering/tactics edits and memory finalization. Production publication remains a separate action.
