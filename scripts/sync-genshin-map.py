#!/usr/bin/env python3
"""Cache the official bilingual HoYoLAB interactive-map catalogue.

The point list is a useful complement to genshin-db: it contains the current
coordinates for every official map point, while the label tree provides the
human-readable category and icon.  User attribution/content fields are
intentionally omitted from the generated records; the catalogue stores only
game/map metadata and coordinates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_HOST = "https://sg-public-api-static.hoyolab.com"
APP_SN = "ys_obc"
LANGUAGES = (("en-us", "en_US", "English"), ("ru-ru", "ru_RU", "Russian"))
RETRIES = 3

# The official map-list endpoint currently returns the map titles in Chinese
# for every requested locale. Keep the source title in ``sourceName`` while
# exposing stable English/Russian names to API consumers.
MAP_NAMES = {
    2: {"en_US": "Teyvat", "ru_RU": "Тейват"},
    7: {"en_US": "Enkanomiya", "ru_RU": "Энканомия"},
    9: {"en_US": "The Chasm", "ru_RU": "Разлом"},
    36: {"en_US": "Ancient Sacred Mountain", "ru_RU": "Древняя священная гора"},
}


def fetch_json(url: str) -> tuple[bytes, dict[str, object]]:
    request = Request(url, headers={"User-Agent": "Gildra-Genshin-MapSync/1.0 (+https://api.gildra.net)"})
    last_error: Exception | None = None
    for attempt in range(RETRIES):
        try:
            with urlopen(request, timeout=60) as response:  # noqa: S310 - fixed official source
                if response.status != 200:
                    raise RuntimeError(f"map source returned HTTP {response.status} for {url}")
                raw = response.read()
            decoded = json.loads(raw)
            if not isinstance(decoded, dict) or decoded.get("retcode") != 0:
                raise RuntimeError(f"map source returned an invalid response for {url}")
            data = decoded.get("data")
            if not isinstance(data, dict):
                raise RuntimeError(f"map source response has no data object for {url}")
            return raw, data
        except Exception as error:  # noqa: BLE001 - retry transient upstream failures
            last_error = error
            if attempt + 1 < RETRIES:
                time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last_error}") from last_error


def endpoint(host: str, version: str, resource: str, lang: str, **params: object) -> str:
    query = {"app_sn": APP_SN, "lang": lang, **params}
    return f"{host}/common/map_user/ys_obc/{version}/map/{resource}?{urlencode(query)}"


def map_nodes(tree: list[object]) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []

    def visit(node: object, parent: dict[str, object] | None = None) -> None:
        if not isinstance(node, dict) or not isinstance(node.get("id"), int):
            return
        record = dict(node)
        record.pop("children", None)
        if parent is not None:
            record["parentName"] = parent.get("name", "")
        result.append(record)
        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                visit(child, record)

    for node in tree:
        visit(node)
    return result


def safe_point(point: dict[str, object], label: dict[str, object] | None, map_id: int) -> dict[str, object]:
    # Keep stable, game-facing fields only.  In particular do not persist
    # author_name, editor_name, ctime, or free-form user content/images.
    fields = {
        "id": point.get("id"),
        "mapId": map_id,
        "labelId": point.get("label_id"),
        "x": point.get("x_pos"),
        "y": point.get("y_pos"),
        "areaId": point.get("area_id"),
        "zLevel": point.get("z_level"),
        "displayState": point.get("display_state"),
        "iconSign": point.get("icon_sign"),
    }
    point_group = point.get("point_group")
    if point_group is not None:
        fields["pointGroup"] = point_group
    ext_attrs = point.get("ext_attrs")
    if isinstance(ext_attrs, str) and ext_attrs not in ("", "{}", "[]"):
        try:
            fields["extraAttributes"] = json.loads(ext_attrs)
        except json.JSONDecodeError:
            fields["extraAttributes"] = ext_attrs
    if label:
        fields["label"] = {
            "id": label.get("id"),
            "name": label.get("name", ""),
            "parentId": label.get("parent_id", 0),
            "parentName": label.get("parentName", ""),
            "icon": label.get("icon", ""),
        }
    return fields


def localized_name(label: dict[str, object] | None, language: str, map_id: int, point_id: object) -> str:
    if label and isinstance(label.get("name"), str) and label["name"].strip():
        return label["name"].strip()
    prefix = "Точка карты" if language == "ru_RU" else "Map point"
    return f"{prefix} {map_id}/{point_id}"


def write_overlay(
    output: Path,
    host: str,
    raw_sources: dict[str, list[bytes]],
    maps: dict[str, list[dict[str, object]]],
    labels: dict[str, dict[int, dict[str, object]]],
    points: dict[str, list[tuple[int, dict[str, object]]]],
) -> None:
    temporary = Path(tempfile.mkdtemp(prefix="genshin-map-", dir=output.parent))
    try:
        if output.exists():
            shutil.copytree(output, temporary, dirs_exist_ok=True)
            for language in ("English", "Russian"):
                for category in ("maps", "maplabels", "mappoints"):
                    shutil.rmtree(temporary / "src" / "data" / language / category, ignore_errors=True)
            for path in temporary.glob("manifest-map-*.json"):
                path.unlink()
            for path in temporary.glob("source-map-*.json"):
                path.unlink()
            (temporary / "src" / "data" / "image" / "maplabels.json").unlink(missing_ok=True)

        for language_code, locale, directory_name in LANGUAGES:
            language_dir = temporary / "src" / "data" / directory_name
            maps_dir = language_dir / "maps"
            labels_dir = language_dir / "maplabels"
            points_dir = language_dir / "mappoints"
            maps_dir.mkdir(parents=True, exist_ok=True)
            labels_dir.mkdir(parents=True, exist_ok=True)
            points_dir.mkdir(parents=True, exist_ok=True)
            for map_info in maps[locale]:
                map_id = int(map_info["id"])
                payload = dict(map_info)
                payload["id"] = map_id
                source_name = str(payload.get("name") or f"Map {map_id}")
                payload["sourceName"] = source_name
                payload["name"] = MAP_NAMES.get(map_id, {}).get(locale, source_name)
                payload["description"] = (
                    f"Официальная интерактивная карта: {payload['name']}"
                    if locale == "ru_RU"
                    else f"Official interactive map: {payload['name']}"
                )
                payload["sourceUrl"] = endpoint(host, "v1", "info", language_code, map_id=map_id)
                (maps_dir / f"map-{map_id}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
                )
            for (map_id, label_id), label in sorted(labels[locale].items()):
                payload = dict(label)
                payload["mapId"] = map_id
                payload["sourceUrl"] = endpoint(host, "v2", "label/tree", language_code, map_id=map_id)
                (labels_dir / f"map-{map_id}-label-{label_id}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
                )
            for map_id, point in points[locale]:
                point_id = int(point["id"])
                label = point.get("label")
                payload = dict(point)
                payload["name"] = localized_name(label if isinstance(label, dict) else None, locale, map_id, point_id)
                payload["description"] = (
                    f"{payload['name']} · карта {map_id} · X {payload.get('x')} · Y {payload.get('y')}"
                    if locale == "ru_RU"
                    else f"{payload['name']} · map {map_id} · X {payload.get('x')} · Y {payload.get('y')}"
                )
                payload["sourceUrl"] = endpoint(host, "v1", "point/list", language_code, map_id=map_id)
                (points_dir / f"map-{map_id}-point-{point_id}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
                )
            manifest = {
                "name": f"hoyolab-map-archive-{locale}",
                "url": f"{host}/common/map_user/ys_obc/v1/map/list?{urlencode({'app_sn': APP_SN, 'lang': language_code})}",
                "sha256": hashlib.sha256(b"".join(raw_sources[locale])).hexdigest(),
                "fetchedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            }
            (temporary / f"manifest-map-{locale}.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (temporary / f"source-map-{locale}.json").write_bytes(b"\n".join(raw_sources[locale]))

        image_manifest: dict[str, dict[str, list[str]]] = {}
        for map_id, label in sorted(labels["en_US"].items()):
            icon = label.get("icon")
            if isinstance(icon, str) and icon.startswith("https://"):
                image_manifest[f"map-{map_id[0]}-label-{map_id[1]}"] = {"filename_icon": [icon]}
        image_dir = temporary / "src" / "data" / "image"
        image_dir.mkdir(parents=True, exist_ok=True)
        (image_dir / "maplabels.json").write_text(json.dumps(image_manifest, indent=2) + "\n", encoding="utf-8")

        backup = output.with_name(output.name + ".previous")
        if backup.exists():
            backup.rename(output.with_name(output.name + ".previous-stale"))
        if output.exists():
            output.rename(backup)
        temporary.rename(output)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--host", default=DEFAULT_HOST)
    args = parser.parse_args()

    raw_sources: dict[str, list[bytes]] = {"en_US": [], "ru_RU": []}
    maps: dict[str, list[dict[str, object]]] = {}
    labels: dict[str, dict[tuple[int, int], dict[str, object]]] = {"en_US": {}, "ru_RU": {}}
    points: dict[str, list[tuple[int, dict[str, object]]]] = {"en_US": [], "ru_RU": []}
    map_ids: set[int] | None = None
    for language, locale, _ in LANGUAGES:
        raw, data = fetch_json(f"{args.host}/common/map_user/ys_obc/v1/map/list?{urlencode({'app_sn': APP_SN, 'lang': language})}")
        raw_sources[locale].append(raw)
        active = {int(entry["id"]) for entry in data.get("list", []) if isinstance(entry, dict) and isinstance(entry.get("id"), int)}
        if map_ids is not None and active != map_ids:
            raise RuntimeError("English and Russian map lists contain different active map IDs")
        map_ids = active
        all_map_list = [entry for entry in data.get("all_map_list", []) if isinstance(entry, dict) and int(entry.get("id", 0)) in active]
        maps[locale] = all_map_list
        for map_id in sorted(active):
            points_raw, points_data = fetch_json(endpoint(args.host, "v1", "point/list", language, map_id=map_id))
            labels_raw, labels_data = fetch_json(endpoint(args.host, "v2", "label/tree", language, map_id=map_id))
            raw_sources[locale].extend((points_raw, labels_raw))
            label_map = {int(item["id"]): item for item in map_nodes(labels_data.get("tree", [])) if isinstance(item.get("id"), int)}
            for label_id, label in label_map.items():
                labels[locale][(map_id, label_id)] = label
            for point in points_data.get("point_list", []):
                if not isinstance(point, dict) or not isinstance(point.get("id"), int):
                    continue
                points[locale].append((map_id, safe_point(point, label_map.get(int(point.get("label_id", 0))), map_id)))

    if map_ids is None or not map_ids:
        raise RuntimeError("map source returned no active maps")
    if len(points["en_US"]) != len(points["ru_RU"]):
        raise RuntimeError("English and Russian map point lists contain different counts")
    en_keys = {(map_id, int(point["id"])) for map_id, point in points["en_US"]}
    ru_keys = {(map_id, int(point["id"])) for map_id, point in points["ru_RU"]}
    if en_keys != ru_keys:
        raise RuntimeError("English and Russian map point lists contain different IDs")

    write_overlay(args.output, args.host, raw_sources, maps, labels, points)
    print(json.dumps({"output": str(args.output), "maps": sorted(map_ids), "points": len(points["en_US"]), "labels": len(labels["en_US"])}))


if __name__ == "__main__":
    main()
