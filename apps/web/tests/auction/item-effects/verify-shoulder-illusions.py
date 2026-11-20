"""Verify the permanent shoulder enchant IDs against the pinned SimC engine."""
from pathlib import Path
import re
import sys

engine = Path(sys.argv[1])
generated = engine / "dbc/generated"
module = Path(__file__).resolve().parents[3] / "lib/wow/auctionGearMechanicalCache.ts"
table = module.read_text().split("const shoulderIllusions = new Set([", 1)[1].split("]);", 1)[0]
enabled = set(map(int, re.findall(r"\d+", table)))
verified = set()
drivers = set()
for line in (generated / "spell_item_enchantment.inc").open():
    if "Illusory Adornment" not in line:
        continue
    match = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{[^}]+\},\s*(\d+),", line)
    enchant, *flags = map(int, match[1].split(","))
    assert flags in ([0] * 8, [0, 0, 0, 80, 0, 0, 0, 0])
    kinds, amounts, spells = [list(map(int, match[i].split(","))) for i in (2, 3, 4)]
    # EQUIP_SPELL passes only its driver ID to the engine. It does not read
    # the stat-scaling coefficient on the newer cosmetic ranks.
    assert kinds == [3, 0, 0] and amounts == [0, 0, 0] and int(match[5]) == 0
    assert spells[0] > 0 and spells[1:] == [0, 0]
    verified.add(enchant)
    drivers.add(spells[0])
assert verified == enabled and len(drivers) > 0

present, effects = set(), set()
for line in (generated / "sc_spell_data.inc").open():
    spell = re.match(r'^  \{ "[^"]*"\s*,\s*(\d+),', line)
    if spell and int(spell[1]) in drivers:
        assert int(line.split(",")[32], 0) == 0  # usable_proc requires proc flags
        present.add(int(spell[1]))
    aura = re.match(r"^  \{\s*\d+,\s*(\d+),\s*\d+,\s*(\d+),\s*(\d+),", line)
    if aura and int(aura[1]) in drivers:
        assert (int(aura[2]), int(aura[3])) == (6, 4)  # apply dummy aura; no passive_enchant stat
        effects.add(int(aura[1]))
assert present == effects == drivers
handler = re.compile(r"\b(?:" + "|".join(map(str, drivers)) + r")\b|illusory.adornment", re.I)
for file in engine.rglob("*.cpp"):
    assert not handler.search(file.read_text(errors="replace")), file
print(f"Verified {len(verified)} shoulder illusions and {len(drivers)} inert spell drivers")
