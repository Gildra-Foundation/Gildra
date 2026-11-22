"""Verify the auction gem score tables against a pinned SimC engine/dbc/generated directory."""
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys

root = Path(sys.argv[1])
proof = Path(__file__).resolve().parents[3] / "lib/wow/auctionGearMechanicalCache.ts"
pairs = re.findall(r"\[(\d+), (\d+)\]", proof.read_text().split("const equivalentGems =", 1)[1].split("]);", 1)[0])
assert pairs and len({a for a, _ in pairs}) == len(pairs)
ids = {int(item) for pair in pairs for item in pair}
# Compare the application's explicit numeric table to the same DBC operations
# as item_enchantment_effect_stats at player level 90, including float rounding.
ratings_source = proof.with_name("auctionRingRatings.ts").read_text()
def table(name):
    declaration = ratings_source.split(f"const {name} = ", 1)[1].split(" as const;", 1)[0]
    return json.loads(declaration.replace(",\n]", "\n]"))

rating_stats = (32, 36, 49, 40)
gem_ratings = {gem: (stat, amount) for stat, groups in zip(rating_stats, table("gemRanks90"), strict=True)
               for amount, group in enumerate(groups, 1) for gem in group}
enchant_ratings = {eid: (stat, amount) for stat, group in zip(rating_stats, table("enchantRanks90"), strict=True)
                  for eid, amount in zip(group, table("enchantAmounts90"), strict=True)}
assert len(gem_ratings) == 40 and len(enchant_ratings) == 16
ids.update(gem_ratings)
midnight_table = proof.with_name("auctionMidnightGemRatings.ts").read_text().split(
    "const midnightGemRows = ", 1)[1].split(" as const;", 1)[0]
midnight_rows = json.loads(midnight_table.replace(",\n]", "\n]"))
midnight = {sku: (description, ratings) for sku, description, *ratings in midnight_rows}
assert len(midnight_rows) == len(midnight) == 64
assert {d for d, _ in midnight.values()} == {14262, 14276, 14277, 14278}
ids.update(midnight)
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
# Extract the worker's observable rating for each supported explicit armor enchant.
worker = proof.parents[4] / "backend/internal/rotationlab/armor_batch.go"
armor = {}
for slot, body in re.findall(r'case "(FEET|HEAD|SHOULDER)":(.*?)(?=\n\t(?:case "|default:))', worker.read_text(), re.S):
    for id_list, axis in re.findall(r'case ([0-9, ]+):\s+axis = armor(Speed|Leech|Avoidance)', body):
        for token in id_list.split(","):
            armor[int(token)] = (slot, {"Speed": 61, "Leech": 62, "Avoidance": 63}[axis])
assert len(armor) == 24
required = {properties[items[i]][0] for i in ids} | set(enchant_ratings) | set(armor)
enchants = {}
for line in (root / "spell_item_enchantment.inc").open():
    row = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*(\d+),", line)
    if not row:
        continue
    eid, gem_id, scaling_class, floor, cap, low, high, skill, required_skill = map(int, row[1].split(","))
    if eid not in required:
        continue
    types, amounts, stats = [list(map(int, group.split(","))) for group in row.group(2, 3, 4)]
    assert not skill and int(row[6]) == 0 and set(types) <= {0, 5}
    if gem_id in midnight:
        assert (scaling_class, floor, cap, low, high, required_skill) == (-7, 0, 80, 80, 0, 0)
        assert all(stat in rating_stats for kind, stat in zip(types, stats) if kind == 5)
    # util::class_id maps both -1 and -7 to column 14. Unknown classes fail.
    budget = budgets[{-1:14, -2:15, -3:16, -4:17, -5:18, -7:14}[scaling_class]] if scaling_class else None
    coeff = [struct.unpack("f", struct.pack("f", float(c.strip().rstrip("f"))))[0] for c in row[5].split(",")]
    enchants[eid] = (low, high, [
        tuple((s, (math.floor(budget[min(level, cap or level)-1] * c + 0.5) if budget is not None else fixed)) for t, s, c, fixed in zip(types, stats, coeff, amounts) if t == 5)
        for level in range(1, 91)
    ])

def signature(item):
    enchant, color, description = properties[items[int(item)]]
    assert color == 14  # ordinary prismatic gem, including socket bonus matching
    # Swaps between single-socket jewelry pieces use only hosts of level ten or higher.
    # No enabled gem has an upper level gate or a Midnight gem-description tag.
    low, high, _ = enchants[enchant]
    assert 0 <= low <= 10 and high == 0 and description == 0
    return color, description, enchants[enchant]

for a, b in pairs:
    assert signature(a) == signature(b), (a, b)
print(f"Verified {len(pairs)} pairs at all 90 levels")

gate_by_rating = {}
for gem, rating in gem_ratings.items():
    enchant, color, description = properties[items[gem]]
    low, high, amounts = enchants[enchant]
    assert color == 14 and description == 0 and 0 <= low <= 120 and high == 0
    assert amounts[89] == (rating,), (gem, rating, amounts[89])
    # The owned item retains its native level and bonuses. Either both
    # explicit replacement gems pass the exact native host gate, or neither does.
    assert gate_by_rating.setdefault(rating, (low, high)) == (low, high)
for eid, rating in enchant_ratings.items():
    low, high, amounts = enchants[eid]
    assert low == 120 and high == 0 and amounts[89] == (rating,), (eid, amounts[89])
print(f"Verified {len(gem_ratings)} gem ratings and {len(enchant_ratings)} enchant ratings at level 90")

for sku, (tag, ratings) in midnight.items():
    enchant, color, actual_tag = properties[items[sku]]
    low, high, levels = enchants[enchant]
    assert (color, actual_tag, low, high) == (14, tag, 80, 0)
    actual = [sum(value for stat, value in levels[89] if stat == axis) for axis in rating_stats]
    assert actual == ratings, (sku, ratings, actual)
print(f"Verified {len(midnight)} Midnight socket IDs, descriptions and individually rounded level-90 ratings")

stamina_per_rank = {}
for eid, (slot, stat) in armor.items():
    low, high, levels = enchants[eid]
    assert (low, high) == (120, 0)
    for level, values in enumerate(levels, 1):
        assert tuple(k for k, _ in values) == ((stat, 7) if slot == "FEET" else (stat,))
        if slot == "FEET":
            stamina = values[1][1]
            assert stamina_per_rank.setdefault((level, eid % 2), stamina) == stamina
print(f"Verified {len(armor)} armor enchant effects and boot stamina at all 90 levels")
