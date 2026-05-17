from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.config.log import get_logger
from app.services import PolygonClient

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
async def get_transactions(address: str | None = Query(default=None)) -> JSONResponse:
    # params query need a schema to validate and check valid params
    query_params = {'address': address} if address else None
    client = PolygonClient()
    data = await client.get_transactions_by_address(query_params=query_params)
    # Need schema to response
    return JSONResponse(content=data.json())
