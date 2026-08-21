import json
import unittest

from scraper.parsers.archon_tierlist import parse_archon_page


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
