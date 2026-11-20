"""Verify the cache's purchased neck gem pairs against a local pinned SimC engine/dbc/generated directory."""
import hashlib
import math
from pathlib import Path
import re
import struct
import sys

root = Path(sys.argv[1])
proof = Path(__file__).resolve().parents[3] / "lib/wow/auctionGearMechanicalCache.ts"
pairs = re.findall(r"\[(\d+), (\d+)\]", proof.read_text().split("const equivalentNeckGems =", 1)[1].split("]);", 1)[0])
assert pairs and len({a for a, _ in pairs}) == len(pairs)
ids = {int(item) for pair in pairs for item in pair}
digests = {
    "item_data.inc": "223062c9cce5aaa70b45cc230c9f329ffcceb9ca0bb98a1dd6e42e29dcfa96d6",
    "gem_data.inc": "55738c79cd1363e066f474783b030e91560b76bf5835d002650dfab3a74f3883",
    "spell_item_enchantment.inc": "0be38e08232daa7d39cecdfef7c6df52ccf4622ae1d54f88fe9ecfaa4187802c",
    "sc_scale_data.inc": "aec04efc71cf52db465bb7a258c559101926eafb39b4b362fc82d619180fa0d3",
}
for name, digest in digests.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
items = {}
for line in (root / "item_data.inc").open():
    item = re.match(r'^  \{ "(.+?)",\s+(\d+),.*\{ [^}]* \},\s*(\d+),', line)
    if item and int(item[2]) in ids:
        # These name families are observed by Elemental Lariat and Dragonflight items.
        assert not any(s in item[1].lower() for s in ("neltharite", "ysemerald", "malygite", "alexstraszite", "nozdorite"))
        items[int(item[2])] = int(item[3])
properties = {}
for line in (root / "gem_data.inc").open():
    row = re.match(r'^  \{\s*(\d+),\s*(\d+),\s*(0x\w+),\s*(\d+) \}', line)
    if row:
        properties[int(row[1])] = (int(row[2]), int(row[3], 16), int(row[4]))
scaling = (root / "sc_scale_data.inc").read_text().split("double __spell_scaling[][90] = {", 1)[1].split("};", 1)[0]
scaling = re.sub(r"//[^\n]*", "", scaling)
budgets = [[float(x) for x in row.split(",") if x.strip()] for row in re.findall(r"\{([^{}]+)\}", scaling)]
assert len(budgets) == 23 and all(len(row) == 90 for row in budgets)
required = {properties[items[i]][0] for i in ids}
enchants = {}
for line in (root / "spell_item_enchantment.inc").open():
    row = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*(\d+),", line)
    if not row:
        continue
    eid, _, scaling_class, _, cap, low, high, skill, _ = map(int, row[1].split(","))
    if eid not in required:
        continue
    types, _, stats = [list(map(int, group.split(","))) for group in row.group(2, 3, 4)]
    assert not skill and int(row[6]) == 0 and set(types) <= {0, 5}
    # Only the three scaling classes used by these direct-stat pairs. Unknown inputs fail.
    budget = budgets[{-3: 16, -4: 17, -5: 18}[scaling_class]]
    coeff = [struct.unpack("f", struct.pack("f", float(c.strip().rstrip("f"))))[0] for c in row[5].split(",")]
    enchants[eid] = (low, high, [
        tuple((s, math.floor(budget[min(level, cap or level)-1] * c + 0.5)) for t, s, c in zip(types, stats, coeff) if t == 5)
        for level in range(1, 91)
    ])

def signature(item):
    enchant, color, description = properties[items[int(item)]]
    assert color == 14  # ordinary prismatic gem, including socket bonus matching
    return color, description, enchants[enchant]

for a, b in pairs:
    assert signature(a) == signature(b), (a, b)
print(f"Verified {len(pairs)} pairs at all 90 levels")
