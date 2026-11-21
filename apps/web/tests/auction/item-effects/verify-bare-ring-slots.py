"""Check the pinned native tables behind the bare purchased-ring slot proof.

Pass the SimC engine/dbc/generated directory. Rings cannot observe a changed
parent level or change which child inherits their level. A local ring cannot
carry an artifact through its base DBC record. Its socket bonus can only add
stats to that same item.
"""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
parents_or_children = set()
for line in (root / "item_child.inc").read_text().splitlines():
    match = re.match(r"\s*\{\s*\d+,\s*(\d+),\s*(\d+)\s*\}", line)
    if match:
        parents_or_children.update(map(int, match.groups()))
assert parents_or_children

declared = 0
parsed = 0
rings = set()
socket_bonuses = set()
with (root / "item_data.inc").open() as items:
    for line in items:
        chunk = re.match(r"static const std::array<dbc_item_data_t, (\d+)> __item_data_chunk", line)
        if chunk:
            declared += int(chunk[1])
        row = re.match(r'\s*\{ "(?:[^"\\]|\\.)*",\s*(\d+), (.+) \},', line)
        if not row:
            continue
        parsed += 1
        item_id = int(row[1])
        # Relative to flags_1 in dbc_item_data_t (right after id), including
        # its three socket-color entries. The last five fields are socket
        # bonus ID, set ID, curve ID, artifact ID and crafting quality.
        fields = row[2].split(", ")
        if int(fields[8]) != 11:
            continue
        assert item_id not in parents_or_children and int(fields[-2]) == 0, item_id
        rings.add(item_id)
        if bonus := int(fields[-5]):
            socket_bonuses.add(bonus)

assert parsed == declared and len(rings) == 4170, (declared, parsed, len(rings))
enchantments = {}
for line in (root / "spell_item_enchantment.inc").open():
    match = re.match(r"\s*\{\s*(\d+),[^{}]+\{\s*([\d,\s]+)\}", line)
    if match:
        enchantments[int(match[1])] = tuple(map(int, match[2].split(",")))
for bonus in socket_bonuses:
    operations = enchantments[bonus]
    assert len(operations) == 3 and 5 in operations and set(operations) <= {0, 5}, (bonus, operations)

planner = Path(__file__).resolve().parents[3] / "lib/wow/auctionGearRingMirrors.ts"
listed = re.search(r"statOnlyRingSocketBonuses = new Set\(\[([^\]]+)\]", planner.read_text())
assert listed and set(map(int, re.findall(r"\d+", listed[1]))) == socket_bonuses
print(f"Verified {len(rings)} rings and {len(socket_bonuses)} stat-only socket bonuses across {parsed} pinned item records")
