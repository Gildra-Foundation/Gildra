from copy import deepcopy
import unittest

from scraper.parsers import archon_dataset_service as service


def candidate() -> dict:
    pages = []
    classes = [
        ("warrior", "Warrior"), ("mage", "Mage"), ("druid", "Druid"),
        ("priest", "Priest"), ("hunter", "Hunter"), ("shaman", "Shaman"),
        ("rogue", "Rogue"), ("warlock", "Warlock"), ("monk", "Monk"),
        ("paladin", "Paladin"), ("evoker", "Evoker"),
        ("death-knight", "Death Knight"), ("demon-hunter", "Demon Hunter"),
    ]
    for source in service.SOURCES:
        count = 30 if source["role"] == "dps" else 5
        records = []
        for index in range(count):
            class_slug, class_name = classes[index % len(classes)]
            suffix = f"{chr(97 + index // 26)}{chr(97 + index % 26)}"
            spec_slug = f"{source['role']}-spec-{suffix}"
            records.append({
                **{key: source[key] for key in ("activity", "difficulty", "role")},
                "rank": index + 1, "tier": "S", "tier_assignments": {"score": {"tier": "S", "rank": index + 1}},
                "spec_id": index + 1, "class_name": class_name, "class_slug": class_slug,
                "spec_name": f"Spec {index + 1}", "spec_slug": spec_slug,
                "icon_slug": f"{class_name}-Spec", "build_url": f"https://www.archon.gg/wow/builds/{spec_slug}/{class_slug}/raid/overview/heroic/all-bosses",
                "source_url": source["url"], "score": 2500, "dps": 100000,
                "hps": None, "survivability": 95, "popularity": 0.1,
                "parses": 100, "max_key": 12,
            })
        pages.append({**source, "source_updated_at": "2026-08-21T12:00:00Z", "records": records})
    records = [record for page in pages for record in page["records"]]
    return {
        "schema_version": 1, "pages": pages, "page_count": 12,
        "record_count": len(records),
        "unique_spec_count": len({(row["class_slug"], row["spec_slug"]) for row in records}),
    }


class ValidateArchonCandidateTest(unittest.TestCase):
    def test_accepts_complete_twelve_slice_snapshot(self) -> None:
        self.assertEqual(160, len(service.validate_candidate(candidate())))

    def test_rejects_missing_slice(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"].pop()
        payload["page_count"] = 11
        with self.assertRaisesRegex(service.DatasetValidationError, "twelve pages"):
            service.validate_candidate(payload)

    def test_rejects_large_regression(self) -> None:
        with self.assertRaisesRegex(service.DatasetValidationError, "lost more than"):
            service.validate_candidate(candidate(), previous_record_count=300)
