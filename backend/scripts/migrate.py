"""Run Alembic migrations under a PostgreSQL advisory lock.

Both the API and worker containers use the same entrypoint in development. On a
fresh volume they can start together, so Alembic's version table creation must be
serialized before either process continues.
"""

from __future__ import annotations

import asyncio
import os
import subprocess

import asyncpg

LOCK_ID = 917_137_000


def _database_url() -> str:
    user = os.environ['POSTGRES_USER']
    password = os.environ['POSTGRES_PASSWORD']
    host = os.environ['POSTGRES_HOST']
    port = os.environ['POSTGRES_PORT']
    database = os.environ['POSTGRES_DB']
    return f'postgresql://{user}:{password}@{host}:{port}/{database}'


async def main() -> None:
    connection = await asyncpg.connect(_database_url())
    try:
        await connection.execute('SELECT pg_advisory_lock($1)', LOCK_ID)
        subprocess.run(['uv', 'run', 'alembic', 'upgrade', 'head'], check=True)
    finally:
        await connection.execute('SELECT pg_advisory_unlock($1)', LOCK_ID)
        await connection.close()


if __name__ == '__main__':
    asyncio.run(main())
