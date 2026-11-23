"""Build the public ZIP and index its independently compressed entries."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

root, release = map(Path, sys.argv[1:])
archive = release / "Gildra-Gear-Windows-x64.zip"
entries = []
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as writer:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            writer.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as reader, archive.open("rb") as raw:
    for entry in reader.infolist():
        raw.seek(entry.header_offset + 26)
        name, extra = struct.unpack("<HH", raw.read(4))
        with (root / entry.filename).open("rb") as source:
            checksum = hashlib.file_digest(source, "sha256").hexdigest()
        entries.append(dict(path=entry.filename, offset=entry.header_offset + 30 + name + extra,
                            compressed=entry.compress_size, size=entry.file_size, hash=checksum))
(release / "gear-files.json").write_text(json.dumps(entries, separators=(",", ":")))
