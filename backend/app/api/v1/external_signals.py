"""External signals (RSS / resolution source) REST API."""

# ruff: noqa: B008

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.core.database import get_session
from app.models import ExternalSignal
from app.schemas.external_signal import (
    ExternalSignalRead,
    ExternalSignalsCollectRequest,
    ExternalSignalsCollectResponse,
    PaginatedExternalSignals,
    external_signal_to_read,
)
from app.services.external_signals.service import ExternalSignalsService

router = APIRouter()
logger = get_logger('external_signals')


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip().replace('Z', '+00:00')
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


@router.get(
    '',
    response_model=PaginatedExternalSignals,
    operation_id='list_external_signals',
    tags=['external-signals'],
    summary='List external signals',
)
async def list_external_signals(
    market_id: int | None = Query(default=None),
    slug: str | None = Query(default=None),
    source: str | None = Query(default=None),
    since: str | None = Query(default=None),
    until: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> PaginatedExternalSignals:
    service = ExternalSignalsService(session)
    items, total = await service.list_signals(
        market_id=market_id,
        slug=slug,
        source=source,
        since=_parse_since(since),
        until=_parse_since(until),
        q=q,
        limit=limit,
        offset=offset,
    )
    return PaginatedExternalSignals(
        items=[external_signal_to_read(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + len(items)) < total,
    )


@router.get(
    '/{signal_id}',
    response_model=ExternalSignalRead,
    operation_id='get_external_signal',
    tags=['external-signals'],
    summary='Get external signal by id',
)
async def get_external_signal(
    signal_id: int,
    session: AsyncSession = Depends(get_session),
) -> ExternalSignalRead:
    service = ExternalSignalsService(session)
    signal = await service.get_by_id(signal_id)
    if signal is None:
        raise HTTPException(status_code=404, detail=f'External signal "{signal_id}" not found.')
    return external_signal_to_read(signal)


@router.post(
    '/collect',
    response_model=ExternalSignalsCollectResponse,
    operation_id='collect_external_signals',
    tags=['external-signals'],
    summary='Trigger external signals ingestion',
)
async def collect_external_signals(
    body: ExternalSignalsCollectRequest,
    session: AsyncSession = Depends(get_session),
) -> ExternalSignalsCollectResponse:
    service = ExternalSignalsService(session)
    count = await service.collect_for_market_ids(
        market_ids=body.market_ids,
        slugs=body.slugs,
    )
    markets = await service.load_markets(market_ids=body.market_ids, slugs=body.slugs)
    return ExternalSignalsCollectResponse(
        markets_processed=len(markets),
        signals_upserted=count,
    )
