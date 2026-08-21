from copy import deepcopy
import unittest

from scraper.parsers import icyveins_dataset_service as service


def candidate() -> dict:
    classes = ["warrior", "mage", "druid", "priest", "hunter", "shaman", "rogue", "warlock", "monk", "paladin", "evoker", "death-knight", "demon-hunter"]
    specs = [(classes[index % len(classes)], f"spec-{chr(97 + index // 26)}{chr(97 + index % 26)}") for index in range(40)]
    pages = []
    for page_index, source in enumerate(service.SOURCES):
        count = 20 if source["role"] == "dps" else 7
        records = []
        for rank in range(count):
            class_slug, spec_slug = specs[(page_index * 5 + rank) % len(specs)]
            records.append({
                "activity": source["activity"], "role": source["role"],
                "tier": "S", "rank_in_tier": rank + 1,
                "class_name": class_slug.title(), "class_slug": class_slug,
                "spec_name": spec_slug.title(), "spec_slug": spec_slug,
                "icon_url": "https://static.icy-veins.com/images/wow/spec-icons/example.webp",
                "guide_url": f"https://www.icy-veins.com/wow/{spec_slug}-guide",
                "source_url": f"https://www.icy-veins.com{source['path']}",
                "change_direction": "same", "description": "",
                "description_paragraphs": [],
                "source_updated_at": "2026-08-21T12:00:00Z",
            })
        pages.append({
            "context_key": f"{source['activity']}:{source['role']}",
            "activity": source["activity"], "role": source["role"],
            "source_url": f"https://www.icy-veins.com{source['path']}",
            "source_updated_at": "2026-08-21T12:00:00Z",
            "record_count": len(records), "records": records,
        })
    records = [row for page in pages for row in page["records"]]
    return {
        "schema_version": 1, "pages": pages, "page_count": len(pages),
        "record_count": len(records),
        "unique_spec_count": len({(row["class_slug"], row["spec_slug"]) for row in records}),
    }


class ValidateIcyVeinsCandidateTest(unittest.TestCase):
    def test_accepts_complete_eight_page_snapshot(self) -> None:
        payload = candidate()
        self.assertGreaterEqual(len(service.validate_candidate(payload)), 70)

    def test_rejects_missing_page(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"].pop()
        with self.assertRaisesRegex(service.DatasetValidationError, "eight"):
            service.validate_candidate(payload)

    def test_rejects_large_regression(self) -> None:
        with self.assertRaisesRegex(service.DatasetValidationError, "lost more than"):
            service.validate_candidate(candidate(), previous_record_count=250)


if __name__ == "__main__":
    unittest.main()
