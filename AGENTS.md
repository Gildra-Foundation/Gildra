# Gildra agent contract

The agent may read and modify all files in this repository.

Allowed:
- application and frontend changes;
- backend and API changes;
- PostgreSQL migrations;
- local data imports;
- local builds and tests;
- restarting local development services.

Do not commit or push unless explicitly requested.
Production deployment, migrations, data imports, and service restarts are allowed only when explicitly requested by the user. Verify backup, rollback, and service health before production changes.
Preserve existing user changes.
