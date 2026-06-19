#!/usr/bin/env python3
"""Export core PostgreSQL tables to parquet for analysis."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import _build_database_url  # noqa: E402

DEFAULT_OUTPUT = BACKEND_ROOT / 'data' / 'datasets' / 'core_db'
CORE_TABLES = [
    'markets',
    'price_history',
    'chainlink_prices',
    'divergences',
    'external_signals',
    'ecosystem_metrics',
]


async def export_tables(output_dir: Path, limit: int | None = None) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    engine = create_async_engine(_build_database_url(), pool_pre_ping=True)
    row_counts: dict[str, int] = {}
    warnings: list[str] = []

    async with engine.connect() as conn:
        for table in CORE_TABLES:
            sql = f'SELECT * FROM {table}'
            if limit and limit > 0:
                sql = f'{sql} LIMIT {int(limit)}'
            try:
                result = await conn.execute(text(sql))
                rows = result.mappings().all()
                frame = pd.DataFrame(rows)
                frame.to_parquet(output_dir / f'{table}.parquet', index=False)
                row_counts[table] = int(len(frame))
            except Exception as exc:  # noqa: BLE001
                warnings.append(f'{table}: {exc}')
                pd.DataFrame().to_parquet(output_dir / f'{table}.parquet', index=False)
                row_counts[table] = 0

    await engine.dispose()

    manifest = {
        'dataset': 'core_db_snapshot',
        'created_at_utc': datetime.now(UTC).isoformat(),
        'row_counts': row_counts,
        'warnings': warnings,
    }
    (output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description='Export core DB tables to parquet')
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--limit', type=int, default=None)
    args = parser.parse_args()
    import asyncio

    manifest = asyncio.run(export_tables(args.output_dir, args.limit))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
