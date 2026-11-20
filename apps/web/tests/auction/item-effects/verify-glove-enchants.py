"""Check the profession glove equivalences against the worker's pinned SimC source tree."""
from pathlib import Path
import re
import sys

engine = Path(sys.argv[1])
generated = engine / "dbc/generated"
cache = Path(__file__).resolve().parents[3] / "lib/wow/auctionGearMechanicalCache.ts"
listed = re.search(r"const professionGloveEnchants = new Set\(\[([\d, ]+)\]", cache.read_text())
ids = set(map(int, listed[1].split(",")))
drivers = set()
found = set()
for line in (generated / "spell_item_enchantment.inc").open():
    m = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\}", line)
    if not m:
        continue
    eid, *flags = map(int, m[1].split(","))
    if eid not in ids:
        continue
    # Fishing has a maximum scaling level, but none of its coefficients adds a stat.
    assert flags == ([0, 0, 0, 50, 0, 0, 0, 0] if eid == 2603 else [0] * 8)
    coeff = re.match(r",\s*\{([^}]+)\}", line[m.end():])
    assert coeff and all(float(value.strip().removesuffix("f")) == 0 for value in coeff[1].split(","))
    found.add(eid)
    for kind, amount, spell in zip(*[map(int, col.split(",")) for col in m.group(2, 3, 4)], strict=True):
        assert amount == 0
        if kind:
            assert kind == 3 and spell > 0  # ITEM_ENCHANTMENT_EQUIP_SPELL
            drivers.add(spell)
        else:
            assert spell == 0
assert found == ids and drivers
present = set()
effects = set()
for line in (generated / "sc_spell_data.inc").open():
    spell = re.match(r'^  \{ "[^"]*"\s*,\s*(\d+),', line)
    if spell and int(spell[1]) in drivers:
        fields = line.split(",")
        assert int(fields[32], 0) == 0  # usable_proc requires proc flags
        present.add(int(spell[1]))
    aura = re.match(r"^  \{\s*\d+,\s*(\d+),\s*\d+,\s*(\d+),\s*(\d+),", line)
    if aura and int(aura[1]) in drivers:
        # Neither dummy nor flat label modifier is a supported passive_enchant
        # subtype. Disallow other aura types if the engine data changes.
        assert int(aura[2]) == 6 and int(aura[3]) in (4, 219)
        effects.add(int(aura[1]))
assert drivers - present == {13611, 13614, 13697, 13838, 13839, 24303, 44507, 71691} and effects == present
# These drivers have no explicit handler, hotfix or custom proc registration.
pattern = re.compile(r"\b(?:" + "|".join(map(str, drivers)) + r")\b")
for file in engine.rglob("*.cpp"):
    assert not pattern.search(file.read_text(errors="replace")), file
print(f"Verified {len(ids)} permanent glove enchants against {len(drivers)} native drivers")
