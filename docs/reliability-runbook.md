# Gildra API and dataset reliability runbook

## User journey and invariants

The critical data path is:

1. River schedules a dataset refresh.
2. The private scraper worker collects every expected source slice.
3. The candidate is validated against structural bounds and the previous snapshot.
4. PostgreSQL publishes the candidate and changes `datasets.current_snapshot_id` in one transaction.
5. The API panel reads only `current_snapshot_id`.

The primary invariant is that a failed collection, validation, or database write must never replace the last-known-good snapshot. A refresh is successful only after all expected pages and records have been committed.

## Structured log events

API and scraper logs are line-delimited JSON on stdout. Secrets, cookies, authorization headers, API keys, URL query strings, and passwords must never be logged.

Common API fields:

- `event`, `request_id`, `method`, `route`, `status`
- `duration_ms`, `response_bytes`, `service`

Common scraper fields:

- `event`, `request_id`, `run_id`, `dataset`, `trigger`, `scheduled_for`
- `stage` (`collect`, `validate`, `publish`), `duration_ms`
- `provider`, `strategy`, `attempt`, `target_status`, `body_bytes`
- `record_count`, `unique_spec_count`, `snapshot_id`, `lkg_preserved`
- `error_type`, `error_code`, `error_summary`

Useful commands:

```bash
sudo docker logs --since 24h gildra-scraper-worker-1 2>&1 \
  | jq -c 'select(.event != null) | {timestamp,event,dataset,run_id,stage,status,duration_ms,error_code,error_summary}'

sudo docker logs --since 1h gildra-api-1 2>&1 \
  | jq -c 'select(.event == "http_request_completed" and .status >= 500)'
```

Health probes are intentionally omitted from successful request logs. Docker rotates each container's JSON logs at 20 MB and retains five files.

## Persistent refresh evidence

PostgreSQL is authoritative for runs and last-known-good snapshots:

```sql
SELECT d.slug, r.status, r.attempt_count, r.started_at, r.finished_at,
       r.page_count, r.record_count, r.error_code, r.error_summary,
       r.lkg_snapshot_id IS NOT NULL AS had_lkg
FROM dataset_runs r
JOIN datasets d ON d.id = r.dataset_id
ORDER BY r.created_at DESC
LIMIT 50;
```

ClickHouse stores the long-term refresh outcome history:

```sql
SELECT dataset, status, count(), max(occurred_at),
       quantile(0.95)(duration_ms) AS p95_ms,
       groupUniqArray(error_code)
FROM dataset_refresh_events
WHERE occurred_at >= now() - INTERVAL 30 DAY
GROUP BY dataset, status
ORDER BY dataset, status;
```

## Service objectives and alerts

Initial objectives should be reviewed after 30 days of production traffic:

- External API availability: 99.9% per rolling 30 days.
- API p95 latency: below 500 ms for public reads; readiness below 2 seconds.
- API 5xx ratio: below 1% over 5 minutes.
- Daily datasets: a successful snapshot no older than 36 hours.
- wow.gg: a successful snapshot no older than 12 hours.
- Dataset publish correctness: 100% of failed runs preserve the previous `current_snapshot_id`.

Alert conditions:

- Critical: `/readyz` fails for 2 minutes; API 5xx exceeds 5% for 5 minutes; no last-known-good snapshot exists.
- Critical: a dataset is older than twice its refresh interval and the most recent run failed.
- Warning: three consecutive refresh failures; provider fallback is used on three consecutive runs; p95 refresh duration doubles for 24 hours.
- Warning: disk usage exceeds 80%, PostgreSQL connections exceed 80%, or a container restarts more than twice in 15 minutes.

Every alert needs an owner, notification destination, and link to this runbook. Alert delivery is not yet installed on the host; until it is, dataset freshness must be checked in the admin panel.

## Incident procedure

1. Confirm `https://api.gildra.net/livez` and `https://api.gildra.net/readyz` separately.
2. Find the latest `dataset_refresh_failed` event and correlate by `request_id` and `run_id`.
3. Determine the failing stage: provider transport, parsing, validation, or publish.
4. Verify `datasets.current_snapshot_id` still points to the previous successful snapshot.
5. Do not weaken validation bounds during an incident. Fix the parser or source contract and trigger a controlled retry.
6. After recovery, compare page count, record count, unique specs, source timestamps, and content hash to the prior snapshot.

## Known operational gaps

- The origin is still reachable directly, so Cloudflare WAF bypass remains possible even though spoofed `CF-Connecting-IP` no longer bypasses Nginx rate limits. Restrict ports 80/443 to Cloudflare networks or use Cloudflare Tunnel.
- Automated off-host backups and PostgreSQL point-in-time recovery are not configured. Local dumps do not protect against host loss.
- Central alert delivery and a log search UI are not installed.
- The parser framework is pinned to a Git commit, but PyPI vulnerability scanners cannot audit that private package identity; its source must be reviewed when the pin changes.
