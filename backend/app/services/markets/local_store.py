"""Read market data from the local PostgreSQL cache (ingested by workers)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Market, PriceHistory
from app.schemas.market import PricePoint
from app.services.markets.categories import extract_market_category

_INTERVAL_WINDOWS: dict[str, timedelta | None] = {
    '1m': timedelta(hours=1),
    '1h': timedelta(hours=24),
    '4h': timedelta(days=7),
    '1d': timedelta(days=30),
    '1w': timedelta(days=90),
    'max': None,
}

_MARKET_ORDER_COLUMNS = {
    'volume_total': Market.volume_total,
    'liquidity': Market.liquidity,
    'end_date': Market.end_date,
    'created_at': Market.created_at,
}


def _json_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _dt_iso(value: datetime | None) -> str:
    if value is None:
        return ''
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def market_to_gamma_dict(market: Market) -> dict[str, Any]:
    """Rebuild a Gamma-shaped dict from a DB row for the existing API mappers."""
    data: dict[str, Any] = dict(market.raw_data or {})
    data['id'] = market.id
    data['conditionId'] = market.condition_id
    data['questionID'] = market.question_id or data.get('questionID') or ''
    data['slug'] = market.slug
    data['question'] = market.question
    data['description'] = market.description or data.get('description') or ''
    data['category'] = market.category or extract_market_category(data)
    data['tags'] = market.tags if market.tags is not None else data.get('tags')
    data['outcomes'] = market.outcomes if market.outcomes is not None else data.get('outcomes')
    data['clobTokenIds'] = (
        market.outcome_token_ids
        if market.outcome_token_ids is not None
        else data.get('clobTokenIds')
    )
    data['image'] = market.image_url or data.get('image') or ''
    data['startDate'] = _dt_iso(market.start_date) or data.get('startDate') or ''
    data['endDate'] = _dt_iso(market.end_date) or data.get('endDate') or ''
    data['closed'] = market.resolved
    data['active'] = market.active
    data['volume'] = float(market.volume_total or 0)
    data['liquidity'] = float(market.liquidity or 0)
    if market.outcomes and not data.get('outcomes'):
        data['outcomes'] = _json_list(market.outcomes)
    if market.outcome_token_ids and not data.get('clobTokenIds'):
        data['clobTokenIds'] = _json_list(market.outcome_token_ids)
    return data


def _apply_market_filters(
    stmt,
    *,
    category: str | None,
    active: bool | None,
    resolved: bool | None,
):
    if category:
        stmt = stmt.where(func.lower(Market.category) == category.lower())
    if active is not None:
        stmt = stmt.where(Market.active == active)
    if resolved is not None:
        stmt = stmt.where(Market.resolved == resolved)
    return stmt


def _market_order_by(order_by: str, order: str):
    column = _MARKET_ORDER_COLUMNS.get(order_by, Market.volume_total)
    if order == 'asc':
        return column.asc().nullslast()
    return column.desc().nullslast()


class MarketsLocalStore:
    """Query cached markets and price history from PostgreSQL."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def count(self) -> int:
        return int((await self.session.scalar(select(func.count()).select_from(Market))) or 0)

    async def list_markets(
        self,
        *,
        limit: int,
        offset: int,
        category: str | None = None,
        active: bool | None = None,
        resolved: bool | None = None,
        order_by: str = 'volume_total',
        order: str = 'desc',
    ) -> tuple[list[Market], int]:
        base = select(Market)
        base = _apply_market_filters(base, category=category, active=active, resolved=resolved)
        total = int(
            (await self.session.scalar(select(func.count()).select_from(base.subquery()))) or 0
        )
        stmt = (
            base.order_by(_market_order_by(order_by, order), Market.id.asc())
            .offset(offset)
            .limit(limit)
        )
        rows = list((await self.session.scalars(stmt)).all())
        return rows, total

    async def search(self, q: str, *, limit: int) -> list[Market]:
        needle = f'%{q}%'
        stmt = (
            select(Market)
            .where(
                or_(
                    Market.question.ilike(needle),
                    Market.slug.ilike(needle),
                    Market.category.ilike(needle),
                )
            )
            .order_by(Market.volume_total.desc().nullslast(), Market.id.asc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def get_by_slug(self, slug: str) -> Market | None:
        return await self.session.scalar(select(Market).where(Market.slug == slug))

    async def get_by_condition_id(self, condition_id: str) -> Market | None:
        if not condition_id:
            return None
        return await self.session.scalar(
            select(Market).where(Market.condition_id == condition_id)
        )

    async def get_by_id(self, market_id: str | int) -> Market | None:
        try:
            mid = int(market_id)
        except (TypeError, ValueError):
            return None
        return await self.session.scalar(select(Market).where(Market.id == mid))

    async def get_by_gamma_id(self, gamma_id: str | int) -> Market | None:
        try:
            gid = str(int(gamma_id))
        except (TypeError, ValueError):
            return None
        return await self.session.scalar(
            select(Market).where(Market.raw_data['id'].astext == gid)
        )

    async def get_price_series(
        self,
        market_id: int,
        outcome: str,
        *,
        interval: str = '1d',
        limit: int | None = None,
    ) -> list[PricePoint]:
        stmt = (
            select(PriceHistory.time, PriceHistory.price)
            .where(PriceHistory.market_id == market_id, PriceHistory.outcome == outcome)
            .order_by(PriceHistory.time.asc())
        )
        window = _INTERVAL_WINDOWS.get(interval)
        if window is not None:
            since = datetime.now(tz=UTC) - window
            stmt = stmt.where(PriceHistory.time >= since)
        if limit is not None:
            stmt = stmt.limit(limit)
        rows = (await self.session.execute(stmt)).all()
        return [PricePoint(t=_dt_iso(point_time), v=float(price)) for point_time, price in rows]
