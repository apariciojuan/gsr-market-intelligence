import re

from fastapi import APIRouter, HTTPException, Query

from app.config.log import get_logger
from app.schemas.resolution import PaginatedResolutions, ResolutionDetail, ResolutionStats
from app.services.uma import UmaClient

router = APIRouter()
logger = get_logger('resolutions')
_QUESTION_ID_RE = re.compile(r'^0x[0-9a-fA-F]{64}$')


@router.get(
    '',
    response_model=PaginatedResolutions,
    status_code=200,
    operation_id='list_resolutions',
    tags=['resolutions'],
    summary='List UMA resolutions',
    description='Live read of UMA CTF adapter events on Polygon (Resolution Watchdog).',
)
async def list_resolutions(
    status: str = Query(default='all'),
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    order: str = Query(default='desc'),
) -> PaginatedResolutions:
    client = UmaClient()
    return await client.list_resolutions(
        status=status, q=q, limit=limit, offset=offset, order=order
    )


@router.get(
    '/stats',
    response_model=ResolutionStats,
    status_code=200,
    operation_id='get_resolution_stats',
    tags=['resolutions'],
    summary='Resolution statistics',
    description='Aggregate stats over recent resolutions (totals + bond histogram).',
)
async def get_resolution_stats(window: str = Query(default='30d')) -> ResolutionStats:
    client = UmaClient()
    return await client.get_stats(window=window)


@router.get(
    '/{question_id}',
    response_model=ResolutionDetail,
    status_code=200,
    operation_id='get_resolution',
    tags=['resolutions'],
    summary='Get a resolution cycle by question id',
    description='Reconstructs the resolution lifecycle (timeline) for a UMA question id.',
)
async def get_resolution(question_id: str) -> ResolutionDetail:
    if not _QUESTION_ID_RE.match(question_id):
        raise HTTPException(status_code=404, detail=f'Resolution "{question_id}" not found.')
    client = UmaClient()
    detail = await client.get_resolution(question_id)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail=f'Resolution "{question_id}" not found.',
        )
    return detail
