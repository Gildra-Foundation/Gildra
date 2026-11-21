"""Check the two-allocation native suffix contract for bare equipment."""
from collections import defaultdict
from pathlib import Path
import re
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
neck_rules = set()
for line in (data / 'permanent_enchant.inc').open():
    record = re.match(r'^  \{\s*(\d+),\s*\d+,\s*4,\s*(0x\w+),\s*(0x\w+)', line)
    if record and int(record[2], 16) & (1 << 2) and int(record[3], 16) & 1:
        neck_rules.add(int(record[1]))
direct_neck = set()
for line in (data / 'spell_item_enchantment.inc').open():
    record = re.match(r'^  \{\s*(\d+),[^{}]+\{([^}]+)\},\s*\{[^}]+\},\s*\{([^}]+)\}', line)
    if record and int(record[1]) in neck_rules:
        kinds, stats = (list(map(int, record[i].split(','))) for i in (2, 3))
        if kinds == [5, 0, 0] and stats[0] in (32, 36, 40, 49) and stats[1:] == [0, 0]:
            direct_neck.add(int(record[1]))
assert direct_neck and enabled_neck == direct_neck, (enabled_neck, direct_neck)
print(f'Verified {len(direct_neck)} direct neck enchants')
