"""Time-series provider for the divergence pipeline (Fase D, sheet 73 section 3).

Decouples :class:`~app.services.divergence.service.DivergenceService` and the
``/signals`` router (DIP) from where the two series come from:

  - the **market** series is the "Yes" outcome's CLOB price history, fetched from
    :meth:`~app.services.PolymarketClient.get_prices_history_by_market` (the "Yes"
    ``clobTokenId`` is ``Market.outcome_token_ids[0]``); the response shape is
    ``{"history": [{"t": <unix s>, "p": <float 0..1>}]}``;
  - the **external** series is the Chainlink spot answers stored in the
    ``chainlink_prices`` hypertable for a given ``feed_id`` over the window — read
    directly from the DB, **not** via ``ChainlinkClient.build_overlay`` (which only
    replicates a single flat spot price).

Both are returned as ``list[PricePoint]`` (``t`` ISO-8601 UTC, ``v`` float) in
ascending time order. With no data they return ``[]`` — honest degradation, never
an error.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.models import ChainlinkPrice
from app.schemas.market import PricePoint
from app.services import PolymarketClient

logger = get_logger('divergence.series_provider')


def _to_iso(value: Any) -> str | None:
    """Render a unix-second timestamp as an ISO-8601 UTC string, or ``None``."""
    point_time = _to_datetime(value)
    return point_time.isoformat() if point_time is not None else None


def _to_datetime(value: Any) -> datetime | None:
    """Convert a unix-second timestamp into a tz-aware datetime, or ``None``."""
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def _to_float(value: Any) -> float | None:
    """Best-effort float conversion (prices/answers), or ``None``."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _history_points(payload: Any) -> list[dict]:
    """Pull the ``history`` list out of a CLOB prices-history response."""
    if not isinstance(payload, dict):
        return []
    history = payload.get('history')
    if not isinstance(history, list):
        return []
    return [point for point in history if isinstance(point, dict)]


class SeriesProvider:
    """Provide the market and external price series for a divergence evaluation."""

    def __init__(self, session: AsyncSession, client: PolymarketClient | None = None) -> None:
        self.session = session
        self.client = client or PolymarketClient()

    async def get_market_series(
        self,
        token_id: str,
        frm: datetime,
        to: datetime,
        interval: str,
    ) -> list[PricePoint]:
        """Fetch the "Yes" CLOB price history for ``token_id`` over ``[frm, to]``.

        ``token_id`` is the market's "Yes" ``clobTokenId`` (passed to the CLOB
        endpoint as ``market``). Points are mapped to ``PricePoint(t=iso, v=p)`` in
        ascending time order. Returns ``[]`` on any failure or empty response.
        """
        if not token_id:
            return []
        try:
            response = await self.client.get_prices_history_by_market(
                {
                    'market': token_id,
                    'startTs': int(frm.timestamp()),
                    'endTs': int(to.timestamp()),
                    'interval': interval,
                    'fidelity': 1,
                }
            )
            points = _history_points(response.json())
        except Exception:
            logger.exception(
                'series_provider: failed to fetch market series (token=%s)', token_id
            )
            return []

        series: list[PricePoint] = []
        for point in points:
            point_time = _to_iso(point.get('t'))
            value = _to_float(point.get('p'))
            if point_time is None or value is None:
                continue
            series.append(PricePoint(t=point_time, v=value))
        series.sort(key=lambda item: item.t)
        return series

    async def get_external_series(
        self,
        feed_id: int,
        frm: datetime,
        to: datetime,
    ) -> list[PricePoint]:
        """Read the Chainlink answers for ``feed_id`` over ``[frm, to]`` from the DB.

        Maps each ``chainlink_prices`` row to ``PricePoint(t=time.isoformat(),
        v=float(answer_usd))`` in ascending time order. Returns ``[]`` when there
        are no rows in the window — honest degradation, never an error.
        """
        try:
            stmt = (
                select(ChainlinkPrice.time, ChainlinkPrice.answer_usd)
                .where(
                    ChainlinkPrice.feed_id == feed_id,
                    ChainlinkPrice.time >= frm,
                    ChainlinkPrice.time <= to,
                )
                .order_by(ChainlinkPrice.time.asc())
            )
            rows = (await self.session.execute(stmt)).all()
        except Exception:
            logger.exception('series_provider: failed to read external series (feed=%s)', feed_id)
            return []

        series: list[PricePoint] = []
        for point_time, answer_usd in rows:
            value = _to_float(answer_usd)
            if point_time is None or value is None:
                continue
            series.append(PricePoint(t=point_time.isoformat(), v=value))
        return series
