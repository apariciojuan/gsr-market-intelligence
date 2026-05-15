from app.config.log import get_logger
from fastapi import APIRouter

router = APIRouter()
logger = get_logger('dashboard')


@router.get(
    '/summary',
    response_model=str,
    status_code=200,
    operation_id='get_dashboard_summary',
    tags=['dashboard'],
    summary='Get dashboard summary',
    description='Returns dashboard summary.',
)
async def get_dashboard_summary() -> str:
    return f'dashboard summary'





