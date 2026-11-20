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
        if 1 <= bonus <= 250:
            programs[bonus].append(operation)

verified = 0
for bonus, program in programs.items():
    if [op[0] for op in program] != [2, 2, 5]:
        continue
    for kind, rating, allocation, third, fourth, index in program[:2]:
        assert rating in (32, 36, 40, 49) and allocation > 0 and third == fourth == 0, bonus
    verified += 1
assert verified > 0
print(f'Verified {verified} pure secondary-rating suffix programs')

# Pin every exception for enchanted armor to the operation types handled
# directly by initialize_item_enchant and item_enchantment_effect_stats.
module = Path(__file__).resolve().parents[3] / 'lib/wow/auctionGearEffects.ts'
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
