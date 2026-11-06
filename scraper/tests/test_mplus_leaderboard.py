import copy
import json
import pathlib
import unittest

from scraper.parsers.mplus_leaderboard import (
    SPECS,
    estimate_candidates,
    parse_equipment,
    parse_leaderboard,
    parse_season_profile,
    parse_specializations,
    parse_summary,
    season_label,
    select_candidates,
    select_final,
    summarize_specs,
)
from scraper.parsers.mplus_leaderboard_dataset_service import DatasetValidationError, validate_candidate

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
LOADOUT = "CoPAkXBWxkyfx9CbGaHonEAhLxMzyMzwMmZmhZbmZmmZZmZMzMAAAAAmhZ"


def _member(name, realm, spec):
    return {"profile": {"name": name, "id": hash(name) % 10_000, "realm": {"id": 1, "slug": realm}},
            "faction": {"type": "HORDE"}, "specialization": {"id": spec}}


def _group(level, rating, members, completed=1):
    return {"ranking": 1, "duration": 1, "completed_timestamp": completed, "keystone_level": level,
            "mythic_rating": {"rating": rating}, "members": members}


class DiscoveryTest(unittest.TestCase):
    def test_parses_runs_and_drops_unknown_specs(self) -> None:
        board = {"leading_groups": [
            _group(23, 532.1, [_member("Zefirqt", "bloodhoof", 250), _member("Ghost", "kazzak", 9999)]),
            _group(2, 0, [_member("Nobody", "kazzak", 63)]),
        ]}
        runs = parse_leaderboard(board, 585)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["members"], [{"name": "Zefirqt", "realm": "bloodhoof", "spec": 250}])

    def test_estimate_keeps_the_best_run_per_dungeon_and_ignores_repeats(self) -> None:
        run = {"dungeon": 585, "completed": 1, "level": 23, "rating": 500.0,
               "members": [{"name": "Zef", "realm": "bloodhoof", "spec": 250}]}
        runs = [run, copy.deepcopy(run), {**run, "rating": 400.0, "completed": 2},
                {**run, "dungeon": 586, "rating": 450.0, "members": [{"name": "ZEF", "realm": "bloodhoof", "spec": 251}]}]
        estimate = estimate_candidates(runs)[("bloodhoof", "zef")]
        self.assertEqual(estimate["estimate"], 950.0)
        self.assertEqual(estimate["spec"], 250)

    def test_selects_overall_top_per_spec_top_and_carried_characters(self) -> None:
        estimates = {("r", f"a{i}"): {"name": f"A{i}", "realm": "r", "estimate": 3000 - i, "spec": 63} for i in range(10)}
        estimates[("r", "tank")] = {"name": "Tank", "realm": "r", "estimate": 100, "spec": 250}
        chosen = select_candidates(estimates, [{"name": "Old", "realm": "r", "spec": 65}], overall=3, per_spec=1)
        names = [item["name"] for item in chosen]
        self.assertEqual(names[:3], ["A0", "A1", "A2"])
        self.assertIn("Tank", names)
        self.assertIn("Old", names)
        self.assertNotIn("A5", names)


class ProfileTest(unittest.TestCase):
    def test_season_profile_gives_rating_main_spec_and_highest_timed_key(self) -> None:
        def run(dungeon, level, timed, rating, spec):
            return {"dungeon": {"id": dungeon}, "keystone_level": level, "is_completed_within_time": timed,
                    "mythic_rating": {"rating": rating},
                    "members": [{"character": {"id": 7}, "specialization": {"id": spec}}, {"character": {"id": 8}, "specialization": {"id": 63}}]}
        document = {"character": {"id": 7, "name": "Zefirqt", "realm": {"slug": "bloodhoof"}},
                    "mythic_rating": {"rating": 4256.65},
                    "best_runs": [run(584, 23, True, 530.9, 250), run(585, 24, False, 320.0, 251), run(585, 22, True, 500.0, 250),
                                  run(586, 22, True, 510.0, 251)]}
        rated = parse_season_profile(document)
        self.assertEqual(rated, {"name": "Zefirqt", "realm": "bloodhoof", "score": round(4256.65, 1), "key": 23, "spec": 250})
        self.assertIsNone(parse_season_profile(None))
        self.assertIsNone(parse_season_profile({"character": {"name": "X"}, "mythic_rating": {"rating": 0}}))

    def test_summary_specializations_and_equipment(self) -> None:
        summary = parse_summary({"equipped_item_level": 339, "faction": {"type": "HORDE"}, "active_spec": {"id": 250}})
        self.assertEqual(summary, {"ilvl": 339, "faction": "h", "active_spec": 250})
        specializations = {"specializations": [
            {"specialization": {"id": 252}, "loadouts": [{"is_active": True, "talent_loadout_code": LOADOUT, "selected_hero_talent_tree": {"id": 32, "name": "Rider"}}]},
            {"specialization": {"id": 250}, "loadouts": [
                {"is_active": False, "talent_loadout_code": "short"},
                {"is_active": True, "talent_loadout_code": LOADOUT, "selected_hero_talent_tree": {"id": 31, "name": "San'layn"}}]},
        ]}
        self.assertEqual(parse_specializations(specializations, 250), {"hero": 31, "hero_name": "San'layn", "loadout": LOADOUT})
        self.assertEqual(parse_specializations(specializations, 63), {})
        equipment = {"equipped_items": [
            {"slot": {"type": "TRINKET_1"}, "item": {"id": 1}}, {"slot": {"type": "TRINKET_2"}, "item": {"id": 2}},
            {"slot": {"type": "MAIN_HAND"}, "item": {"id": 3}}, {"slot": {"type": "HEAD"}, "item": {"id": 4}}]}
        self.assertEqual(parse_equipment(equipment), {"trinkets": [1, 2], "weapons": [3]})

    def test_season_label(self) -> None:
        self.assertEqual(season_label("Mythic+ Dungeons (Midnight Season 2)"), "Midnight Season 2")


class FinalListTest(unittest.TestCase):
    def test_final_list_is_overall_top_plus_spec_tops_ordered_by_rating(self) -> None:
        rated = [{"name": f"M{i}", "realm": "r", "score": 3000.0 - i, "spec": 63, "key": 20} for i in range(5)]
        rated.append({"name": "Tank", "realm": "r", "score": 100.0, "spec": 250, "key": 10})
        final = select_final(rated, overall=2, per_spec=1)
        self.assertEqual([item["name"] for item in final], ["M0", "M1", "Tank"])

    def test_spec_summary_shares_and_top_build(self) -> None:
        characters = [
            {"name": "A", "realm": "r", "spec": 250, "score": 3000.0, "hero": 31, "hero_name": "San'layn", "loadout": LOADOUT},
            {"name": "B", "realm": "r", "spec": 250, "score": 2900.0, "hero": 33, "hero_name": "Deathbringer", "loadout": LOADOUT},
            {"name": "C", "realm": "r", "spec": 250, "score": 2800.0, "hero": 31, "hero_name": "San'layn", "loadout": None},
        ]
        equipment = {("r", "a"): {"trinkets": [1, 2], "weapons": [9]}, ("r", "b"): {"trinkets": [1, 3], "weapons": [9]}}
        summary = {spec["id"]: spec for spec in summarize_specs(characters, equipment)}[250]
        self.assertEqual(summary["count"], 3)
        self.assertEqual(summary["hero"][0]["id"], 31)
        self.assertAlmostEqual(summary["hero"][0]["share"], 0.667)
        self.assertEqual(summary["hero"][0]["top"]["name"], "A")
        self.assertEqual(summary["trinkets"][0], {"id": 1, "count": 2, "share": 1.0})
        self.assertEqual(summary["weapons"], [{"id": 9, "count": 2, "share": 1.0}])
        self.assertEqual(len(summarize_specs(characters, equipment)), len(SPECS))


class ValidationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.payload = json.loads((FIXTURES / "mplus-leaderboard-kr.json").read_text(encoding="utf-8"))

    def test_accepts_the_recorded_snapshot(self) -> None:
        self.assertEqual(validate_candidate(self.payload), len(self.payload["characters"]))

    def test_rejects_unsorted_duplicate_or_foreign_rows(self) -> None:
        broken = copy.deepcopy(self.payload)
        broken["characters"][1]["score"] = broken["characters"][0]["score"] + 1
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        broken = copy.deepcopy(self.payload)
        broken["characters"][1] = dict(broken["characters"][0])
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        broken = copy.deepcopy(self.payload)
        broken["characters"][0]["spec"] = 1
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        broken = copy.deepcopy(self.payload)
        broken["characters"][0]["loadout"] = "<script>"
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)

    def test_rejects_a_candidate_that_lost_most_characters(self) -> None:
        with self.assertRaises(DatasetValidationError):
            validate_candidate(self.payload, previous_count=len(self.payload["characters"]) * 3)

    def test_rejects_bad_counts_and_missing_specs(self) -> None:
        broken = copy.deepcopy(self.payload)
        broken["record_count"] += 1
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)
        broken = copy.deepcopy(self.payload)
        broken["specs"] = broken["specs"][1:]
        with self.assertRaises(DatasetValidationError):
            validate_candidate(broken)


if __name__ == "__main__":
    unittest.main()
