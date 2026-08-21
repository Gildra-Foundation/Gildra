from __future__ import annotations

import unittest

from scraper.parsers.wowhead_dataset_service import (
    DatasetValidationError,
    validate_candidate,
)


def candidate() -> dict:
    contexts = [
        ("raid", "dps"),
        ("raid", "healer"),
        ("raid", "tank"),
        ("mythic_plus", "dps"),
        ("mythic_plus", "healer"),
        ("mythic_plus", "tank"),
    ]
    pages = []
    unique_specs: set[tuple[str, str]] = set()
    for page_index, (activity, role) in enumerate(contexts):
        specs = []
        group = page_index if page_index < 4 else page_index - 4
        for spec_index in range(10):
            number = group * 10 + spec_index
            class_slug = f"class-{chr(97 + number // 10)}"
            spec_slug = f"spec-{chr(97 + number // 26)}{chr(97 + number % 26)}"
            unique_specs.add((class_slug, spec_slug))
            specs.append(
                {
                    "activity": activity,
                    "role": role,
                    "tier": "S" if spec_index == 0 else "A",
                    "rank_in_tier": 1 if spec_index == 0 else spec_index,
                    "class": class_slug.title(),
                    "class_slug": class_slug,
                    "spec": spec_slug.title(),
                    "spec_slug": spec_slug,
                    "badge_slug": f"{spec_slug}-{class_slug}",
                    "guide_id": page_index * 100 + spec_index + 1,
                    "guide_title": "Test guide",
                    "guide_url": f"https://www.wowhead.com/guide/classes/{class_slug}/{spec_slug}/overview",
                    "source_url": f"https://www.wowhead.com/guide/classes/tier-lists/{role}-rankings-{activity}",
                    "description": "",
                    "description_paragraphs": [],
                    "description_markup": "",
                }
            )
        pages.append(
            {
                "activity": activity,
                "role": role,
                "source_url": specs[0]["source_url"],
                "spec_count": len(specs),
                "tiers": [
                    {"tier": "S", "spec_count": 1, "specs": specs[:1]},
                    {"tier": "A", "spec_count": len(specs) - 1, "specs": specs[1:]},
                ],
            }
        )
    return {
        "schema_version": 1,
        "page_count": len(pages),
        "record_count": 60,
        "unique_spec_count": len(unique_specs),
        "pages": pages,
    }


class ValidateCandidateTest(unittest.TestCase):
    def test_accepts_complete_six_page_candidate(self) -> None:
        self.assertEqual(60, len(validate_candidate(candidate(), previous_record_count=70)))

    def test_rejects_a_partial_context_set(self) -> None:
        payload = candidate()
        payload["pages"].pop()
        payload["page_count"] = 5
        payload["record_count"] = 50
        with self.assertRaisesRegex(DatasetValidationError, "exactly six"):
            validate_candidate(payload)

    def test_rejects_a_large_drop_and_preserves_previous_snapshot(self) -> None:
        with self.assertRaisesRegex(DatasetValidationError, "20 percent"):
            validate_candidate(candidate(), previous_record_count=80)


if __name__ == "__main__":
    unittest.main()
