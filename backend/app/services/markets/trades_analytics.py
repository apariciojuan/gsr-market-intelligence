"""On-the-fly trade analytics from the Polymarket Data API.

Aggregates ``/trades`` into per-interval volume buckets and unique active wallets.
Designed for the quick path (no local trade ingestor yet).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.config.log import get_logger
from app.schemas.market import VolumePoint
from app.services import PolymarketClient

logger = get_logger('markets.trades_analytics')

_INTERVAL_WINDOWS: dict[str, timedelta | None] = {
    '1m': timedelta(hours=1),
    '1h': timedelta(hours=24),
    '4h': timedelta(days=7),
    '1d': timedelta(days=30),
    '1w': timedelta(days=90),
    'max': None,
}

_VOLUME_BUCKET_COUNTS: dict[str, int] = {
    '1h': 24,
    '4h': 42,
    '1d': 30,
    '1w': 13,
    'max': 60,
}

_MAX_MARKET_TRADES = 5000
_MAX_GLOBAL_TRADES = 5000
_PAGE_SIZE = 100


def _parse_iso(value: str) -> datetime:
    text = value.strip().replace('Z', '+00:00')
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _trade_value_usd(row: dict) -> tuple[int, float]:
    """Return (unix_seconds, notional_usd) for a trade row, or skip with zeros."""
    try:
        ts = int(row.get('timestamp') or 0)
        size = float(row.get('size') or 0)
        price = float(row.get('price') or 0)
    except (TypeError, ValueError):
        return 0, 0.0
    return ts, max(0.0, size * price)


def window_start_for_interval(interval: str) -> datetime | None:
    """UTC lower bound for an interval label, or ``None`` for ``max``."""
    window = _INTERVAL_WINDOWS.get(interval)
    if window is None:
        return None
    return datetime.now(tz=UTC) - window


def resolve_volume_bucket_timestamps(
    interval: str,
    price_series_ts: list[str] | None = None,
) -> list[str]:
    """Build evenly spaced bucket ends for volume bars (not minute-level price rows)."""
    count = _VOLUME_BUCKET_COUNTS.get(interval, 30)
    now = datetime.now(tz=UTC)

    if price_series_ts and len(price_series_ts) >= 2:
        start = _parse_iso(price_series_ts[0])
        end = _parse_iso(price_series_ts[-1])
    else:
        window = _INTERVAL_WINDOWS.get(interval)
        end = now
        start = now - window if window is not None else now - timedelta(days=60)

    if end <= start:
        start = end - timedelta(hours=1)

    step = (end - start) / count
    return [
        (start + step * (index + 1)).astimezone(UTC).isoformat().replace('+00:00', 'Z')
        for index in range(count)
    ]


async def fetch_market_trades(
    client: PolymarketClient,
    condition_id: str,
    *,
    since: datetime | None = None,
    max_trades: int = _MAX_MARKET_TRADES,
) -> list[dict]:
    """Paginate market trades (newest first) until ``since`` or ``max_trades``."""
    if not condition_id:
        return []

    since_ts = int(since.timestamp()) if since is not None else None
    trades: list[dict] = []
    offset = 0

    while len(trades) < max_trades:
        try:
            response = await client.get_trades(
                {'market': condition_id, 'limit': _PAGE_SIZE, 'offset': offset}
            )
            batch = response.json()
        except Exception:
            logger.warning('trades fetch failed for market=%s offset=%s', condition_id, offset)
            break

        if not isinstance(batch, list) or not batch:
            break

        for row in batch:
            if not isinstance(row, dict):
                continue
            ts, _ = _trade_value_usd(row)
            if since_ts is not None and ts < since_ts:
                return trades
            trades.append(row)

        if len(batch) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE

    return trades


def build_volume_series(trades: list[dict], series_ts: list[str]) -> list[VolumePoint]:
    """Bucket trade notional into evenly spaced time windows."""
    if not series_ts:
        return []

    edges = [_parse_iso(ts) for ts in series_ts]
    if len(edges) == 1:
        step = timedelta(hours=1)
    else:
        step = edges[1] - edges[0]
        if step.total_seconds() <= 0:
            step = timedelta(hours=1)

    parsed: list[tuple[int, float]] = []
    for row in trades:
        ts, value = _trade_value_usd(row)
        if ts > 0 and value > 0:
            parsed.append((ts, value))

    points: list[VolumePoint] = []
    prev_volume = 0.0

    for index, end in enumerate(edges):
        start = edges[index - 1] if index > 0 else end - step
        start_ts = int(start.timestamp())
        end_ts = int(end.timestamp())
        volume = sum(value for ts, value in parsed if start_ts < ts <= end_ts)
        direction = 'up' if volume >= prev_volume else 'down'
        points.append(
            VolumePoint(
                t=series_ts[index],
                v=round(volume, 2),
                direction=direction,
            )
        )
        prev_volume = volume

    return points


async def count_active_wallets_24h(
    client: PolymarketClient,
    *,
    max_trades: int = _MAX_GLOBAL_TRADES,
) -> int:
    """Count unique ``proxyWallet`` addresses in global trades over the last 24h."""
    since = datetime.now(tz=UTC) - timedelta(hours=24)
    since_ts = int(since.timestamp())
    wallets: set[str] = set()
    offset = 0
    scanned = 0

    while scanned < max_trades:
        try:
            response = await client.get_trades({'limit': _PAGE_SIZE, 'offset': offset})
            batch = response.json()
        except Exception:
            logger.warning('global trades fetch failed at offset=%s', offset)
            break

        if not isinstance(batch, list) or not batch:
            break

        for row in batch:
            if not isinstance(row, dict):
                continue
            ts = int(row.get('timestamp') or 0)
            if ts < since_ts:
                return len(wallets)
            wallet = str(row.get('proxyWallet') or '').strip().lower()
            if wallet:
                wallets.add(wallet)
            scanned += 1
            if scanned >= max_trades:
                break

        if len(batch) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE

    return len(wallets)
