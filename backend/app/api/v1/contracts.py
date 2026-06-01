from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.config.log import get_logger
from app.services import PolygonClient
from .schemas import PolygonQueryParams, EventLogQueryParams

router = APIRouter()
logger = get_logger('contracts')


@router.get(
    '/transactions',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_transactions_by_address',
    tags=['contracts'],
    summary='Get transactions by address',
    description='Returns transactions for a given address.',
)
async def get_transactions(params: PolygonQueryParams = Depends()) -> JSONResponse:
    client = PolygonClient()
    data = await client.get_transactions_by_address(query_params=params.model_dump())
    return JSONResponse(content=data)

@router.get(
    '/transfers/erc20',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_erc20_transfers',
    tags=['contracts'],
    summary='Get ERC20 transfers by address',
    description='Returns ERC20 token transfer events for a given address (Whale Tracking).',
)
async def get_erc20_transfers(params: PolygonQueryParams = Depends()) -> JSONResponse:
    client = PolygonClient()
    data = await client.get_erc20_transfers_by_address(query_params=params.model_dump())
    return JSONResponse(content=data)


@router.get(
    '/transfers/erc721',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_erc721_transfers',
    tags=['contracts'],
    summary='Get ERC721 transfers by address',
    description='Returns ERC721 (NFT) transfer events for a given address.',
)
async def get_erc721_transfers(params: PolygonQueryParams = Depends()) -> JSONResponse:
    client = PolygonClient()
    data = await client.get_erc721_transfers_by_address(query_params=params.model_dump())
    return JSONResponse(content=data)


@router.get(
    '/transfers/erc1155',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_erc1155_transfers',
    tags=['contracts'],
    summary='Get ERC1155 transfers by address',
    description='Returns ERC1155 transfer events for a given address.',
)
async def get_erc1155_transfers(params: PolygonQueryParams = Depends()) -> JSONResponse:
    client = PolygonClient()
    data = await client.get_erc1155_transfers_by_address(query_params=params.model_dump())
    return JSONResponse(content=data)


@router.get(
    '/logs',
    response_class=JSONResponse,
    status_code=200,
    operation_id='get_event_logs',
    tags=['contracts'],
    summary='Get event logs by address or topic',
    description='Returns historical event logs for smart contract auditing.',
)
async def get_event_logs(params: EventLogQueryParams = Depends()) -> JSONResponse:
    client = PolygonClient()
    query_dict = {k: v for k, v in params.model_dump().items() if v is not None}
    data = await client.get_event_logs_by_address_or_topic(query_params=query_dict)
    return JSONResponse(content=data)