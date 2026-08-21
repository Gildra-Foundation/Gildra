from __future__ import annotations

import io
import json
import logging
import unittest

from scraper.parsers.observability import JSONFormatter, event, log_context, safe_error, safe_url


class ObservabilityTest(unittest.TestCase):
    def test_safe_url_drops_credentials_query_and_fragment(self) -> None:
        self.assertEqual(
            "https://example.com/path",
            safe_url("https://user:password@example.com/path?token=secret#fragment"),
        )

    def test_error_text_redacts_common_credentials(self) -> None:
        value = safe_error(
            "request https://example.com/path?api_key=topsecret failed with Bearer abc.def"
        )
        self.assertNotIn("topsecret", value)
        self.assertNotIn("abc.def", value)
        self.assertIn("[REDACTED]", value)

    def test_json_event_includes_context_without_secrets(self) -> None:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(JSONFormatter())
        logger = logging.getLogger("observability-test")
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(logging.INFO)

        with log_context(dataset="tierlist-wowhead", token="never-log-this"):
            event(logger, "fetch_completed", provider="scrape.do", status=200)

        payload = json.loads(stream.getvalue())
        self.assertEqual("fetch_completed", payload["event"])
        self.assertEqual("tierlist-wowhead", payload["dataset"])
        self.assertEqual("[REDACTED]", payload["token"])
        self.assertEqual(200, payload["status"])

    def test_empty_optional_field_stays_empty(self) -> None:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(JSONFormatter())
        logger = logging.getLogger("observability-empty-test")
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(logging.INFO)

        event(logger, "refresh_succeeded", error_code="")

        self.assertEqual("", json.loads(stream.getvalue())["error_code"])


if __name__ == "__main__":
    unittest.main()
