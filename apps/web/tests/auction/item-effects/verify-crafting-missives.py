"""Verify the pinned item-bonus data used by auctionMissiveComparison."""
from collections import defaultdict
from pathlib import Path
import re
import sys

operations = defaultdict(list)
for line in (Path(sys.argv[1]) / "item_bonus.inc").read_text().splitlines():
    match = re.fullmatch(r"\s*\{\s*([\d,\s-]+)\},\s*", line)
    if match:
        _, bonus, kind, first, *rest = map(int, match[1].split(","))
        operations[bonus].append((kind, first, *rest))
        # Even a recursively applied list cannot reintroduce either placeholder
        # through ADD_STAT or MOD_ITEM_STAT before item_t::decode_stats.
        assert kind not in (2, 25) or first not in (24, 25), (bonus, kind, first)

for bonus, (first, second) in enumerate([(32, 36), (32, 49), (40, 36), (49, 36), (49, 40), (32, 40)], 8790):
    assert [op[:2] for op in operations[bonus]] == [(25, first), (25, second)], bonus

for bonus in (10394, 10395, 10832, 10833):
    assert operations[bonus] == [(0, 0, 0, 0, 0, 0)], bonus

print("Verified six two-stat missives, four rank markers and all placeholder writes")
