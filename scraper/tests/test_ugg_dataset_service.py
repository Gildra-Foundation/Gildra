from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
import unittest

from scraper.parsers import ugg_dataset_service as service
from scraper.parsers.ugg_tierlist import CONTEXTS, parse_ugg_tierlist

FIXTURES = Path(__file__).parent / "fixtures"


def candidate() -> dict:
    pages = []
    for activity, difficulty, game_mode, _, _ in CONTEXTS:
        name = "ugg-v37-all-mythic.json" if game_mode == "mythic" else "ugg-v37-heroic-raid.json"
        pages.extend(parse_ugg_tierlist(
            (FIXTURES / name).read_bytes(), activity=activity, difficulty=difficulty,
            game_mode=game_mode, data_source_url="https://stats2.u.gg/x",
            now=datetime(2026, 10, 24, 12, tzinfo=UTC),
        ))
    records = [record for page in pages for record in page["records"]]
    return {
        "schema_version": 1, "pages": pages, "page_count": len(pages),
        "record_count": len(records),
        "unique_spec_count": len({(row["class_slug"], row["spec_slug"]) for row in records}),
    }


class ValidateUggCandidateTest(unittest.TestCase):
    def test_accepts_all_fifteen_slices(self) -> None:
        self.assertEqual(200, len(service.validate_candidate(candidate())))

    def test_rejects_missing_slice(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"].pop()
        with self.assertRaisesRegex(service.DatasetValidationError, "exactly 15 pages"):
            service.validate_candidate(payload)

    def test_rejects_large_regression(self) -> None:
        with self.assertRaisesRegex(service.DatasetValidationError, "lost more than"):
            service.validate_candidate(candidate(), previous_record_count=400)

    def test_rejects_foreign_source_url(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"][0]["records"][0]["source_url"] = "https://example.com/wow/tier-list/x"
        with self.assertRaisesRegex(service.DatasetValidationError, "invalid source URL"):
            service.validate_candidate(payload)


if __name__ == "__main__":
    unittest.main()
