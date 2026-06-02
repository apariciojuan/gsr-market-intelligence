"""Ecosystem analytics service (Fase C, sheet 72 section 4).

Reads the append-only ``ecosystem_metrics`` snapshots written by
``app.workers.ecosystem_aggregator`` and serves the ecosystem endpoints. The
response shapes mirror EXACTLY the frontend contract in
``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.ecosystem``).

Two read strategies:

  - Snapshot-backed (``/kpis``, ``/kpi/{key}/sparkline``, ``/by-category``):
    served from the latest snapshot(s); deltas and sparklines mature as more
    aggregation cycles accumulate.
  - On-the-fly from ``markets`` (``/volume``, ``/active-markets``): bucketed over
    the requested interval. ``/volume`` only knows ``new_markets`` per bucket
    (REAL); there is no temporal volume source yet (``price_history.volume_1h``
    is NULL), so ``volume_usd`` is ``0.0``. ``/active-markets`` is exact "now"
    and approximate for past buckets (overlap of ``[start_date, end_date]``).

Honest degradation: endpoints with no data source yet
(``/calibration`` over resolved markets — currently 0 —, ``/activity-heatmap``
over the empty ``transactions`` table, ``/top-wallets`` over the empty
``wallet_positions`` table) return empty/zero payloads with the correct shape
and HTTP 200 — never an error.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.models import EcosystemMetric, Market
from app.schemas.dashboard import KpiItem
from app.schemas.ecosystem import (
    ActivityHeatmap,
    Calibration,
    EcoActiveMarkets,
    EcoActiveMarketsBucket,
    EcoByCategory,
    EcoCategory,
    EcoSparkline,
    EcosystemKpis,
    EcoVolume,
    EcoVolumeBucket,
    PaginatedTopWallets,
)

logger = get_logger('ecosystem')

# Ordered KPI keys served by ``/kpis`` (one snapshot row per key per cycle).
_KPI_KEYS: tuple[str, ...] = (
    'kpi_total_volume',
    'kpi_total_liquidity',
    'kpi_active_markets',
    'kpi_total_markets',
    'kpi_resolved_markets',
)

# Bucket width per interval and how many buckets to emit for the time series.
_INTERVAL_STEP: dict[str, timedelta] = {
    '1d': timedelta(days=1),
    '1w': timedelta(weeks=1),
    '1m': timedelta(days=30),
}
_INTERVAL_BUCKETS = 30


def _to_float(value: Any) -> float:
    """Best-effort float conversion (snapshot values are ``Decimal``)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


class EcosystemService:
    """Serve ecosystem analytics from snapshots and live ``markets`` reads."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _latest(self, metric_key: str) -> EcosystemMetric | None:
        """Most recent snapshot for ``metric_key`` (``computed_at`` DESC)."""
        stmt = (
            select(EcosystemMetric)
            .where(EcosystemMetric.metric_key == metric_key)
            .order_by(EcosystemMetric.computed_at.desc())
            .limit(1)
        )
        return (await self.session.scalars(stmt)).first()

    async def _history(self, metric_key: str, points: int) -> list[EcosystemMetric]:
        """Up to ``points`` most recent snapshots for ``metric_key``.

        Returned in ascending ``computed_at`` order (oldest first), as expected
        for a sparkline series.
        """
        stmt = (
            select(EcosystemMetric)
            .where(EcosystemMetric.metric_key == metric_key)
            .order_by(EcosystemMetric.computed_at.desc())
            .limit(points)
        )
        rows = list((await self.session.scalars(stmt)).all())
        rows.reverse()
        return rows

    async def get_kpis(self, window: str | None = None) -> EcosystemKpis:
        """Latest KPI snapshots, each with a real delta vs the previous snapshot."""
        kpis: list[KpiItem] = []
        for key in _KPI_KEYS:
            history = await self._history(key, 2)
            if not history:
                continue
            latest = history[-1]
            previous = history[0] if len(history) >= 2 else None  # noqa: PLR2004

            value = _to_float(latest.metric_value)
            metadata = latest.metric_metadata or {}
            label = str(metadata.get('label') or key)
            value_formatted = str(metadata.get('value_formatted') or value)

            delta_pct: float | None = None
            delta_direction = 'neutral'
            if previous is not None and latest is not previous:
                prev_value = _to_float(previous.metric_value)
                if prev_value != 0:
                    delta_pct = round((value - prev_value) / prev_value * 100, 2)
                    if delta_pct > 0:
                        delta_direction = 'up'
                    elif delta_pct < 0:
                        delta_direction = 'down'

            kpis.append(
                KpiItem(
                    key=key,
                    label=label,
                    value=value,
                    value_formatted=value_formatted,
                    delta_pct=delta_pct,
                    delta_direction=delta_direction,
                )
            )
        return EcosystemKpis(kpis=kpis)

    async def get_kpi_sparkline(self, key: str, points: int = 30) -> EcoSparkline:
        """Series of snapshot values for a KPI (oldest first) + trend direction."""
        metric_key = key if key.startswith('kpi_') else f'kpi_{key}'
        history = await self._history(metric_key, points)
        values = [_to_float(row.metric_value) for row in history]
        direction = 'down' if len(values) >= 2 and values[-1] < values[0] else 'up'  # noqa: PLR2004
        return EcoSparkline(key=key, values=values, direction=direction)

    async def get_by_category(self, window: str | None = None) -> EcoByCategory:
        """Volume split by primary tag from the latest ``by_category`` snapshot."""
        window_label = window or 'all'
        snapshot = await self._latest('by_category')
        if snapshot is None:
            return EcoByCategory(window=window_label, total_volume_usd=0.0, categories=[])

        metadata = snapshot.metric_metadata or {}
        raw_categories = metadata.get('categories') or []
        categories = [
            EcoCategory(
                name=str(entry.get('name') or ''),
                volume_usd=_to_float(entry.get('volume_usd')),
                share_pct=_to_float(entry.get('share_pct')),
                color=str(entry.get('color') or ''),
            )
            for entry in raw_categories
            if isinstance(entry, dict)
        ]
        return EcoByCategory(
            window=window_label,
            total_volume_usd=_to_float(snapshot.metric_value),
            categories=categories,
        )

    async def get_volume(
        self,
        interval: str = '1d',
        frm: str | None = None,
        to: str | None = None,
    ) -> EcoVolume:
        """New-markets-per-bucket time series, on-the-fly from ``markets``.

        ``new_markets`` is REAL (markets whose ``start_date`` falls in the bucket).
        ``volume_usd`` is ``0.0`` for every bucket: there is no temporal volume
        source yet (``price_history.volume_1h`` is NULL).
        """
        step = _INTERVAL_STEP.get(interval, _INTERVAL_STEP['1d'])
        now = datetime.now(tz=UTC)
        to_time = now
        from_time = now - step * _INTERVAL_BUCKETS

        start_dates = list((await self.session.scalars(select(Market.start_date))).all())

        buckets: list[EcoVolumeBucket] = []
        bucket_start = from_time
        while bucket_start < to_time:
            bucket_end = bucket_start + step
            new_markets = sum(
                1
                for start in start_dates
                if start is not None and bucket_start <= start < bucket_end
            )
            buckets.append(
                EcoVolumeBucket(
                    t=bucket_start.isoformat(),
                    volume_usd=0.0,
                    new_markets=new_markets,
                )
            )
            bucket_start = bucket_end

        return EcoVolume(
            interval=interval,
            from_time=from_time.isoformat(),
            to_time=to_time.isoformat(),
            buckets=buckets,
        )

    async def get_active_markets(self, interval: str = '1d') -> EcoActiveMarkets:
        """Active-markets-per-bucket time series, on-the-fly from ``markets``.

        A market counts in a bucket when its ``[start_date, end_date]`` window
        overlaps the bucket. Exact for the "now" bucket; approximate for the past.
        """
        step = _INTERVAL_STEP.get(interval, _INTERVAL_STEP['1d'])
        now = datetime.now(tz=UTC)
        from_time = now - step * _INTERVAL_BUCKETS

        result = await self.session.execute(select(Market.start_date, Market.end_date))
        windows = list(result.all())

        buckets: list[EcoActiveMarketsBucket] = []
        bucket_start = from_time
        while bucket_start < now:
            bucket_end = bucket_start + step
            active_count = sum(
                1
                for start, end in windows
                if (start is None or start < bucket_end) and (end is None or end >= bucket_start)
            )
            buckets.append(
                EcoActiveMarketsBucket(t=bucket_start.isoformat(), active_count=active_count)
            )
            bucket_start = bucket_end

        return EcoActiveMarkets(interval=interval, buckets=buckets)

    async def get_calibration(
        self, window: str = 'all', category: str | None = None
    ) -> Calibration:
        """Prediction calibration over resolved markets (currently 0).

        ``overall_brier_score`` is the mean of ``(implied_prob_avg - outcome)^2``;
        buckets are 10 fixed 0.1-wide bins. With no resolved markets yet this is an
        honest empty payload (``markets:[], buckets:[], overall_brier_score:0.0``).
        """
        category_label = category or 'all'
        # No resolved markets yet (and no implied-probability history source);
        # degrade honestly to an empty, well-shaped payload.
        return Calibration(
            window=window,
            category=category_label,
            markets_count=0,
            markets=[],
            buckets=[],
            overall_brier_score=0.0,
        )

    async def get_activity_heatmap(self, window: str | None = None) -> ActivityHeatmap:
        """Day-of-week / hour activity matrix from ``transactions`` (empty for now)."""
        window_label = window or 'all'
        # The ``transactions`` table is empty (Phase 2); honest empty matrix.
        return ActivityHeatmap(window=window_label, matrix=[])

    async def get_top_wallets(
        self,
        limit: int = 50,
        order_by: str = 'volume',
        window: str | None = None,
    ) -> PaginatedTopWallets:
        """Top wallets from ``wallet_positions`` (empty for now).

        Returns the ``PaginatedTopWallets`` envelope with the wallets in
        ``.items`` (never a bare array). The ``wallet_positions`` table is empty
        (Phase 2), so this degrades honestly to an empty, well-shaped page.
        """
        return PaginatedTopWallets(
            items=[],
            total=0,
            limit=limit,
            offset=0,
            has_more=False,
        )
