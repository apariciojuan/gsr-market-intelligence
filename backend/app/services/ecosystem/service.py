"""Ecosystem analytics service (Fase C, sheet 72 section 4).

Reads the append-only ``ecosystem_metrics`` snapshots written by
``app.workers.ecosystem_aggregator`` and serves the ecosystem endpoints. The
response shapes mirror EXACTLY the frontend contract in
``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.ecosystem``).

Two read strategies:

  - Snapshot-backed (``/kpis``, ``/kpi/{key}/sparkline``): served from the latest
    snapshot(s); deltas and sparklines mature as more aggregation cycles
    accumulate.
  - On-the-fly from local tables and live fallbacks: ``/by-category``, ``/volume``,
    ``/active-markets``, ``/calibration``, ``/activity-heatmap`` and
    ``/top-wallets`` are computed from ``markets``, ``price_history``,
    ``transactions`` and ``wallet_positions`` as available; empty transaction
    and wallet tables fall back to the Polymarket Data API ``/trades``.

Honest degradation: when a backing table is empty or a market lacks the needed
resolution/price data, the endpoint returns an empty/zero payload with the
correct shape and HTTP 200 — never an error.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import case, desc, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.models import EcosystemMetric, Market, PriceHistory, Transaction, WalletPosition
from app.schemas.dashboard import KpiItem
from app.schemas.ecosystem import (
    ActivityHeatmap,
    ActivityHeatmapCell,
    Calibration,
    CalibrationBucket,
    CalibrationMarket,
    EcoActiveMarkets,
    EcoActiveMarketsBucket,
    EcoByCategory,
    EcoCategory,
    EcoSparkline,
    EcosystemKpis,
    EcoVolume,
    EcoVolumeBucket,
    PaginatedTopWallets,
    TopWallet,
)
from app.services.ecosystem.categories import build_by_category, market_category
from app.services.polymarket_client import PolymarketClient

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
_TRADE_PAGE_SIZE = 100
_MAX_LIVE_TRADES = 5000
_CALIBRATION_SAMPLE_LIMIT = 12
_CALIBRATION_TERMINAL_EPSILON = 0.02


def _to_float(value: Any) -> float:
    """Best-effort float conversion (snapshot values are ``Decimal``)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _window_cutoff(window: str | None, now: datetime) -> datetime | None:
    """Translate ecosystem window labels into an inclusive lower timestamp."""
    if window == '90d':
        return now - timedelta(days=90)
    if window == '1y':
        return now - timedelta(days=365)
    if window and window.endswith('d'):
        try:
            return now - timedelta(days=int(window[:-1]))
        except ValueError:
            return None
    return None


def _resolved_yes_outcome(market: Market) -> int | None:
    """Return 1 when the resolved outcome is YES, 0 when it is a known non-YES."""
    resolved = (market.resolved_outcome or '').strip()
    if not resolved:
        return None

    resolved_key = resolved.lower()
    if resolved_key in {'yes', 'true', '1'}:
        return 1
    if resolved_key in {'no', 'false', '0'}:
        return 0

    outcomes = market.outcomes if isinstance(market.outcomes, list) else []
    if outcomes:
        return 1 if str(outcomes[0]).strip().lower() == resolved_key else 0
    return None


def _inferred_yes_outcome(final_yes_price: float) -> int | None:
    """Infer a resolved YES/NO outcome from a terminal YES price."""
    if final_yes_price >= 0.95:
        return 1
    if final_yes_price <= 0.05:
        return 0
    return None


def _calibration_probability(prices: list[float]) -> float | None:
    """Return a YES probability, preferring pre-resolution prices when available."""
    if not prices:
        return None

    non_terminal = [
        price
        for price in prices
        if _CALIBRATION_TERMINAL_EPSILON < price < 1.0 - _CALIBRATION_TERMINAL_EPSILON
    ]
    sample = (
        non_terminal[-_CALIBRATION_SAMPLE_LIMIT:]
        if non_terminal
        else prices[-_CALIBRATION_SAMPLE_LIMIT:]
    )
    probability = sum(sample) / len(sample)
    return max(
        _CALIBRATION_TERMINAL_EPSILON,
        min(1.0 - _CALIBRATION_TERMINAL_EPSILON, probability),
    )


def _trade_timestamp(row: dict) -> int:
    try:
        return int(row.get('timestamp') or 0)
    except (TypeError, ValueError):
        return 0


def _trade_value_usd(row: dict) -> float:
    try:
        size = float(row.get('size') or 0)
        price = float(row.get('price') or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, size * price)


def _trade_wallet(row: dict) -> str:
    return str(row.get('proxyWallet') or '').strip().lower()


async def _fetch_live_trades(
    *,
    since: datetime | None = None,
    max_trades: int = _MAX_LIVE_TRADES,
) -> list[dict]:
    """Fetch recent global trades from Polymarket Data API."""
    client = PolymarketClient()
    since_ts = int(since.timestamp()) if since is not None else None
    trades: list[dict] = []
    offset = 0

    while len(trades) < max_trades:
        try:
            response = await client.get_trades({'limit': _TRADE_PAGE_SIZE, 'offset': offset})
            batch = response.json()
        except Exception:
            logger.warning('ecosystem live trades fetch failed at offset=%s', offset)
            break

        if not isinstance(batch, list) or not batch:
            break

        for row in batch:
            if not isinstance(row, dict):
                continue
            ts = _trade_timestamp(row)
            if since_ts is not None and ts < since_ts:
                return trades
            trades.append(row)
            if len(trades) >= max_trades:
                break

        if len(batch) < _TRADE_PAGE_SIZE:
            break
        offset += _TRADE_PAGE_SIZE

    return trades


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
        """Volume split by display category from live markets.

        The endpoint computes this live instead of trusting the latest snapshot so
        stale snapshots generated by older category logic do not keep the UI stuck
        with all volume under ``Other``.
        """
        window_label = window or 'all'
        markets = list((await self.session.scalars(select(Market))).all())
        if not markets:
            return EcoByCategory(window=window_label, total_volume_usd=0.0, categories=[])

        total_volume, raw_categories = build_by_category(markets)
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
            total_volume_usd=_to_float(total_volume),
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
        """Prediction calibration over resolved markets using YES price history."""
        category_label = category or 'all'

        stmt = (
            select(Market, PriceHistory.price, PriceHistory.time)
            .join(PriceHistory, PriceHistory.market_id == Market.id)
            .where(Market.resolved.is_(True))
            .where(func.lower(PriceHistory.outcome) == 'yes')
            .order_by(Market.id.asc(), PriceHistory.time.asc())
        )
        cutoff = _window_cutoff(window, datetime.now(tz=UTC))
        if cutoff is not None:
            stmt = stmt.where(func.coalesce(Market.resolved_at, Market.end_date) >= cutoff)

        prices_by_market: dict[int, list[tuple[Market, float]]] = defaultdict(list)
        for market, price, _time in (await self.session.execute(stmt)).all():
            prices_by_market[market.id].append((market, _to_float(price)))

        entries: list[CalibrationMarket] = []
        brier_terms: list[float] = []
        bucket_values: list[list[tuple[float, int]]] = [[] for _ in range(10)]

        for market_prices in prices_by_market.values():
            market = market_prices[-1][0]
            display_category = market_category(market)
            if category_label != 'all' and display_category != category_label:
                continue

            final_yes_price = market_prices[-1][1]
            outcome = _resolved_yes_outcome(market)
            if outcome is None:
                outcome = _inferred_yes_outcome(final_yes_price)
            if outcome is None:
                continue

            probability = _calibration_probability([price for _, price in market_prices])
            if probability is None:
                continue
            entries.append(
                CalibrationMarket(
                    id=market.id,
                    slug=market.slug,
                    question=market.question,
                    implied_prob_avg=probability,
                    outcome=outcome,
                    category=display_category,
                    volume_usd=_to_float(market.volume_total),
                )
            )
            brier_terms.append((probability - outcome) ** 2)
            bucket_index = min(9, int(probability * 10))
            bucket_values[bucket_index].append((probability, outcome))

        buckets: list[CalibrationBucket] = []
        for index, values in enumerate(bucket_values):
            if not values:
                continue
            predicted_avg = sum(probability for probability, _ in values) / len(values)
            actual_rate = sum(outcome for _, outcome in values) / len(values)
            buckets.append(
                CalibrationBucket(
                    range=f'{index / 10:.1f}-{(index + 1) / 10:.1f}',
                    predicted_avg=round(predicted_avg, 4),
                    actual_rate=round(actual_rate, 4),
                    count=len(values),
                )
            )

        return Calibration(
            window=window,
            category=category_label,
            markets_count=len(entries),
            markets=entries,
            buckets=buckets,
            overall_brier_score=round(sum(brier_terms) / len(brier_terms), 6)
            if brier_terms
            else 0.0,
        )

    async def get_activity_heatmap(self, window: str | None = None) -> ActivityHeatmap:
        """Day-of-week / hour activity matrix from indexed transactions."""
        window_label = window or 'all'
        cutoff = _window_cutoff(window, datetime.now(tz=UTC))
        stmt = select(
            func.extract('dow', Transaction.time).label('dow'),
            func.extract('hour', Transaction.time).label('hour'),
            func.count().label('tx_count'),
        )
        if cutoff is not None:
            stmt = stmt.where(Transaction.time >= cutoff)
        stmt = stmt.group_by('dow', 'hour').order_by('dow', 'hour')

        matrix = [
            ActivityHeatmapCell(
                day=(int(dow) + 6) % 7,
                hour=int(hour),
                tx_count=int(tx_count),
            )
            for dow, hour, tx_count in (await self.session.execute(stmt)).all()
        ]
        if matrix:
            return ActivityHeatmap(window=window_label, matrix=matrix)

        trades = await _fetch_live_trades(since=cutoff)
        buckets: dict[tuple[int, int], int] = defaultdict(int)
        trade_days: set[int] = set()
        for row in trades:
            ts = _trade_timestamp(row)
            if ts <= 0:
                continue
            timestamp = datetime.fromtimestamp(ts, tz=UTC)
            trade_days.add(timestamp.toordinal())
            buckets[(timestamp.weekday(), timestamp.hour)] += 1

        if len(trade_days) >= 2:
            matrix = [
                ActivityHeatmapCell(day=day, hour=hour, tx_count=tx_count)
                for (day, hour), tx_count in sorted(buckets.items())
            ]
            return ActivityHeatmap(window=window_label, matrix=matrix)

        price_stmt = select(
            func.extract('dow', PriceHistory.time).label('dow'),
            func.extract('hour', PriceHistory.time).label('hour'),
            func.count().label('tx_count'),
        )
        if cutoff is not None:
            price_stmt = price_stmt.where(PriceHistory.time >= cutoff)
        price_stmt = price_stmt.group_by('dow', 'hour').order_by('dow', 'hour')

        matrix = [
            ActivityHeatmapCell(
                day=(int(dow) + 6) % 7,
                hour=int(hour),
                tx_count=int(tx_count),
            )
            for dow, hour, tx_count in (await self.session.execute(price_stmt)).all()
        ]
        return ActivityHeatmap(window=window_label, matrix=matrix)

    async def get_top_wallets(
        self,
        limit: int = 50,
        order_by: str = 'volume',
        window: str | None = None,
        offset: int = 0,
    ) -> PaginatedTopWallets:
        """Top wallets aggregated from ``wallet_positions``."""
        volume_expr = (
            func.coalesce(func.sum(WalletPosition.total_bought_usd), 0)
            + func.coalesce(func.sum(WalletPosition.total_sold_usd), 0)
        ).label('total_volume_usd')
        trade_count_expr = func.count(WalletPosition.id).label('trade_count')
        market_count_expr = func.count(distinct(WalletPosition.market_id)).label('market_count')
        pnl_expr = func.coalesce(func.sum(WalletPosition.realized_pnl_usd), 0).label(
            'realized_pnl_usd'
        )
        success_rate_expr = (
            func.coalesce(
                func.avg(case((WalletPosition.realized_pnl_usd > 0, 1.0), else_=0.0)),
                0,
            )
            * 100
        ).label('success_rate_pct')
        first_seen_expr = func.min(WalletPosition.last_activity_at).label('first_seen_at')

        base = select(WalletPosition.wallet_address)
        cutoff = _window_cutoff(window, datetime.now(tz=UTC))
        if cutoff is not None:
            base = base.where(WalletPosition.last_activity_at >= cutoff)
        wallets = await self.session.scalars(base.group_by(WalletPosition.wallet_address))
        total = len(wallets.all())

        stmt = select(
            WalletPosition.wallet_address,
            volume_expr,
            trade_count_expr,
            market_count_expr,
            pnl_expr,
            success_rate_expr,
            first_seen_expr,
        )
        if cutoff is not None:
            stmt = stmt.where(WalletPosition.last_activity_at >= cutoff)
        stmt = stmt.group_by(WalletPosition.wallet_address)

        order_exprs = {
            'volume': volume_expr,
            'pnl': pnl_expr,
            'trades': trade_count_expr,
            'success_rate': success_rate_expr,
        }
        stmt = (
            stmt.order_by(desc(order_exprs.get(order_by, volume_expr)))
            .offset(offset)
            .limit(limit)
        )

        items = [
            TopWallet(
                address=wallet_address,
                address_label=None,
                total_volume_usd=_to_float(total_volume),
                trade_count=int(trade_count),
                market_count=int(market_count),
                realized_pnl_usd=_to_float(realized_pnl),
                success_rate_pct=_to_float(success_rate),
                first_seen_at=first_seen_at.isoformat() if first_seen_at else '',
            )
            for (
                wallet_address,
                total_volume,
                trade_count,
                market_count,
                realized_pnl,
                success_rate,
                first_seen_at,
            ) in (await self.session.execute(stmt)).all()
        ]

        if not items and total == 0:
            return await self._get_live_top_wallets(
                limit=limit,
                offset=offset,
                order_by=order_by,
                window=window,
            )

        return PaginatedTopWallets(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
            has_more=offset + len(items) < total,
        )

    async def _get_live_top_wallets(
        self,
        *,
        limit: int,
        offset: int,
        order_by: str,
        window: str | None,
    ) -> PaginatedTopWallets:
        """Fallback top wallets from recent Polymarket Data API trades."""
        cutoff = _window_cutoff(window, datetime.now(tz=UTC))
        trades = await _fetch_live_trades(since=cutoff)
        by_wallet: dict[str, dict[str, Any]] = {}

        for row in trades:
            wallet = _trade_wallet(row)
            if not wallet:
                continue
            stats = by_wallet.setdefault(
                wallet,
                {
                    'total_volume_usd': 0.0,
                    'trade_count': 0,
                    'markets': set(),
                    'first_seen_ts': None,
                    'label': None,
                },
            )
            stats['total_volume_usd'] += _trade_value_usd(row)
            stats['trade_count'] += 1
            if row.get('conditionId'):
                stats['markets'].add(str(row.get('conditionId')))
            ts = _trade_timestamp(row)
            if ts > 0 and (stats['first_seen_ts'] is None or ts < stats['first_seen_ts']):
                stats['first_seen_ts'] = ts
            label = str(row.get('name') or row.get('pseudonym') or '').strip()
            if label and not stats['label']:
                stats['label'] = label

        sort_key = {
            'volume': lambda item: item[1]['total_volume_usd'],
            'trades': lambda item: item[1]['trade_count'],
            'pnl': lambda item: item[1]['total_volume_usd'],
            'success_rate': lambda item: item[1]['trade_count'],
        }.get(order_by, lambda item: item[1]['total_volume_usd'])

        ranked = sorted(by_wallet.items(), key=sort_key, reverse=True)
        page = ranked[offset : offset + limit]
        items = [
            TopWallet(
                address=wallet,
                address_label=stats['label'],
                total_volume_usd=round(stats['total_volume_usd'], 2),
                trade_count=int(stats['trade_count']),
                market_count=len(stats['markets']),
                realized_pnl_usd=0.0,
                success_rate_pct=0.0,
                first_seen_at=datetime.fromtimestamp(stats['first_seen_ts'], tz=UTC).isoformat()
                if stats['first_seen_ts']
                else '',
            )
            for wallet, stats in page
        ]

        return PaginatedTopWallets(
            items=items,
            total=len(ranked),
            limit=limit,
            offset=offset,
            has_more=offset + len(items) < len(ranked),
        )
