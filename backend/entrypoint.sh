#!/bin/sh
set -eu

goose -dir /app/migrations/postgres postgres "$DATABASE_URL" up
goose -dir /app/migrations/clickhouse clickhouse "clickhouse://$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD@$CLICKHOUSE_ADDR/$CLICKHOUSE_DATABASE" up
river migrate-up --database-url "$DATABASE_URL"
exec server
