from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.config.log import get_logger
from app.services import PolymarketClient

router = APIRouter()
logger = get_logger('markets')


@router.get(
    '/',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_markets',
    tags=['markets'],
    summary='Get available markets',
    description='Returns a list of available markets.',
)
async def get_markets() -> JSONResponse:
    client = PolymarketClient()
    data = await client.get_markets_keyset()
    # Need schema to response
    return JSONResponse(content=data.json())


@router.get(
    '/search',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_markets_search',
    tags=['markets'],
    summary='Search markets',
    description='Returns a list of markets.',
)
async def get_markets_search(q: str | None = Query(default=None)) -> JSONResponse:
    # params query need a schema to validate and check valid params
    query_params = {'q': q} if q else None
    client = PolymarketClient()
    data = await client.get_markets_search(query_params=query_params)
    # Need schema to response
    return JSONResponse(content=data.json())


@router.get(
    '/slug/{slug}',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_markets_detail by slug',
    tags=['markets'],
    summary='Get markets detail by slug',
    description='Returns markets detail by slug.',
)
async def get_markets_detail_by_slug(slug: str) -> JSONResponse:
    client = PolymarketClient()
    data = await client.get_market_by_slug(market_slug=slug)
    # Need schema to response
    return JSONResponse(content=data.json())


@router.get(
    '/{id}',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_markets_detail by id',
    tags=['markets'],
    summary='Get markets detail by id',
    description='Returns markets detail by id.',
)
async def get_markets_detail_by_id(id: str) -> JSONResponse:
    client = PolymarketClient()
    data = await client.get_market_by_id(market_id=id)
    # Need schema to response
    return JSONResponse(content=data.json())



