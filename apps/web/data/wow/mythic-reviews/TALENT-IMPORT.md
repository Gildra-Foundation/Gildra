# Mythic pull talent import

Snapshot retrieved 2026-10-23, live build 12.1.5.70529, Raidbots generated
2026-10-23T02:33:25.466Z. Complete ordered class trees for all 13 classes / 40 specs.
The compact snapshot is accessed through lib/data/wow/mythicTalentImport.ts.

Protocol source: Blizzard live client ClassTalentImportExport.lua and ExportUtil.lua:
https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_PlayerSpells/ClassTalents/Blizzard_ClassTalentImportExport.lua
https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_SharedXMLBase/ExportUtil.lua
Tree source: https://www.raidbots.com/static/data/live/talents.json
Build metadata: https://www.raidbots.com/static/data/live/metadata.json
The release audit retains raw sources, SHA256s, generator and decoded references.

Serialization v2: LSB-first sextets; version8/spec16/hash128, complete ascending
class-node order (including other specs), selected/purchased/rank/choice fields.
Granted nodes omit rank/choice fields; tiered entries unlock in rank order.
Inactive hero subtree allocations may be retained in legitimate exports and must
not grant spells. Nonzero hashes must match the current class tree. Blizzard permits
zero hashes; these cannot establish freshness, so the UI requests a fresh export.
EOF, unknown nodes/choices/ranks, stale nonzero hashes, wrong version/spec and
nonzero/oversized tails fail closed. One additional zero sextet is canonicalized:
three independently published live Hunter SimC exports contain this padding.
We read the exported allocation; we do not validate full point budgets, prerequisites,
recommend builds or infer the active pet, spell cooldown or enemy susceptibility.

Profile stores canonical talentString with class/spec. Import detects class/spec/role.
All reloads re-decode against current data; invalid/stale/mismatched saved imports
retain baseline abilities only and show a repair message. Invalid form submission
preserves the previous valid selection. Manual class/spec/role change clears import.
Removing import restores explicitly conditional talent options. localStorage fallback
uses the existing shared in-memory profile preference and storage event handling.

Filtering applies to utility added across role boundaries and every player spell
recommendation in both hover and expanded briefings. Optional spell requirements
and improved-dispel passives must be selected; baseline skills remain. Existing
pet/form/CC/defense limitations remain visible. Dungeon duties remain even when a
player lacks a button, with party-help wording instead of an invented action.

Tests include independent sparse bitstream fixtures for all 40 specs (serialization
only, not legal/recommended builds), choice/partial/tiered/free/hero/hash/padding
cases, every161groups ×40specs ×on/off allocation, malformed/persisted inputs,
and57 independently published SimC/Method exports. Public exports are references,
not fixtures derived from the implementation. Re-fetch the tree and references
before adapting to game updates; never bypass hash/version failures.
