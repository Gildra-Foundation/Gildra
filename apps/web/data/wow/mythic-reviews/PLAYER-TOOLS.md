# Abilities for a selected Mythic+ specialization

`player-tools.json` is a curated utility catalogue for all 40 playable Midnight
specializations. It is separate from NPC tactics and never modifies pull membership,
coordinates, counts or the original role-only briefing.

Checked 2026-10-23 against live Raidbots talents and metadata, build
**12.1.5.70529**, generated 2026-10-23T02:33:25.466Z. Active talent membership and
extra dispel effects use exact spell IDs in that specialization's current tree.
Free nodes and trained abilities are distinguished from optional talents.

Primary data:

- https://www.raidbots.com/static/data/live/talents.json
- https://www.raidbots.com/static/data/live/metadata.json
- https://raw.githubusercontent.com/simulationcraft/simc/midnight/engine/dbc/generated/trait_data.inc
- https://news.blizzard.com/en-us/article/24244455/midnight-pre-expansion-content-update-notes
- Current ID-bound game tooltips: `https://nether.wowhead.com/tooltip/spell/{id}`,
  `?locale=7` for ruRU. Each player spell also links to its own Wowhead record.

Russian and English names and icon identities come from current spell tooltips.
Icons are mirrored under `public/assets/wow/mythic/player-tools/`. Full fetched
source snapshots, hashes and the generator are kept in
`/home/debian/gildra-pull-spec-tools-release-20261023/`.

Dungeon effect types are bound to NPC spell IDs, cross-checked against the reviewed
combat catalogue and its `COMBAT.md` sources. Never infer dispel type from localized
text or damage school. In particular, poison **damage** is not proof of a removable
Poison debuff. An unknown effect ID produces no specific dispel recommendation.
Enrage removal is separate from removing beneficial Magic. Spellsteal is explicitly
conditional on the buff being stealable.

Blessing of Freedom is a separate, exact-ID exception for the reviewed removable
movement effects (Cold Claws, Paralyzing Shots, Spore Spines, Serpent Strike and
Frost Shock). It does not grant a generic Magic dispel to Protection/Retribution.

Selection sets the specialization's role. Selecting a role directly clears the
specialization, retaining class choice. Profiles persist across dungeons/locales
and tabs; malformed, foreign-class and blocked-storage values fail safely.

Task advice includes the selected role's existing tasks and shared duties. It also
adds reviewed interrupt/CC/dispel/purge tasks from other role assignments **only**
when that specialization has a matching tool. This allows a tank to interrupt and
a mage to help remove curses. Missing tools never become invented abilities.

The site does not know the player's actual talents, pet, cooldowns or target
immunities. Optional talents, improved dispels, pet conflicts, form requirements,
CC susceptibility and restricted defensive coverage are shown next to the button.
These are conditional options, not a live character loadout or a cooldown planner.
No obsolete healer kicks, passive Shield of Vengeance/Renewing Blaze/Diffuse Magic,
or removed Poison Cleansing Totem are offered as active buttons.

Personal defensive advice explicitly applies when damage hits the player. Feint
has area-damage restrictions; personal healing is not presented as mitigation.
CC remains distinct from an interrupt and cannot guarantee stopping immune mobs.
