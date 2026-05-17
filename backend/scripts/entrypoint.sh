#!/bin/sh

echo "Waiting for postgres..."

while ! nc -z $POSTGRES_HOST $POSTGRES_PORT; do
  sleep 0.1
done

echo "PostgreSQL started"

python << EOF
print('Hola')
EOF


echo "Syncing dependencies from uv.lock..."
uv sync --frozen

exec "$@"