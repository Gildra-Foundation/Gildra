import unittest

from scraper.parsers.mythicstats_tierlist import parse_performance_page, parse_spec_tier_page


class ParseMythicStatsTest(unittest.TestCase):
    def test_extracts_exact_performance_metrics_and_roles(self) -> None:
        html = """
        <h1>Top DPS logs in Mythic+ 11-17 keys.</h1>
        <p class="mt-4 text-lg">Period 1077 (week 1)</p>
        <select name="period"><option value="1077" selected>1077 (week 1)</option></select>
        <div class="text-left text-sm text-gray-500 mb-2 mt-4">Damage specs</div>
        <div class="grid grid-cols-6 gap-px w-56">
          <div>1</div><div>↑2</div><div>S</div>
          <div title="175983 average dps. 100% of max average dps">176K</div>
          <div title="235073 top dps. 100% of max top dps">235K</div>
          <div title="11 - 17">1.9K</div>
        </div>
        <a class="flex" href="https://mythicstats.com/spec/assassination-rogue">
          <img src="https://assets.laravel.cloud/spec/assassination-rogue.jpg" alt="assassination rogue">
        </a>
        """
        page = parse_performance_page(html)
        self.assertEqual("1077", page["source_period_id"])
        self.assertEqual("11-17", page["key_range"])
        self.assertEqual(1, page["record_count"])
        row = page["records"][0]
        self.assertEqual("dps", row["role"])
        self.assertEqual(2, row["rank_change"])
        self.assertEqual(175983, row["average_value"])
        self.assertEqual(235073, row["top_value"])
        self.assertEqual(1900, row["runs_estimate"])
        self.assertEqual("rogue", row["class_slug"])
        self.assertEqual("assassination", row["spec_slug"])

    def test_extracts_all_spec_tier_fields(self) -> None:
        html = """
        <h1>Mythic+ Spec tier list</h1>
        <p class="mt-4 text-lg">Best specs for Mythic+</p>
        <h2 class="pb-3">Melee tier list</h2>
        <a href="https://mythicstats.com/spec/unholy-death-knight" title="unholy death-knight A-tier">
          <img src="https://assets.laravel.cloud/spec/unholy-death-knight.jpg" alt="unholy death-knight A-tier">
        </a>
        """
        page = parse_spec_tier_page(html)
        self.assertEqual(1, page["record_count"])
        row = page["records"][0]
        self.assertEqual("melee", row["category"])
        self.assertEqual("A", row["tier"])
        self.assertEqual("death-knight", row["class_slug"])
        self.assertEqual("unholy", row["spec_slug"])


if __name__ == "__main__":
    unittest.main()
