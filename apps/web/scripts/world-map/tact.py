"""Minimal read-only TACT (NGDP) client for Blizzard's public CDN.

Reads a product's current build straight from the patch service and CDN, with
no login and no local game install:

  versions/cdns  ->  build config + CDN config
  encoding       ->  content key (CKey) -> encoded key (EKey)
  root (MFST)    ->  FileDataID -> CKey (per locale)
  archive index  ->  EKey -> (archive, offset, size)
  BLTE           ->  decoded file bytes

Formats follow the public documentation at https://wowdev.wiki/TACT and
https://wowdev.wiki/CASC.  Encrypted ('E') BLTE chunks are not supported; such
files raise ``EncryptedFile`` and are skipped by callers.

Everything downloaded is cached under ``cache_dir`` (keep it in /tmp and delete
it after a run).
"""

from __future__ import annotations

import bisect
import hashlib
import os
import struct
import time
import zlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PATCH_HOST = "http://us.patch.battle.net:1119"
LOCALE_ENUS = 0x2
LOCALE_RURU = 0x2000
CONTENT_LOW_VIOLENCE = 0x80
CONTENT_NO_NAME_HASH = 0x10000000


class EncryptedFile(Exception):
    pass


class MissingFile(Exception):
    pass


def _http(url: str, byte_range: tuple[int, int] | None = None, retries: int = 6, timeout: int = 60) -> bytes:
    headers = {"User-Agent": "gildra-world-map/1.0"}
    if byte_range:
        headers["Range"] = f"bytes={byte_range[0]}-{byte_range[1]}"
    last: Exception | None = None
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers=headers), timeout=timeout) as response:
                return response.read()
        except HTTPError as error:
            if error.code == 404:
                raise MissingFile(url) from error
            last = error
        except (URLError, TimeoutError, ConnectionError, OSError) as error:
            last = error
        time.sleep(min(30, 1.5 * 2 ** attempt))
    raise RuntimeError(f"GET {url} failed: {last}")


def parse_bpsv(text: str) -> list[dict[str, str]]:
    lines = [line for line in text.splitlines() if line and not line.startswith("##")]
    header = [column.split("!")[0] for column in lines[0].split("|")]
    return [dict(zip(header, line.split("|"))) for line in lines[1:]]


def parse_config(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for line in text.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.split()
    return out


def blte_decode(data: bytes, expected_ekey: bytes | None = None, zero_encrypted: bool = False) -> bytes:
    if data[:4] != b"BLTE":
        raise ValueError("not a BLTE stream")
    header_size = struct.unpack(">I", data[4:8])[0]
    if expected_ekey is not None:
        digest = hashlib.md5(data[: header_size or len(data)]).digest()
        if digest != expected_ekey:
            raise ValueError("BLTE header checksum mismatch")
    if header_size == 0:
        chunks = [(len(data) - 8, None)]
        position = 8
    else:
        flags = data[8]
        if flags != 0x0F:
            raise ValueError(f"unexpected BLTE flags {flags:#x}")
        count = int.from_bytes(data[9:12], "big")
        chunks = []
        cursor = 12
        for _ in range(count):
            compressed, decompressed = struct.unpack(">II", data[cursor : cursor + 8])
            chunks.append((compressed, decompressed))
            cursor += 24
        position = header_size
    out = bytearray()
    for compressed, decompressed in chunks:
        chunk = data[position : position + compressed]
        position += compressed
        mode = chunk[:1]
        if mode == b"N":
            out += chunk[1:]
        elif mode == b"Z":
            out += zlib.decompress(chunk[1:])
        elif mode == b"F":
            out += blte_decode(chunk[1:])
        elif mode == b"E":
            # DB2 files keep unreleased rows in encrypted chunks: zero-fill them
            # (the DB2 reader skips zeroed sections) instead of failing the table
            if not zero_encrypted or decompressed is None:
                raise EncryptedFile()
            out += bytes(decompressed)
        else:
            raise ValueError(f"unsupported BLTE chunk mode {mode!r}")
    return bytes(out)


@dataclass
class ArchiveLocation:
    archive: str
    offset: int
    size: int


class Encoding:
    """CKey -> EKey lookup over a decoded encoding file (binary search on pages)."""

    def __init__(self, data: bytes):
        if data[:2] != b"EN":
            raise ValueError("bad encoding magic")
        ckey_size, ekey_size = data[3], data[4]
        if (ckey_size, ekey_size) != (16, 16):
            raise ValueError("unexpected encoding key sizes")
        ce_page_kb, _espec_page_kb = struct.unpack(">HH", data[5:9])
        ce_pages, _espec_pages = struct.unpack(">II", data[9:17])
        espec_block = struct.unpack(">I", data[18:22])[0]
        cursor = 22 + espec_block
        self.first_keys: list[bytes] = []
        for page in range(ce_pages):
            self.first_keys.append(data[cursor : cursor + 16])
            cursor += 32
        self.pages_start = cursor
        self.page_size = ce_page_kb * 1024
        self.data = data

    def ekey(self, ckey: bytes) -> bytes | None:
        page = bisect.bisect_right(self.first_keys, ckey) - 1
        if page < 0:
            return None
        cursor = self.pages_start + page * self.page_size
        end = cursor + self.page_size
        data = self.data
        while cursor + 22 <= end:
            count = data[cursor]
            if count == 0:
                break
            key = data[cursor + 6 : cursor + 22]
            if key == ckey:
                return data[cursor + 22 : cursor + 38]
            cursor += 22 + 16 * count
        return None


class Root:
    """WoW root manifest: FileDataID -> [(locale_flags, content_flags, ckey)]."""

    def __init__(self, data: bytes):
        self.files: dict[int, list[tuple[int, int, bytes]]] = {}
        cursor = 0
        version = 0
        allow_unnamed = False
        if data[:4] == b"TSFM":
            first, second = struct.unpack("<II", data[4:12])
            if first < 100 and second < 100:  # 10.1.7+: header_size, version
                header_size, version = first, second
                total, named = struct.unpack("<II", data[12:20])
                cursor = header_size
            else:
                total, named = first, second
                cursor = 12
            allow_unnamed = total != named
        size = len(data)
        while cursor < size:
            if version >= 2:
                count, locale = struct.unpack("<II", data[cursor : cursor + 8])
                unk1, unk2 = struct.unpack("<II", data[cursor + 8 : cursor + 16])
                unk3 = data[cursor + 16]
                content = unk1 | unk2 | (unk3 << 17)
                cursor += 17
            else:
                count, content, locale = struct.unpack("<III", data[cursor : cursor + 12])
                cursor += 12
            deltas = struct.unpack(f"<{count}i", data[cursor : cursor + 4 * count])
            cursor += 4 * count
            legacy = data[:4] != b"TSFM"
            if legacy:
                ckeys = []
                for index in range(count):
                    ckeys.append(data[cursor : cursor + 16])
                    cursor += 24
            else:
                ckeys = [data[cursor + 16 * i : cursor + 16 * i + 16] for i in range(count)]
                cursor += 16 * count
                if not (allow_unnamed and content & CONTENT_NO_NAME_HASH):
                    cursor += 8 * count
            fdid = -1
            for index in range(count):
                fdid += deltas[index] + 1
                self.files.setdefault(fdid, []).append((locale, content, ckeys[index]))
        if cursor != size:
            raise ValueError("root parse did not end on file boundary")

    def ckey(self, fdid: int, locale: int = LOCALE_ENUS) -> bytes | None:
        entries = self.files.get(fdid)
        if not entries:
            return None
        preferred = [e for e in entries if e[0] & locale and not e[1] & CONTENT_LOW_VIOLENCE]
        fallback = [e for e in entries if e[0] & locale] or entries
        return (preferred or fallback)[0][2]


class TactClient:
    def __init__(self, product: str, cache_dir: Path, region: str = "us", index_dir: Path | None = None, cdn_region: str | None = None):
        self.product = product
        self.cache = Path(cache_dir)
        # archive indexes are keyed by archive hash, so products can share them
        self.index_dir = Path(index_dir) if index_dir else self.cache / "indexes"
        self.cache.mkdir(parents=True, exist_ok=True)
        versions = parse_bpsv(_http(f"{PATCH_HOST}/{product}/versions").decode())
        cdns = parse_bpsv(_http(f"{PATCH_HOST}/{product}/cdns").decode())
        version = next(v for v in versions if v["Region"] == region)
        cdn = next(c for c in cdns if c["Name"] == (cdn_region or region))
        self.version_name = version["VersionsName"]
        self.build_id = int(version["BuildId"])
        self.path = cdn["Path"]
        self.hosts = cdn["Hosts"].split()
        self.build_config = parse_config(self._config(version["BuildConfig"]).decode())
        self.cdn_config = parse_config(self._config(version["CDNConfig"]).decode())
        self._encoding: Encoding | None = None
        self._root: Root | None = None
        self._index: dict[bytes, ArchiveLocation] = {}
        self._indexed_for: set[bytes] = set()

    # -- raw CDN access -------------------------------------------------
    def _url(self, kind: str, key: str, suffix: str = "") -> list[str]:
        return [f"http://{host}/{self.path}/{kind}/{key[0:2]}/{key[2:4]}/{key}{suffix}" for host in self.hosts]

    def _get(self, kind: str, key: str, suffix: str = "", byte_range: tuple[int, int] | None = None) -> bytes:
        last: Exception | None = None
        for url in self._url(kind, key, suffix):
            try:
                return _http(url, byte_range)
            except MissingFile as error:
                last = error
            except RuntimeError as error:
                last = error
        if isinstance(last, MissingFile):
            raise last
        raise RuntimeError(f"all CDN hosts failed for {kind}/{key}{suffix}: {last}")

    def _cached(self, name: str, loader) -> bytes:
        path = self.cache / name
        if path.exists():
            return path.read_bytes()
        data = loader()
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(data)
        os.replace(tmp, path)
        return data

    def _config(self, key: str) -> bytes:
        return self._cached(f"config-{key}", lambda: self._get("config", key))

    # -- manifests ------------------------------------------------------
    @property
    def encoding(self) -> Encoding:
        if self._encoding is None:
            ekey = self.build_config["encoding"][1]
            data = self._cached(f"encoding-{ekey}", lambda: blte_decode(self._get("data", ekey)))
            self._encoding = Encoding(data)
        return self._encoding

    @property
    def root(self) -> Root:
        if self._root is None:
            ckey = bytes.fromhex(self.build_config["root"][0])
            ekey = self.encoding.ekey(ckey)
            if ekey is None:
                raise RuntimeError("root ckey not in encoding")
            data = self._cached(f"root-{ekey.hex()}", lambda: self._fetch_ekey_uncached(ekey))
            self._root = Root(data)
        return self._root

    # -- archive indexes ------------------------------------------------
    def _index_bytes(self, archive: str) -> bytes:
        path = self.index_dir / f"{archive}.index"
        if path.exists():
            return path.read_bytes()
        path.parent.mkdir(exist_ok=True)
        data = self._get("data", archive, ".index")
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        os.replace(tmp, path)
        return data

    def _global_index(self):
        """Every archive index of the CDN config merged into sorted numpy arrays (cached)."""
        if getattr(self, "_gindex", None) is not None:
            return self._gindex
        import numpy as np

        name = self.cdn_config.get("archive-group", [None])[0] or hashlib.md5(" ".join(self.cdn_config["archives"]).encode()).hexdigest()
        path = self.index_dir / f"merged-{name}.npz"
        if not path.exists():
            archives = self.cdn_config["archives"]

            def parse(item):
                number, archive = item
                data = self._index_bytes(archive)
                footer = data[-28:]
                block_kb, offset_bytes, size_bytes, key_bytes = footer[11], footer[12], footer[13], footer[14]
                if (offset_bytes, size_bytes, key_bytes) != (4, 4, 16):
                    raise ValueError(f"index {archive}: unexpected layout")
                entry = key_bytes + size_bytes + offset_bytes
                block = block_kb * 1024
                blocks = (len(data) - 28) // (block + key_bytes + 8)
                per_block = block // entry
                raw = np.frombuffer(data, dtype=np.uint8, count=blocks * block).reshape(blocks, block)[:, : per_block * entry]
                rows = raw.reshape(blocks * per_block, entry)
                hi = rows[:, 0:8].copy().view(">u8").ravel()
                lo = rows[:, 8:16].copy().view(">u8").ravel()
                size = rows[:, 16:20].copy().view(">u4").ravel()
                offset = rows[:, 20:24].copy().view(">u4").ravel()
                keep = (hi != 0) | (lo != 0)
                return hi[keep], lo[keep], size[keep], offset[keep], np.full(int(keep.sum()), number, dtype=np.uint16)

            with ThreadPoolExecutor(max_workers=16) as pool:
                parts = list(pool.map(parse, enumerate(archives)))
            hi, lo, size, offset, number = (np.concatenate([p[i] for p in parts]) for i in range(5))
            order = np.lexsort((lo, hi))
            tmp = path.with_suffix(".part.npz")
            np.savez(tmp, hi=hi[order], lo=lo[order], size=size[order], offset=offset[order], number=number[order])
            os.replace(tmp, path)
        loaded = np.load(path)
        self._gindex = {k: loaded[k] for k in ("hi", "lo", "size", "offset", "number")}
        return self._gindex

    def locate(self, ekeys: set[bytes]) -> None:
        """Resolve archive locations for ``ekeys`` through the merged archive index."""
        wanted = [key for key in ekeys if key not in self._index and key not in self._indexed_for]
        if not wanted:
            return
        import numpy as np

        index = self._global_index()
        archives = self.cdn_config["archives"]
        his = np.array([int.from_bytes(k[:8], "big") for k in wanted], dtype=np.uint64)
        left = np.searchsorted(index["hi"], his, side="left")
        right = np.searchsorted(index["hi"], his, side="right")
        for key, a, b in zip(wanted, left, right):
            lo = int.from_bytes(key[8:16], "big")
            for i in range(a, b):
                if int(index["lo"][i]) == lo:
                    self._index[key] = ArchiveLocation(archives[int(index["number"][i])], int(index["offset"][i]), int(index["size"][i]))
                    break
        self._indexed_for |= set(wanted)

    # -- file access ----------------------------------------------------
    def _fetch_ekey_uncached(self, ekey: bytes, zero_encrypted: bool = False) -> bytes:
        location = self._index.get(ekey)
        if location is None and ekey not in self._indexed_for:
            self.locate({ekey})
            location = self._index.get(ekey)
        if location is None:
            raw = self._get("data", ekey.hex())  # loose (unarchived) file
        else:
            raw = self._get("data", location.archive, "", (location.offset, location.offset + location.size - 1))
        return blte_decode(raw, ekey, zero_encrypted)

    def ekey_for_fdid(self, fdid: int, locale: int = LOCALE_ENUS) -> bytes | None:
        ckey = self.root.ckey(fdid, locale)
        if ckey is None:
            return None
        return self.encoding.ekey(ckey)

    def has_file(self, fdid: int) -> bool:
        return fdid in self.root.files

    def read_fdid(self, fdid: int, locale: int = LOCALE_ENUS, zero_encrypted: bool = False) -> bytes:
        ekey = self.ekey_for_fdid(fdid, locale)
        if ekey is None:
            raise MissingFile(f"fdid {fdid} not in {self.product} {self.version_name}")
        return self._fetch_ekey_uncached(ekey, zero_encrypted)

    def prefetch(self, fdids: list[int], locale: int = LOCALE_ENUS) -> None:
        keys = {k for k in (self.ekey_for_fdid(f, locale) for f in fdids) if k}
        self.locate(keys)

    def resolve(self, fdids, locale: int = LOCALE_ENUS) -> dict[int, "FileRef"]:
        """FileDataID -> FileRef for every file present in this build (one index scan)."""
        ekeys = {fdid: self.ekey_for_fdid(fdid, locale) for fdid in set(fdids)}
        self.locate({key for key in ekeys.values() if key})
        refs = {}
        for fdid, ekey in ekeys.items():
            if ekey is None:
                continue
            location = self._index.get(ekey)
            refs[fdid] = FileRef(
                tuple(self.hosts), self.path, ekey.hex(),
                location.archive if location else None,
                location.offset if location else 0,
                location.size if location else 0,
            )
        return refs


@dataclass(frozen=True)
class FileRef:
    """Self-contained pointer to one encoded file on the CDN (picklable for worker processes)."""

    hosts: tuple[str, ...]
    path: str
    ekey: str
    archive: str | None
    offset: int
    size: int

    def read(self) -> bytes:
        key = self.archive or self.ekey
        byte_range = (self.offset, self.offset + self.size - 1) if self.archive else None
        last: Exception | None = None
        for host in self.hosts:
            url = f"http://{host}/{self.path}/data/{key[0:2]}/{key[2:4]}/{key}"
            try:
                return blte_decode(_http(url, byte_range), bytes.fromhex(self.ekey))
            except (MissingFile, RuntimeError) as error:
                last = error
        raise MissingFile(f"{self.ekey}: {last}")
