CREATE DATABASE gildra_cms;

-- Query statistics for the operations console. The server preloads the
-- library through shared_preload_libraries in compose.yml; without it the
-- view exists but stays empty.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
