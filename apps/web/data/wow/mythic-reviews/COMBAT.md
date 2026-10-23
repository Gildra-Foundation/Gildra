# Midnight Season 2 pull briefings

`combat.json` is the source-reviewed catalogue for the eight dungeon maps, checked
2026-10-23 against patch 12.1.5. It replaces legacy editor assignments in pull
briefings. NPC and spell names use the verified client locale in RU/EN, including pull composition and caster labels. Russian instructions also localize inline game names. Identity keys, NPC/spell IDs and saved route data remain unchanged.

Identity and coverage:

- Bind creatures by MDT NPC ID, never route step, coordinates, or approximate name.
- Named trash mechanics come from Tactyks' dungeon guides; MDT spell lists and
  Wowhead's current client tooltips establish NPC/spell identities and media.
- Boss tables sometimes contain triggered damage variants. A canonical mechanic
  is resolved only within that boss's own MDT spell list. Summoned encounter
  mechanics are explicitly included for their boss and their own NPC record.
- Separate IDs for the same named creature stay separate. Objects, allies and
  event NPCs have instructions rather than fabricated combat casts.
- Instructions describe practical role responsibilities, not fixed player names.
  A poison/curse dispel, soothe, freedom or bleed removal requires the appropriate
  class ability; it is not guaranteed by choosing a role.
- Listed mechanics cover relevant documented casts and passives. Hidden visual
  effects, duplicate damage triggers and the generic Xal'atath affix marker are
  intentionally not presented as additional casts. This is source review, not
  an in-game certification or an automatic promise of future patch updates.

Sources are linked in every dungeon record and every spell/NPC entry. The
October 13 hotfix changes, notably Living Bomb dispel preventing its explosion,
are included. Where guides recommend different positioning or target orders,
use the shared mechanic requirement rather than presenting one route choice as
mandatory. Current client data wins over stale effect descriptions (for example,
Shredding Claws reduces armor; Fiery Demise leaves a fire pool).

`combat-provenance.json` records hashes and URLs for the fetched source snapshots,
NPC model portraits and spell icons. All displayed assets are served locally,
with fixed image dimensions and no dependency on a third-party browser request.
Portrait display IDs come from MDT; spell icon names come from the corresponding
Wowhead spell ID. Existing site assets are not overwritten.

To update: review Blizzard hotfixes and each dungeon guide, reconcile changes
against that dungeon's MDT NPC/spell table and current client tooltips, update
both languages and media provenance, then run `mdtPullIntel.test.mjs`, typecheck,
Atlas/Valyro checks and RU/EN desktop/touch acceptance. Do not fill a missing entry
with a similarly named creature or a generic action icon. Preserve Temple of
Sethraliss' incompatible authored route status until a valid import exists.
