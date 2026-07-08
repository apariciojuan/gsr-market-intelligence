"""Read/write pre-aggregated market volume buckets (filled by the worker)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MarketVolumeCache
from app.schemas.market import VolumePoint

_VOLUME_INTERVALS = ('1h', '4h', '1d', '1w', 'max')
# Fewer, wider buckets so bar charts stay readable (minute-level price rows
# would otherwise produce 200+ mostly-zero bars that look empty in the UI).
_DISPLAY_BUCKETS: dict[str, int] = {
    '1h': 24,
    '4h': 42,
    '1d': 30,
    '1w': 13,
    'max': 60,
}


def volume_intervals() -> tuple[str, ...]:
    return _VOLUME_INTERVALS


def compress_volume_series(
    points: list[VolumePoint], interval: str
) -> list[VolumePoint]:
    """Merge fine-grained buckets into a display-friendly series."""
    max_bars = _DISPLAY_BUCKETS.get(interval, 48)
    if len(points) <= max_bars:
        return points

    chunk_size = (len(points) + max_bars - 1) // max_bars
    compressed: list[VolumePoint] = []
    for index in range(0, len(points), chunk_size):
        chunk = points[index : index + chunk_size]
        if not chunk:
            continue
        total = round(sum(point.v for point in chunk), 2)
        prev = compressed[-1].v if compressed else 0.0
        compressed.append(
            VolumePoint(
                t=chunk[-1].t,
                v=total,
                direction='up' if total >= prev else 'down',
            )
        )
    return compressed


class VolumeCacheStore:
    """PostgreSQL-backed volume cache for ``GET /markets/{id}/prices``."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_volume_series(
        self, market_id: int, interval: str
    ) -> tuple[list[VolumePoint], float]:
        row = await self.session.scalar(
            select(MarketVolumeCache).where(
                MarketVolumeCache.market_id == market_id,
                MarketVolumeCache.interval == interval,
            )
        )
        if row is None or not row.buckets:
            return [], 0.0

        points: list[VolumePoint] = []
        for bucket in row.buckets:
            if not isinstance(bucket, dict):
                continue
            try:
                points.append(
                    VolumePoint(
                        t=str(bucket['t']),
                        v=float(bucket['v']),
                        direction=bucket.get('direction') or 'up',
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        total = float(row.total_volume_usd or 0)
        return points, total

    async def upsert(
        self,
        market_id: int,
        interval: str,
        points: list[VolumePoint],
        *,
        computed_at: datetime | None = None,
    ) -> None:
        now = computed_at or datetime.now(tz=UTC)
        buckets = [{'t': p.t, 'v': p.v, 'direction': p.direction} for p in points]
        total = Decimal(str(round(sum(p.v for p in points), 2)))
        stmt = (
            pg_insert(MarketVolumeCache)
            .values(
                market_id=market_id,
                interval=interval,
                buckets=buckets,
                total_volume_usd=total,
                computed_at=now,
            )
            .on_conflict_do_update(
                constraint='uq_market_volume_cache_market_interval',
                set_={
                    'buckets': buckets,
                    'total_volume_usd': total,
                    'computed_at': now,
                    'updated_at': now,
                },
            )
        )
        await self.session.execute(stmt)
