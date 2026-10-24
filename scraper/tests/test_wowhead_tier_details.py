from __future__ import annotations

import json
import unittest

from scraper.parsers.wowhead_tier_details import parse_tier_page, tier_page_provenance


class ParseTierPageTest(unittest.TestCase):
    def test_season_requires_evidence_in_page_heading(self) -> None:
        self.assertEqual("midnight-season-2", tier_page_provenance("<title>DPS Rankings — Midnight Season 2 (12.1.5)</title>")["season_id"])
        self.assertEqual("12.1.5", tier_page_provenance("<h1>Midnight Season 2 — 12.1.5</h1>")["game_version"])
        self.assertEqual("", tier_page_provenance("<title>Midnight DPS Rankings</title><p>Season 2 navigation</p>")["season_id"])
        self.assertEqual("", tier_page_provenance("<title>The War Within Season 2</title>")["season_id"])

    def test_extracts_tier_and_guide_link_without_guide_text(self) -> None:
        markup = """
        [tier-list=rows]
        [tier][tier-label bg=q5]S[/tier-label][tier-content]
        [url guide=10][spec-badge=arms-warrior][/url]
        [/tier-content][/tier]
        [tier][tier-label bg=q4]A[/tier-label][tier-content][/tier-content][/tier]
        [/tier-list]
        [h4][color=c1]Arms Warrior[/color][/h4]
        [quote type=box][color=c1]Arms[/color] uses [spell=42].\n\nSecond paragraph.[/quote]
        [center][cta-button guide=10]Arms Warrior Class Guide[/cta-button][/center]
        """
        page_html = f"""
        <html><head><title>Test</title></head><body><script>
        WH.Gatherer.addData(6, 1, {{"42":{{"name_enus":"Sweeping Strikes"}}}});
        WH.Gatherer.addData(100, 1, {{"10":{{"name":"Arms Warrior DPS Guide","url":"https://www.wowhead.com/guide/classes/warrior/arms/overview-pve-dps"}}}});
        WH.markup.printHtml({json.dumps(markup)}, "guide-body", {{}});
        </script></body></html>
        """

        result = parse_tier_page(
            page_html,
            source_url="https://www.wowhead.com/guide/classes/tier-lists/dps-rankings-raids",
            activity="raid",
            role="dps",
        )

        self.assertEqual(1, result["spec_count"])
        self.assertEqual(2, len(result["tiers"]))
        self.assertEqual(0, result["tiers"][1]["spec_count"])
        spec = result["tiers"][0]["specs"][0]
        self.assertEqual("S", spec["tier"])
        self.assertEqual("Arms", spec["spec"])
        self.assertEqual("Warrior", spec["class"])
        self.assertEqual("", spec["description"])
        self.assertEqual([], spec["description_paragraphs"])
        self.assertEqual("", spec["description_markup"])
        self.assertEqual(
            "https://www.wowhead.com/guide/classes/warrior/arms/overview-pve-dps",
            spec["guide_url"],
        )


if __name__ == "__main__":
    unittest.main()
