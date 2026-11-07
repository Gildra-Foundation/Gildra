"""Reader for WDC3/WDC4/WDC5 client database (DB2) files.

Column names and array sizes come from the public WoWDBDefs definitions
(https://github.com/wowdev/WoWDBDefs, ``definitions/<Table>.dbd``); the layout
is matched by the file's layout hash.  Format reference:
https://wowdev.wiki/DB2.

Only what the world-map pipeline needs is implemented: inline, bit-packed,
common, pallet and pallet-array fields, the ID list, copy table, relationship
map and string tables of non-sparse tables.  Encrypted sections whose key is
unknown are skipped (their records are zero-filled in the file).
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field


@dataclass
class DbdColumn:
    name: str
    type: str  # int | float | string | locstring
    signed: bool = True


@dataclass
class DbdEntry:
    name: str
    array: int = 1
    bits: int | None = None
    unsigned: bool = False
    noninline_id: bool = False
    relation: bool = False


@dataclass
class DbdDefinition:
    columns: dict[str, DbdColumn]
    layouts: list[tuple[set[str], list[str], list[DbdEntry]]] = field(default_factory=list)

    def layout(self, layout_hash: int, build: str | None = None) -> list[DbdEntry]:
        target = f"{layout_hash:08X}"
        candidates = [entry for entry in self.layouts if target in entry[0]]
        if not candidates:
            raise KeyError(f"layout {target} not in definition")
        if build:
            for hashes, builds, entries in candidates:
                if any(_build_matches(spec, build) for spec in builds):
                    return entries
        return candidates[-1][2]


def _version_tuple(value: str) -> tuple[int, ...]:
    return tuple(int(part) for part in value.split("."))


def _build_matches(spec: str, build: str) -> bool:
    target = _version_tuple(build)
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            low, high = part.split("-")
            if _version_tuple(low) <= target <= _version_tuple(high):
                return True
        elif part and _version_tuple(part) == target:
            return True
    return False


ENTRY_RE = re.compile(r"^(\$[^$]+\$)?([A-Za-z0-9_]+)(<(u?)(\d+)>)?(\[(\d+)\])?")


def parse_dbd(text: str) -> DbdDefinition:
    columns: dict[str, DbdColumn] = {}
    definition = DbdDefinition(columns)
    lines = text.splitlines()
    index = 0
    if lines and lines[0].strip() == "COLUMNS":
        index = 1
        while index < len(lines) and lines[index].strip():
            line = lines[index].strip().split("//")[0].strip()
            kind, _, name = line.partition(" ")
            base = kind.split("<")[0]
            name = name.strip().rstrip("?")
            columns[name] = DbdColumn(name, base)
            index += 1
    hashes: set[str] = set()
    builds: list[str] = []
    entries: list[DbdEntry] = []

    def flush() -> None:
        if entries:
            definition.layouts.append((set(hashes), list(builds), list(entries)))

    for raw in lines[index:]:
        line = raw.split("//")[0].strip()
        if not line:
            flush()
            hashes, builds, entries = set(), [], []
            continue
        if line.startswith("LAYOUT"):
            hashes |= {h.strip() for h in line[6:].split(",")}
        elif line.startswith("BUILD"):
            builds.append(line[5:].strip())
        elif line.startswith("COMMENT"):
            continue
        else:
            match = ENTRY_RE.match(line)
            if not match:
                continue
            annotations = set((match.group(1) or "").strip("$").split(","))
            noninline = "noninline" in annotations
            entries.append(
                DbdEntry(
                    name=match.group(2),
                    array=int(match.group(7) or 1),
                    bits=int(match.group(5)) if match.group(5) else None,
                    unsigned=match.group(4) == "u",
                    noninline_id=noninline and "id" in annotations,
                    relation=noninline and "relation" in annotations,
                )
            )
    flush()
    return definition


@dataclass
class _FieldInfo:
    offset_bits: int
    size_bits: int
    additional_size: int
    storage: int
    v1: int
    v2: int
    v3: int


def _signed(value: int, bits: int) -> int:
    if bits and value & (1 << (bits - 1)):
        return value - (1 << bits)
    return value


def read_db2(data: bytes, definition: DbdDefinition, build: str | None = None) -> dict[int, dict]:
    magic = data[:4]
    if magic not in (b"WDC3", b"WDC4", b"WDC5"):
        raise ValueError(f"unsupported DB2 magic {magic!r}")
    cursor = 4
    if magic == b"WDC5":
        cursor += 4 + 128  # version + schema string
    (
        record_count,
        field_count,
        record_size,
        string_table_size,
        table_hash,
        layout_hash,
        min_id,
        max_id,
        locale,
        flags,
        id_index,
        total_field_count,
        bitpacked_offset,
        lookup_columns,
        field_storage_size,
        common_size,
        pallet_size,
        section_count,
    ) = struct.unpack("<9IHH7I", data[cursor : cursor + 68])
    cursor += 68
    sections = []
    for _ in range(section_count):
        sections.append(struct.unpack("<Q8I", data[cursor : cursor + 40]))
        cursor += 40
    cursor += 4 * field_count  # field_structure (size, position) pairs
    infos: list[_FieldInfo] = []
    for _ in range(field_storage_size // 24):
        infos.append(_FieldInfo(*struct.unpack("<HHIIIII", data[cursor : cursor + 24])))
        cursor += 24
    pallet = data[cursor : cursor + pallet_size]
    cursor += pallet_size
    common = data[cursor : cursor + common_size]
    cursor += common_size

    # pallet / common blocks are concatenated in field order
    pallet_offsets, common_maps = {}, {}
    p_off = c_off = 0
    for i, info in enumerate(infos):
        if info.storage in (3, 4):
            pallet_offsets[i] = p_off
            p_off += info.additional_size
        elif info.storage == 2:
            block = common[c_off : c_off + info.additional_size]
            common_maps[i] = {
                struct.unpack_from("<I", block, j)[0]: struct.unpack_from("<I", block, j + 4)[0]
                for j in range(0, len(block), 8)
            }
            c_off += info.additional_size

    if flags & 0x01:
        raise NotImplementedError("sparse (offset map) tables are not supported")

    entries = definition.layout(layout_hash, build)
    inline = [e for e in entries if not e.noninline_id and not e.relation]
    relation_entry = next((e for e in entries if e.relation), None)
    id_entry = next((e for e in entries if e.noninline_id), None)
    if len(inline) != field_count:
        raise ValueError(f"definition has {len(inline)} inline fields, file has {field_count}")

    total_records = sum(s[2] for s in sections)
    # strings: offsets are relative to the field inside a virtual buffer of all
    # sections' records followed by all sections' string tables
    string_blob = bytearray()
    records_global = 0
    rows: dict[int, dict] = {}
    for tact_key, file_offset, count, strings_size, records_end, id_list_size, rel_size, offset_map_count, copy_count in sections:
        records_start = file_offset
        blob_base = len(string_blob)
        string_blob += data[records_start + count * record_size : records_start + count * record_size + strings_size]
        position = records_start + count * record_size + strings_size
        ids = list(struct.unpack_from(f"<{id_list_size // 4}I", data, position)) if id_list_size else []
        position += id_list_size
        copies = [struct.unpack_from("<II", data, position + 8 * i) for i in range(copy_count)]
        position += 8 * copy_count
        position += 6 * offset_map_count
        relations: dict[int, int] = {}
        if rel_size:
            num = struct.unpack_from("<I", data, position)[0]
            base = position + 12
            for i in range(num):
                foreign, record_index = struct.unpack_from("<II", data, base + 8 * i)
                relations[record_index] = foreign
            position += rel_size
        if tact_key and not any(data[records_start : records_start + count * record_size]):
            records_global += count
            continue
        section_rows = []
        for r in range(count):
            rec_off = records_start + r * record_size
            record = data[rec_off : rec_off + record_size]
            values: dict[str, object] = {}
            for fi, entry in enumerate(inline):
                info = infos[fi]
                column = definition.columns.get(entry.name)
                ctype = column.type if column else "int"
                if info.storage == 0:
                    byte = info.offset_bits // 8
                    width = entry.bits // 8 if entry.bits else info.size_bits // 8 // entry.array
                    items = []
                    for k in range(entry.array):
                        start = byte + k * width
                        raw = record[start : start + width]
                        if ctype == "float":
                            items.append(struct.unpack("<f", raw)[0])
                        elif ctype in ("string", "locstring"):
                            rel = int.from_bytes(raw, "little")
                            if rel == 0:
                                items.append("")
                            else:
                                virtual = (records_global + r) * record_size + start + rel
                                index = virtual - total_records * record_size
                                end = string_blob.find(b"\0", index)
                                if end < 0:
                                    end = len(string_blob)
                                items.append(bytes(string_blob[index:end]).decode("utf-8", "replace"))
                        else:
                            value = int.from_bytes(raw, "little")
                            if not entry.unsigned:
                                value = _signed(value, width * 8)
                            items.append(value)
                    values[entry.name] = items if entry.array > 1 else items[0]
                    continue
                if info.storage in (1, 3, 4, 5):
                    bit_offset = info.offset_bits
                    raw = int.from_bytes(record, "little") >> bit_offset
                    raw &= (1 << info.size_bits) - 1
                    if info.storage == 1:
                        value = raw
                        values[entry.name] = value
                    elif info.storage == 5:
                        values[entry.name] = _signed(raw, info.v2)
                    elif info.storage == 3:
                        val = struct.unpack_from("<I", pallet, pallet_offsets[fi] + raw * 4)[0]
                        values[entry.name] = struct.unpack("<f", struct.pack("<I", val))[0] if ctype == "float" else (
                            val if entry.unsigned else _signed(val, 32)
                        )
                    else:
                        card = info.v3
                        base = pallet_offsets[fi] + raw * card * 4
                        arr = list(struct.unpack_from(f"<{card}I", pallet, base))
                        if ctype == "float":
                            arr = [struct.unpack("<f", struct.pack("<I", v))[0] for v in arr]
                        elif not entry.unsigned:
                            arr = [_signed(v, 32) for v in arr]
                        values[entry.name] = arr
                    continue
                if info.storage == 2:
                    values[entry.name] = ("pending-common", fi)
                    continue
                raise ValueError(f"unknown storage type {info.storage}")
            section_rows.append((r, values))
        for r, values in section_rows:
            row_id = ids[r] if ids else values.get(entry_name(inline, id_index))
            for name, value in list(values.items()):
                if isinstance(value, tuple) and value and value[0] == "pending-common":
                    fi = value[1]
                    raw = common_maps[fi].get(row_id, infos[fi].v1)
                    column = definition.columns.get(name)
                    if column and column.type == "float":
                        values[name] = struct.unpack("<f", struct.pack("<I", raw))[0]
                    else:
                        entry = next(e for e in inline if e.name == name)
                        bits = entry.bits or 32
                        raw &= (1 << bits) - 1
                        values[name] = raw if entry.unsigned else _signed(raw, bits)
            if id_entry:
                values[id_entry.name] = row_id
            if relation_entry and r in relations:
                values[relation_entry.name] = relations[r]
            elif relation_entry:
                values.setdefault(relation_entry.name, 0)
            rows[row_id] = values
        for new_id, old_id in copies:
            if old_id in rows:
                clone = dict(rows[old_id])
                if id_entry:
                    clone[id_entry.name] = new_id
                else:
                    clone[entry_name(inline, id_index)] = new_id
                rows[new_id] = clone
        records_global += count
    return rows


def entry_name(inline: list[DbdEntry], id_index: int) -> str:
    return inline[id_index].name
