from app.config.log import get_logger
from fastapi import APIRouter

router = APIRouter()
logger = get_logger('markets')


@router.get(
    '/',
    response_model=str,
    status_code=200,
    operation_id='get_markets',
    tags=['markets'],
    summary='Get available markets',
    description='Returns a list of available markets.',
)
async def get_markets() -> str:
    return 'market1,market2,market3'


@router.get(
    '/{slug}',
    response_model=str,
    status_code=200,
    operation_id='get_markets_detail',
    tags=['markets'],
    summary='Get markets detail',
    description='Returns markets detail.',
)
async def get_markets_detail(slug: str) -> str:
    return f'markets detail for {slug}'


@router.get(
    '/search',
    response_model=str,
    status_code=200,
    operation_id='get_markets_search',
    tags=['markets'],
    summary='Search markets',
    description='Returns a list of markets.',
)
async def get_markets_search() -> str:
    return 'market search result'




