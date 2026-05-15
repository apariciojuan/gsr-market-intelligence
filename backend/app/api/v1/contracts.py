from app.config.log import get_logger
from fastapi import APIRouter

router = APIRouter()
logger = get_logger('contracts')


@router.get(
    '/{address}',
    response_model=str,
    status_code=200,
    operation_id='get_contracts_detail',
    tags=['contracts'],
    summary='Get contracts detail',
    description='Returns contracts detail.',
)
async def get_contracts_detail(address: str) -> str:
    return f'contracts detail for {address}'



