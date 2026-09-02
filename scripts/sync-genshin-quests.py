#!/usr/bin/env python3
"""Cache the bilingual Genshin quest and dialogue archive as an import overlay.

Project Amber publishes the quest index and the complete chapter/dialogue payloads
behind a stable JSON API.  The generated files intentionally use the same source
layout as genshin-db so the Go importer can keep the data as generic, queryable
records without flattening dialogue branches or reward structures.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://ambr.top/api/v2"
LANGUAGES = (("EN", "en_US"), ("RU", "ru_RU"))
MAX_WORKERS = 16
RETRIES = 3


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "Gildra-Genshin-QuestSync/1.0 (+https://api.gildra.net)"})
    last_error: Exception | None = None
    for attempt in range(RETRIES):
        try:
            with urlopen(request, timeout=60) as response:  # noqa: S310 - explicit operator-configured source
                if response.status != 200:
                    raise RuntimeError(f"quest source returned HTTP {response.status} for {url}")
                return response.read()
        except Exception as error:  # noqa: BLE001 - retry transient upstream failures
            last_error = error
            if attempt + 1 < RETRIES:
                time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last_error}") from last_error


def fetch_json(url: str) -> tuple[bytes, dict[str, object]]:
    raw = fetch(url)
    decoded = json.loads(raw)
    if not isinstance(decoded, dict) or decoded.get("response") != 200:
        raise RuntimeError(f"quest source returned an invalid response for {url}")
    data = decoded.get("data")
    if not isinstance(data, dict):
        raise RuntimeError(f"quest source response has no data object for {url}")
    return raw, data


def fetch_detail(base_url: str, language: str, quest_id: str) -> tuple[str, dict[str, object]]:
    _, data = fetch_json(f"{base_url}/{language}/quest/{quest_id}")
    return quest_id, data


def quest_name(info: dict[str, object], language: str, quest_id: str) -> str:
    for key in ("chapterTitle", "route", "chapterImageTitle"):
        value = info.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    prefix = "Задание" if language == "ru_RU" else "Quest"
    return f"{prefix} {quest_id}"


def quest_description(data: dict[str, object], language: str, quest_id: str) -> str:
    story_list = data.get("storyList")
    if isinstance(story_list, dict):
        for chapter in story_list.values():
            if not isinstance(chapter, dict):
                continue
            info = chapter.get("info")
            if isinstance(info, dict):
                description = info.get("description")
                if isinstance(description, str) and description.strip():
                    return description.strip()
    prefix = "Данные задания" if language == "ru_RU" else "Quest data"
    return f"{prefix} {quest_id}"


def normalized_record(data: dict[str, object], language: str, source_url: str, quest_id: str) -> dict[str, object]:
    info = data.get("info")
    if not isinstance(info, dict):
        info = {"id": int(quest_id)}
    record = dict(info)
    record["id"] = int(record.get("id") or quest_id)
    record["name"] = quest_name(info, language, quest_id)
    record["description"] = quest_description(data, language, quest_id)
    record["sourceUrl"] = source_url
    # Keep every chapter, branch, condition, reward and dialogue line intact.
    record["storyList"] = data.get("storyList") or {}
    if "npcList" in data:
        record["npcList"] = data["npcList"]
    return record


def chapter_icons(records: dict[str, dict[str, object]]) -> dict[str, dict[str, list[str]]]:
    images: dict[str, dict[str, list[str]]] = {}
    for quest_id, record in records.items():
        icon = record.get("chapterIcon")
        if isinstance(icon, str) and icon.strip():
            images[f"quest-{quest_id}"] = {
                "filename_chapter": [f"https://gi.yatta.moe/assets/UI/chapter/{icon.strip()}.png"]
            }
    return images


def replace_generated_tree(temporary: Path, output: Path) -> None:
    if output.exists():
        backup = output.with_name(output.name + ".previous")
        if backup.exists():
            shutil.rmtree(backup)
        output.rename(backup)
        shutil.rmtree(backup)
    temporary.rename(output)


def write_overlay(
    output: Path,
    base_url: str,
    raw_indexes: dict[str, bytes],
    records: dict[str, dict[str, dict[str, object]]],
) -> None:
    temporary = Path(tempfile.mkdtemp(prefix="genshin-quests-", dir=output.parent))
    try:
        if output.exists():
            shutil.copytree(output, temporary, dirs_exist_ok=True)
            for language in ("English", "Russian"):
                shutil.rmtree(temporary / "src" / "data" / language / "quests", ignore_errors=True)
            (temporary / "src" / "data" / "image" / "quests.json").unlink(missing_ok=True)
            for path in temporary.glob("manifest-quests-*.json"):
                path.unlink()
        for language, locale in LANGUAGES:
            directory_name = "English" if locale == "en_US" else "Russian"
            directory = temporary / "src" / "data" / directory_name / "quests"
            directory.mkdir(parents=True, exist_ok=True)
            for quest_id in sorted(records[locale], key=lambda value: int(value)):
                payload = records[locale][quest_id]
                (directory / f"quest-{quest_id}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
                )
            source_url = f"{base_url}/{language}/quest"
            manifest = {
                "name": f"ambr-quest-archive-{locale}",
                "url": source_url,
                "sha256": hashlib.sha256(raw_indexes[locale]).hexdigest(),
                "fetchedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            }
            (temporary / f"manifest-quests-{locale}.json").write_text(
                json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
            )
        image_dir = temporary / "src" / "data" / "image"
        image_dir.mkdir(parents=True, exist_ok=True)
        (image_dir / "quests.json").write_text(
            json.dumps(chapter_icons(records["en_US"]), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        for locale, raw in raw_indexes.items():
            (temporary / f"source-quests-{locale}.json").write_bytes(raw)
        replace_generated_tree(temporary, output)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--workers", default=MAX_WORKERS, type=int)
    args = parser.parse_args()
    if not 1 <= args.workers <= 32:
        raise SystemExit("--workers must be between 1 and 32")

    raw_indexes: dict[str, bytes] = {}
    metadata: dict[str, dict[str, object]] = {}
    for language, locale in LANGUAGES:
        raw, data = fetch_json(f"{args.base_url}/{language}/quest")
        items = data.get("items")
        if not isinstance(items, dict):
            raise RuntimeError(f"{language} quest index has no items object")
        raw_indexes[locale] = raw
        metadata[locale] = {str(key): value for key, value in items.items() if isinstance(value, dict)}

    if set(metadata["en_US"]) != set(metadata["ru_RU"]):
        raise RuntimeError("English and Russian quest indexes contain different IDs")

    records: dict[str, dict[str, dict[str, object]]] = {"en_US": {}, "ru_RU": {}}
    future_to_locale = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        for language, locale in LANGUAGES:
            for quest_id in metadata[locale]:
                future_to_locale[executor.submit(fetch_detail, args.base_url, language, quest_id)] = locale
        for future in as_completed(future_to_locale):
            locale = future_to_locale[future]
            quest_id, data = future.result()
            language = "EN" if locale == "en_US" else "RU"
            records[locale][quest_id] = normalized_record(
                data, locale, f"{args.base_url}/{language}/quest/{quest_id}", quest_id
            )

    write_overlay(args.output, args.base_url, raw_indexes, records)
    print(json.dumps({"output": str(args.output), "quests": len(records["en_US"]), "locales": list(records)}))


if __name__ == "__main__":
    main()
