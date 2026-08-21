from __future__ import annotations

import unittest
from decimal import Decimal
from types import SimpleNamespace

from web_scraper import ResponseContract

from scraper.parsers.wowhead_tier_lists import (
    extract_tier_list_links,
    fetch_with_fallback,
)


class FakeProvider:
    configured = True

    def __init__(self, name: str, body: bytes) -> None:
        self.name = name
        self.body = body
        self.calls = 0

    def fetch(self, request):
        self.calls += 1
        return SimpleNamespace(
            provider=self.name,
            strategy_id=request.strategy_id,
            final_url=request.url,
            target_status=200,
            headers={"content-type": "text/html"},
            body=self.body,
            latency_ms=1,
            truncated=False,
            cost=SimpleNamespace(attributed=True, credits=Decimal("1")),
        )


class ExtractTierListLinksTest(unittest.TestCase):
    def test_extracts_deduplicates_and_orders_expected_links(self) -> None:
        html = """
        <html><body>
          <a href="/guide/classes/tier-lists/tank-rankings-mythic-plus">Tank M+</a>
          <a href="/guide/classes/tier-lists/healer-rankings-raids">Healer Raid</a>
          <a href="https://www.wowhead.com/guide/classes/tier-lists/dps-rankings-raids?x=1">DPS Raid</a>
          <a href="/guide/classes/tier-lists/tank-rankings-raids">Tank Raid</a>
          <a href="/guide/classes/tier-lists/dps-rankings-mythic-plus">DPS M+</a>
          <a href="/guide/classes/tier-lists/healer-rankings-mythic-plus">Healer M+</a>
          <a href="/guide/classes/tier-lists/dps-rankings-raids">Duplicate</a>
          <a href="https://example.com/guide/classes/tier-lists/dps-rankings-raids">External</a>
        </body></html>
        """

        links = extract_tier_list_links(
            html, "https://www.wowhead.com/guides/classes/tier-lists"
        )

        self.assertEqual(6, len(links))
        self.assertEqual(
            [
                ("raid", "dps"),
                ("raid", "healer"),
                ("raid", "tank"),
                ("mythic_plus", "dps"),
                ("mythic_plus", "healer"),
                ("mythic_plus", "tank"),
            ],
            [(item["activity"], item["role"]) for item in links],
        )
        self.assertTrue(all("?" not in item["url"] for item in links))

    def test_falls_back_when_primary_body_fails_validation(self) -> None:
        primary = FakeProvider("scrape.do", b"blocked")
        backup = FakeProvider("zenrows", b"<html>Tier List Guides</html>")
        body, telemetry = fetch_with_fallback(
            "https://www.wowhead.com/guides/classes/tier-lists",
            ResponseContract.html(canaries=("Tier List Guides",), min_body_bytes=10),
            providers=[(primary, "normal"), (backup, "basic")],
        )
        self.assertIn(b"Tier List Guides", body)
        self.assertEqual("zenrows", telemetry["provider"])
        self.assertEqual(1, primary.calls)
        self.assertEqual(1, backup.calls)


if __name__ == "__main__":
    unittest.main()
