from __future__ import annotations

import copy
import unittest
from unittest.mock import patch

from scraper.parsers.wowhead_tier_details import collect_tierlist_dataset
from scraper.tests.test_wowhead_dataset_service import candidate


class RatingIsolationTest(unittest.TestCase):
    def collect(self, previous, *, wrong_season=False):
        pages = candidate()["pages"]
        links = [{"activity": p["activity"], "role": p["role"], "url": p["source_url"]} for p in pages]
        failed_url = links[1]["url"]

        def fetch(url, contract):
            if url == failed_url and not wrong_season:
                raise TimeoutError("source unavailable")
            return url, {"credits_spent": 0}

        def parse(body, *, source_url, activity, role):
            page = copy.deepcopy(next(p for p in pages if p["activity"] == activity and p["role"] == role))
            if source_url == failed_url and wrong_season:
                page["season_id"] = "midnight-season-1"
            return page

        with patch("scraper.parsers.wowhead_tier_lists.extract_tier_list_links", return_value=links), patch("scraper.parsers.wowhead_tier_details.fetch_with_fallback", side_effect=fetch), patch("scraper.parsers.wowhead_tier_details.parse_tier_page", side_effect=parse):
            return collect_tierlist_dataset(previous)

    def test_one_failed_rating_keeps_its_original_date_and_refreshes_other_five(self):
        previous = candidate()
        result = self.collect(previous)
        self.assertEqual(6, result["page_count"])
        self.assertEqual(previous["pages"][1]["fetched_at"], result["pages"][1]["fetched_at"])
        self.assertTrue(result["pages"][1]["retained_after_failure"])
        self.assertNotEqual(previous["pages"][0]["fetched_at"], result["pages"][0]["fetched_at"])
        self.assertNotIn("retained_after_failure", previous["pages"][1])

    def test_wrong_season_response_uses_same_season_last_verified_rating(self):
        result = self.collect(candidate(), wrong_season=True)
        self.assertEqual("midnight-season-2", result["pages"][1]["season_id"])
        self.assertTrue(result["pages"][1]["retained_after_failure"])

    def test_previous_season_and_undated_ratings_are_never_used_as_fallback(self):
        for key, value in [("season_id", "midnight-season-1"), ("fetched_at", "")]:
            previous = candidate()
            previous["pages"][1][key] = value
            with self.subTest(key=key), self.assertRaises(TimeoutError):
                self.collect(previous)
