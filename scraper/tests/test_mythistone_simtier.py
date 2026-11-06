import copy
import unittest
from datetime import UTC, datetime
from pathlib import Path

from scraper.parsers.mythistone_simtier import SimTierParseError, build_payload, parse_tierlist_page, slugify
from scraper.parsers.mythistone_simtier_dataset_service import DatasetValidationError, validate_candidate

FIXTURE = Path(__file__).parent / "fixtures" / "mythistone-tierlist.html"


def _payload():
    parsed = parse_tierlist_page(FIXTURE.read_bytes())
    return build_payload(parsed, {"provider": "direct", "credits_spent": "0"}, datetime(2026, 11, 6, tzinfo=UTC))


class ParseMythistoneTierlistTest(unittest.TestCase):
    def test_reads_every_table_of_the_page(self) -> None:
        parsed = parse_tierlist_page(FIXTURE.read_bytes())
        self.assertEqual(("2026-11-04", "1210-01"), (parsed["simmed_on"], parsed["sim_version"]))
        keys = [(table["role"], table["targets"]) for table in parsed["tables"]]
        self.assertEqual(
            [("dps", 1), ("tank", 1), ("dps", 3), ("tank", 3), ("dps", 5), ("tank", 5), ("dps", 8), ("tank", 8)],
            keys,
        )
        dps = parsed["tables"][0]
        self.assertEqual(26, len(dps["entries"]))
        self.assertEqual(27, dps["specs_total"])
        top = dps["entries"][0]
        self.assertEqual(
            {"rank": 1, "tier": "S", "role": "dps", "spec_id": 1480, "class_slug": "demon-hunter",
             "spec_slug": "devourer", "behind_pct": 0.0, "best": 272055},
            {key: top[key] for key in ("rank", "tier", "role", "spec_id", "class_slug", "spec_slug", "behind_pct", "best")},
        )
        self.assertEqual({"popular": 250783, "simcbis": 272055, "top50": 250899}, top["dps"])
        second = dps["entries"][1]
        self.assertEqual(("frost", "death-knight", -4.7), (second["spec_slug"], second["class_slug"], second["behind_pct"]))
        self.assertEqual(6, len(parsed["tables"][1]["entries"]))

    def test_multi_word_names_become_slugs(self) -> None:
        self.assertEqual("beast-mastery", slugify("Beast Mastery"))
        self.assertEqual("death-knight", slugify("Death Knight"))

    def test_rejects_a_changed_row_layout(self) -> None:
        broken = FIXTURE.read_text(encoding="utf-8").replace('class="tier-badge tier-', 'class="badge tier-', 1)
        with self.assertRaises(SimTierParseError):
            parse_tierlist_page(broken)

    def test_rejects_a_page_without_tables(self) -> None:
        with self.assertRaises(SimTierParseError):
            parse_tierlist_page("<html><body>maintenance</body></html>")


class ValidateMythistoneSnapshotTest(unittest.TestCase):
    def test_accepts_the_fixture(self) -> None:
        payload = _payload()
        self.assertEqual(payload["record_count"], validate_candidate(payload))
        self.assertEqual(4 * (26 + 6), payload["record_count"])

    def test_rejects_a_missing_target_count(self) -> None:
        payload = _payload()
        payload["tables"] = [table for table in payload["tables"] if table["targets"] != 8]
        payload["record_count"] = sum(len(table["entries"]) for table in payload["tables"])
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload)

    def test_rejects_a_gap_that_disagrees_with_the_numbers(self) -> None:
        payload = copy.deepcopy(_payload())
        payload["tables"][0]["entries"][1]["behind_pct"] = -20.0
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload)

    def test_rejects_a_shrunken_candidate(self) -> None:
        payload = _payload()
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload, previous_record_count=payload["record_count"] * 2)

    def test_rejects_absurd_damage(self) -> None:
        payload = copy.deepcopy(_payload())
        entry = payload["tables"][0]["entries"][3]
        entry["dps"]["popular"] = 10
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload)


if __name__ == "__main__":
    unittest.main()
