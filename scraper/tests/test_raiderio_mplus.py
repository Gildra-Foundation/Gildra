import copy
import json
import unittest
from datetime import UTC, datetime
from pathlib import Path

from scraper.parsers.raiderio_mplus import collect_raiderio_mplus, current_season, parse_cutoffs, parse_run
from scraper.parsers.raiderio_mplus_dataset_service import DatasetValidationError, validate_candidate

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def _load(name):
    return json.loads((FIXTURES / name).read_text())


def _fake_fetch(calls):
    static = _load("raiderio-static-data-11.json")
    runs = _load("raiderio-runs-murder-row-eu.json")
    cutoffs = _load("raiderio-season-cutoffs-eu.json")

    def fetch(path, params):
        calls.append((path, dict(params)))
        if path == "/static-data":
            return static
        if path == "/runs":
            # A full page of 20 with its own run ids, like the real leaderboards.
            body = {"rankings": [copy.deepcopy(runs["rankings"][index % len(runs["rankings"])]) for index in range(20)]}
            for index, ranking in enumerate(body["rankings"]):
                ranking["run"]["keystone_run_id"] = len(calls) * 1000 + index
                ranking["run"]["dungeon"]["map_challenge_mode_id"] = next(
                    d["challenge_mode_id"] for d in static["seasons"][0]["dungeons"] if d["slug"] == params["dungeon"])
            return body
        if path == "/season-cutoffs":
            return cutoffs
        raise AssertionError(path)

    return fetch


class RaiderIOParsingTest(unittest.TestCase):
    def test_current_season_is_the_running_main_season(self):
        season = current_season(_load("raiderio-static-data-11.json"), NOW)
        self.assertEqual(season["slug"], "season-mn-2")
        self.assertEqual(len(season["dungeons"]), 8)
        self.assertTrue(all(d["timer_ms"] >= 1_500_000 for d in season["dungeons"]))
        with self.assertRaises(ValueError):
            current_season(_load("raiderio-static-data-11.json"), datetime(2020, 1, 1, tzinfo=UTC))

    def test_parse_run_keeps_numbers_and_specs_only(self):
        specs = {}
        ranking = _load("raiderio-runs-murder-row-eu.json")["rankings"][0]
        row = parse_run(ranking, "eu", specs)
        self.assertEqual(set(row), {"id", "dg", "lv", "ch", "ms", "tm", "at", "rg", "t", "h", "d", "v"})
        self.assertEqual(len(row["d"]), 3)
        self.assertEqual(row["d"], sorted(row["d"]))
        self.assertTrue(row["at"].endswith("Z"))
        self.assertEqual(specs[row["t"]]["role"], "tank")
        self.assertNotIn("Moadzarella", json.dumps(row))

    def test_parse_run_drops_odd_rosters(self):
        ranking = copy.deepcopy(_load("raiderio-runs-murder-row-eu.json")["rankings"][0])
        ranking["run"]["roster"] = ranking["run"]["roster"][:4]
        self.assertIsNone(parse_run(ranking, "eu", {}))

    def test_parse_cutoffs(self):
        cutoffs = parse_cutoffs(_load("raiderio-season-cutoffs-eu.json"))
        scores = [tier["score"] for tier in cutoffs["tiers"]]
        self.assertEqual([tier["key"] for tier in cutoffs["tiers"]], ["p999", "p990", "p900", "p750", "p600"])
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertGreater(cutoffs["players"], 100_000)
        self.assertEqual([m["score"] for m in cutoffs["milestones"]], [2000, 2500, 3000, 3600])
        self.assertEqual([item["level"] for item in cutoffs["all_timed"]], [20, 21])
        self.assertEqual(cutoffs["updated_at"], "2026-11-06T13:01:09Z")
        self.assertTrue(all(len(point) == 2 for series in cutoffs["history"] for point in series["points"]))


class RaiderIOCollectTest(unittest.TestCase):
    def _collect(self, pages=None):
        calls = []
        payload = collect_raiderio_mplus(_fake_fetch(calls), now=NOW, pages=pages or {"us": 3, "eu": 3, "kr": 1, "tw": 0})
        return payload, calls

    def test_collect_builds_a_valid_snapshot(self):
        payload, calls = self._collect()
        # 1 static + 8 dungeons x 7 pages + 4 cutoffs.
        self.assertEqual(len(calls), 1 + 8 * 7 + 4)
        self.assertEqual(payload["page_count"], len(calls))
        self.assertEqual(payload["regions"], ["us", "eu", "kr"])
        self.assertEqual(payload["record_count"], len(payload["runs"]))
        self.assertGreaterEqual(len(payload["runs"]), 500)
        self.assertEqual(validate_candidate(payload), len(payload["runs"]))

    def test_validation_rejects_unsafe_candidates(self):
        payload, _ = self._collect()
        broken = copy.deepcopy(payload)
        broken["runs"][0]["ch"] = 0
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        broken = copy.deepcopy(payload)
        broken["runs"][1]["t"] = broken["runs"][1]["h"]
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        broken = copy.deepcopy(payload)
        broken["runs"] = broken["runs"][:100]
        broken["record_count"] = 100
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload, previous_run_count=len(payload["runs"]) * 3)
        broken = copy.deepcopy(payload)
        broken["cutoffs"]["eu"]["tiers"].reverse()
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)


if __name__ == "__main__":
    unittest.main()
