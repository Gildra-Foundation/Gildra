import unittest

from scraper.parsers.icyveins_tierlist import parse_icyveins_page


class ParseIcyVeinsPageTest(unittest.TestCase):
    def test_extracts_tier_icon_and_guide_link_without_guide_text(self) -> None:
        html = """
        <h1 class="content-header__title">Mythic+ Healer Rankings</h1>
        <span class="content-header__updated-date">Aug 16, 2026 - 1:48 PM</span>
        <span class="content-header__author-name">Petko</span>
        <table class="tier-list"><tr><th></th><th></th></tr><tr><td>S+</td><td>
          <span class="tier-list-entry" data-change="up"><details><summary>
            <img src="//static.icy-veins.com/images/wow/spec-icons/round-without-border/paladin/holy.webp" alt="Holy Paladin">
            <span class="details_block__summary-title-wrapper">Holy Paladin</span>
          </summary><div class="details-block__content">
            <p>Strong priority healing and utility.</p><p>Excellent group support.</p>
            <a href="//www.icy-veins.com/wow/holy-paladin-pve-healing-guide">Holy Paladin Guide</a>
          </div></details></span>
        </td></tr></table>
        """
        result = parse_icyveins_page(html, {
            "activity": "mythic_plus", "role": "healer", "path": "/wow/mythic-healer-tier-list",
        })
        self.assertEqual("Mythic+ Healer Rankings", result["title"])
        self.assertEqual("Petko", result["author_name"])
        self.assertEqual(1, result["record_count"])
        row = result["records"][0]
        self.assertEqual("S+", row["tier"])
        self.assertEqual("up", row["change_direction"])
        self.assertEqual("paladin", row["class_slug"])
        self.assertEqual("holy", row["spec_slug"])
        self.assertEqual("", row["description"])
        self.assertEqual([], row["description_paragraphs"])
        self.assertEqual("https://www.icy-veins.com/wow/holy-paladin-pve-healing-guide", row["guide_url"])


if __name__ == "__main__":
    unittest.main()
