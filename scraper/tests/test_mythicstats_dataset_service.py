from copy import deepcopy
import unittest

from scraper.parsers import mythicstats_dataset_service as service


def candidate() -> dict:
    classes = [
        "warrior", "mage", "druid", "priest", "hunter", "shaman", "rogue",
        "warlock", "monk", "paladin", "evoker", "death-knight", "demon-hunter",
    ]
    specs = [
        (classes[index % len(classes)], f"spec-{chr(97 + index // 26)}{chr(97 + index % 26)}")
        for index in range(40)
    ]
    performance = []
    role_counts = (("dps", 27), ("tank", 6), ("healer", 7))
    cursor = 0
    for role, count in role_counts:
        for rank in range(1, count + 1):
            class_slug, spec_slug = specs[cursor]
            cursor += 1
            performance.append({
                "role": role, "rank": rank, "rank_change": 0, "tier": "S",
                "average_value": 100_000 - rank, "top_value": 120_000 - rank,
                "runs_label": "1.2K", "runs_estimate": 1200, "key_range": "11 - 17",
                "class_name": class_slug.title(), "class_slug": class_slug,
                "spec_name": spec_slug.title(), "spec_slug": spec_slug,
                "icon_url": f"https://assets.laravel.cloud/spec/{spec_slug}-{class_slug}.jpg",
                "spec_url": f"https://mythicstats.com/spec/{spec_slug}-{class_slug}",
                "source_url": "https://mythicstats.com/dps",
            })

    spec_tiers = []
    category_counts = (("melee", 13), ("ranged", 14), ("tank", 6), ("healer", 7))
    cursor = 0
    for category, count in category_counts:
        for rank in range(1, count + 1):
            class_slug, spec_slug = specs[cursor]
            cursor += 1
            spec_tiers.append({
                "category": category, "tier": "S", "rank_in_tier": rank,
                "class_name": class_slug.title(), "class_slug": class_slug,
                "spec_name": spec_slug.title(), "spec_slug": spec_slug,
                "icon_url": f"https://assets.laravel.cloud/spec/{spec_slug}-{class_slug}.jpg",
                "spec_url": f"https://mythicstats.com/spec/{spec_slug}-{class_slug}",
                "source_url": "https://mythicstats.com/spec",
            })

    pages = [
        {
            "context_key": "performance", "page_type": "performance",
            "title": "Top DPS logs in Mythic+ 11-17 keys.", "subtitle": "Period 1077",
            "source_url": "https://mythicstats.com/dps", "source_period_id": "1077",
            "source_period_name": "1077 (week 1)", "key_range": "11-17",
            "record_count": len(performance), "records": performance,
        },
        {
            "context_key": "spec_tiers", "page_type": "spec_tiers",
            "title": "Mythic+ Spec tier list", "subtitle": "Best specs for Mythic+",
            "source_url": "https://mythicstats.com/spec", "source_period_id": "",
            "source_period_name": "", "key_range": "",
            "record_count": len(spec_tiers), "records": spec_tiers,
        },
    ]
    return {
        "schema_version": 1,
        "pages": pages,
        "page_count": 2,
        "record_count": len(performance) + len(spec_tiers),
        "unique_spec_count": 40,
    }


class ValidateMythicStatsCandidateTest(unittest.TestCase):
    def test_accepts_complete_two_page_snapshot(self) -> None:
        self.assertEqual(80, len(service.validate_candidate(candidate())))

    def test_rejects_missing_page(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"].pop()
        with self.assertRaisesRegex(service.DatasetValidationError, "two"):
            service.validate_candidate(payload)

    def test_rejects_disagreeing_spec_coverage(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"][1]["records"][0]["spec_slug"] = "different"
        payload["unique_spec_count"] = 41
        with self.assertRaisesRegex(service.DatasetValidationError, "disagree"):
            service.validate_candidate(payload)

    def test_rejects_large_regression(self) -> None:
        with self.assertRaisesRegex(service.DatasetValidationError, "lost more than"):
            service.validate_candidate(candidate(), previous_record_count=120)


if __name__ == "__main__":
    unittest.main()
