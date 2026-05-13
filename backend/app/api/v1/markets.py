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
