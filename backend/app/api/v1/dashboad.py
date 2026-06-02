"""Real dashboard endpoints backed by Polymarket (Gamma) and the UMA client.

Every response matches EXACTLY the frontend contract in
``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.dashboard``).

Honest scope notes:
  - There is no 24h price/volume history yet, so every ``delta_pct`` is ``None``
    (``delta_direction='neutral'``) and ``delta_pct_24h`` / ``sparkline`` are
    left at their empty defaults. Computing them per market would be too costly.
  - ``divergences_today`` now counts the active ``divergences`` detected today
    (UTC), and ``/notable-divergences`` returns the top active divergences; both
    degrade honestly to ``0`` / ``[]`` when the calculator has produced no rows.
  - ``active_users_24h`` has no source yet (``transactions``/``wallet_positions``
    are empty), so it stays an honest ``0`` placeholder — never invented.
"""

# ``Depends``/``Query`` in argument defaults is the FastAPI idiom (B008 is moot here).
# ruff: noqa: B008

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.signals import _build_series, _to_divergence_read, _to_market_ref
from app.config.log import get_logger
from app.core.database import get_session
from app.models import Divergence, Market
from app.schemas.dashboard import (
    DashboardActiveResolution,
    DashboardSummary,
    KpiItem,
    TopMarketItem,
    TopMarketsResponse,
)
from app.schemas.divergence import DivergenceCard, SignalMiniChart
from app.services import PolymarketClient
from app.services.divergence.series_provider import SeriesProvider
from app.services.uma.client import UmaClient

router = APIRouter()
logger = get_logger('dashboard')


def _parse_json_list(value: Any) -> list[str]:
    """Parse a Gamma field that may be a JSON-encoded string list or a real list."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            return [text]
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
        return [str(parsed)]
    return [str(value)]


def _to_float(value: Any) -> float:
    """Best-effort float conversion (Gamma sends numeric strings or None)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: Any) -> int:
    """Best-effort int conversion for Gamma's string numeric ids."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _extract_markets(payload: Any) -> list[dict]:
    """Pull a flat list of market dicts out of a Gamma list/search response."""
    if isinstance(payload, list):
        return [m for m in payload if isinstance(m, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get('markets'), list):
            return [m for m in payload['markets'] if isinstance(m, dict)]
        if isinstance(payload.get('events'), list):
            markets: list[dict] = []
            for event in payload['events']:
                if isinstance(event, dict) and isinstance(event.get('markets'), list):
                    markets.extend(m for m in event['markets'] if isinstance(m, dict))
            return markets
    return []


def _format_usd(value: float) -> str:
    """Compact USD formatting: '$8.6M' / '$540.0K' / '$12.00'."""
    if value >= 1_000_000:
        return f'${value / 1_000_000:.1f}M'
    if value >= 1_000:
        return f'${value / 1_000:.1f}K'
    return f'${value:.2f}'


def _to_top_market_item(market: dict) -> TopMarketItem:
    prices = _parse_json_list(market.get('outcomePrices'))
    price_yes = _to_float(prices[0]) if len(prices) >= 1 else 0.0
    price_no = _to_float(prices[1]) if len(prices) >= 2 else max(0.0, 1.0 - price_yes)
    volume_24h = _to_float(market.get('volume24hr')) or _to_float(market.get('volume'))
    return TopMarketItem(
        id=_to_int(market.get('id')),
        slug=market.get('slug') or '',
        question=market.get('question') or '',
        category=market.get('category') or '',
        price_yes=price_yes,
        price_no=price_no,
        # No 24h history available yet; computing it per market is too costly.
        delta_pct_24h=0.0,
        volume_24h_usd=volume_24h,
        end_date=market.get('endDate') or '',
        # Sparkline omitted by design (one CLOB history call per market is costly).
        sparkline=[],
    )


@router.get(
    '/top-markets',
    response_model=TopMarketsResponse,
    status_code=200,
    operation_id='get_dashboard_top_markets',
    tags=['dashboard'],
    summary='Get dashboard top markets',
    description='Top active markets by 24h volume, mapped to the frontend contract.',
)
async def get_dashboard_top_markets(
    limit: int = Query(default=10, ge=1, le=100),
    window: str | None = Query(default=None),
) -> TopMarketsResponse:
    client = PolymarketClient()
    response = await client.get_markets(
        query_params={
            'limit': max(limit, 20),
            'order': 'volume24hr',
            'ascending': 'false',
            'closed': 'false',
        }
    )
    markets = _extract_markets(response.json())[:limit]
    items = [_to_top_market_item(market) for market in markets]
    return TopMarketsResponse(items=items, total=len(items))


@router.get(
    '/summary',
    response_model=DashboardSummary,
    status_code=200,
    operation_id='get_dashboard_summary',
    tags=['dashboard'],
    summary='Get dashboard summary',
    description='KPI strip + active resolution teasers from Polymarket and UMA.',
)
async def get_dashboard_summary(
    session: AsyncSession = Depends(get_session),
) -> DashboardSummary:
    client = PolymarketClient()
    response = await client.get_markets(query_params={'limit': 100, 'closed': 'false'})
    markets = _extract_markets(response.json())

    volume_24h = sum(
        _to_float(m.get('volume24hr')) or _to_float(m.get('volume')) for m in markets
    )
    # Sample over a single page of active markets, NOT the global total — approximate.
    active_markets = sum(1 for m in markets if bool(m.get('active')))

    resolutions = (await UmaClient().list_resolutions(status='all', limit=200)).items
    pending = [r for r in resolutions if r.status != 'resolved']
    pending_count = len(pending)

    # Active divergences detected since the start of today (UTC). Honest 0 with no rows.
    today_start = datetime.now(tz=UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    divergences_today = (
        await session.scalar(
            select(func.count())
            .select_from(Divergence)
            .where(Divergence.status == 'active', Divergence.detected_at >= today_start)
        )
    ) or 0

    kpis = [
        KpiItem(
            key='volume_24h',
            label='Volume 24h',
            value=volume_24h,
            value_formatted=_format_usd(volume_24h),
            delta_pct=None,
            delta_direction='neutral',
        ),
        KpiItem(
            key='active_markets',
            label='Active Markets',
            value=active_markets,
            value_formatted=f'{active_markets:,}',
            delta_pct=None,
            delta_direction='neutral',
        ),
        KpiItem(
            key='pending_resolutions',
            label='Pending Resolutions',
            value=pending_count,
            value_formatted=str(pending_count),
            delta_pct=None,
            delta_direction='neutral',
        ),
        KpiItem(
            key='divergences_today',
            label='Divergences Today',
            value=divergences_today,
            value_formatted=str(divergences_today),
            delta_pct=None,
            delta_direction='neutral',
        ),
        KpiItem(
            key='active_users_24h',
            label='Active Wallets 24h',
            # No source yet: transactions/wallet_positions are empty — honest 0.
            value=0,
            value_formatted='0',
            delta_pct=None,
            delta_direction='neutral',
        ),
    ]

    active_resolutions = [
        DashboardActiveResolution(
            question_id=r.question_id,
            market_question=r.market_question,
            status=r.status,
            bond_usd=r.bond_usd,
            ends_in_seconds=r.seconds_remaining or 0,
            challenge_deadline=r.challenge_deadline or '',
        )
        for r in pending[:5]
    ]

    return DashboardSummary(kpis=kpis, active_resolutions=active_resolutions)


@router.get(
    '/notable-divergences',
    response_model=list[DivergenceCard],
    status_code=200,
    operation_id='get_dashboard_notable_divergences',
    tags=['dashboard'],
    summary='Get dashboard notable divergences',
    description='Top active divergences by severity (bare array; empty when there are none).',
)
async def get_dashboard_notable_divergences(
    limit: int = Query(default=3, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
) -> list[DivergenceCard]:
    stmt = (
        select(Divergence, Market)
        .join(Market, Market.id == Divergence.market_id)
        .where(Divergence.status == 'active')
        .order_by(Divergence.severity.desc(), Divergence.detected_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()

    provider = SeriesProvider(session)
    cards: list[DivergenceCard] = []
    for divergence, market in rows:
        market_series, external_series = await _build_series(
            session, provider, market, divergence
        )
        cards.append(
            DivergenceCard(
                divergence=_to_divergence_read(divergence),
                market=_to_market_ref(market),
                mini_chart_data=SignalMiniChart(
                    market_series=market_series, external_series=external_series
                ),
            )
        )
    return cards
