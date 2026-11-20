"""Verify the additive rating contract for the cached ring enchant swaps."""
from pathlib import Path
import json
import re
import sys

data = Path(sys.argv[1])
module = Path(__file__).resolve().parents[3] / 'lib/wow/auctionRingRatings.ts'
declaration = module.read_text().split('const enchantRanks90 = ', 1)[1].split(' as const;', 1)[0]
enabled = {eid for group in json.loads(declaration.replace(',\n]', '\n]')) for eid in group}
verified = set()
for line in (data / 'spell_item_enchantment.inc').open():
    r = re.match(r'^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*(\d+),\s*"Enchant Ring - ', line)
    if not r:
        continue
    eid, _, scaling, _, cap, minimum, maximum, profession, rank = map(int, r[1].split(','))
    kinds, amounts, stats = [list(map(int, r[i].split(','))) for i in (2, 3, 4)]
    if kinds != [5, 0, 0] or stats[0] not in (32, 36, 40, 49):
        continue
    # SimC obtains the integer amount from the player's capped level.
    # No item-level multiplier, skill gate, driver spell, proc or bonus.
    assert (scaling, cap, minimum, maximum, profession, rank) == (-7, 80, 120, 0, 0, 0)
    assert amounts == [0, 0, 0] and stats[1:] == [0, 0] and int(r[6]) == 0
    coeff = [float(x.strip().rstrip('f')) for x in r[5].split(',')]
    assert coeff[0] > 0 and coeff[1:] == [0, 0]
    verified.add(eid)
assert enabled and verified == enabled, (verified - enabled, enabled - verified)
print(f'Verified {len(enabled)} direct secondary-rating ring enchants')
