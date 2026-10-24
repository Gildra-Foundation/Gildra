import copy
import unittest

from scraper.parsers.mythicstats_meta import parse_meta_page, parse_period_header
from scraper.parsers.mythicstats_meta_dataset_service import DatasetValidationError, validate_candidate

DPS = [("death-knight", "frost")] + [("rogue", f"spec{chr(97 + i)}") for i in range(19)] + [("mage", "arcane")]
TANKS = [("death-knight", "blood"), ("druid", "guardian"), ("monk", "brewmaster"), ("paladin", "protection"), ("warrior", "protection")]
HEALERS = [("paladin", "holy"), ("priest", "holy"), ("priest", "discipline"), ("shaman", "restoration"), ("druid", "restoration"), ("monk", "mistweaver")]


def _cells(specs, value):
    return "".join(
        f'<div class="bg-{cls} box-shadow flex items-center " style="width: 1%" title="{value}% {spec}">'
        f'<span class="py-1.5 px-2">{spec[:4]} {round(value)}%</span></div>'
        for cls, spec in specs
    )


def _row(period, week, key="20.6"):
    return (
        f'<a class="grid grid-cols-6 gap-2 mt-px overflow-hidden capitalize" href="https://mythicstats.com/period/{period}">'
        f'<div class="flex overflow-hidden col-span-3">{_cells(DPS, 7.5)}</div>'
        f'<div class="flex overflow-hidden">{_cells(TANKS, 29.9)}</div>'
        f'<div class="flex overflow-hidden">{_cells(HEALERS, 59)}</div>'
        '<div class="grid grid-cols-6 gap-px">'
        f'<div class="bg-gray-800/50 text-white/70 flex justify-center items-center">{week}</div>'
        f'<div class="flex justify-center items-center py-1.5 px-2" style="background-color: rgb(191,144,50)">{key}</div>'
        '<div class="flex">0.71</div><div class="flex">0.73</div><div class="flex">0.60</div><div class="flex">0.67</div>'
        '</div></a>'
    )


def _page():
    return (
        "<h1>Weekly spec diversity in top 2000 Mythic+ keys</h1>"
        '<div><a class="text-gray-300 uppercase" href="https://mythicstats.com/season/mid2">mid2</a> DPS specs</div>'
        + _row(1086, 10) + _row(1085, 9, "21.4")
        + '<div><a class="text-gray-300 uppercase" href="https://mythicstats.com/season/mid1">mid1</a> DPS specs</div>'
        + _row(1075, 20, "22.6")
        + '<a href="https://mythicstats.com/period/1086">Periods</a>'
    )


def _payload():
    parsed = parse_meta_page(_page())
    weeks = [week for season in parsed["seasons"] for week in season["weeks"]]
    return {
        "schema_version": 1,
        "seasons": parsed["seasons"],
        "current_period": None,
        "week_count": len(weeks),
        "record_count": sum(len(week["specs"]) for week in weeks),
    }


class ParseMythicstatsMetaTest(unittest.TestCase):
    def test_extracts_weeks_specs_and_gini_by_season(self) -> None:
        result = parse_meta_page(_page())
        self.assertEqual(["mid2", "mid1"], [season["slug"] for season in result["seasons"]])
        latest = result["seasons"][0]["weeks"][0]
        self.assertEqual((1086, 10, 20.6), (latest["period_id"], latest["week"], latest["average_key"]))
        self.assertEqual({"all": 0.71, "dps": 0.73, "tank": 0.6, "healer": 0.67}, latest["gini"])
        self.assertEqual(len(DPS) + len(TANKS) + len(HEALERS), len(latest["specs"]))
        blood = next(spec for spec in latest["specs"] if spec["spec_slug"] == "blood")
        self.assertEqual({"role": "tank", "class_slug": "death-knight", "spec_slug": "blood", "presence": 29.9}, blood)
        self.assertEqual(9, result["seasons"][0]["weeks"][1]["week"])

    def test_rejects_a_row_with_a_changed_layout(self) -> None:
        broken = _page().replace('<div class="flex">0.67</div>', "", 1)
        with self.assertRaises(ValueError):
            parse_meta_page(broken)

    def test_reads_period_affixes_and_sample(self) -> None:
        html = (
            '<h1><span>Period 1086, week 10 of </span><a href="https://mythicstats.com/season/mid2">MID2</a> '
            "(Lindormi&#039;s Guidance, Xal&#039;atath&#039;s Bargain: Voidbound, Tyrannical)</h1>"
            "<p>Top 2000 keys, 10000 characters (4319 unique), 20.6 average key level</p>"
        )
        result = parse_period_header(html, 1086)
        self.assertEqual(["Lindormi's Guidance", "Xal'atath's Bargain: Voidbound", "Tyrannical"], result["affixes"])
        self.assertEqual((2000, 10000, 4319, "mid2"), (result["keys"], result["characters"], result["unique_characters"], result["season"]))
        with self.assertRaises(ValueError):
            parse_period_header(html, 1085)


class ValidateMythicstatsMetaTest(unittest.TestCase):
    def test_accepts_a_complete_candidate(self) -> None:
        payload = _payload()
        self.assertEqual(payload["record_count"], validate_candidate(payload))

    def test_rejects_missing_role_rows_and_bad_counts(self) -> None:
        payload = _payload()
        week = payload["seasons"][0]["weeks"][0]
        week["specs"] = [spec for spec in week["specs"] if spec["role"] != "healer"]
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload)
        payload = _payload()
        payload["record_count"] += 1
        with self.assertRaises(DatasetValidationError):
            validate_candidate(payload)

    def test_rejects_out_of_range_numbers_and_foreign_urls(self) -> None:
        for mutate in (
            lambda week: week["gini"].update(all=1.4),
            lambda week: week.update(average_key=0),
            lambda week: week["specs"][0].update(presence=140),
            lambda week: week.update(source_url="https://example.com/period/1"),
        ):
            payload = copy.deepcopy(_payload())
            mutate(payload["seasons"][0]["weeks"][0])
            with self.assertRaises(DatasetValidationError):
                validate_candidate(payload)

    def test_rejects_a_candidate_that_lost_most_weeks(self) -> None:
        with self.assertRaises(DatasetValidationError):
            validate_candidate(_payload(), previous_week_count=30)


if __name__ == "__main__":
    unittest.main()
