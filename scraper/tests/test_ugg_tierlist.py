import json
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock

from scraper.parsers import ugg_tierlist
from scraper.parsers.ugg_tierlist import discover_version, page_url, parse_ugg_tierlist, slugify

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 10, 24, 12, tzinfo=UTC)


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


class UggHelpersTest(unittest.TestCase):
    def test_slugify_matches_gildra_slugs(self) -> None:
        self.assertEqual("death-knight", slugify("DeathKnight"))
        self.assertEqual("beast-mastery", slugify("BeastMastery"))
        self.assertEqual("herald-of-the-sun", slugify("HeraldOfTheSun"))
        self.assertEqual("devourer", slugify("Devourer"))

    def test_page_urls_link_back_to_the_matching_u_gg_view(self) -> None:
        self.assertEqual("https://u.gg/wow/tier-list/dps-rankings", page_url("mythic_plus", "all", "dps"))
        self.assertEqual("https://u.gg/wow/tier-list/tank-rankings/raid", page_url("raid", "all", "tank"))
        self.assertEqual(
            "https://u.gg/wow/tier-list/healer-rankings/raid?difficulty=mythic",
            page_url("raid", "mythic", "healer"),
        )

    def test_discover_version_walks_up_to_the_newest_published_build(self) -> None:
        published = {37, 38, 39}
        with mock.patch.object(ugg_tierlist, "_probe", side_effect=lambda url: int(url.split("/v")[1].split("/")[0]) in published):
            self.assertEqual(39, discover_version(37))

    def test_discover_version_fails_closed_when_the_floor_disappears(self) -> None:
        with mock.patch.object(ugg_tierlist, "_probe", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "no longer published"):
                discover_version(37)


class SavedUggTierListTest(unittest.TestCase):
    def test_mythic_plus_fixture_collapses_hero_talents_per_spec(self) -> None:
        pages = parse_ugg_tierlist(
            fixture("ugg-v37-all-mythic.json"), activity="mythic_plus", difficulty="all",
            game_mode="mythic", data_source_url="https://stats2.u.gg/x", now=NOW,
        )
        by_role = {page["role"]: page for page in pages}
        self.assertEqual({"dps": 27, "healer": 7, "tank": 6}, {r: p["record_count"] for r, p in by_role.items()})
        first = by_role["dps"]["records"][0]
        self.assertEqual(("warrior", "arms", "S", 1), (first["class_slug"], first["spec_slug"], first["tier"], first["rank"]))
        self.assertEqual(["slayer", "colossus"], [hero["slug"] for hero in first["hero_talents"]])
        self.assertEqual(first["parses"], sum(hero["count"] for hero in first["hero_talents"]))
        self.assertEqual(list(range(1, 28)), [record["rank"] for record in by_role["dps"]["records"]])
        self.assertAlmostEqual(1.0, sum(record["popularity"] for record in by_role["tank"]["records"]), places=4)
        self.assertEqual("2026-10-24T04:17:01.565542+00:00"[:19], by_role["dps"]["source_updated_at"][:19])

    def test_heroic_raid_fixture_keeps_difficulty_and_source_link(self) -> None:
        pages = parse_ugg_tierlist(
            fixture("ugg-v37-heroic-raid.json"), activity="raid", difficulty="heroic",
            game_mode="raid", data_source_url="https://stats2.u.gg/x", now=NOW,
        )
        specs = {(record["class_slug"], record["spec_slug"]) for page in pages for record in page["records"]}
        self.assertEqual(40, len(specs))
        self.assertIn(("demon-hunter", "devourer"), specs)
        self.assertTrue(all(page["source_url"].endswith("?difficulty=heroic") for page in pages))

    def test_rejects_stale_or_wrong_mode_payloads(self) -> None:
        body = fixture("ugg-v37-heroic-raid.json")
        with self.assertRaisesRegex(ValueError, "stale"):
            parse_ugg_tierlist(body, activity="raid", difficulty="heroic", game_mode="raid",
                               data_source_url="x", now=datetime(2026, 12, 1, tzinfo=UTC))
        with self.assertRaisesRegex(ValueError, "no 'mythic' section"):
            parse_ugg_tierlist(body, activity="mythic_plus", difficulty="all", game_mode="mythic",
                               data_source_url="x", now=NOW)
        broken = json.loads(body)
        broken["raid"]["dps_list"][0]["tier_letter"] = "Z"
        with self.assertRaisesRegex(ValueError, "tier letter"):
            parse_ugg_tierlist(json.dumps(broken), activity="raid", difficulty="heroic",
                               game_mode="raid", data_source_url="x", now=NOW)


if __name__ == "__main__":
    unittest.main()
