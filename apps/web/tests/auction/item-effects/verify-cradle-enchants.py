"""Check both Worldsoul Cradle ranks against the SimC tree used for the worker."""
from pathlib import Path
import re
import sys

engine = Path(sys.argv[1])
generated = engine / "dbc/generated"
drivers = {8006: 1236735, 8007: 1236736}
seen = set()
for line in (generated / "spell_item_enchantment.inc").open():
    row = re.match(r"^  \{\s*([^{}]+),\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\},\s*\{([^}]+)\}", line)
    if not row:
        continue
    eid, *flags = map(int, row[1].split(","))
    if eid in drivers:
        assert flags == [0, 0, 0, 80, 120, 0, 0, 0]
        assert list(map(int, row[2].split(","))) == [3, 0, 0]  # EQUIP_SPELL
        assert list(map(int, row[3].split(","))) == [0, 0, 0]
        assert list(map(int, row[4].split(","))) == [drivers[eid], 0, 0]
        assert not any(float(c.strip().removesuffix("f")) for c in row[5].split(","))
        seen.add(eid)
assert seen == drivers.keys()

proc_flags = {}
effects = {spell: [] for spell in drivers.values()}
for line in (generated / "sc_spell_data.inc").open():
    row = re.match(r'^  \{ "Worldsoul Cradle"\s*,\s*(\d+),', line)
    if row and int(row[1]) in effects:
        proc_flags[int(row[1])] = int(line.split(",")[32], 0)
    row = re.match(r"^  \{\s*\d+,\s*(\d+),\s*\d+,\s*(\d+),\s*(\d+),[^{}]+\{[^}]+\},\s*(\d+),", line)
    if row and int(row[1]) in effects:
        effects[int(row[1])].append(tuple(map(int, row.groups()[1:])))
assert proc_flags == dict.fromkeys(drivers.values(), 0)
assert all(rows == [(6, 285, 1241724)] for rows in effects.values())  # APPLY_AURA, LINKED
# passive_enchant ignores A_LINKED. With no custom handler or driver proc
# flags, usable_proc rejects the driver before any linked spell can execute.
handler = re.compile(r"\b(?:1236735|1236736|1241724|1242003)\b|worldsoul.cradle", re.I)
for suffix in ("*.cpp", "*.hpp"):
    for path in engine.rglob(suffix):
        assert not handler.search(path.read_text(errors="replace")), path
print("Verified both Worldsoul Cradle drivers and their linked aura")
