#!/usr/bin/env python3
"""Seed Tierlist WoWHead from a previously validated JSON report."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime
from pathlib import Path

from . import wowhead_dataset_service as service


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True)
    parser.add_argument("--scheduled-for", default=date.today().isoformat())
    args = parser.parse_args()

    payload = json.loads(Path(args.report).read_text(encoding="utf-8"))
    for page in payload.get("pages", []):
        for tier in page.get("tiers", []):
            for spec in tier.get("specs", []):
                spec["source_url"] = page["source_url"]
    payload["source_index"] = "https://www.wowhead.com/guides/classes/tier-lists"
    payload["fetched_at"] = payload.get("fetched_at") or datetime.now(UTC).isoformat()

    service.collect_tierlist_dataset = lambda: payload
    result = service.refresh_tierlist(
        date.fromisoformat(args.scheduled_for), trigger="seed"
    )
    print(json.dumps(result.as_dict(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
