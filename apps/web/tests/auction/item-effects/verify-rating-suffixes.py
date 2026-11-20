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
