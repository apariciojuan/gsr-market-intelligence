"""Real signals (divergences) endpoints (Fase D, sheet 73 section 4).

Every response matches EXACTLY the frontend contract in
``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.divergence``).

Both endpoints read the indexed ``divergences`` table joined to ``markets`` and
build the ``mini_chart_data`` series on the fly via
:class:`~app.services.divergence.series_provider.SeriesProvider` (the market
"Yes" CLOB history and the Chainlink answers stored in ``chainlink_prices``).
With the current data the listing degrades honestly to ``items=[]`` and a
missing id returns 404 — the only legitimate error (calca ``resolutions.py``).
"""

# ``Depends``/``Query`` in argument defaults is the FastAPI idiom (B008 is moot here).
# ruff: noqa: B008

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.config.settings import settings
from app.core.database import get_session
from app.models import ChainlinkFeed, Divergence, Market
from app.schemas.divergence import (
    DetectionPoint,
    DivergenceRead,
    MarketRef,
    PaginatedSignals,
    SignalDetail,
    SignalListItem,
    SignalMiniChart,
)
from app.schemas.market import MarketRead, PricePoint
from app.services.divergence.series_provider import SeriesProvider

router = APIRouter()
logger = get_logger('signals')

# Sortable columns for the ``order_by`` query param (default: detected_at).
_ORDER_COLUMNS = {
    'detected_at': Divergence.detected_at,
    'last_updated_at': Divergence.last_updated_at,
    'severity': Divergence.severity,
    'magnitude_pct': Divergence.magnitude_pct,
}


def _to_iso(value: datetime | None) -> str:
    """Render a tz-aware datetime as an ISO-8601 string, or ``''`` when missing."""
    return value.isoformat() if value is not None else ''


def _to_float(value: object) -> float:
    """Best-effort float conversion (Decimal/None legacy → 0.0), never raising."""
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _to_divergence_read(divergence: Divergence) -> DivergenceRead:
    """Map a ``Divergence`` ORM row to the contract ``DivergenceRead`` (no nulls)."""
    return DivergenceRead(
        id=divergence.id,
        market_id=divergence.market_id,
        divergence_type=divergence.divergence_type,
        detected_at=_to_iso(divergence.detected_at),
        last_updated_at=_to_iso(divergence.last_updated_at),
        severity=divergence.severity,
        magnitude_pct=_to_float(divergence.magnitude_pct),
        direction=divergence.direction or 'market_above',
        market_value=_to_float(divergence.market_value),
        external_value=_to_float(divergence.external_value),
        external_source=divergence.external_source or '',
        time_window_minutes=divergence.time_window_minutes or 0,
        status=divergence.status,
    )


def _to_market_ref(market: Market) -> MarketRef:
    """Map a ``Market`` ORM row to the compact ``MarketRef`` (category NULL→'')."""
    return MarketRef(
        id=market.id,
        slug=market.slug or '',
        question=market.question or '',
        category=market.category or '',
    )


def _to_str_list(value: object) -> list[str]:
    """Coerce a JSONB list column into a ``list[str]`` (NULL/other → [])."""
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


def _to_market_read(market: Market) -> MarketRead:
    """Map a ``Market`` ORM row to the full contract ``MarketRead`` (string NULL→'').

    ``uma_adapter_address`` is required by the contract but does not exist on the
    ``Market`` model, so it is reported as ``''`` (honest empty).
    """
    return MarketRead(
        id=market.id,
        condition_id=market.condition_id or '',
        question_id=market.question_id or '',
        slug=market.slug or '',
        question=market.question or '',
        description=market.description or '',
        category=market.category or '',
        tags=_to_str_list(market.tags),
        outcomes=_to_str_list(market.outcomes),
        outcome_token_ids=_to_str_list(market.outcome_token_ids),
        market_address=market.market_address or '',
        image_url=market.image_url or '',
        start_date=_to_iso(market.start_date),
        end_date=_to_iso(market.end_date),
        resolved=market.resolved,
        active=market.active,
        volume_total=_to_float(market.volume_total),
        liquidity=_to_float(market.liquidity),
        uma_adapter_version=market.uma_adapter_version or '',
        uma_adapter_address='',
        last_synced_at=_to_iso(market.last_synced_at),
    )


def _yes_token_id(market: Market) -> str:
    """The market's "Yes" ``clobTokenId`` (``outcome_token_ids[0]``), or ``''``."""
    token_ids = market.outcome_token_ids
    if isinstance(token_ids, list) and token_ids and token_ids[0]:
        return str(token_ids[0])
    return ''


async def _resolve_feed_id(session: AsyncSession, asset_pair: str | None) -> int | None:
    """Map a divergence ``external_source`` (asset pair) to its ``chainlink_feeds.id``."""
    if not asset_pair:
        return None
    stmt = select(ChainlinkFeed.id).where(ChainlinkFeed.asset_pair == asset_pair)
    return (await session.scalars(stmt)).first()


async def _build_series(
    session: AsyncSession,
    provider: SeriesProvider,
    market: Market,
    divergence: Divergence,
) -> tuple[list[PricePoint], list[PricePoint]]:
    """Fetch the market and external series over the mini-chart window (ascending).

    The window ends at the divergence ``detected_at`` and spans
    ``DIVERGENCE_MINI_CHART_HOURS``. Both series are trimmed to the same length so
    they stay aligned (per the contract); empty data degrades to ``[]``.
    """
    to = divergence.detected_at or datetime.now(tz=UTC)
    frm = to - timedelta(hours=settings.DIVERGENCE_MINI_CHART_HOURS)
    feed_id = await _resolve_feed_id(session, divergence.external_source)

    market_series = await provider.get_market_series(
        _yes_token_id(market), frm, to, settings.MARKET_PRICE_INTERVAL
    )
    external_series = (
        await provider.get_external_series(feed_id, frm, to) if feed_id is not None else []
    )

    size = min(len(market_series), len(external_series))
    if size:
        market_series = market_series[-size:]
        external_series = external_series[-size:]
    return market_series, external_series


@router.get(
    '',
    response_model=PaginatedSignals,
    status_code=200,
    operation_id='list_signals',
    tags=['signals'],
    summary='List divergence signals',
    description='Indexed divergences joined to their market (External Signals Cross-Check).',
)
async def list_signals(
    divergence_type: str = Query(default='all'),
    min_severity: int = Query(default=1, ge=1, le=5),
    status: str = Query(default='all'),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    order: str = Query(default='desc'),
    order_by: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> PaginatedSignals:
    column = _ORDER_COLUMNS.get(order_by or '', Divergence.detected_at)
    direction = column.asc() if order == 'asc' else column.desc()

    stmt = (
        select(Divergence, Market)
        .join(Market, Market.id == Divergence.market_id)
        .where(Divergence.status != 'false_positive', Divergence.severity >= min_severity)
    )
    if divergence_type != 'all':
        stmt = stmt.where(Divergence.divergence_type == divergence_type)
    if status != 'all':
        stmt = stmt.where(Divergence.status == status)
    stmt = stmt.order_by(direction).limit(limit).offset(offset)

    rows = (await session.execute(stmt)).all()

    provider = SeriesProvider(session)
    items: list[SignalListItem] = []
    for divergence, market in rows:
        market_series, external_series = await _build_series(
            session, provider, market, divergence
        )
        items.append(
            SignalListItem(
                divergence=_to_divergence_read(divergence),
                market=_to_market_ref(market),
                mini_chart_data=SignalMiniChart(
                    market_series=market_series, external_series=external_series
                ),
            )
        )

    return PaginatedSignals(
        items=items,
        limit=limit,
        offset=offset,
        has_more=len(items) == limit,
    )


@router.get(
    '/{id}',
    response_model=SignalDetail,
    status_code=200,
    operation_id='get_signal',
    tags=['signals'],
    summary='Get a divergence signal by id',
    description='Full divergence detail with both price series and the detection point.',
)
async def get_signal(
    id: int,
    session: AsyncSession = Depends(get_session),
) -> SignalDetail:
    stmt = (
        select(Divergence, Market)
        .join(Market, Market.id == Divergence.market_id)
        .where(Divergence.id == id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Divergence "{id}" not found.')

    divergence, market = row
    provider = SeriesProvider(session)
    market_series, external_series = await _build_series(session, provider, market, divergence)

    # detection_point mirrors the persisted divergence scalars (raw market
    # probability + normalized external level, both 0..1) so it stays consistent
    # with DivergenceRead; the raw price_series stay raw for the dual-axis chart.
    detection_point = DetectionPoint(
        t=_to_iso(divergence.detected_at),
        market_value=_to_float(divergence.market_value),
        external_value=_to_float(divergence.external_value),
        magnitude_pct=_to_float(divergence.magnitude_pct),
    )

    return SignalDetail(
        divergence=_to_divergence_read(divergence),
        market=_to_market_read(market),
        market_series=market_series,
        external_series=external_series,
        detection_point=detection_point,
        related_news=[],
    )
