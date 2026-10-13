# @gildra/game-data

Verified World of Warcraft data of the current expansion: the content manifest
(seasons, instances, encounters, sources), specializations, delves, lairs and
The Venomous Abyss. Pure TypeScript and JSON — no React, no app imports — so it
can be read by the web app, scripts and future services alike.

- The web app reads it on the server through `lib/data` (`@/lib/data/wow`,
  `liveSeason()`); components never import it directly (ESLint).
- `content-manifest.json` is also reachable at `data/wow/content-manifest.json`
  (a symlink) for the catalog audit scripts.
- Never invent data here: every entry carries its source and verification.
