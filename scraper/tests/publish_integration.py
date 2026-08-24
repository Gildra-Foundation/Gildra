"""Opt-in integration check for atomic dataset publication against PostgreSQL."""

from __future__ import annotations

import os
from datetime import UTC, date, datetime

import psycopg

from scraper.parsers import wowhead_dataset_service as service
from scraper.tests.test_wowhead_dataset_service import candidate


def main() -> int:
    payload = candidate()
    payload.update(
        {
            "source_index": "https://www.wowhead.com/guides/classes/tier-lists",
            "fetched_at": datetime.now(UTC).isoformat(),
            "credits_spent": 0,
        }
    )
    service.collect_tierlist_dataset = lambda: payload
    succeeded = service.refresh_tierlist(date(2026, 8, 21), trigger="seed")
    if succeeded.status != "succeeded" or not succeeded.snapshot_id:
        raise AssertionError(f"unexpected successful result: {succeeded}")

    broken = candidate()
    broken["pages"].pop()
    broken["page_count"] = 5
    broken["record_count"] = 50
    broken["fetched_at"] = datetime.now(UTC).isoformat()
    broken["credits_spent"] = 0
    service.collect_tierlist_dataset = lambda: broken
    try:
        service.refresh_tierlist(date(2026, 8, 22), trigger="scheduled")
    except service.DatasetValidationError:
        pass
    else:
        raise AssertionError("invalid candidate was unexpectedly published")

    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT current_snapshot_id::text, last_error_code
                FROM datasets WHERE slug = 'tierlist-wowhead'
                """
            )
            current_snapshot_id, error_code = cursor.fetchone()
            cursor.execute(
                """
                SELECT status, lkg_snapshot_id::text
                FROM dataset_runs
                WHERE run_key = 'daily:2026-08-22'
                """
            )
            failed_status, lkg_snapshot_id = cursor.fetchone()
    if current_snapshot_id != succeeded.snapshot_id:
        raise AssertionError("failed refresh replaced the last-known-good snapshot")
    if failed_status != "failed" or lkg_snapshot_id != succeeded.snapshot_id:
        raise AssertionError("failed run did not retain its last-known-good pointer")
    if error_code != "validation_failed":
        raise AssertionError(f"unexpected dataset error code: {error_code}")
    print(
        f"atomic publication verified snapshot={current_snapshot_id} "
        f"failed_run_lkg={lkg_snapshot_id}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
