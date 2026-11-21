"""Verify the native assumptions of the Fury-only pure-leech price proof."""
from pathlib import Path
import re
import sys

engine = Path(sys.argv[1])
cache = Path(__file__).resolve().parents[3] / "lib/wow/auctionGearMechanicalCache.ts"
rule = cache.read_text().split("export function pureArmorLeechEnchant(", 1)[1].split("\n}", 1)[0]
enabled = set(map(int, re.findall(r"\bid === (\d+)", rule)))
old = {7958, 7959, 8028, 8029, 8030, 8031}
assert enabled == old
wrist_back = cache.read_text().split("export function pureWristBackLeechEnchant(", 1)[1].split("\n}", 1)[0]
ranges = {tuple(map(int, pair)) for pair in re.findall(r"id >= (\d+) && id <= (\d+)", wrist_back)}
assert ranges == {(6575, 6580), (6593, 6595), (7386, 7391), (7404, 7406)}
enabled |= {eid for first, last in ranges for eid in range(first, last + 1)}
found = set()
for line in (engine / "dbc/generated/spell_item_enchantment.inc").open():
    m = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{[^}]+\},\s*(\d+),", line)
    if not m:
        continue
    eid, *flags = map(int, m[1].split(","))
    if eid not in enabled:
        continue
    bounds = [80, 120, 0] if eid in old else [60, 10, 120] if eid < 7000 else [70, 70, 170]
    assert flags == [0, -7, 0, *bounds, 0, 0]
    kinds, amounts, stats = [tuple(map(int, m[i].split(","))) for i in (2, 3, 4)]
    assert kinds == (5, 0, 0) and amounts == (0, 0, 0) and stats == (62, 0, 0)
    assert int(m[5]) == 0
    found.add(eid)
assert found == enabled

player = (engine / "player/player.cpp").read_text()
assert "return role == ROLE_TANK || role == ROLE_HEAL || sim -> enable_dps_healing;" in player
assert re.search(r"if \( record_healing\(\) \)\s*\{\s*spells.leech = new leech_t", player)
assert re.search(r"if \( spells.leech \)\s*\{\s*assessor_out_damage.add\( assessor::LEECH", player)
heal = (engine / "action/heal.cpp").read_text()
assert re.search(r"if \( player->spells.leech \)\s*\{[^{}]+composite_leech\(", heal)
apl = player.split('if ( splits[ 0 ] == "stat" )', 1)[1].split("throw sc_invalid_apl_argument", 1)[0]
assert "STAT_LEECH_RATING" not in apl

# A new action or item that directly reads the percentage requires another
# audit. Report/snapshot reads record measurements without driving actions.
reads = set()
for path in engine.rglob("*.cpp"):
    rel = path.relative_to(engine).as_posix()
    if rel.startswith("report/") or rel == "action/snapshot_stats.cpp":
        continue
    src = path.read_text(errors="replace")
    if re.search(r"->composite_leech\s*\(|cache\.leech\s*\(", src):
        reads.add(rel)
assert reads == {"action/action.cpp", "action/heal.cpp", "player/player.cpp", "player/player_stat_cache.cpp"}, reads
enchant_source = (engine / "item/enchants.cpp").read_text()
direct_stat = enchant_source.split("case ITEM_ENCHANTMENT_STAT:", 1)[1].split("break;", 1)[0]
assert "stats.push_back( stat )" in direct_stat and "effect.type =" not in direct_stat
assert re.search(r"if \( effect.type != SPECIAL_EFFECT_NONE \)\s*\{\s*item.parsed.special_effects.push_back", enchant_source)
# Direct enchant ID lookups outside item initialization and reporting are
# restricted to weapons in the pinned sources.
for path in engine.rglob("*.cpp"):
    rel = path.relative_to(engine).as_posix()
    if rel.startswith(("item/", "report/", "interfaces/")):
        continue
    for line in path.read_text(errors="replace").splitlines():
        if "parsed.enchant_id" in line:
            assert rel in {"player/unique_gear.cpp", "class_modules/sc_death_knight.cpp"} and re.search(r"SLOT_(MAIN|OFF)_HAND", line), (rel, line)
print("Verified 24 direct leech enchants and the pinned Fury leech consumers")
