"""Check indirect bonus lists for bare local replacements against pinned SimC DBC tables."""
import re
import sys
from collections import defaultdict
from pathlib import Path

root = Path(sys.argv[1])
bonuses = defaultdict(list)
rows = (root / 'item_bonus.inc').read_text().splitlines()
for line in rows:
    if line.startswith('  {'):
        _, list_id, kind, value, _, _, _, _ = map(int, re.findall(r'-?\d+', line))
        bonuses[list_id].append((kind, value))
assert sum(map(len, bonuses.values())) == 20226

# Native type 51 sets only the resolved item level and the Midnight scaling
# flag. Both lists have the same ignored operation types (27 and 47). The
# socket is supplied by the common list. No list can install an item effect,
# suffix, or a cross-item description tag.
assert bonuses[13668] == [(6, 1), (26, 5)]
assert bonuses[13729] == [(27, 101224), (47, 2), (51, 434)]
assert bonuses[13900] == [(27, 115477), (47, 2), (51, 481)]


# Automatic weapon oils and socket bonuses can reach apply_item_bonus via
# ITEM_ENCHANTMENT_APPLY_BONUS even when the replacement has no bonus_id.
enchantments = 0
applied = set()
for line in (root / 'spell_item_enchantment.inc').read_text().splitlines():
    if line.startswith('  {'):
        kinds, _, props = re.findall(r'\{\s*([\d, -]+)\}', line)[:3]
        for kind, prop in zip(map(int, kinds.split(',')), map(int, props.split(',')), strict=True):
            if kind == 11:
                applied.add(prop)
        enchantments += 1
assert enchantments == 5342 and applied
visited = set()
while applied:
    list_id = applied.pop()
    if list_id in visited:
        continue
    visited.add(list_id)
    for kind, value in bonuses.get(list_id, []):
        assert kind not in (13, 49, 51), (list_id, kind)
        if kind == 50:
            applied.add(value)
print(f'Checked {enchantments} enchantments and {len(visited)} reachable bonus lists')

# On weapons, the other accepted ordered program changes quality. It must
# remain distinct from the curve-only programs even when the level matches.
assert bonuses[6652] == [(0, 0)]
assert bonuses[13730] == [(27, 101224), (47, 2), (51, 435), (3, 3)]
