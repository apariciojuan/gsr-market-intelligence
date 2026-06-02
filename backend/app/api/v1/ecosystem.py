"""Real ecosystem endpoints (Fase C) backed by the indexed Postgres data.

Every response matches EXACTLY the frontend contract in
``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.ecosystem``).

This is the first router that touches the database: each endpoint depends on
``get_session`` and delegates to ``EcosystemService``. KPIs, sparkline and
``by-category`` read the append-only ``ecosystem_metrics`` snapshots; ``volume``
and ``active-markets`` are computed on the fly from ``markets``; ``calibration``,
``activity-heatmap`` and ``top-wallets`` have no data source yet (Phase 2) and
degrade honestly to empty, well-shaped payloads with HTTP 200.
"""

# ``Depends``/``Query`` in argument defaults is the FastAPI idiom (B008 is moot here).
# ruff: noqa: B008

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.core.database import get_session
from app.schemas.ecosystem import (
    ActivityHeatmap,
    Calibration,
    CalibrationWindow,
    EcoActiveMarkets,
    EcoByCategory,
    EcoInterval,
    EcoSparkline,
    EcosystemKpis,
    EcoVolume,
    PaginatedTopWallets,
    TopWalletsOrderBy,
)
from app.services.ecosystem import EcosystemService

router = APIRouter()
logger = get_logger('ecosystem')


@router.get(
    '/kpis',
    response_model=EcosystemKpis,
    status_code=200,
    operation_id='get_ecosystem_kpis',
    tags=['ecosystem'],
    summary='Get ecosystem KPIs',
    description='Latest ecosystem KPI snapshots with real deltas vs the previous snapshot.',
)
async def get_ecosystem_kpis(
    window: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> EcosystemKpis:
    return await EcosystemService(session).get_kpis(window=window)


@router.get(
    '/kpi/{key}/sparkline',
    response_model=EcoSparkline,
    status_code=200,
    operation_id='get_ecosystem_kpi_sparkline',
    tags=['ecosystem'],
    summary='Get ecosystem KPI sparkline',
    description='Series of snapshot values for a KPI (oldest first) plus its trend direction.',
)
async def get_ecosystem_kpi_sparkline(
    key: str,
    points: int = Query(default=30, ge=2, le=365),
    session: AsyncSession = Depends(get_session),
) -> EcoSparkline:
    return await EcosystemService(session).get_kpi_sparkline(key=key, points=points)


@router.get(
    '/volume',
    response_model=EcoVolume,
    status_code=200,
    operation_id='get_ecosystem_volume',
    tags=['ecosystem'],
    summary='Get ecosystem volume series',
    description='New-markets-per-bucket time series (volume_usd is 0 — no temporal source yet).',
)
async def get_ecosystem_volume(
    interval: EcoInterval = Query(default='1d'),
    from_: str | None = Query(default=None, alias='from'),
    to: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> EcoVolume:
    return await EcosystemService(session).get_volume(interval=interval, frm=from_, to=to)


@router.get(
    '/active-markets',
    response_model=EcoActiveMarkets,
    status_code=200,
    operation_id='get_ecosystem_active_markets',
    tags=['ecosystem'],
    summary='Get ecosystem active-markets series',
    description='Active-markets-per-bucket time series (exact now, approximate for the past).',
)
async def get_ecosystem_active_markets(
    interval: EcoInterval = Query(default='1d'),
    session: AsyncSession = Depends(get_session),
) -> EcoActiveMarkets:
    return await EcosystemService(session).get_active_markets(interval=interval)


@router.get(
    '/by-category',
    response_model=EcoByCategory,
    status_code=200,
    operation_id='get_ecosystem_by_category',
    tags=['ecosystem'],
    summary='Get ecosystem volume by category',
    description='Volume split by primary tag from the latest by_category snapshot.',
)
async def get_ecosystem_by_category(
    window: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> EcoByCategory:
    return await EcosystemService(session).get_by_category(window=window)


@router.get(
    '/calibration',
    response_model=Calibration,
    status_code=200,
    operation_id='get_ecosystem_calibration',
    tags=['ecosystem'],
    summary='Get ecosystem calibration',
    description='Prediction calibration over resolved markets (empty for now — 0 resolved).',
)
async def get_ecosystem_calibration(
    window: CalibrationWindow = Query(default='all'),
    category: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> Calibration:
    return await EcosystemService(session).get_calibration(window=window, category=category)


@router.get(
    '/activity-heatmap',
    response_model=ActivityHeatmap,
    status_code=200,
    operation_id='get_ecosystem_activity_heatmap',
    tags=['ecosystem'],
    summary='Get ecosystem activity heatmap',
    description='Day-of-week / hour activity matrix from transactions (empty for now).',
)
async def get_ecosystem_activity_heatmap(
    window: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> ActivityHeatmap:
    return await EcosystemService(session).get_activity_heatmap(window=window)


@router.get(
    '/top-wallets',
    response_model=PaginatedTopWallets,
    status_code=200,
    operation_id='get_ecosystem_top_wallets',
    tags=['ecosystem'],
    summary='Get ecosystem top wallets',
    description='Top wallets from wallet_positions (empty for now — paginated envelope).',
)
async def get_ecosystem_top_wallets(
    limit: int = Query(default=50, ge=1, le=200),
    order_by: TopWalletsOrderBy = Query(default='volume'),
    window: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> PaginatedTopWallets:
    return await EcosystemService(session).get_top_wallets(
        limit=limit, order_by=order_by, window=window
    )
