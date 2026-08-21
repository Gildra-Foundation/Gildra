import unittest

from scraper.parsers.wowgg_tierlist import (
    _assign_tiers,
    _numeric,
    _pve_rows,
    _pvp_rows,
    build_context_plan,
)


class WowGGTierlistTest(unittest.TestCase):
    def test_normalizes_pve_metrics_and_assigns_all_tiers(self) -> None:
        payload = [
            {
                "class_name": "Маг", "class_name_en": "Mage",
                "spec": "Тайная магия", "spec_en": "Arcane", "meta": 3000,
                "average_dps": 200000, "top_dps": 300000, "max_key": 17,
            },
            {
                "class_name": "Воин", "class_name_en": "Warrior",
                "spec": "Оружие", "spec_en": "Arms", "meta": 2000,
                "average_dps": 150000, "top_dps": 220000, "max_key": 14,
            },
        ]
        rows = _pve_rows(payload, "dps", "https://wow.gg/ru/meta/mythic-plus/dps")
        _assign_tiers(rows, {"score": "meta_score", "avgDps": "average_dps"})
        self.assertEqual("mage-arcane", rows[0]["entity_slug"])
        self.assertEqual("S", rows[0]["tier_assignments"]["score"]["tier"])
        self.assertEqual("A", rows[1]["tier_assignments"]["avgDps"]["tier"])

    def test_normalizes_pvp_and_compact_numbers(self) -> None:
        rows = _pvp_rows(
            {"specs": [{
                "class_name": "Разбойник", "class_name_en": "Rogue",
                "spec": "Ликвидация", "spec_en": "Assassination",
                "all_players": 9, "avg_rating": 2048, "max_rating": 2201,
            }]},
            "dps", "https://wow.gg/ru/meta/pvp/dps",
        )
        self.assertEqual(9, rows[0]["pvp_players"])
        self.assertEqual(169000, _numeric("169.0k"))

    def test_plan_contains_every_filter_family(self) -> None:
        catalogs = {
            "11": {
                "encounters": [{"wow_id": 10, "name": "Dungeon"}],
                "raids": [{"wow_id": 20, "name": "Raid", "raid_bosses": [{"wow_id": 21, "name": "Boss"}]}],
            },
            "1007": {"encounters": [], "raids": [{"wow_id": 30, "name": "Classic Raid", "raid_bosses": []}]},
            "1050": {"encounters": [], "raids": []},
            "1053": {"encounters": [], "raids": []},
        }
        plan = build_context_plan(catalogs)
        self.assertTrue(any(item["mode"] == "mythic_plus" and item["key_type"] == "low" for item in plan))
        self.assertTrue(any(item["selection_type"] == "boss" for item in plan))
        self.assertTrue(any(item["raid_difficulty"] == "raid_h25" for item in plan))
        self.assertTrue(any(item["mode"] == "pvp" and item["pvp_region"] == "kr" for item in plan))


if __name__ == "__main__":
    unittest.main()
