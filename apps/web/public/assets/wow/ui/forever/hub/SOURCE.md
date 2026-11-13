# Game interface textures on the Forever hub

World of Warcraft interface textures (Blizzard Entertainment), cut from the mirror
https://github.com/Gethe/wow-ui-textures, branch `live`, commit `d23deaf8f44a7d280dc974a5c9d5321c013db59b`
(patch 9.2.7). Local archive: `/home/debian/wow-assets/wow-ui-textures`. Transparent borders trimmed, saved as lossless WebP.
The raid and class chapters wear the home page marks (`../../home/mark-raids.webp`, `mark-classes.webp`).

| File | Archive path | Cut |
| --- | --- | --- |
| `mark-dungeons.webp` | `MINIMAP/Dungeon_Icon.PNG` | the portal without its outer glow: 38×38 at 13,14 |
| `mark-crafts.webp` | `MINIMAP/TRACKING/Repair.PNG` | whole, trimmed to 28×30 |
| `mark-library.webp` | `MINIMAP/TRACKING/Profession.PNG` | whole, trimmed to 27×26 |

The hub banners and the page scenes are the site's own paintings (`/assets/wow/loading/*`, lib/atlas/scenes.ts):
the archive's loading screens and Encounter Journal backgrounds of the classic dungeons are at most 512 px wide and
carry the game logo, so they do not hold a 1440 px hero or a 2× banner.
