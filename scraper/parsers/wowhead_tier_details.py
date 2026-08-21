#!/usr/bin/env python3
"""Extract tier placements and specialization guide links from Wowhead."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from web_scraper import ResponseContract

from .wowhead_tier_lists import fetch_with_fallback, fetch_with_scrape_do

DEFAULT_INDEX_REPORT = "/app/reports/wowhead-tier-lists.json"
DEFAULT_OUTPUT = "/app/reports/wowhead-tier-list-details.json"

_PRINT_HTML_RE = re.compile(
    r'WH\.markup\.printHtml\(\s*("(?:\\.|[^"\\])*")\s*,\s*"guide-body"',
    re.DOTALL,
)
_GATHERER_RE = re.compile(
    r"WH\.Gatherer\.addData\((?P<type>\d+),\s*1,\s*(?P<data>\{.*?\})\);",
    re.DOTALL,
)
_TIER_RE = re.compile(r"\[tier\](?P<body>.*?)\[/tier\]", re.DOTALL)
_TIER_LABEL_RE = re.compile(
    r"\[tier-label[^\]]*\](?P<label>.*?)\[/tier-label\]", re.DOTALL
)
_TIER_ENTRY_RE = re.compile(
    r"\[url guide=(?P<guide_id>\d+)[^\]]*\]"
    r".*?\[spec-badge=(?P<badge>[^\]]+)\].*?\[/url\]",
    re.DOTALL,
)
_TAG_RE = re.compile(r"\[/?[^\]]+\]")

_CLASS_NAMES = {
    "death-knight": "Death Knight",
    "demon-hunter": "Demon Hunter",
}


def _decode_guide_markup(page_html: str) -> str:
    match = _PRINT_HTML_RE.search(page_html)
    if match is None:
        raise ValueError("Wowhead guide-body markup was not found")
    try:
        markup = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ValueError("Wowhead guide-body markup is not valid JSON string data") from exc
    if "[tier-list" not in markup:
        raise ValueError("Wowhead guide-body does not contain a tier list")
    return str(markup)


def _gatherer_data(page_html: str) -> dict[int, dict[str, dict[str, Any]]]:
    gathered: dict[int, dict[str, dict[str, Any]]] = {}
    for match in _GATHERER_RE.finditer(page_html):
        data_type = int(match.group("type"))
        try:
            payload = json.loads(match.group("data"))
        except json.JSONDecodeError:
            continue
        bucket = gathered.setdefault(data_type, {})
        for entity_id, entity in payload.items():
            if isinstance(entity, dict):
                bucket[str(entity_id)] = entity
    return gathered


def _plain_label(markup: str) -> str:
    return " ".join(_TAG_RE.sub("", markup).split())


def _guide_lookup(
    gathered: dict[int, dict[str, dict[str, Any]]]
) -> dict[str, dict[str, Any]]:
    return gathered.get(100, {})


def _guide_slugs(guide_url: str) -> tuple[str, str]:
    parts = urlsplit(guide_url)
    segments = [segment for segment in parts.path.split("/") if segment]
    if (
        parts.scheme != "https"
        or parts.hostname not in {"wowhead.com", "www.wowhead.com"}
        or len(segments) < 5
        or segments[:2] != ["guide", "classes"]
    ):
        raise ValueError(f"unexpected specialization guide URL: {guide_url}")
    return segments[2], segments[3]


def parse_tier_page(
    page_html: bytes | str,
    *,
    source_url: str,
    activity: str,
    role: str,
) -> dict[str, Any]:
    text = (
        page_html.decode("utf-8", errors="replace")
        if isinstance(page_html, bytes)
        else page_html
    )
    markup = _decode_guide_markup(text)
    gathered = _gatherer_data(text)
    guides = _guide_lookup(gathered)

    tiers: list[dict[str, Any]] = []
    seen_guides: set[str] = set()
    for tier_match in _TIER_RE.finditer(markup):
        tier_markup = tier_match.group("body")
        label_match = _TIER_LABEL_RE.search(tier_markup)
        if label_match is None:
            continue
        tier = _plain_label(label_match.group("label"))
        if not tier:
            raise ValueError("empty tier label")

        specs: list[dict[str, Any]] = []
        for rank_in_tier, entry in enumerate(_TIER_ENTRY_RE.finditer(tier_markup), start=1):
            guide_id = entry.group("guide_id")
            if guide_id in seen_guides:
                raise ValueError(f"duplicate guide {guide_id} in {source_url}")
            seen_guides.add(guide_id)

            guide = guides.get(guide_id)
            guide_url = guide.get("url") if guide else None
            if not isinstance(guide_url, str) or not guide_url:
                raise ValueError(f"canonical URL for guide {guide_id} was not found")
            class_slug, spec_slug = _guide_slugs(guide_url)
            class_name = _CLASS_NAMES.get(class_slug, class_slug.replace("-", " ").title())

            spec_name = spec_slug.replace("-", " ").title()

            specs.append(
                {
                    "tier": tier,
                    "rank_in_tier": rank_in_tier,
                    "activity": activity,
                    "role": role,
                    "class": class_name,
                    "class_slug": class_slug,
                    "spec": spec_name,
                    "spec_slug": spec_slug,
                    "badge_slug": entry.group("badge"),
                    "guide_id": int(guide_id),
                    "guide_title": guide.get("name"),
                    "guide_url": guide_url,
                    "source_url": source_url,
                    "description": "",
                    "description_paragraphs": [],
                    "description_markup": "",
                }
            )
        tiers.append({"tier": tier, "spec_count": len(specs), "specs": specs})

    spec_count = sum(tier["spec_count"] for tier in tiers)
    badge_count = len(re.findall(r"\[spec-badge=[^\]]+\]", markup))
    if spec_count == 0 or spec_count != badge_count:
        raise ValueError(
            f"tier table accounting failed: parsed={spec_count}, badges={badge_count}"
        )
    return {
        "source_url": source_url,
        "activity": activity,
        "role": role,
        "spec_count": spec_count,
        "tiers": tiers,
    }


def _load_index_report(path: Path) -> list[dict[str, str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    links = payload.get("links")
    if not isinstance(links, list) or len(links) != 6:
        raise ValueError("tier-list index report must contain exactly six links")
    required = {"activity", "role", "url"}
    if any(not isinstance(item, dict) or not required.issubset(item) for item in links):
        raise ValueError("tier-list index report contains an invalid link record")
    return links


def collect_tierlist_dataset() -> dict[str, Any]:
    """Fetch the index and all six tier-list pages as one publishable candidate."""
    from .wowhead_tier_lists import DEFAULT_SOURCE_URL, extract_tier_list_links

    index_contract = ResponseContract.html(
        canaries=("Tier List Guides", "/guide/classes/tier-lists/"),
        min_body_bytes=1_000,
        stop_signatures=("Just a moment...", "cf-chl-"),
    )
    index_body, index_fetch = fetch_with_fallback(DEFAULT_SOURCE_URL, index_contract)
    links = extract_tier_list_links(index_body, DEFAULT_SOURCE_URL)
    if len(links) != 6:
        raise RuntimeError(f"expected 6 tier-list links, extracted {len(links)}")

    pages: list[dict[str, Any]] = []
    fetches = [index_fetch]
    for link in links:
        contract = ResponseContract.html(
            canaries=(
                '<h1 class="heading-size-1',
                '<div id="guide-body"',
                urlsplit(link["url"]).path,
            ),
            min_body_bytes=5_000,
            stop_signatures=("Just a moment...", "cf-chl-"),
        )
        body, fetch = fetch_with_fallback(link["url"], contract)
        page = parse_tier_page(
            body,
            source_url=link["url"],
            activity=link["activity"],
            role=link["role"],
        )
        page["fetch"] = fetch
        pages.append(page)
        fetches.append(fetch)

    all_specs = [
        spec for page in pages for tier in page["tiers"] for spec in tier["specs"]
    ]
    unique_specs = {(spec["class_slug"], spec["spec_slug"]) for spec in all_specs}
    attributed = all(fetch["credits_spent"] is not None for fetch in fetches)
    credits = (
        sum(int(fetch["credits_spent"]) for fetch in fetches) if attributed else None
    )
    return {
        "schema_version": 1,
        "source_index": DEFAULT_SOURCE_URL,
        "fetched_at": datetime.now(UTC).isoformat(),
        "page_count": len(pages),
        "record_count": len(all_specs),
        "unique_spec_count": len(unique_specs),
        "credits_spent": credits,
        "index_fetch": index_fetch,
        "pages": pages,
    }


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-report", default=DEFAULT_INDEX_REPORT)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    links = _load_index_report(Path(args.index_report))
    pages: list[dict[str, Any]] = []
    total_credits = 0
    credits_attributed = True
    for link in links:
        contract = ResponseContract.html(
            canaries=(
                "<h1 class=\"heading-size-1",
                "<div id=\"guide-body\"",
                urlsplit(link["url"]).path,
            ),
            min_body_bytes=5_000,
            stop_signatures=("Just a moment...", "cf-chl-"),
        )
        body, fetch = fetch_with_scrape_do(link["url"], contract)
        page = parse_tier_page(
            body,
            source_url=link["url"],
            activity=link["activity"],
            role=link["role"],
        )
        page["fetch"] = fetch
        pages.append(page)
        if fetch["credits_spent"] is None:
            credits_attributed = False
        else:
            total_credits += int(fetch["credits_spent"])

    all_specs = [
        spec
        for page in pages
        for tier in page["tiers"]
        for spec in tier["specs"]
    ]
    unique_specs = {(spec["class_slug"], spec["spec_slug"]) for spec in all_specs}
    payload = {
        "schema_version": 1,
        "source_index": str(Path(args.index_report)),
        "fetched_at": datetime.now(UTC).isoformat(),
        "page_count": len(pages),
        "record_count": len(all_specs),
        "unique_spec_count": len(unique_specs),
        "credits_spent": total_credits if credits_attributed else None,
        "pages": pages,
    }
    output = Path(args.output)
    _write_json_atomic(output, payload)
    print(
        json.dumps(
            {
                "status": "ok",
                "pages": len(pages),
                "records": len(all_specs),
                "unique_specs": len(unique_specs),
                "credits_spent": payload["credits_spent"],
                "output": str(output),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
