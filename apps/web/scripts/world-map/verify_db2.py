#!/usr/bin/env python3
"""Cross-check the DB2 reader: UiMap and UiMapAssignment read from the game files
must equal the catalog DB rows of the latest retail build (field by field).

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/verify_db2.py --work /tmp/wm-work
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sources import CatalogDB, GameTables  # noqa: E402


def compare(name: str, game_rows: dict, db_rows: dict) -> int:
    checked = diffs = 0
    for row_id, db_row in db_rows.items():
        game_row = game_rows.get(row_id)
        if game_row is None:
            diffs += 1
            print(f"  {name} {row_id}: missing in game files")
            continue
        for key, value in db_row.items():
            if key not in game_row:
                continue
            ours = game_row[key]
            checked += 1
            if isinstance(value, list):
                ok = len(value) == len(ours) and all(abs(float(a) - float(b)) <= 1e-3 * max(1.0, abs(float(a))) for a, b in zip(value, ours))
            elif isinstance(ours, float) or isinstance(value, float):
                ok = abs(float(ours) - float(value)) <= 1e-3 * max(1.0, abs(float(value)))
            else:
                ok = str(ours) == str(value)
            if not ok:
                diffs += 1
                if diffs <= 10:
                    print(f"  {name} {row_id}.{key}: game {ours!r} db {value!r}")
    print(f"{name}: {len(db_rows)} db rows, {len(game_rows)} game rows, {checked} values, {diffs} differences")
    return diffs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, required=True)
    args = parser.parse_args()
    db = CatalogDB(args.work / "db")
    build_id, version = db.latest_retail_build()
    game = GameTables("wow", args.work)
    print(f"catalog {version} vs game files {game.version}")
    diffs = 0
    for name in ("UiMap", "UiMapAssignment"):
        diffs += compare(name, game.table(name), db.table(name, build_id))
    sys.exit(1 if diffs else 0)


if __name__ == "__main__":
    main()
