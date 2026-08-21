from copy import deepcopy
import unittest

from scraper.parsers import wowgg_dataset_service as service


def candidate() -> dict:
    key_types = ["all", "high", "middle", "low"]
    difficulties = ["raid_myth", "raid_hero", "raid_normal", "raid_n10", "raid_n25", "raid_h10", "raid_h25"]
    brackets = ["2v2", "3v3", "5v5", "rbg", "shuffle", "blitz"]
    regions = ["all", "eu", "us", "kr", "tw"]
    families = [
        (mode, role)
        for mode in ("mythic_plus", "raid", "pvp")
        for role in ("dps", "healer", "tank")
    ] + [("mythic_plus", "dungeon_ease")]
    pages = []
    for index in range(180):
        cycle = index // len(families)
        mode, role = families[index % len(families)]
        selection_id = str(10_000 + index)
        selection_type = "dungeon" if mode == "mythic_plus" else "raid" if mode == "raid" else "bracket"
        if index == 0:
            mode, role, selection_id, selection_type = "mythic_plus", "dps", "all", "all"
        elif index == 1:
            mode, role, selection_id, selection_type = "raid", "dps", "53", "raid"
        elif index == 2:
            mode, role, selection_id, selection_type = "pvp", "dps", "2v2", "bracket"
        context_key = f"{mode}|{role}|{index}"
        rows = []
        for row_index in range(3):
            spec_index = (index * 3 + row_index) % 40
            class_slug = ["warrior", "mage", "druid", "priest", "hunter"][spec_index % 5]
            spec_slug = f"spec-{spec_index:02d}"
            rows.append({
                "entity_type": "specialization", "entity_slug": f"{class_slug}-{spec_slug}",
                "class_slug": class_slug, "spec_slug": spec_slug, "rank": row_index + 1,
                "tier": "S", "tier_assignments": {"score": {"tier": "S", "rank": row_index + 1}},
                "source_url": f"https://wow.gg/ru/meta/{'mythic-plus' if mode == 'mythic_plus' else mode}/dps",
                "guide_url": f"https://wow.gg/ru/guides/{class_slug}-{spec_slug}",
            })
        pages.append({
            "context_key": context_key, "mode": mode, "role": role,
            "selection_id": selection_id, "selection_type": selection_type,
            "key_type": key_types[cycle % len(key_types)] if mode == "mythic_plus" else "",
            "raid_difficulty": difficulties[cycle % len(difficulties)] if mode == "raid" else "",
            "pvp_bracket": brackets[cycle % len(brackets)] if mode == "pvp" else "",
            "pvp_region": regions[cycle % len(regions)] if mode == "pvp" else "",
            "source_url": f"https://wow.gg/ru/meta/{'mythic-plus' if mode == 'mythic_plus' else mode}/dps",
            "source_updated_at": "2026-08-21T12:00:00Z", "record_count": len(rows),
            "records": rows,
        })
    records = [row for page in pages for row in page["records"]]
    return {
        "schema_version": 1, "pages": pages, "page_count": len(pages),
        "record_count": len(records),
        "unique_spec_count": len({(row["class_slug"], row["spec_slug"]) for row in records}),
    }


class ValidateWowGGCandidateTest(unittest.TestCase):
    def test_accepts_complete_filter_map(self) -> None:
        self.assertEqual(540, len(service.validate_candidate(candidate())))

    def test_rejects_partial_filter_map(self) -> None:
        payload = deepcopy(candidate())
        payload["pages"] = payload["pages"][:100]
        payload["page_count"] = 100
        payload["record_count"] = 300
        with self.assertRaisesRegex(service.DatasetValidationError, "context count"):
            service.validate_candidate(payload)

    def test_rejects_large_regression(self) -> None:
        with self.assertRaisesRegex(service.DatasetValidationError, "lost more than"):
            service.validate_candidate(candidate(), previous_record_count=1_000)


if __name__ == "__main__":
    unittest.main()
