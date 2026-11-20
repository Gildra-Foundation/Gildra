"""Check exactly what the pinned engine installs for the two hearthstone scrolls."""
from pathlib import Path
import re
import sys

engine = Path(sys.argv[1])
generated = engine / "dbc/generated"
drivers = {5970: (271365, 0, 0), 6222: (323929, 348272, 0)}
enchants = set()
for line in (generated / "spell_item_enchantment.inc").open():
    m = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\}", line)
    if not m:
        continue
    eid, *flags = map(int, m[1].split(","))
    if eid not in drivers:
        continue
    assert flags == [0, -3 if eid == 6222 else 0, 0, 0, 0, 0, 0, 0]
    kinds, amounts, spells = [tuple(map(int, m[i].split(","))) for i in (2, 3, 4)]
    assert kinds == tuple(3 if spell else 0 for spell in drivers[eid])  # EQUIP_SPELL
    assert amounts == (0, 0, 0) and spells == drivers[eid]
    assert all(float(c.strip().removesuffix("f")) == 0 for c in m[5].split(","))
    enchants.add(eid)
assert enchants == drivers.keys()

expected = {271365: [4], 323929: [341], 348272: [219, 219]}
effects = {spell: [] for spell in expected}
proc_flags = {}
for line in (generated / "sc_spell_data.inc").open():
    m = re.match(r'^  \{ "[^"]*"\s*,\s*(\d+),', line)
    if m and int(m[1]) in expected:
        proc_flags[int(m[1])] = int(line.split(",")[32], 0)
    row = re.match(r"^  \{\s*\d+,\s*(\d+),\s*\d+,\s*(\d+),\s*(\d+),[^{}]+\{[^}]+\},\s*(\d+),", line)
    if row and int(row[1]) in expected:
        assert int(row[2]) == 6 and int(row[4]) == 0  # APPLY_AURA, no trigger spell
        effects[int(row[1])].append(int(row[3]))
assert effects == expected
assert proc_flags == {271365: 0, 323929: 2, 348272: 0}
# Shaded Hearthing does have a proc flag. Its spell-category cooldown aura
# cannot create a stat/absorb buff, attack, spell, heal or resource action.
# All three aura subtypes also fall through enchant::passive_enchant.
handler = re.compile(r"\b(?:271365|323929|348272)\b|shaded.hearthing|safe.hearthing|forgeborne.reveries", re.I)
for suffix in ("*.cpp", "*.hpp"):
    for path in engine.rglob(suffix):
        assert not handler.search(path.read_text(errors="replace")), path
print("Verified both wrist enchants, their three drivers and all four native aura rows")
