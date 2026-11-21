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

# The original Bronze Band of Force has one on-equip spell and no use spell.
# When its bonus list is empty the local item parser cannot add another effect.
band = 30804
driver = 26596
effects = []
for line in (root / "item_effect.inc").open():
    row = re.match(r"\s*\{\s*\d+,\s*(\d+),\s*(\d+),\s*\d+,\s*(\d+),", line)
    if row and int(row[2]) == band:
        effects.append((int(row[1]), int(row[3])))
assert band in rings and effects == [(driver, 1)]
spells = [line for line in (root / "sc_spell_data.inc").open()
          if re.match(r'\s*\{ "Weapon Damage"\s*,\s*26596,', line)]
assert len(spells) == 1 and int(spells[0].split(",")[32], 0) == 0
# A custom or passive initializer for this driver would supersede usable_proc.
engine = root.parent.parent
for ext in ("*.cpp", "*.hpp"):
    for path in engine.rglob(ext):
        assert not re.search(r"\b26596\b|bronze_band_of_force", path.read_text(errors="replace"), re.I), path
print("Verified the sole Bronze Band of Force driver has no proc flags or custom initializer")
