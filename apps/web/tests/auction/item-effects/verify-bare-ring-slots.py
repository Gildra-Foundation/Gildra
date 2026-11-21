"""Check the pinned native tables behind the bare purchased-ring slot proof.

Pass the SimC engine/dbc/generated directory. Rings cannot observe a changed
parent level or change which child inherits their level. A local item cannot
carry an artifact through its base DBC record either.
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
        # its three socket-color entries. id_artifact precedes crafting_quality.
        fields = row[2].split(", ")
        if int(fields[8]) != 11:
            continue
        assert item_id not in parents_or_children and int(fields[-2]) == 0, item_id
        rings.add(item_id)

assert parsed == declared and len(rings) == 4170, (declared, parsed, len(rings))
print(f"Verified all {len(rings)} rings across {parsed} pinned native item records")
