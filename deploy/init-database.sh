#!/bin/sh
# Runs once, on an empty data volume. The owner role (POSTGRES_USER) runs
# migrations; the runtime role gets data access only, never DDL or role rights.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password POSTGRES_APP_PASSWORD
CREATE ROLE swmach_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE swmach TO swmach_app;
GRANT USAGE ON SCHEMA public TO swmach_app;
ALTER DEFAULT PRIVILEGES FOR ROLE swmach IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO swmach_app;
ALTER DEFAULT PRIVILEGES FOR ROLE swmach IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO swmach_app;
ALTER DEFAULT PRIVILEGES FOR ROLE swmach IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO swmach_app;
SQL
