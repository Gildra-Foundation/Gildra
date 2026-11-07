"""Data sources for the world map: the read-only catalog DB and the game files."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from tact import LOCALE_ENUS, LOCALE_RURU, TactClient
from wdc import parse_dbd, read_db2

DBD_URL = "https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/definitions/{}.dbd"
MANIFEST_URL = "https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/manifest.json"
PSQL = ["sudo", "-n", "docker", "exec", "gildra-postgres-1", "psql", "-U", "gildra", "-d", "gildra", "-At", "-c"]

# Tables read from the game files (absent from the catalog DB, or needed per product build).
GAME_TABLES = (
    "UiMap",
    "UiMapAssignment",
    "UiMapLink",
    "UiMapArt",
    "UiMapArtTile",
    "UiMapXMapArt",
    "UiMapArtStyleLayer",
    "UiMapGroupMember",
    "TaxiNodes",
    "AreaPOI",
    "JournalInstanceEntrance",
)
LOCALIZED = {"UiMap", "TaxiNodes", "AreaPOI", "UiMapGroupMember"}


def _fetch(url: str) -> bytes:
    from tact import _http

    return _http(url)


def _numeric(value):
    if isinstance(value, str):
        if re.fullmatch(r"-?\d+", value):
            return int(value)
        if re.fullmatch(r"-?\d+\.\d*(e-?\d+)?|-?\d+e-?\d+", value, re.I):
            return float(value)
    return value


def normalize_db_row(payload: dict) -> dict:
    """catalog_db2_rows payloads are wago CSV rows: strings, arrays as Name_0..Name_n."""
    out: dict = {}
    arrays: dict[str, dict[int, object]] = {}
    for key, value in payload.items():
        match = re.fullmatch(r"(.+?)_(\d+)", key)
        if match and not key.endswith("_lang") and not key.startswith("Field_"):
            arrays.setdefault(match.group(1), {})[int(match.group(2))] = _numeric(value)
        else:
            out[key] = _numeric(value)
    for name, items in arrays.items():
        out[name] = [items[i] for i in sorted(items)]
    return out


class CatalogDB:
    """SELECT-only access to catalog_db2_rows through the postgres container."""

    def __init__(self, cache: Path):
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)

    def query(self, sql: str) -> str:
        return subprocess.run(PSQL + [sql], check=True, capture_output=True, text=True).stdout

    def latest_retail_build(self) -> tuple[int, str]:
        rows = self.query(
            "SELECT DISTINCT build_id, substring(source_url from 'build=([0-9.]+)') FROM catalog_db2_rows "
            "WHERE table_name='UiMap' AND locale='en_US'"
        )
        builds = []
        for line in rows.splitlines():
            build_id, version = line.split("|")
            parts = tuple(int(p) for p in version.split("."))
            if parts[0] >= 10:  # retail only (classic products are 1.x-5.x)
                builds.append((parts, int(build_id), version))
        _, build_id, version = max(builds)
        return build_id, version

    def table(self, name: str, build_id: int, locale: str = "en_US") -> dict[int, dict]:
        path = self.cache / f"db-{name}-{build_id}-{locale}.json"
        if not path.exists():
            text = self.query(
                "SELECT coalesce(json_agg(payload ORDER BY row_id::bigint), '[]') FROM catalog_db2_rows "
                f"WHERE table_name='{name}' AND build_id={int(build_id)} AND locale='{locale}'"
            )
            path.write_text(text)
        rows = [normalize_db_row(row) for row in json.loads(path.read_text())]
        return {row["ID"]: row for row in rows}


class GameTables:
    """DB2 tables read from one product's current build on the public CDN."""

    def __init__(self, product: str, cache: Path):
        self.cache = cache
        self.client = TactClient(product, cache / product)
        self.version = self.client.version_name
        self._dbd: dict[str, object] = {}
        manifest_path = cache / "dbd-manifest.json"
        if not manifest_path.exists():
            manifest_path.write_bytes(_fetch(MANIFEST_URL))
        self.manifest = {e["tableName"]: e.get("db2FileDataID") for e in json.loads(manifest_path.read_text())}

    def definition(self, table: str):
        if table not in self._dbd:
            path = self.cache / "dbd" / f"{table}.dbd"
            path.parent.mkdir(exist_ok=True)
            if not path.exists():
                path.write_bytes(_fetch(DBD_URL.format(table)))
            self._dbd[table] = parse_dbd(path.read_text())
        return self._dbd[table]

    def table(self, name: str, locale: int = LOCALE_ENUS) -> dict[int, dict]:
        fdid = self.manifest[name]
        if not self.client.has_file(fdid):
            return {}
        return read_db2(self.client.read_fdid(fdid, locale), self.definition(name), self.version)

    def load(self, names=GAME_TABLES) -> dict[str, dict[int, dict]]:
        out = {}
        for name in names:
            out[name] = self.table(name)
            if name in LOCALIZED:
                out[name + "@ru"] = self.table(name, LOCALE_RURU)
        return out
