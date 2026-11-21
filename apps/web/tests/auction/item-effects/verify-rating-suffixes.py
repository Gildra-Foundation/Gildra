"""Check the two-allocation native suffix contract for bare equipment."""
from collections import defaultdict
from pathlib import Path
import re
import json
import math
import struct
import sys

programs = defaultdict(list)
for line in (Path(sys.argv[1]) / 'item_bonus.inc').open():
    match = re.fullmatch(r'\s*\{\s*([\d,\s-]+)\},\s*', line)
    if match:
        _, bonus, *operation = map(int, match[1].split(','))
        if 1 <= bonus <= 250 or 1676 <= bonus <= 1717:
            programs[bonus].append(operation)

# Both native programs introduce exactly the same ordered rating types and
# suffix name. No other bonus operation or tag is present.
for bonus, crit, vers in [(1679, 3500, 3500), (1680, 3000, 4000)]:
    assert programs[bonus] == [
        [2, 32, crit, 0, 0, 0], [2, 40, vers, 0, 0, 1], [5, 13152, 0, 0, 0, 2]
    ]
print('Verified both bare ring suffix programs')

# The name must agree even if an APL or equipment effect inspects the item.
module = Path(__file__).resolve().parents[3] / 'lib/wow/auctionGearEffects.ts'
ranges = module.read_text().split('const jewelrySuffixRanges = [', 1)[1].split('] as const;', 1)[0]
family_stats = {13150: {32, 36}, 13151: {32, 49}, 13152: {32, 40},
                13156: {36, 49}, 13157: {36, 40}, 13161: {40, 49}}
claimed = set()
for first, last, name in re.findall(r'\[(\d+), (\d+), (\d+)\]', ranges):
    for bonus in range(int(first), int(last) + 1):
        assert bonus not in claimed
        claimed.add(bonus)
        a, b, suffix = programs[bonus]
        assert [a[0], b[0]] == [2, 2] and {a[1], b[1]} == family_stats[int(name)], bonus
        assert a[2] > 0 and b[2] > 0 and a[3:] == [0, 0, 0] and b[3:] == [0, 0, 1], bonus
        assert suffix == [5, int(name), 0, 0, 0, 2], bonus
assert claimed and set(family_stats) == {programs[bonus][2][1] for bonus in claimed}
print(f'Verified {len(claimed)} socketless jewelry suffix programs')

verified = 0
for bonus, program in programs.items():
    if bonus > 250:
        continue
    if [op[0] for op in program] != [2, 2, 5]:
        continue
    for kind, rating, allocation, third, fourth, index in program[:2]:
        assert rating in (32, 36, 40, 49) and allocation > 0 and third == fourth == 0, bonus
    verified += 1
assert verified > 0
print(f'Verified {verified} pure secondary-rating suffix programs')

# Pin every exception for enchanted armor to the operation types handled
# directly by initialize_item_enchant and item_enchantment_effect_stats.
decl = module.read_text().split('const directChestEnchants = new Set([', 1)[1].split(']);', 1)[0]
enabled = list(map(int, re.findall(r'\d+', decl)))
assert enabled and len(set(enabled)) == len(enabled)
verified_enchants = set()
for line in (Path(sys.argv[1]) / 'spell_item_enchantment.inc').open():
    record = re.match(r'^  \{\s*(\d+),[^{}]+\{([^}]+)\},\s*\{[^}]+\},\s*\{([^}]+)\}', line)
    if record and int(record[1]) in enabled:
        kinds = list(map(int, record[2].split(',')))
        assert len(kinds) == 3 and any(kinds) and set(kinds) <= {0, 4, 5}, (record[1], kinds)
        # Empty operation slots in the pinned data must have no spell or stat ID.
        properties = list(map(int, record[3].split(',')))
        assert len(properties) == 3 and all(k or p == 0 for k, p in zip(kinds, properties)), record[1]
        verified_enchants.add(int(record[1]))
assert verified_enchants == set(enabled), set(enabled) - verified_enchants
print(f'Verified {len(enabled)} direct chest enchants')

# Only the same enchant may reuse a suffix score. In the pinned engine a STAT
# entry reads the player's level and spell data, and no host bonus operation.
neck_module = module.with_name('auctionGearMechanicalCache.ts')
decl = neck_module.read_text().split('const directNeckEnchants = new Set([', 1)[1].split(']);', 1)[0]
enabled_neck = set(map(int, re.findall(r'\d+', decl)))
data = Path(sys.argv[1])
neck_rules, ring_rules = set(), set()
for line in (data / 'permanent_enchant.inc').open():
    record = re.match(r'^  \{\s*(\d+),\s*\d+,\s*4,\s*(0x\w+),\s*(0x\w+)', line)
    if record and int(record[3], 16) & 1:
        if int(record[2], 16) & (1 << 2):
            neck_rules.add(int(record[1]))
        if int(record[2], 16) & (1 << 11):
            ring_rules.add(int(record[1]))
direct_neck = set()
for line in (data / 'spell_item_enchantment.inc').open():
    record = re.match(r'^  \{\s*(\d+),[^{}]+\{([^}]+)\},\s*\{[^}]+\},\s*\{([^}]+)\}', line)
    if record and int(record[1]) in neck_rules:
        kinds, stats = (list(map(int, record[i].split(','))) for i in (2, 3))
        if kinds == [5, 0, 0] and stats[0] in (32, 36, 40, 49) and stats[1:] == [0, 0]:
            direct_neck.add(int(record[1]))
assert direct_neck and enabled_neck == direct_neck, (enabled_neck, direct_neck)
print(f'Verified {len(direct_neck)} direct neck enchants')

# The enchant spell is tried first. Check that its average is identically zero,
# then compare the actual fallback inputs to item_enchantment_effect_stats.
source = neck_module.read_text().split('const equalNeckEnchantRanks = new Map([', 1)[1].split(']);', 1)[0]
pairs = [tuple(map(int, pair)) for pair in re.findall(r'\[(\d+), (\d+)\]', source)]
paired_ids = {eid for pair in pairs for eid in pair}
assert pairs and paired_ids <= direct_neck and len(paired_ids) == 2 * len(pairs)
ring_source = module.with_name('auctionRingRatings.ts').read_text()
decl = ring_source.split('const legacyRingEnchantGroups90 = ', 1)[1].split(' as const;', 1)[0]
ring_groups = json.loads(re.sub(r',\s*]', ']', decl))
ring_ids = {eid for group in ring_groups for eid in group}
assert ring_ids and ring_ids <= ring_rules and sum(map(len, ring_groups)) == len(ring_ids)

# dbc_t::spell_scaling indexes class_id(scale) and level-1. SimC reads
# ench_coeff as a float and rounds the positive product with floor(x+0.5).
scales = (data / 'sc_scale_data.inc').read_text().split('double __spell_scaling[][90] = {', 1)[1].split('};', 1)[0]
tables = [list(map(float, row.strip().rstrip(',').split(',')))
          for row in re.findall(r'\{([^{}]+)\}', re.sub(r'//[^\n]*', '', scales))]
class_id = {-1: 14, -3: 16, -4: 17, -5: 18, -7: 14}
rating_order = [32, 36, 49, 40]
joint_ratings = {eid: (rating_order[index % 4], 1 + index // 4)
                 for index, group in enumerate(ring_groups) for eid in group}
war_amounts = json.loads(ring_source.split('const warWithinRingAmounts90 = ', 1)[1].split(' as const;', 1)[0])
assert len(war_amounts) == 6
for axis, stat in enumerate(rating_order):
    for rank, amount in enumerate(war_amounts):
        joint_ratings[7329 + axis*6 + rank] = (stat, amount)
def rating_list(name):
    return json.loads(re.sub(r',\s*]', ']', ring_source.split(f'const {name} = ', 1)[1].split(' as const;', 1)[0]))
for stat, ranks in zip(rating_order, rating_list('enchantRanks90'), strict=True):
    for eid, amount in zip(ranks, rating_list('enchantAmounts90'), strict=True):
        joint_ratings[eid] = (stat, amount)
assert len(joint_ratings) == 92 and joint_ratings.keys() <= ring_rules
weapon_source = module.with_name('auctionGearEnhancementStage.ts').read_text()
weapon_groups = json.loads(weapon_source.split('const weaponScrollGroups90 = ', 1)[1].split(' as const;', 1)[0])
weapon_stats = [(4, 7), (5, 10), (38, 12), (45, 7), (45, 14)]
weapon_ratings = {eid: stat for group, stat in zip(weapon_groups, weapon_stats, strict=True) for eid in group}
weapon_stats_by_id = {}
assert len(weapon_ratings) == 11 and not (weapon_ratings.keys() & joint_ratings.keys())
weapon_rules = set()
for line in (data / 'permanent_enchant.inc').open():
    entry = re.match(r'^  \{\s*(\d+),\s*\d+,\s*2,', line)
    if entry:
        weapon_rules.add(int(entry[1]))
assert weapon_ratings.keys() <= weapon_rules
fallback, spell_enchants, ring_rating = {}, {}, {}
for line in (data / 'spell_item_enchantment.inc').open():
    row = re.match(r'^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{[^}]+\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*(\d+),', line)
    if not row:
        continue
    eid, _, scaling, scaling_min, cap, minimum, maximum, skill, rank = map(int, row[1].split(','))
    if eid in joint_ratings or eid in paired_ids or eid in weapon_ratings:
        if eid in ring_ids or eid in weapon_ratings:
            assert (minimum, maximum) == (10, 120), eid
        elif 7329 <= eid <= 7352:
            assert (minimum, maximum) == (70, 170), eid
        assert scaling != 0 and skill == rank == 0
        fallback[eid] = (scaling, scaling_min, cap, minimum, maximum, row[2], row[3], row[4])
        if int(row[5]):
            spell_enchants[int(row[5])] = eid
        if eid in joint_ratings or eid in weapon_ratings:
            kinds, stats = [list(map(int, row[i].split(','))) for i in (2, 3)]
            assert kinds == [5, 0, 0] and stats[1:] == [0, 0]
            assert scaling_min == 0 and 0 < cap <= 90 and scaling in class_id
            coefficient = float(row[4].split(',')[0].strip().removesuffix('f'))
            native_float = struct.unpack('f', struct.pack('f', coefficient))[0]
            observed = weapon_stats_by_id if eid in weapon_ratings else ring_rating
            observed[eid] = (stats[0], math.floor(tables[class_id[scaling]][cap-1] * native_float + 0.5))
assert joint_ratings == ring_rating
assert weapon_ratings == weapon_stats_by_id
for a, b in pairs:
    assert fallback[a] == fallback[b], (a, b)
assert paired_ids <= set(spell_enchants.values())
for group in ring_groups:
    assert len(group) >= 2 and len({ring_rating[eid] for eid in group}) == 1, group
spells, effects = set(), {}
in_effects = False
for line in (data / 'sc_spell_data.inc').open():
    spell = re.match(r'^  \{ "[^"]+"\s*,\s*(\d+),([^{}]+)', line)
    if spell and int(spell[1]) in spell_enchants:
        assert int(spell[2].split(',')[8]) == 0  # spell_data_t::_scale_from_ilevel
        spells.add(int(spell[1]))
    if line.startswith('static spelleffect_data_t __spelleffect_data['):
        in_effects = True
    elif line.startswith('};'):
        in_effects = False
    elif in_effects:
        fields = re.sub(r'\{[^{}]+\}', 'flags', line.strip().removeprefix('{').removesuffix('},')).split(',')
        sid = int(fields[1])
        if sid in spell_enchants:
            assert sid not in effects and int(fields[2]) == 0 and int(fields[3]) == 53
            assert all(float(fields[i]) == 0 for i in (7, 15, 22))  # scaling coefficient, base, points per level
            effects[sid] = int(fields[16])
assert spells == spell_enchants.keys() and effects == spell_enchants
# Direct reads of a hand's permanent enchant ID in combat concern
# effect 4083 and the Death Knight runeforges.
# Each whitelisted scroll must follow the same (unmatched) path.
native = data.parents[1]
hand_readers = set()
for subtree in ('class_modules', 'player'):
    for path in (native / subtree).rglob('*'):
        if path.suffix not in ('.cpp', '.hpp'):
            continue
        text = path.read_text(errors='replace')
        assert 'encoded_enchant' not in text and 'option_enchant_id_str' not in text, path
        if 'parsed.enchant_id' in text:
            hand_readers.add(path.relative_to(native).as_posix())
assert hand_readers == {'class_modules/sc_death_knight.cpp', 'player/unique_gear.cpp'}
unique_checks = (native / 'player/unique_gear.cpp').read_text()
checked_ids = {int(v) for v in re.findall(r'parsed\.enchant_id\s*==\s*(\d+)', unique_checks)}
dk = (native / 'class_modules/sc_death_knight.cpp').read_text()
checked_ids.update(int(v) for v in re.findall(r'RUNEFORGE_ID_\w+\s*=\s*(\d+)', dk))
assert 4083 in checked_ids and 3368 in checked_ids and not checked_ids.intersection(weapon_ratings)
print(f'Verified {len(weapon_ratings)} pure level-90 weapon scrolls in {len(weapon_groups)} equal-stat groups')
print(f'Verified {len(pairs)} neck scroll pairs with identical native ratings')
print(f'Verified {len(joint_ratings)} two-ring scroll contributions and {len(ring_groups)} legacy substitution groups')

# Verify both complete sides of the exact cross-slot armor substitutions. All
# records in this proof use only the fallback at player level 90, with no
# enchant spell, skill gate, proc, or implicit effect.
armor_source = module.with_name('auctionGearEnhancementOptimizer.ts').read_text()
source = armor_source.split('const armorEnchantExchanges90 = {', 1)[1].split('} as const;', 1)[0]
armor_pairs = {slot: json.loads(rows) for slot, rows in
               re.findall(r'(SHOULDER|FEET): (\[\[.*?\]\])', source, re.S)}
assert set(armor_pairs) == {'SHOULDER', 'FEET'}
armor_ids = {eid for rows in armor_pairs.values() for pair in rows for eid in pair if eid}
inventory = {}
for line in (data / 'permanent_enchant.inc').open():
    row = re.match(r'^  \{\s*(\d+),\s*\d+,\s*4,\s*(0x\w+)', line)
    if row and int(row[1]) in armor_ids:
        inventory[int(row[1])] = int(row[2], 16)
armor = {0: (0, 0, 0, 0)}
for line in (data / 'spell_item_enchantment.inc').open():
    row = re.match(r'^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{[^}]+\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*(\d+),', line)
    if not row:
        continue
    eid, _, scaling, scale_min, cap, minimum, maximum, skill, rank = map(int, row[1].split(','))
    if eid not in armor_ids:
        continue
    assert (scaling, scale_min, cap, minimum, maximum, skill, rank, int(row[5])) == (-7, 0, 80, 120, 0, 0, 0, 0), eid
    kinds, stats = (list(map(int, row[i].split(','))) for i in (2, 3))
    coefficients = [float(x.strip().removesuffix('f')) for x in row[4].split(',')]
    vector = [0, 0, 0, 0]
    for kind, stat, coefficient in zip(kinds, stats, coefficients, strict=True):
        if kind == 0:
            assert stat == coefficient == 0
            continue
        assert kind == 5 and stat in (7, 61, 62, 63) and coefficient > 0, eid
        native_float = struct.unpack('f', struct.pack('f', coefficient))[0]
        vector[(7, 61, 62, 63).index(stat)] += math.floor(tables[class_id[scaling]][cap-1] * native_float + 0.5)
    armor[eid] = tuple(vector)
assert set(armor) == armor_ids | {0}
for slot, rows in armor_pairs.items():
    for a, b, c, d in rows:
        assert a != c and b != d
        assert all(inventory[eid] == 1 << 1 for eid in (a, c) if eid)
        assert all(inventory[eid] == 1 << {'SHOULDER': 3, 'FEET': 8}[slot] for eid in (b, d))
        assert tuple(map(sum, zip(armor[a], armor[b]))) == tuple(map(sum, zip(armor[c], armor[d]))), (a, b, c, d)
print(f'Verified {sum(map(len, armor_pairs.values()))} level-90 cross-slot armor exchanges')
