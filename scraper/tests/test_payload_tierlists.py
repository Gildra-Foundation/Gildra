import copy
import unittest
from datetime import UTC, datetime
from pathlib import Path

from scraper.parsers import method_tierlist, murlok_tierlist, pvp_ladder, wowmeta_tierlist, wythic_tierlist
from scraper.parsers.tierlist_payload import DatasetValidationError, TierParseError, build_payload, validate_payload
from scraper.parsers.wow_specs import BY_ID, SPECS, ckmeans_tiers, by_full_name, by_parts

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


class FakeFetcher:
    """Serves fixture pages by URL path; murlok's 15 pages share three fixtures by role."""

    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages
        self.requests = 0

    def get(self, url, contract):
        self.requests += 1
        path = "/" + url.split("/", 3)[3]
        return fixture(self.pages[path]), {"path": path, "provider": "direct", "credits_spent": "0"}


class SpecCatalogTest(unittest.TestCase):
    def test_forty_specs_with_unique_ids_and_slugs(self) -> None:
        self.assertEqual(40, len(SPECS))
        self.assertEqual(40, len(BY_ID))
        self.assertEqual("beast-mastery", by_full_name("Beast Mastery Hunter").spec_slug)
        self.assertEqual("death-knight", by_parts("deathknight", "unholy").class_slug)
        self.assertIsNone(by_full_name("Holy"))

    def test_ckmeans_splits_on_the_largest_gaps(self) -> None:
        self.assertEqual(["S", "S", "A", "B", "B", "C", "D"], ckmeans_tiers([100, 99, 80, 60, 59, 40, 10]))
        self.assertEqual(["S", "S", "S"], ckmeans_tiers([5, 5, 5]))
        self.assertEqual(["S", "A", "A"], ckmeans_tiers([3, 1, 1]))
        self.assertEqual([], ckmeans_tiers([]))


class WowMetaTest(unittest.TestCase):
    def test_parses_rank_tier_and_numbers(self) -> None:
        parsed = wowmeta_tierlist.parse_page(fixture("wowmeta-mplus-dps.html"), "dps")
        self.assertEqual(27, len(parsed["entries"]))
        top = parsed["entries"][0]
        self.assertEqual(("warrior", "arms", "S"), (top["class_slug"], top["spec_slug"], top["tier"]))
        self.assertEqual({"score": 367.25, "rating": 367.58, "players": 131208, "max_key": 21}, top["metrics"])
        self.assertEqual(1_419_789, parsed["sample"])

    def test_collect_validates(self) -> None:
        fetcher = FakeFetcher({path: f"wowmeta-mplus-{role}.html" for role, path in wowmeta_tierlist.PAGES.items()})
        payload = wowmeta_tierlist.collect_wowmeta(fetcher)
        self.assertEqual(40, validate_payload(payload, wowmeta_tierlist.DATASET.expect))
        self.assertEqual(3, fetcher.requests)

    def test_layout_change_fails_closed(self) -> None:
        with self.assertRaises(TierParseError):
            wowmeta_tierlist.parse_page(b"<html><body>nothing</body></html>", "dps")


class WythicTest(unittest.TestCase):
    def test_splits_all_role_tiers_by_role(self) -> None:
        lists = {item["role"]: item for item in wythic_tierlist.parse_page(fixture("wythic-en.html"))}
        self.assertEqual((27, 7, 6), (len(lists["dps"]["entries"]), len(lists["healer"]["entries"]), len(lists["tank"]["entries"])))
        healer = lists["healer"]["entries"][0]
        self.assertEqual(("paladin", "holy", "S", 1), (healer["class_slug"], healer["spec_slug"], healer["tier"], healer["rank"]))
        self.assertAlmostEqual(0.164, healer["metrics"]["popularity"])

    def test_collect_validates(self) -> None:
        payload = wythic_tierlist.collect_wythic(FakeFetcher({"/en": "wythic-en.html"}))
        self.assertEqual(40, validate_payload(payload, wythic_tierlist.DATASET.expect))


class MethodTest(unittest.TestCase):
    def test_reads_the_spec_list_only(self) -> None:
        lists = {item["role"]: item for item in method_tierlist.parse_page(fixture("method-mplus.html"))}
        self.assertEqual(40, sum(len(item["entries"]) for item in lists.values()))
        tank = lists["tank"]["entries"][0]
        self.assertEqual(("death-knight", "blood", "S"), (tank["class_slug"], tank["spec_slug"], tank["tier"]))
        self.assertIn(lists["tank"]["entries"][1]["change"], {"up", "down", ""})
        self.assertTrue(any(entry["change"] for item in lists.values() for entry in item["entries"]))

    def test_collect_validates(self) -> None:
        payload = method_tierlist.collect_method(FakeFetcher({method_tierlist.PAGE: "method-mplus.html"}))
        self.assertEqual(40, validate_payload(payload, method_tierlist.DATASET.expect))


class MurlokTest(unittest.TestCase):
    def test_derives_tiers_from_the_score(self) -> None:
        parsed = murlok_tierlist.parse_page(fixture("murlok-dps-3v3.html"), "dps", "3v3")
        self.assertTrue(parsed["tiers_derived"])
        self.assertEqual("3v3", parsed["bracket"])
        self.assertEqual(27, len(parsed["entries"]))
        top = parsed["entries"][0]
        self.assertEqual(("rogue", "subtlety", "S", 2800), (top["class_slug"], top["spec_slug"], top["tier"], top["metrics"]["score"]))
        self.assertEqual("D", parsed["entries"][-1]["tier"])

    def test_solo_page_is_the_shuffle_bracket(self) -> None:
        parsed = murlok_tierlist.parse_page(fixture("murlok-healer-solo.html"), "healer", "solo")
        self.assertEqual(("shuffle", 7), (parsed["bracket"], len(parsed["entries"])))

    def test_role_mismatch_fails(self) -> None:
        with self.assertRaises(TierParseError):
            murlok_tierlist.parse_page(fixture("murlok-dps-3v3.html"), "healer", "3v3")

    def test_collect_validates(self) -> None:
        pages = {}
        for bracket in murlok_tierlist.BRACKETS:
            pages[f"/meta/dps/{bracket}"] = "murlok-dps-3v3.html"
            pages[f"/meta/healer/{bracket}"] = "murlok-healer-solo.html"
            pages[f"/meta/tank/{bracket}"] = "murlok-tank-rbg.html"

        class Rewriting(FakeFetcher):
            def get(self, url, contract):
                body, fetch = super().get(url, contract)
                bracket = url.rsplit("/", 1)[1]
                # The fixtures belong to one bracket each; point their links at the requested one.
                return body.replace(b'/3v3"', f'/{bracket}"'.encode()).replace(b'/solo"', f'/{bracket}"'.encode()).replace(b'/rbg"', f'/{bracket}"'.encode()), fetch

        payload = murlok_tierlist.collect_murlok(Rewriting(pages))
        self.assertEqual(15 * 0 + 5 * (27 + 7 + 6), validate_payload(payload, murlok_tierlist.DATASET.expect))


def _row(rank: int, rating: int, name: str = "X", realm: str = "realm", won: int = 6, played: int = 10) -> dict:
    return {"rank": rank, "rating": rating, "character": {"name": f"{name}{rank}", "realm": {"slug": realm}},
            "season_match_statistics": {"played": played, "won": won}}


class PvPLadderTest(unittest.TestCase):
    def test_board_names_map_to_specs(self) -> None:
        spec = pvp_ladder.spec_from_board("shuffle-deathknight-unholy", "shuffle")
        self.assertEqual(("death-knight", "unholy"), (spec.class_slug, spec.spec_slug))
        self.assertEqual("blitz-hunter-beastmastery", pvp_ladder.spec_board_name("blitz", by_full_name("Beast Mastery Hunter")))

    def test_spec_bracket_counts_players_above_the_overall_cutoff(self) -> None:
        overall = {"entries": [_row(rank, 3000 - rank) for rank in range(1, 201)]}
        boards = {261: {"entries": [_row(1, 2990), _row(2, 2950), _row(3, 2700)]}, 65: {"entries": [_row(1, 2900)]}}
        counts, cutoff = pvp_ladder.count_spec_bracket(overall, boards, cutoff_rank=100)
        self.assertEqual(2900, cutoff)
        self.assertEqual(2, counts[261]["players"])
        self.assertEqual(1, counts[65]["players"])

    def test_team_bracket_counts_active_specs(self) -> None:
        board = {"entries": [_row(rank, 2800 - rank) for rank in range(1, 81)]}
        specs = {f"X{rank}": (261 if rank % 2 else 71) for rank in range(1, 81)}
        counts, cutoff = pvp_ladder.count_team_bracket(board, 60, lambda realm, name: specs[name])
        self.assertEqual(2740, cutoff)
        self.assertEqual(30, counts[261]["players"])
        self.assertEqual(30, counts[71]["players"])

    def test_lists_rank_every_spec_and_validate(self) -> None:
        dps = [spec.spec_id for spec in SPECS if spec.role == "dps"]
        healers = [spec.spec_id for spec in SPECS if spec.role == "healer"]
        def counts(seed: int):
            result = {}
            for index, spec_id in enumerate(dps + healers):
                players = max(0, 40 - ((index * 7 + seed) % 45))
                if players:
                    result[spec_id] = {"players": players, "rating_sum": players * 2600.0, "played": players * 20, "won": players * 11}
            return result
        by_region = {"eu": {bracket: counts(1) for bracket in (*pvp_ladder.SPEC_BRACKETS, *pvp_ladder.TEAM_BRACKETS)},
                     "us": {bracket: counts(3) for bracket in (*pvp_ladder.SPEC_BRACKETS, *pvp_ladder.TEAM_BRACKETS)}}
        lists = pvp_ladder.build_lists(by_region)
        payload = build_payload("ladder", "Blizzard", pvp_ladder.SOURCE_URL, lists, [{}], datetime(2026, 11, 6, tzinfo=UTC))
        rows = validate_payload(payload, pvp_ladder.DATASET.expect)
        self.assertEqual(5 * 3 * (27 + 7), rows)
        first = next(item for item in lists if item["bracket"] == "3v3" and item["region"] == "all" and item["role"] == "dps")
        self.assertEqual(27, len(first["entries"]))
        self.assertAlmostEqual(1.0, sum(entry["metrics"]["popularity"] for entry in first["entries"]), places=3)
        self.assertEqual(0.55, first["entries"][0]["metrics"]["win_rate"])
        zero = [entry for entry in first["entries"] if entry["metrics"]["players"] == 0]
        self.assertTrue(all(entry["tier"] == "F" for entry in zero))


class ValidationTest(unittest.TestCase):
    def _payload(self):
        return method_tierlist.collect_method(FakeFetcher({method_tierlist.PAGE: "method-mplus.html"}))

    def test_rejects_unordered_tiers(self) -> None:
        payload = self._payload()
        payload["lists"][0]["entries"][0]["tier"] = "C"
        with self.assertRaises(DatasetValidationError):
            validate_payload(payload, method_tierlist.DATASET.expect)

    def test_rejects_a_spec_in_the_wrong_role(self) -> None:
        payload = self._payload()
        tank = next(item for item in payload["lists"] if item["role"] == "tank")
        dps = next(item for item in payload["lists"] if item["role"] == "dps")
        dps["entries"][0] = copy.deepcopy(tank["entries"][0])
        with self.assertRaises(DatasetValidationError):
            validate_payload(payload, method_tierlist.DATASET.expect)

    def test_rejects_a_lost_list_and_a_big_drop(self) -> None:
        payload = self._payload()
        lost = copy.deepcopy(payload)
        lost["lists"] = lost["lists"][:2]
        lost["record_count"] = sum(len(item["entries"]) for item in lost["lists"])
        with self.assertRaises(DatasetValidationError):
            validate_payload(lost, method_tierlist.DATASET.expect)
        with self.assertRaises(DatasetValidationError):
            validate_payload(payload, method_tierlist.DATASET.expect, previous_record_count=100)

    def test_rejects_out_of_range_metrics(self) -> None:
        payload = wythic_tierlist.collect_wythic(FakeFetcher({"/en": "wythic-en.html"}))
        payload["lists"][0]["entries"][0]["metrics"]["popularity"] = 3.0
        with self.assertRaises(DatasetValidationError):
            validate_payload(payload, wythic_tierlist.DATASET.expect)


if __name__ == "__main__":
    unittest.main()
