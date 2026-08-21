"""Opt-in integration proof for atomic Tierlist — Icy Veins publication."""

from __future__ import annotations

import os
from datetime import UTC, date, datetime

import psycopg

from scraper.parsers import icyveins_dataset_service as service
from scraper.tests.test_icyveins_dataset_service import candidate


def main() -> int:
    payload = candidate()
    payload.update({"fetched_at": datetime.now(UTC).isoformat(), "credits_spent": 0})
    for page in payload["pages"]:
        page.update({"title": "Icy Veins Tier List", "author_name": "Icy Veins"})
    service.collect_icyveins_dataset = lambda: payload
    succeeded = service.refresh_tierlist_icyveins(date(2026, 8, 21), trigger="seed")
    if succeeded.status != "succeeded" or not succeeded.snapshot_id:
        raise AssertionError(f"unexpected successful result: {succeeded}")

    broken = candidate()
    broken["pages"].pop()
    broken.update({"fetched_at": datetime.now(UTC).isoformat(), "credits_spent": 0})
    service.collect_icyveins_dataset = lambda: broken
    try:
        service.refresh_tierlist_icyveins(date(2026, 8, 22), trigger="scheduled")
    except service.DatasetValidationError:
        pass
    else:
        raise AssertionError("invalid Icy Veins candidate was unexpectedly published")

    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_snapshot_id::text, last_error_code FROM datasets WHERE slug = 'tierlist-icyveins'")
            current_snapshot_id, error_code = cursor.fetchone()
            cursor.execute("""
                SELECT status, lkg_snapshot_id::text FROM dataset_runs r
                JOIN datasets d ON d.id = r.dataset_id
                WHERE d.slug = 'tierlist-icyveins' AND r.run_key = 'daily:2026-08-22'
            """)
            failed_status, lkg_snapshot_id = cursor.fetchone()
    if current_snapshot_id != succeeded.snapshot_id or lkg_snapshot_id != succeeded.snapshot_id:
        raise AssertionError("failed refresh replaced the Icy Veins last-known-good snapshot")
    if failed_status != "failed" or error_code != "validation_failed":
        raise AssertionError("failed Icy Veins run was not recorded correctly")
    print(f"Icy Veins atomic publication verified snapshot={current_snapshot_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
