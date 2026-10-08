import json
import unittest
from unittest import mock

from scraper.parsers import archon_tierlist
from scraper.parsers.archon_tierlist import parse_archon_page


class FetchArchonProviderChainTest(unittest.TestCase):
    def test_uses_the_full_provider_chain_before_direct_fallback(self) -> None:
        contract = object()
        with mock.patch.object(archon_tierlist, "fetch_with_fallback", return_value=(b"body", {"provider": "zyte"})) as fetch:
            body, telemetry = archon_tierlist._fetch_archon("https://www.archon.gg/wow/tier-list/dps-rankings/mythic-plus/10/all-dungeons/this-week", contract)
        self.assertEqual(body, b"body")
        self.assertEqual(telemetry["provider"], "zyte")
        fetch.assert_called_once()
        self.assertNotIn("providers", fetch.call_args.kwargs, "Archon must not be pinned to Scrape.do alone")


class ParseArchonPageTest(unittest.TestCase):
 def test_extracts_metrics_and_all_tier_assignments(self) -> None:
    row = {
        "item": "<ActorIcon type='Warrior-Arms'>Arms Warrior</ActorIcon>",
        "itemPath": "/wow/builds/arms/warrior/raid/overview/heroic/all-bosses",
        "dps": 123456.5,
        "survivability": 96.4,
        "popularity": 0.12,
        "parses": 421,
    }
    entry = {
        "id": 110001,
        "name": "Arms Warrior",
        "url": row["itemPath"],
        "icon": "Warrior-Arms",
    }
    page = {
        "title": "DPS Rankings",
        "lastUpdated": "2026-08-21T12:00:00Z",
        "totalParses": 421,
        "specTierListSection": {
            "description": "Daily tier list",
            "tierLists": [
                {"metric": "popularity", "tiers": [{"tier": "S", "entries": [[entry]]}]},
                {"metric": "throughput", "tiers": [{"tier": "A", "entries": [[entry]]}]},
            ],
        },
        "specRankingsSection": {"table": {"data": [row]}},
    }
    payload = {"props": {"pageProps": {"page": page}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'

    result = parse_archon_page(
        html,
        source_url="https://www.archon.gg/wow/tier-list/dps-rankings/raid/heroic/all-bosses",
        activity="raid",
        difficulty="heroic",
        role="dps",
    )

    record = result["records"][0]
    self.assertEqual("popularity", result["primary_metric"])
    self.assertEqual("S", record["tier"])
    self.assertEqual({
        "popularity": {"tier": "S", "rank": 1},
        "throughput": {"tier": "A", "rank": 1},
    }, record["tier_assignments"])
    self.assertEqual("warrior", record["class_slug"])
    self.assertEqual("arms", record["spec_slug"])
    self.assertEqual(110001, record["spec_id"])
    self.assertEqual(123456.5, record["dps"])


 def test_keeps_low_sample_rows_without_a_tier(self) -> None:
    page = {
        "lastUpdated": "2026-08-21T12:00:00Z",
        "totalParses": 0,
        "specTierListSection": {
            "tierLists": [{"metric": "popularity", "tiers": []}],
        },
        "specRankingsSection": {
            "table": {
                "data": [{
                    "item": "<ActorIcon type='Druid-Guardian'>Guardian Druid</ActorIcon>",
                    "itemPath": "/wow/builds/guardian/druid/raid/overview/mythic/all-bosses",
                    "dps": 60000,
                    "popularity": 0.5,
                    "parses": 1,
                }]
            }
        },
    }
    payload = {"props": {"pageProps": {"page": page}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'

    result = parse_archon_page(
        html,
        source_url="https://www.archon.gg/wow/tier-list/tank-rankings/raid/mythic/all-bosses",
        activity="raid",
        difficulty="mythic",
        role="tank",
    )
    self.assertEqual("", result["records"][0]["tier"])
    self.assertEqual({}, result["records"][0]["tier_assignments"])
