import copy
import json
import unittest
from datetime import UTC, datetime
from pathlib import Path

from scraper.parsers.raiderio_mplus import (collect_raiderio_mplus, current_season, parse_cutoffs, parse_run,
                                            parse_spec_cohorts, parse_world_cutoffs)
from scraper.parsers.raiderio_mplus_dataset_service import (DatasetValidationError, merge_presence_history,
                                                            validate_candidate)

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def _load(name):
    return json.loads((FIXTURES / name).read_text())


def _fake_fetch(calls):
    static = _load("raiderio-static-data-11.json")
    runs = _load("raiderio-runs-murder-row-eu.json")
    cutoffs = _load("raiderio-season-cutoffs-eu.json")
    cohorts = _load("raiderio-cutoff-analysis-specs-eu.json")
    summary = _load("raiderio-cutoff-summary-world.json")

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
        if path == "/cutoff-analysis/summary":
            return summary
        if path == "/cutoff-analysis":
            return cohorts
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
        # 1 static + 8 dungeons x 7 pages + 4 cutoffs + world summary + 5 spec cohort sets.
        self.assertEqual(len(calls), 1 + 8 * 7 + 4 + 1 + 5)
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

    def test_world_cutoffs_and_spec_cohorts(self):
        world = parse_world_cutoffs(_load("raiderio-cutoff-summary-world.json"))
        self.assertEqual([tier["key"] for tier in world["tiers"]], ["p999", "p990", "p900", "p750", "p600"])
        self.assertGreater(world["players"], 1_000_000)
        self.assertEqual(len(world["history"]), 5)
        self.assertEqual(world["history"][0]["points"][-1][0], "2026-11-06")
        cohorts = parse_spec_cohorts(_load("raiderio-cutoff-analysis-specs-eu.json"))
        self.assertEqual(cohorts["trend_end"], "2026-11-06")
        self.assertEqual(len(cohorts["specs"]), 12)
        arms = next(spec for spec in cohorts["specs"] if spec["id"] == 71)
        self.assertGreater(arms["title"], 0)
        self.assertTrue(arms["p01"] > arms["p1"] > arms["p10"])
        # 30 days of observations -> weekly points ending at the last day, oldest first.
        self.assertEqual(len(arms["trend"]), 5)
        self.assertEqual(arms["trend"][-1], arms["p1"])
        self.assertEqual(arms["trend"], sorted(arms["trend"]))

    def test_collect_sums_world_title_counts_over_regions(self):
        payload, _ = self._collect()
        self.assertEqual(sorted(payload["spec_cohorts"]), ["eu", "kr", "tw", "us", "world"])
        arms = {scope: next(spec for spec in block["specs"] if spec["id"] == 71) for scope, block in payload["spec_cohorts"].items()}
        self.assertEqual(arms["world"]["title"], 4 * arms["eu"]["title"])
        broken = copy.deepcopy(payload)
        broken["spec_cohorts"]["eu"]["specs"][0]["title"] = broken["spec_cohorts"]["eu"]["specs"][0]["population"] + 1
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)

    def test_presence_history_is_carried_and_capped(self):
        payload, _ = self._collect()
        old = [{"date": "2026-10-30", "runs": {"eu": 10}, "specs": {"eu": {"71": 7}}},
               {"date": "2026-11-06", "runs": {"eu": 1}, "specs": {"eu": {}}}, "junk"]
        history = merge_presence_history(old, payload, "2026-11-06")
        self.assertEqual([item["date"] for item in history], ["2026-10-30", "2026-11-06"])
        today = history[-1]
        self.assertEqual(sum(today["runs"].values()), len(payload["runs"]))
        for region, counts in today["specs"].items():
            self.assertTrue(all(count <= today["runs"][region] for count in counts.values()))
        many = [{"date": f"2026-{month:02d}-{day:02d}", "runs": {}, "specs": {}} for month in (6, 7, 8, 9, 10) for day in range(1, 29)]
        self.assertEqual(len(merge_presence_history(many, payload, "2026-11-06")), 120)


if __name__ == "__main__":
    unittest.main()
