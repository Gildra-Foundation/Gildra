#!/usr/bin/env python3
"""Cache the current bilingual Genshin event calendar as an import overlay."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


DEFAULT_URL = "https://ambr.top/assets/data/event.json"
IMAGE_RE = re.compile(r"https?://[^\"'<> ]+")


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "Gildra-Genshin-Events/1.0 (+https://api.gildra.net)"})
    with urlopen(request, timeout=45) as response:  # noqa: S310 - URL is an explicit operator input
        if response.status != 200:
            raise RuntimeError(f"event source returned HTTP {response.status}")
        return response.read()


def localized(value: object, language: str) -> str:
    if isinstance(value, dict):
        result = value.get(language)
        return result if isinstance(result, str) else ""
    return value if isinstance(value, str) else ""


def event_record(event: dict[str, object], language: str, source_url: str) -> dict[str, object]:
    record: dict[str, object] = {
        "id": event.get("id"),
        "name": localized(event.get("name"), language),
        "nameFull": localized(event.get("nameFull"), language),
        "description": localized(event.get("description"), language),
        "startAt": event.get("startAt"),
        "endAt": event.get("endAt"),
        "sourceUrl": source_url,
    }
    banner = localized(event.get("banner"), language)
    if banner:
        record["banner"] = banner
    return record


def image_urls(event: dict[str, object]) -> list[str]:
    values: list[str] = []
    banner = event.get("banner")
    if isinstance(banner, dict):
        for key in ("EN", "RU"):
            value = banner.get(key)
            if isinstance(value, str) and value:
                values.append(value)
    description = event.get("description")
    if isinstance(description, dict):
        for language in ("EN", "RU"):
            values.extend(IMAGE_RE.findall(localized(description, language)))
    return list(dict.fromkeys(values))


def write_overlay(output: Path, source_url: str, raw: bytes, events: dict[str, object]) -> None:
    temporary = Path(tempfile.mkdtemp(prefix="genshin-events-", dir=output.parent))
    try:
        if output.exists():
            shutil.copytree(output, temporary, dirs_exist_ok=True)
            for language in ("English", "Russian"):
                shutil.rmtree(temporary / "src" / "data" / language / "events", ignore_errors=True)
            (temporary / "src" / "data" / "image" / "events.json").unlink(missing_ok=True)
        english = temporary / "src" / "data" / "English" / "events"
        russian = temporary / "src" / "data" / "Russian" / "events"
        english.mkdir(parents=True)
        russian.mkdir(parents=True)
        images: dict[str, dict[str, list[str]]] = {}
        for key in sorted(events, key=lambda value: int(value)):
            event = events[key]
            if not isinstance(event, dict) or not isinstance(event.get("id"), int):
                continue
            slug = f"event-{event['id']}"
            (english / f"{slug}.json").write_text(
                json.dumps(event_record(event, "EN", source_url), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            (russian / f"{slug}.json").write_text(
                json.dumps(event_record(event, "RU", source_url), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            urls = image_urls(event)
            if urls:
                images[slug] = {"filename_banner": urls}
        image_dir = temporary / "src" / "data" / "image"
        image_dir.mkdir(parents=True, exist_ok=True)
        (image_dir / "events.json").write_text(
            json.dumps(images, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        (temporary / "source-event.json").write_bytes(raw)
        manifest = {
            "name": "ambr-event-calendar",
            "url": source_url,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "fetchedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        }
        (temporary / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if output.exists():
            backup = output.with_name(output.name + ".previous")
            if backup.exists():
                shutil.rmtree(backup)
            output.rename(backup)
            shutil.rmtree(backup)
        temporary.rename(output)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--url", default=DEFAULT_URL)
    args = parser.parse_args()
    raw = fetch(args.url)
    decoded = json.loads(raw)
    if not isinstance(decoded, dict):
        raise RuntimeError("event source must be a JSON object keyed by event id")
    write_overlay(args.output, args.url, raw, decoded)
    print(json.dumps({"output": str(args.output), "events": len(decoded), "sha256": hashlib.sha256(raw).hexdigest()}))


if __name__ == "__main__":
    main()
