#!/bin/sh
set -eu

goose -dir /app/migrations/postgres postgres "$DATABASE_URL" up
minimum_schema_version=$(cat /app/migrations/postgres/.minimum-catalog-schema-version)
actual_schema_version=$(psql "$DATABASE_URL" -Atqc "SELECT COALESCE(max(version_id),0) FROM goose_db_version WHERE is_applied")
case "$minimum_schema_version:$actual_schema_version" in
  *[!0-9:]*|:*)
    echo 'catalog migration version check returned invalid output' >&2
    exit 1
    ;;
esac
[ "$actual_schema_version" -ge "$minimum_schema_version" ] || {
  echo "catalog migrations stopped at schema $actual_schema_version; code requires $minimum_schema_version" >&2
  exit 1
}
goose -dir /app/migrations/clickhouse clickhouse "clickhouse://$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD@$CLICKHOUSE_ADDR/$CLICKHOUSE_DATABASE" up
river migrate-up --database-url "$DATABASE_URL"
exec server
