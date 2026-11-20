"""Check the pinned native bonus programs used by bare waist dominance."""
from pathlib import Path
import re
import sys

expected = {
    6652: [(0, 0, 0, 0, 0, 0)],
    13663: [(0, 0, 0, 0, 0, 0)],
    13695: [(6, 1, 7, 0, 0, 0), (26, 5, 0, 0, 0, 1), (9, 12, 0, 0, 0, 2)],
    13696: [(0, 0, 0, 0, 0, 0)],
    13901: [(27, 115477, 0, 0, 0, 0), (47, 2, 0, 0, 0, 1),
            (51, 482, 1, 0, 0, 2), (3, 3, 0, 0, 0, 3)],
}
actual = {key: [] for key in expected}
for line in (Path(sys.argv[1]) / 'item_bonus.inc').open():
    match = re.fullmatch(r'\s*\{\s*([\d,\s-]+)\},\s*', line)
    if match:
        _, bonus, *operation = map(int, match[1].split(','))
        if bonus in actual:
            actual[bonus].append(tuple(operation))
assert actual == expected, actual
print('Verified the empty-socket and socketless waist bonus programs')
