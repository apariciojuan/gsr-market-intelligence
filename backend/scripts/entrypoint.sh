#!/bin/sh
set -eu

echo "Waiting for postgres..."

while ! nc -z $POSTGRES_HOST $POSTGRES_PORT; do
  sleep 0.1
done

echo "PostgreSQL started"

echo "Syncing dependencies from uv.lock..."
uv sync --frozen

echo "Applying database migrations..."
uv run python scripts/migrate.py

exec "$@"
